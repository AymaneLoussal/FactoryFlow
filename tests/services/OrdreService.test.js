const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const OrdreService = require('../../src/services/OrdreService');
const OrdreRepository = require('../../src/repositories/OrdreRepository');
const LigneOrdreRepository = require('../../src/repositories/LigneOrdreRepository');
const LotStockRepository = require('../../src/repositories/LotStockRepository');
const MouvementRepository = require('../../src/repositories/MouvementRepository');
const CompositionProduit = require('../../src/models/CompositionProduit');
const Produit = require('../../src/models/Produit');

const ids = {
  produit: '64a1b2c3d4e5f60718293041',
  matiereA: '64a1b2c3d4e5f60718293051',
  matiereB: '64a1b2c3d4e5f60718293052',
  ordre: '64a1b2c3d4e5f60718293061',
  lot1: '64a1b2c3d4e5f60718293071',
  lot2: '64a1b2c3d4e5f60718293072',
  lot3: '64a1b2c3d4e5f60718293073',
};

const validProduit = {
  _id: ids.produit,
  reference: 'PROD-001',
  nom: 'Chaise Bois',
};

const validComposition = [
  {
    produit: ids.produit,
    matiere: { _id: ids.matiereA, nom: 'Planche de bois', reference: 'MAT-BOIS', unite: 'm3' },
    quantiteUnitaire: 2,
  },
  {
    produit: ids.produit,
    matiere: { _id: ids.matiereB, nom: 'Vis acier', reference: 'MAT-VIS', unite: 'piece' },
    quantiteUnitaire: 8,
  },
];

const validCreateData = {
  reference: 'OF-001',
  produit: ids.produit,
  quantite: 10,
};

const originalMethods = [];

function stub(target, methodName, implementation) {
  originalMethods.push({ target, methodName, original: target[methodName] });
  target[methodName] = implementation;
}

function expectError(error, statusCode, message) {
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.message, message);
}

function createFakeSession() {
  return {
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: async () => {},
  };
}

test.afterEach(() => {
  for (const { target, methodName, original } of originalMethods.reverse()) {
    target[methodName] = original;
  }
  originalMethods.length = 0;
});

// ── OrdreService.create ──────────────────────────────────────────────────────

test('rejects missing or non-object order data', async () => {
  for (const bad of [null, 'string', 42, []]) {
    await assert.rejects(
      () => OrdreService.create(bad),
      (error) => { expectError(error, 400, 'Order data is required'); return true; }
    );
  }
});

test('rejects unsupported order creation fields', async () => {
  await assert.rejects(
    () => OrdreService.create({ ...validCreateData, extraField: 'invalid' }),
    (error) => { expectError(error, 400, 'Unsupported order field(s): extraField'); return true; }
  );
});

test('rejects missing or blank reference', async () => {
  for (const bad of [null, '', '   ']) {
    await assert.rejects(
      () => OrdreService.create({ ...validCreateData, reference: bad }),
      (error) => { expectError(error, 400, 'reference must be a non-empty string'); return true; }
    );
  }
});

test('rejects missing or invalid produit ObjectId', async () => {
  const { produit: _, ...noProduit } = validCreateData;
  await assert.rejects(
    () => OrdreService.create(noProduit),
    (error) => { expectError(error, 400, 'produit is required'); return true; }
  );

  await assert.rejects(
    () => OrdreService.create({ ...validCreateData, produit: 'invalid-id' }),
    (error) => { expectError(error, 400, 'produit must be a valid MongoDB ObjectId'); return true; }
  );
});

test('rejects missing, non-integer, zero, or negative quantite', async () => {
  const { quantite: _, ...noQuantite } = validCreateData;
  await assert.rejects(
    () => OrdreService.create(noQuantite),
    (error) => { expectError(error, 400, 'quantite is required'); return true; }
  );

  for (const bad of [0, -5, 2.5, NaN, Infinity, '10']) {
    await assert.rejects(
      () => OrdreService.create({ ...validCreateData, quantite: bad }),
      (error) => { expectError(error, 400, 'quantite must be an integer greater than or equal to 1'); return true; }
    );
  }
});

