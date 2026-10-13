const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const LotStockRepository = require('../../src/repositories/LotStockRepository');
const MouvementRepository = require('../../src/repositories/MouvementRepository');
const MatiereRepository = require('../../src/repositories/MatiereRepository');
const LotStockService = require('../../src/services/LotStockService');

const ids = {
  matiere: '64a1b2c3d4e5f60718293051',
  matiere2: '64a1b2c3d4e5f60718293052',
  lot: '64a1b2c3d4e5f60718293071',
};

const validMatiere = {
  _id: ids.matiere,
  reference: 'MAT-001',
  nom: 'Acier',
  unite: 'kg',
  seuilAlerte: 100,
};

const validEntreeData = {
  matiere: ids.matiere,
  numeroLot: 'LOT-001',
  quantite: 500,
  dateEntree: '2024-01-15',
};

// ── Stub helpers ─────────────────────────────────────────────────────────────

const originalMethods = [];

function stub(target, methodName, implementation) {
  originalMethods.push({ target, methodName, original: target[methodName] });
  target[methodName] = implementation;
}

function expectError(error, statusCode, message) {
  assert.equal(error.statusCode, statusCode);
  assert.equal(error.message, message);
}

test.afterEach(() => {
  for (const { target, methodName, original } of originalMethods.reverse()) {
    target[methodName] = original;
  }
  originalMethods.length = 0;
});

// ── enregistrerEntree validation ─────────────────────────────────────────────

test('rejects missing or non-object lot data', async () => {
  for (const bad of [null, 'string', 42, []]) {
    await assert.rejects(
      () => LotStockService.enregistrerEntree(bad),
      (error) => { expectError(error, 400, 'Lot data is required'); return true; }
    );
  }
});

test('rejects unsupported lot fields', async () => {
  await assert.rejects(
    () => LotStockService.enregistrerEntree({ ...validEntreeData, extra: true }),
    (error) => { expectError(error, 400, 'Unsupported lot field(s): extra'); return true; }
  );
});

test('rejects missing matiere', async () => {
  const { matiere: _, ...rest } = validEntreeData;
  await assert.rejects(
    () => LotStockService.enregistrerEntree(rest),
    (error) => { expectError(error, 400, 'matiere is required'); return true; }
  );
});

test('rejects invalid matiere ObjectId', async () => {
  await assert.rejects(
    () => LotStockService.enregistrerEntree({ ...validEntreeData, matiere: 'bad-id' }),
    (error) => { expectError(error, 400, 'matiere must be a valid MongoDB ObjectId'); return true; }
  );
});

test('rejects missing or blank numeroLot', async () => {
  for (const bad of [null, '', '   ']) {
    await assert.rejects(
      () => LotStockService.enregistrerEntree({ ...validEntreeData, numeroLot: bad }),
      (error) => { expectError(error, 400, 'numeroLot must be a non-empty string'); return true; }
    );
  }
});

test('rejects missing quantite', async () => {
  const { quantite: _, ...rest } = validEntreeData;
  await assert.rejects(
    () => LotStockService.enregistrerEntree(rest),
    (error) => { expectError(error, 400, 'quantite is required'); return true; }
  );
});

test('rejects non-positive, non-finite, or non-numeric quantite', async () => {
  for (const bad of [0, -1, NaN, Infinity, '500']) {
    await assert.rejects(
      () => LotStockService.enregistrerEntree({ ...validEntreeData, quantite: bad }),
      (error) => { expectError(error, 400, 'quantite must be a finite positive number'); return true; }
    );
  }
});

test('rejects missing dateEntree', async () => {
  const { dateEntree: _, ...rest } = validEntreeData;
  await assert.rejects(
    () => LotStockService.enregistrerEntree(rest),
    (error) => { expectError(error, 400, 'dateEntree is required'); return true; }
  );
});

test('rejects invalid dateEntree', async () => {
  await assert.rejects(
    () => LotStockService.enregistrerEntree({ ...validEntreeData, dateEntree: 'not-a-date' }),
    (error) => { expectError(error, 400, 'dateEntree must be a valid date'); return true; }
  );
});

