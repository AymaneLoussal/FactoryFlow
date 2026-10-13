const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const LotStockService = require('../../src/services/LotStockService');
const app = require('../../src/app');

const serviceMethods = ['enregistrerEntree', 'findAll', 'findById', 'getStockDisponible'];
const originalServiceMethods = new Map(
  serviceMethods.map((m) => [m, LotStockService[m]])
);

let server;
let baseUrl;

function withServiceMocks(mocks, callback) {
  const originals = new Map();
  for (const [methodName, implementation] of Object.entries(mocks)) {
    originals.set(methodName, LotStockService[methodName]);
    LotStockService[methodName] = implementation;
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [methodName, original] of originals) {
        LotStockService[methodName] = original;
      }
    });
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
    LotStockService[methodName] = original;
  }
  if (server && server.listening) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

// ── POST /api/lots ────────────────────────────────────────────────────────────

test('POST /api/lots returns 201 and the created lot', async () => {
  const unique = randomUUID();
  const requestBody = {
    matiere: '64a1b2c3d4e5f60718293051',
    numeroLot: `LOT-${unique}`,
    quantite: 500,
    dateEntree: '2024-01-15',
  };
  const createdLot = { _id: `lot-${unique}`, ...requestBody };

  await withServiceMocks(
    {
      enregistrerEntree: async (data) => {
        assert.deepEqual(data, requestBody);
        return createdLot;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), createdLot);
    }
  );
});

test('POST /api/lots returns 400 for validation error', async () => {
  const message = `Validation error ${randomUUID()}`;

  await withServiceMocks(
    {
      enregistrerEntree: async () => {
        const error = new Error(message);
        error.statusCode = 400;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('POST /api/lots returns 404 when matiere does not exist', async () => {
  const message = 'Matiere not found';

  await withServiceMocks(
    {
      enregistrerEntree: async () => {
        const error = new Error(message);
        error.statusCode = 404;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matiere: '64a1b2c3d4e5f60718293099', numeroLot: 'X', quantite: 1, dateEntree: '2024-01-01' }),
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('POST /api/lots returns 409 for duplicate lot number', async () => {
  const message = 'A stock lot with this number already exists';

  await withServiceMocks(
    {
      enregistrerEntree: async () => {
        const error = new Error(message);
        error.statusCode = 409;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matiere: '64a1b2c3d4e5f60718293051', numeroLot: 'LOT-DUP', quantite: 1, dateEntree: '2024-01-01' }),
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

// ── GET /api/lots ─────────────────────────────────────────────────────────────

test('GET /api/lots returns 200 and all lots', async () => {
  const lots = [{ _id: randomUUID(), numeroLot: 'LOT-A' }];

  await withServiceMocks(
    { findAll: async (query) => { assert.deepEqual(query, {}); return lots; } },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), lots);
    }
  );
});

test('GET /api/lots?matiere=id forwards the filter', async () => {
  const matiereId = '64a1b2c3d4e5f60718293051';
  const lots = [{ _id: randomUUID() }];

  await withServiceMocks(
    {
      findAll: async (query) => {
        assert.equal(query.matiere, matiereId);
        return lots;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots?matiere=${matiereId}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), lots);
    }
  );
});

// ── GET /api/lots/:id ─────────────────────────────────────────────────────────

test('GET /api/lots/:id returns 200 and the lot', async () => {
  const id = randomUUID();
  const lot = { _id: id, numeroLot: 'LOT-B' };

  await withServiceMocks(
    {
      findById: async (receivedId) => {
        assert.equal(receivedId, id);
        return lot;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots/${id}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), lot);
    }
  );
});

test('GET /api/lots/:id returns 404 when lot not found', async () => {
  const message = 'LotStock not found';

  await withServiceMocks(
    {
      findById: async () => {
        const error = new Error(message);
        error.statusCode = 404;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/lots/${randomUUID()}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

// ── GET /api/matieres/:matiereId/stock ────────────────────────────────────────

test('GET /api/matieres/:matiereId/stock returns 200 with stock total', async () => {
  const matiereId = '64a1b2c3d4e5f60718293051';
  const stockResult = { matiere: { _id: matiereId }, stockDisponible: 750 };

  await withServiceMocks(
    {
      getStockDisponible: async (receivedId) => {
        assert.equal(receivedId, matiereId);
        return stockResult;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres/${matiereId}/stock`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), stockResult);
    }
  );
});

test('GET /api/matieres/:matiereId/stock returns 404 when matiere not found', async () => {
  const message = 'Matiere not found';

  await withServiceMocks(
    {
      getStockDisponible: async () => {
        const error = new Error(message);
        error.statusCode = 404;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/matieres/64a1b2c3d4e5f60718293099/stock`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});