test('rejects creation when reference already exists', async () => {
  stub(OrdreRepository, 'findByReference', async () => ({ _id: ids.ordre }));

  await assert.rejects(
    () => OrdreService.create(validCreateData),
    (error) => { expectError(error, 409, 'An order with this reference already exists'); return true; }
  );
});

test('rejects creation when produit does not exist', async () => {
  stub(OrdreRepository, 'findByReference', async () => null);
  stub(Produit, 'findById', async () => null);

  await assert.rejects(
    () => OrdreService.create(validCreateData),
    (error) => { expectError(error, 404, 'Produit not found'); return true; }
  );
});

test('rejects creation when product has no composition defined', async () => {
  stub(OrdreRepository, 'findByReference', async () => null);
  stub(Produit, 'findById', async () => validProduit);
  stub(CompositionProduit, 'find', () => ({
    populate: async () => [],
  }));

  await assert.rejects(
    () => OrdreService.create(validCreateData),
    (error) => { expectError(error, 400, 'Product has no composition defined'); return true; }
  );
});

test('creates order and LigneOrdre snapshot successfully with quantiteDemandee calculated', async () => {
  const fakeSession = createFakeSession();
  let createdOrderData;
  let createdLignesData;

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(OrdreRepository, 'findByReference', async () => null);
  stub(Produit, 'findById', async () => validProduit);
  stub(CompositionProduit, 'find', () => ({
    populate: async () => validComposition,
  }));
  stub(OrdreRepository, 'create', async (data) => {
    createdOrderData = data;
    return { _id: ids.ordre, ...data };
  });
  stub(LigneOrdreRepository, 'createMany', async (items) => {
    createdLignesData = items;
    return items.map((it, idx) => ({ _id: `ligne-${idx}`, ...it }));
  });

  const result = await OrdreService.create({
    reference: '  OF-001  ',
    produit: ids.produit,
    quantite: 10,
  });

  assert.equal(createdOrderData.reference, 'OF-001');
  assert.equal(createdOrderData.status, 'PLANIFIE');
  assert.equal(createdOrderData.quantite, 10);
  assert.equal(createdLignesData.length, 2);

  // Material A: 10 * 2 = 20
  assert.equal(createdLignesData[0].quantiteDemandee, 20);
  assert.equal(createdLignesData[0].quantiteConsommee, 0);
  assert.equal(createdLignesData[0].unite, 'm3');

  // Material B: 10 * 8 = 80
  assert.equal(createdLignesData[1].quantiteDemandee, 80);
  assert.equal(createdLignesData[1].quantiteConsommee, 0);
  assert.equal(createdLignesData[1].unite, 'piece');

  assert.equal(result._id, ids.ordre);
  assert.equal(result.lignes.length, 2);
});

// ── OrdreService.findAll & findById ──────────────────────────────────────────

test('findAll returns orders with optional filters', async () => {
  const orders = [{ _id: ids.ordre, reference: 'OF-001' }];
  let receivedFilter;

  stub(OrdreRepository, 'findAll', async (filter) => {
    receivedFilter = filter;
    return orders;
  });

  const result = await OrdreService.findAll({ status: 'PLANIFIE', produit: ids.produit });
  assert.deepEqual(result, orders);
  assert.equal(receivedFilter.status, 'PLANIFIE');
  assert.ok(receivedFilter.produit instanceof mongoose.Types.ObjectId);
});

test('findById returns order and its snapshot lines', async () => {
  const orderDoc = { _id: ids.ordre, reference: 'OF-001', status: 'PLANIFIE' };
  const lines = [{ _id: 'l1', quantiteDemandee: 20 }];

  stub(OrdreRepository, 'findById', async () => orderDoc);
  stub(LigneOrdreRepository, 'findByOrdre', async () => lines);

  const result = await OrdreService.findById(ids.ordre);
  assert.equal(result.reference, 'OF-001');
  assert.deepEqual(result.lignes, lines);
});

