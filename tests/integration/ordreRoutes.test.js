const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const OrdreService = require('../../src/services/OrdreService');
const app = require('../../src/app');

const serviceMethods = ['create', 'findAll', 'findById', 'demarrer', 'terminer', 'annuler'];
const originalServiceMethods = new Map(
  serviceMethods.map((m) => [m, OrdreService[m]])
);

let server;
let baseUrl;

function withServiceMocks(mocks, callback) {
  const originals = new Map();
  for (const [methodName, implementation] of Object.entries(mocks)) {
    originals.set(methodName, OrdreService[methodName]);
    OrdreService[methodName] = implementation;
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [methodName, original] of originals) {
        OrdreService[methodName] = original;
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
    OrdreService[methodName] = original;
  }
  if (server && server.listening) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

// ── POST /api/ordres ─────────────────────────────────────────────────────────

test('POST /api/ordres returns 201 and created order', async () => {
  const unique = randomUUID();
  const requestBody = {
    reference: `OF-${unique}`,
    produit: '64a1b2c3d4e5f60718293041',
    quantite: 10,
  };
  const created = {
    _id: `ordre-${unique}`,
    ...requestBody,
    status: 'PLANIFIE',
    lignes: [],
  };

  await withServiceMocks(
    {
      create: async (data) => {
        assert.deepEqual(data, requestBody);
        return created;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), created);
    }
  );
});