test('rejects dateExpiration earlier than dateEntree', async () => {
  await assert.rejects(
    () => LotStockService.enregistrerEntree({
      ...validEntreeData,
      dateEntree: '2024-06-01',
      dateExpiration: '2024-05-31',
    }),
    (error) => { expectError(error, 400, 'dateExpiration cannot be earlier than dateEntree'); return true; }
  );
});

test('rejects invalid dateExpiration', async () => {
  await assert.rejects(
    () => LotStockService.enregistrerEntree({ ...validEntreeData, dateExpiration: 'bad-date' }),
    (error) => { expectError(error, 400, 'dateExpiration must be a valid date'); return true; }
  );
});

// ── enregistrerEntree — business rules ───────────────────────────────────────

test('throws 404 when matiere does not exist', async () => {
  stub(MatiereRepository, 'findById', async () => null);
  stub(LotStockRepository, 'findByNumeroLot', async () => null);

  await assert.rejects(
    () => LotStockService.enregistrerEntree(validEntreeData),
    (error) => { expectError(error, 404, 'Matiere not found'); return true; }
  );
});

test('throws 409 when numeroLot already exists', async () => {
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'findByNumeroLot', async () => ({ _id: ids.lot }));

  await assert.rejects(
    () => LotStockService.enregistrerEntree(validEntreeData),
    (error) => { expectError(error, 409, 'A stock lot with this number already exists'); return true; }
  );
});

test('creates lot and mouvement in a transaction', async () => {
  const fakeSession = {
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: async () => {},
  };

  const createdLot = {
    _id: ids.lot,
    numeroLot: 'LOT-001',
    matiere: ids.matiere,
    quantiteInitiale: 500,
    quantiteRestante: 500,
    dateEntree: new Date('2024-01-15'),
  };

  let lotCreateOptions;
  let mouvementCreateData;
  let mouvementCreateOptions;

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'findByNumeroLot', async () => null);
  stub(LotStockRepository, 'create', async (data, options) => {
    lotCreateOptions = options;
    return createdLot;
  });
  stub(MouvementRepository, 'create', async (data, options) => {
    mouvementCreateData = data;
    mouvementCreateOptions = options;
    return { _id: 'mv-1', ...data };
  });

  const result = await LotStockService.enregistrerEntree(validEntreeData);

  assert.deepEqual(result, createdLot);
  assert.equal(lotCreateOptions.session, fakeSession);
  assert.equal(mouvementCreateData.type, 'ENTREE');
  assert.equal(mouvementCreateData.quantite, 500);
  assert.deepEqual(String(mouvementCreateData.lot), String(createdLot._id));
  assert.equal(mouvementCreateOptions.session, fakeSession);
});

test('aborts the transaction and re-throws when lot creation fails', async () => {
  let aborted = false;
  const fakeSession = {
    startTransaction: () => {},
    commitTransaction: async () => { throw new Error('should not commit'); },
    abortTransaction: async () => { aborted = true; },
    endSession: async () => {},
  };

  const dbError = new Error('disk full');

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'findByNumeroLot', async () => null);
  stub(LotStockRepository, 'create', async () => { throw dbError; });

  await assert.rejects(
    () => LotStockService.enregistrerEntree(validEntreeData),
    (error) => { assert.equal(error, dbError); return true; }
  );

  assert.equal(aborted, true);
});

test('aborts the transaction and maps mongo 11000 to 409', async () => {
  let aborted = false;
  const fakeSession = {
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => { aborted = true; },
    endSession: async () => {},
  };

  const dupeError = Object.assign(new Error('E11000'), { code: 11000 });

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'findByNumeroLot', async () => null);
  stub(LotStockRepository, 'create', async () => { throw dupeError; });

  await assert.rejects(
    () => LotStockService.enregistrerEntree(validEntreeData),
    (error) => { expectError(error, 409, 'A stock lot with this number already exists'); return true; }
  );

  assert.equal(aborted, true);
});

test('trims numeroLot before saving', async () => {
  const fakeSession = {
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: async () => {},
  };

  let savedNumeroLot;
  stub(mongoose, 'startSession', async () => fakeSession);
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'findByNumeroLot', async () => null);
  stub(LotStockRepository, 'create', async (data) => {
    savedNumeroLot = data.numeroLot;
    return { _id: ids.lot, ...data };
  });
  stub(MouvementRepository, 'create', async (data) => data);

  await LotStockService.enregistrerEntree({ ...validEntreeData, numeroLot: '  LOT-TRIM  ' });
  assert.equal(savedNumeroLot, 'LOT-TRIM');
});