test('findById throws 404 when order does not exist', async () => {
  stub(OrdreRepository, 'findById', async () => null);

  await assert.rejects(
    () => OrdreService.findById(ids.ordre),
    (error) => { expectError(error, 404, 'OrdreFabrication not found'); return true; }
  );
});

// ── OrdreService.demarrer (FIFO Consumption & Atomicity) ─────────────────────

test('demarrer throws 404 when order does not exist', async () => {
  stub(mongoose, 'startSession', async () => createFakeSession());
  stub(OrdreRepository, 'findById', async () => null);

  await assert.rejects(
    () => OrdreService.demarrer(ids.ordre),
    (error) => { expectError(error, 404, 'OrdreFabrication not found'); return true; }
  );
});

test('demarrer prevents double consumption when order is already EN_COURS', async () => {
  stub(mongoose, 'startSession', async () => createFakeSession());
  stub(OrdreRepository, 'findById', async () => ({ _id: ids.ordre, status: 'EN_COURS' }));

  await assert.rejects(
    () => OrdreService.demarrer(ids.ordre),
    (error) => { expectError(error, 409, 'Order is already in progress'); return true; }
  );
});

test('demarrer rejects when order status is TERMINE or ANNULE', async () => {
  stub(mongoose, 'startSession', async () => createFakeSession());
  stub(OrdreRepository, 'findById', async () => ({ _id: ids.ordre, status: 'TERMINE' }));

  await assert.rejects(
    () => OrdreService.demarrer(ids.ordre),
    (error) => { expectError(error, 409, 'Order is already completed'); return true; }
  );
});

test('demarrer rejects when stock is insufficient for a material, with no changes made', async () => {
  let sessionAborted = false;
  const fakeSession = {
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => { sessionAborted = true; },
    endSession: async () => {},
  };

  const order = { _id: ids.ordre, reference: 'OF-001', status: 'PLANIFIE', quantite: 10 };
  const lines = [
    {
      _id: 'l1',
      matiere: { _id: ids.matiereA, nom: 'Planche de bois' },
      quantiteDemandee: 20,
      quantiteConsommee: 0,
    },
  ];

  // Only 15 available, 20 needed
  const availableLots = [
    { _id: ids.lot1, matiere: ids.matiereA, quantiteRestante: 15, dateEntree: new Date('2024-01-01') },
  ];

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(OrdreRepository, 'findById', async () => order);
  stub(LigneOrdreRepository, 'findByOrdre', async () => lines);
  stub(LotStockRepository, 'findAvailableByMatiere', async () => availableLots);

  await assert.rejects(
    () => OrdreService.demarrer(ids.ordre),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.ok(error.message.includes('Insufficient stock for material Planche de bois'));
      return true;
    }
  );

  assert.equal(sessionAborted, true);
});