test('POST /api/ordres returns 400 for validation failure', async () => {
  const message = 'quantite is required';

  await withServiceMocks(
    {
      create: async () => {
        const error = new Error(message);
        error.statusCode = 400;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('POST /api/ordres returns 409 for duplicate reference', async () => {
  const message = 'An order with this reference already exists';

  await withServiceMocks(
    {
      create: async () => {
        const error = new Error(message);
        error.statusCode = 409;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'DUPE' }),
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

// ── GET /api/ordres ──────────────────────────────────────────────────────────

test('GET /api/ordres returns 200 and list of orders', async () => {
  const orders = [{ _id: 'o1', reference: 'OF-1' }, { _id: 'o2', reference: 'OF-2' }];

  await withServiceMocks(
    {
      findAll: async () => orders,
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), orders);
    }
  );
});

test('GET /api/ordres?status=PLANIFIE forwards query filter', async () => {
  const orders = [{ _id: 'o1', reference: 'OF-1', status: 'PLANIFIE' }];

  await withServiceMocks(
    {
      findAll: async (query) => {
        assert.equal(query.status, 'PLANIFIE');
        return orders;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres?status=PLANIFIE`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), orders);
    }
  );
});

// ── GET /api/ordres/:id ──────────────────────────────────────────────────────

test('GET /api/ordres/:id returns 200 and order details with lines', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const order = { _id: id, reference: 'OF-1', lignes: [{ quantiteDemandee: 20 }] };

  await withServiceMocks(
    {
      findById: async (receivedId) => {
        assert.equal(receivedId, id);
        return order;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), order);
    }
  );
});

test('GET /api/ordres/:id returns 404 when order not found', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const message = 'OrdreFabrication not found';

  await withServiceMocks(
    {
      findById: async () => {
        const error = new Error(message);
        error.statusCode = 404;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

// ── POST /api/ordres/:id/demarrer & /start ────────────────────────────────────

test('POST /api/ordres/:id/demarrer returns 200 and start results', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const startResult = {
    message: 'Order started successfully',
    ordre: { _id: id, status: 'EN_COURS' },
    mouvements: [{ type: 'SORTIE', quantite: 20 }],
  };

  await withServiceMocks(
    {
      demarrer: async (receivedId) => {
        assert.equal(receivedId, id);
        return startResult;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/demarrer`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), startResult);
    }
  );
});

test('POST /api/ordres/:id/start alias also starts order', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const startResult = {
    message: 'Order started successfully',
    ordre: { _id: id, status: 'EN_COURS' },
    mouvements: [{ type: 'SORTIE', quantite: 20 }],
  };

  await withServiceMocks(
    {
      demarrer: async (receivedId) => {
        assert.equal(receivedId, id);
        return startResult;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/start`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), startResult);
    }
  );
});

test('POST /api/ordres/:id/demarrer returns 400 when stock is insufficient', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const message = 'Insufficient stock for material Bois: required 50, available 20';

  await withServiceMocks(
    {
      demarrer: async () => {
        const error = new Error(message);
        error.statusCode = 400;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/demarrer`, {
        method: 'POST',
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('POST /api/ordres/:id/demarrer returns 409 when order is already in progress', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const message = 'Order is already in progress';

  await withServiceMocks(
    {
      demarrer: async () => {
        const error = new Error(message);
        error.statusCode = 409;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/demarrer`, {
        method: 'POST',
      });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

// ── POST /api/ordres/:id/terminer & /complete ────────────────────────────────

test('POST /api/ordres/:id/terminer returns 200 and completion results', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const completeResult = {
    message: 'Order completed successfully',
    ordre: { _id: id, status: 'TERMINE', dateFin: new Date().toISOString() },
  };

  await withServiceMocks(
    {
      terminer: async (receivedId) => {
        assert.equal(receivedId, id);
        return completeResult;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/terminer`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), completeResult);
    }
  );
});

test('POST /api/ordres/:id/complete alias also completes order', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const completeResult = {
    message: 'Order completed successfully',
    ordre: { _id: id, status: 'TERMINE' },
  };

  await withServiceMocks(
    {
      terminer: async (receivedId) => {
        assert.equal(receivedId, id);
        return completeResult;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/complete`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), completeResult);
    }
  );
});

test('POST /api/ordres/:id/terminer returns 404 when order does not exist', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const message = 'OrdreFabrication not found';

  await withServiceMocks(
    {
      terminer: async () => {
        const error = new Error(message);
        error.statusCode = 404;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/terminer`, {
        method: 'POST',
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('POST /api/ordres/:id/terminer returns 409 when order is in invalid status', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const message = 'Cannot complete an order that is planned and not in progress';

  await withServiceMocks(
    {
      terminer: async () => {
        const error = new Error(message);
        error.statusCode = 409;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/terminer`, {
        method: 'POST',
      });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

// ── POST /api/ordres/:id/annuler & /cancel ──────────────────────────────────

test('POST /api/ordres/:id/annuler returns 200 and cancellation results', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const cancelResult = {
    message: 'Order cancelled successfully',
    ordre: { _id: id, status: 'ANNULE' },
  };

  await withServiceMocks(
    {
      annuler: async (receivedId) => {
        assert.equal(receivedId, id);
        return cancelResult;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/annuler`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), cancelResult);
    }
  );
});

test('POST /api/ordres/:id/cancel alias also cancels order', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const cancelResult = {
    message: 'Order cancelled successfully',
    ordre: { _id: id, status: 'ANNULE' },
  };

  await withServiceMocks(
    {
      annuler: async (receivedId) => {
        assert.equal(receivedId, id);
        return cancelResult;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/cancel`, {
        method: 'POST',
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), cancelResult);
    }
  );
});

test('POST /api/ordres/:id/annuler returns 400 when order is in progress', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const message = 'Cannot cancel an order in progress: materials have already been consumed';

  await withServiceMocks(
    {
      annuler: async () => {
        const error = new Error(message);
        error.statusCode = 400;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/annuler`, {
        method: 'POST',
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});

test('POST /api/ordres/:id/annuler returns 409 when order is already cancelled', async () => {
  const id = '64a1b2c3d4e5f60718293061';
  const message = 'Order is already cancelled';

  await withServiceMocks(
    {
      annuler: async () => {
        const error = new Error(message);
        error.statusCode = 409;
        throw error;
      },
    },
    async () => {
      const response = await fetch(`${baseUrl}/api/ordres/${id}/annuler`, {
        method: 'POST',
      });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { status: 'error', message });
    }
  );
});
