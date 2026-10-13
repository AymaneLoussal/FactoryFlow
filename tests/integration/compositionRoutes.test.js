const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const CompositionService = require('../../src/services/CompositionService');
const app = require('../../src/app');

const serviceMethods = ['create', 'findByProduct', 'update', 'delete'];
const originalServiceMethods = new Map(
  serviceMethods.map((methodName) => [methodName, CompositionService[methodName]])
);
const originalNodeEnv = process.env.NODE_ENV;

let server;
let baseUrl;

function withServiceMocks(mocks, callback) {
  const originals = new Map();
  for (const [methodName, implementation] of Object.entries(mocks)) {
    originals.set(methodName, CompositionService[methodName]);
    CompositionService[methodName] = implementation;
  }

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [methodName, original] of originals) {
        CompositionService[methodName] = original;
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
    CompositionService[methodName] = original;
  }
  restoreNodeEnv(originalNodeEnv);

  if (server && server.listening) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('POST /api/compositions returns 201 and the created composition', async () => {
  const unique = randomUUID();
  const requestBody = {
    produit: `produit-${unique}`,
    matiere: `matiere-${unique}`,
    quantiteUnitaire: 2.5,
  };
  const composition = { _id: `composition-${unique}`, ...requestBody };

  await withServiceMocks(
    {
      create: async (data) => {
        assert.deepEqual(data, requestBody);
        return composition;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/compositions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), composition);
    }
  );
});

test('GET /api/produits/:produitId/compositions returns 200 and the mocked list', async () => {
  const produitId = `produit-${randomUUID()}`;
  const compositions = [{ _id: `composition-${randomUUID()}`, produit: produitId }];

  await withServiceMocks(
    {
      findByProduct: async (receivedProduitId) => {
        assert.equal(receivedProduitId, produitId);
        return compositions;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/produits/${produitId}/compositions`);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), compositions);
    }
  );
});

test('PATCH /api/compositions/:id returns 200 and the updated composition', async () => {
  const id = `composition-${randomUUID()}`;
  const requestBody = { quantiteUnitaire: 4.25 };
  const composition = { _id: id, ...requestBody };

  await withServiceMocks(
    {
      update: async (receivedId, data) => {
        assert.equal(receivedId, id);
        assert.deepEqual(data, requestBody);
        return composition;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/compositions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), composition);
    }
  );
});

test('DELETE /api/compositions/:id returns 200 with the deletion response', async () => {
  const id = `composition-${randomUUID()}`;
  const composition = { _id: id };

  await withServiceMocks(
    {
      delete: async (receivedId) => {
        assert.equal(receivedId, id);
        return composition;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/compositions/${id}`, {
        method: 'DELETE',
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        message: 'Composition deleted successfully',
        composition,
      });
    }
  );
});

test('forwards a service 404 error to the client', async () => {
  const message = `Missing composition ${randomUUID()}`;

  await withServiceMocks(
    {
      findByProduct: async () => {
        const error = new Error(message);
        error.statusCode = 404;
        throw error;
      },
    },
    async () => {
      const response = await fetch(
        `${baseUrl}/api/produits/${randomUUID()}/compositions`
      );

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('returns a JSON 404 response for an unknown route', async () => {
  const path = `/api/unknown-${randomUUID()}`;
  const response = await fetch(`${baseUrl}${path}`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    status: 'error',
    message: `Route not found: GET ${path}`,
  });
});

test('production 503 errors use a generic message', async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const privateMessage = `private service detail ${randomUUID()}`;

  try {
    await withServiceMocks(
      {
        create: async () => {
          const error = new Error(privateMessage);
          error.statusCode = 503;
          throw error;
        },
      },
      async () => {
        const response = await fetch(`${baseUrl}/api/compositions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ request: randomUUID() }),
        });
        const body = await response.json();

        assert.equal(response.status, 503);
        assert.deepEqual(body, {
          status: 'error',
          message: 'Internal server error',
        });
        assert.equal(JSON.stringify(body).includes(privateMessage), false);
      }
    );
  } finally {
    restoreNodeEnv(original);
  }
});

test('production unexpected errors use status 500 and a generic message', async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const privateMessage = `unexpected internal detail ${randomUUID()}`;

  try {
    await withServiceMocks(
      {
        create: async () => {
          throw new Error(privateMessage);
        },
      },
      async () => {
        const response = await fetch(`${baseUrl}/api/compositions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ request: randomUUID() }),
        });
        const body = await response.json();

        assert.equal(response.status, 500);
        assert.deepEqual(body, {
          status: 'error',
          message: 'Internal server error',
        });
        assert.equal(JSON.stringify(body).includes(privateMessage), false);
      }
    );
  } finally {
    restoreNodeEnv(original);
  }
});