test('demarrer consumes stock across multiple lots in FIFO order', async () => {
  const fakeSession = createFakeSession();
  const order = {
    _id: ids.ordre,
    reference: 'OF-001',
    status: 'PLANIFIE',
    quantite: 10,
  };

  const lines = [
    {
      _id: 'l1',
      matiere: { _id: ids.matiereA, nom: 'Planche de bois' },
      quantiteDemandee: 25,
      quantiteConsommee: 0,
    },
  ];

  // Three lots available in FIFO order:
  // lot1: 10 units (entered 2024-01-01) -> fully consumed (remaining: 0)
  // lot2: 10 units (entered 2024-01-05) -> fully consumed (remaining: 0)
  // lot3: 20 units (entered 2024-01-10) -> partially consumed: 5 units (remaining: 15)
  const lots = [
    { _id: ids.lot1, matiere: ids.matiereA, quantiteRestante: 10, dateEntree: new Date('2024-01-01') },
    { _id: ids.lot2, matiere: ids.matiereA, quantiteRestante: 10, dateEntree: new Date('2024-01-05') },
    { _id: ids.lot3, matiere: ids.matiereA, quantiteRestante: 20, dateEntree: new Date('2024-01-10') },
  ];

  const updatedLotQuantities = new Map();
  const createdMouvements = [];
  let updatedLineConsommee = null;
  let updatedOrderStatus = null;

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(OrdreRepository, 'findById', async () => order);
  stub(LigneOrdreRepository, 'findByOrdre', async () => lines);
  stub(LotStockRepository, 'findAvailableByMatiere', async () => lots);

  stub(LotStockRepository, 'updateQuantiteRestante', async (lotId, newQty) => {
    updatedLotQuantities.set(String(lotId), newQty);
    return { _id: lotId, quantiteRestante: newQty };
  });

  stub(MouvementRepository, 'create', async (mouvementData) => {
    createdMouvements.push(mouvementData);
    return { _id: `mv-${createdMouvements.length}`, ...mouvementData };
  });

  stub(LigneOrdreRepository, 'updateConsommation', async (lineId, qty) => {
    updatedLineConsommee = qty;
    return { _id: lineId, quantiteConsommee: qty };
  });

  stub(OrdreRepository, 'updateStatus', async (orderId, status, extra) => {
    updatedOrderStatus = { status, ...extra };
    return { _id: orderId, reference: 'OF-001', status, ...extra };
  });

  const result = await OrdreService.demarrer(ids.ordre);

  // Lot 1: fully taken 10 -> remaining 0
  assert.equal(updatedLotQuantities.get(ids.lot1), 0);
  // Lot 2: fully taken 10 -> remaining 0
  assert.equal(updatedLotQuantities.get(ids.lot2), 0);
  // Lot 3: partially taken 5 -> remaining 15
  assert.equal(updatedLotQuantities.get(ids.lot3), 15);

  // Three SORTIE movements created
  assert.equal(createdMouvements.length, 3);
  assert.equal(createdMouvements[0].lot, ids.lot1);
  assert.equal(createdMouvements[0].quantite, 10);
  assert.equal(createdMouvements[0].type, 'SORTIE');

  assert.equal(createdMouvements[1].lot, ids.lot2);
  assert.equal(createdMouvements[1].quantite, 10);

  assert.equal(createdMouvements[2].lot, ids.lot3);
  assert.equal(createdMouvements[2].quantite, 5);

  // Line quantiteConsommee updated to 25
  assert.equal(updatedLineConsommee, 25);

  // Order status updated to EN_COURS
  assert.equal(updatedOrderStatus.status, 'EN_COURS');
  assert.ok(updatedOrderStatus.dateDebut instanceof Date);

  assert.equal(result.message, 'Order started successfully');
});

test('demarrer rolls back transaction when movement creation fails', async () => {
  let sessionAborted = false;
  const fakeSession = {
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => { sessionAborted = true; },
    endSession: async () => {},
  };

  const order = { _id: ids.ordre, reference: 'OF-001', status: 'PLANIFIE', quantite: 1 };
  const lines = [
    {
      _id: 'l1',
      matiere: { _id: ids.matiereA, nom: 'Planche' },
      quantiteDemandee: 5,
      quantiteConsommee: 0,
    },
  ];
  const lots = [
    { _id: ids.lot1, matiere: ids.matiereA, quantiteRestante: 10, dateEntree: new Date('2024-01-01') },
  ];

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(OrdreRepository, 'findById', async () => order);
  stub(LigneOrdreRepository, 'findByOrdre', async () => lines);
  stub(LotStockRepository, 'findAvailableByMatiere', async () => lots);
  stub(LotStockRepository, 'updateQuantiteRestante', async () => ({}));
  stub(MouvementRepository, 'create', async () => {
    throw new Error('Database write error');
  });

  await assert.rejects(
    () => OrdreService.demarrer(ids.ordre),
    (error) => {
      assert.equal(error.message, 'Database write error');
      return true;
    }
  );

  assert.equal(sessionAborted, true);
});
