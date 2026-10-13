const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const MatiereService = require('../../src/services/MatiereService');
const app = require('../../src/app');

const serviceMethods = ['create', 'findAll', 'findById', 'update', 'delete'];
const originalServiceMethods = new Map(
  serviceMethods.map((methodName) => [methodName, MatiereService[methodName]])
);
const originalNodeEnv = process.env.NODE_ENV;

let server;
let baseUrl;

function withServiceMocks(mocks, callback) {
  const originals = new Map();
  for (const [methodName, implementation] of Object.entries(mocks)) {
    originals.set(methodName, MatiereService[methodName]);
    MatiereService[methodName] = implementation;
  }

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [methodName, original] of originals) {
        MatiereService[methodName] = original;
      }
    });
}

function restoreNodeEnv(value) {
  if (value === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = value;
  }
}

test.before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  for (const [methodName, original] of originalServiceMethods) {
    MatiereService[methodName] = original;
  }
  restoreNodeEnv(originalNodeEnv);

  if (server && server.listening) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('POST /api/matieres returns 201 and the created material', async () => {
  const unique = randomUUID();
  const requestBody = {
    reference: `MAT-${unique}`,
    nom: 'Plastique ABS',
    unite: 'kg',
    seuilAlerte: 25,
  };
  const createdMatiere = { _id: `matiere-${unique}`, ...requestBody };

  await withServiceMocks(
    {
      create: async (data) => {
        assert.deepEqual(data, requestBody);
        return createdMatiere;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), createdMatiere);
    }
  );
});

test('GET /api/matieres returns 200 and the list of materials', async () => {
  const matieres = [
    { _id: `matiere-${randomUUID()}`, reference: 'MAT-1', nom: 'Bois', unite: 'm3', seuilAlerte: 10 },
    { _id: `matiere-${randomUUID()}`, reference: 'MAT-2', nom: 'Verre', unite: 'm2', seuilAlerte: 5 },
  ];

  await withServiceMocks(
    {
      findAll: async () => matieres,
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), matieres);
    }
  );
});

test('GET /api/matieres/:id returns 200 and the material', async () => {
  const id = `matiere-${randomUUID()}`;
  const matiere = { _id: id, reference: 'MAT-3', nom: 'Cuivre', unite: 'kg', seuilAlerte: 30 };

  await withServiceMocks(
    {
      findById: async (receivedId) => {
        assert.equal(receivedId, id);
        return matiere;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres/${id}`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), matiere);
    }
  );
});

test('PATCH /api/matieres/:id returns 200 and the updated material', async () => {
  const id = `matiere-${randomUUID()}`;
  const requestBody = { nom: 'Cuivre Pur', seuilAlerte: 40 };
  const updatedMatiere = { _id: id, reference: 'MAT-3', unite: 'kg', ...requestBody };

  await withServiceMocks(
    {
      update: async (receivedId, data) => {
        assert.equal(receivedId, id);
        assert.deepEqual(data, requestBody);
        return updatedMatiere;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), updatedMatiere);
    }
  );
});

test('DELETE /api/matieres/:id returns 200 with the deletion response', async () => {
  const id = `matiere-${randomUUID()}`;
  const deletedMatiere = { _id: id, reference: 'MAT-DEL' };

  await withServiceMocks(
    {
      delete: async (receivedId) => {
        assert.equal(receivedId, id);
        return deletedMatiere;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres/${id}`, {
        method: 'DELETE',
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        message: 'Matiere deleted successfully',
        matiere: deletedMatiere,
      });
    }
  );
});

test('forwards a service 400 validation error to the client', async () => {
  const message = `Validation error ${randomUUID()}`;

  await withServiceMocks(
    {
      create: async () => {
        const error = new Error(message);
        error.statusCode = 400;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('forwards a service 404 error to the client', async () => {
  const message = `Matiere not found ${randomUUID()}`;

  await withServiceMocks(
    {
      findById: async () => {
        const error = new Error(message);
        error.statusCode = 404;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres/${randomUUID()}`);

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('forwards a service 409 conflict error to the client', async () => {
  const message = `Conflict ${randomUUID()}`;

  await withServiceMocks(
    {
      create: async () => {
        const error = new Error(message);
        error.statusCode = 409;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'DUPLICATE' }),
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('production 500 error uses generic message', async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const privateDetail = `internal failure ${randomUUID()}`;

  try {
    await withServiceMocks(
      {
        findAll: async () => {
          throw new Error(privateDetail);
        },
      },
      async () => {
        const response = await fetch(`${baseUrl}/api/matieres`);
        const body = await response.json();

        assert.equal(response.status, 500);
        assert.deepEqual(body, {
          status: 'error',
          message: 'Internal server error',
        });
        assert.equal(JSON.stringify(body).includes(privateDetail), false);
      }
    );
  } finally {
    restoreNodeEnv(original);
  }
});