test('sets quantiteInitiale and quantiteRestante to the incoming quantity', async () => {
  const fakeSession = {
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: async () => {},
  };

  let savedData;
  stub(mongoose, 'startSession', async () => fakeSession);
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'findByNumeroLot', async () => null);
  stub(LotStockRepository, 'create', async (data) => {
    savedData = data;
    return { _id: ids.lot, ...data };
  });
  stub(MouvementRepository, 'create', async (data) => data);

  await LotStockService.enregistrerEntree({ ...validEntreeData, quantite: 250 });

  assert.equal(savedData.quantiteInitiale, 250);
  assert.equal(savedData.quantiteRestante, 250);
});

// ── findAll ───────────────────────────────────────────────────────────────────

test('findAll returns all lots when no filter given', async () => {
  const lots = [{ _id: ids.lot }];
  let receivedFilter;
  stub(LotStockRepository, 'findAll', async (filter) => {
    receivedFilter = filter;
    return lots;
  });

  const result = await LotStockService.findAll({});
  assert.deepEqual(result, lots);
  assert.deepEqual(receivedFilter, {});
});

test('findAll filters by matiere when provided', async () => {
  const lots = [{ _id: ids.lot }];
  let receivedFilter;
  stub(LotStockRepository, 'findAll', async (filter) => {
    receivedFilter = filter;
    return lots;
  });

  await LotStockService.findAll({ matiere: ids.matiere });
  assert.ok(receivedFilter.matiere instanceof mongoose.Types.ObjectId);
  assert.equal(String(receivedFilter.matiere), ids.matiere);
});

test('findAll rejects invalid matiere filter ObjectId', async () => {
  await assert.rejects(
    () => LotStockService.findAll({ matiere: 'bad' }),
    (error) => { expectError(error, 400, 'matiere must be a valid MongoDB ObjectId'); return true; }
  );
});

// ── findById ─────────────────────────────────────────────────────────────────

test('findById returns a lot when it exists', async () => {
  const lot = { _id: ids.lot };
  stub(LotStockRepository, 'findById', async () => lot);
  const result = await LotStockService.findById(ids.lot);
  assert.deepEqual(result, lot);
});

test('findById throws 400 for invalid ObjectId', async () => {
  await assert.rejects(
    () => LotStockService.findById('not-an-id'),
    (error) => { expectError(error, 400, 'id must be a valid MongoDB ObjectId'); return true; }
  );
});

test('findById throws 404 when lot does not exist', async () => {
  stub(LotStockRepository, 'findById', async () => null);
  await assert.rejects(
    () => LotStockService.findById(ids.lot),
    (error) => { expectError(error, 404, 'LotStock not found'); return true; }
  );
});

// ── getStockDisponible ────────────────────────────────────────────────────────

test('getStockDisponible returns matiere and aggregated stock', async () => {
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'sumQuantiteRestanteByMatiere', async () => [{ total: 750 }]);

  const result = await LotStockService.getStockDisponible(ids.matiere);
  assert.deepEqual(result, { matiere: validMatiere, stockDisponible: 750 });
});

test('getStockDisponible returns 0 when no lots exist', async () => {
  stub(MatiereRepository, 'findById', async () => validMatiere);
  stub(LotStockRepository, 'sumQuantiteRestanteByMatiere', async () => []);

  const result = await LotStockService.getStockDisponible(ids.matiere);
  assert.equal(result.stockDisponible, 0);
});

test('getStockDisponible throws 400 for invalid matiereId', async () => {
  await assert.rejects(
    () => LotStockService.getStockDisponible('bad'),
    (error) => { expectError(error, 400, 'matiereId must be a valid MongoDB ObjectId'); return true; }
  );
});

test('getStockDisponible throws 404 when matiere does not exist', async () => {
  stub(MatiereRepository, 'findById', async () => null);
  await assert.rejects(
    () => LotStockService.getStockDisponible(ids.matiere),
    (error) => { expectError(error, 404, 'Matiere not found'); return true; }
  );
});
