const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const LotStockRepository = require('../../src/repositories/LotStockRepository');
const MouvementRepository = require('../../src/repositories/MouvementRepository');
const LotStockService = require('../../src/services/LotStockService');

const ids = {
  matiere: '64a1b2c3d4e5f60718293051',
  lot: '64a1b2c3d4e5f60718293071',
};

const validLot = {
  _id: ids.lot,
  numeroLot: 'LOT-001',
  matiere: { _id: ids.matiere, nom: 'Acier', unite: 'kg' },
  quantiteInitiale: 500,
  quantiteRestante: 200,
  dateEntree: new Date('2024-01-15'),
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
function makeFakeSession() {
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

test('ajuster rejects invalid lotId', async () => {
  await assert.rejects(
    () => LotStockService.ajuster('not-an-id', { delta: 10, raison: 'test' }),
    (error) => { expectError(error, 400, 'lotId must be a valid MongoDB ObjectId'); return true; }
  );
});

test('ajuster rejects missing or non-object data', async () => {
  for (const bad of [null, 'string', 42, []]) {
    await assert.rejects(
      () => LotStockService.ajuster(ids.lot, bad),
      (error) => { expectError(error, 400, 'Adjustment data is required'); return true; }
    );
  }
});

test('ajuster rejects unsupported fields', async () => {
  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { delta: 10, raison: 'ok', extra: true }),
    (error) => { expectError(error, 400, 'Unsupported adjustment field(s): extra'); return true; }
  );
});

test('ajuster rejects missing delta', async () => {
  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { raison: 'test' }),
    (error) => { expectError(error, 400, 'delta is required'); return true; }
  );
});

test('ajuster rejects zero, non-finite, and non-numeric delta', async () => {
  for (const bad of [0, NaN, Infinity, -Infinity, '10']) {
    await assert.rejects(
      () => LotStockService.ajuster(ids.lot, { delta: bad, raison: 'test' }),
      (error) => { expectError(error, 400, 'delta must be a non-zero finite number'); return true; }
    );
  }
});

test('ajuster rejects missing raison', async () => {
  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { delta: 10 }),
    (error) => { expectError(error, 400, 'raison must be a non-empty string'); return true; }
  );
});

test('ajuster rejects blank raison', async () => {
  for (const bad of [null, '', '   ']) {
    await assert.rejects(
      () => LotStockService.ajuster(ids.lot, { delta: 10, raison: bad }),
      (error) => { expectError(error, 400, 'raison must be a non-empty string'); return true; }
    );
  }
});

test('ajuster throws 404 when lot does not exist', async () => {
  stub(LotStockRepository, 'findById', async () => null);
  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { delta: 10, raison: 'restock' }),
    (error) => { expectError(error, 404, 'LotStock not found'); return true; }
  );
});

test('ajuster rejects delta that would produce negative stock', async () => {
  stub(LotStockRepository, 'findById', async () => ({ ...validLot, quantiteRestante: 50 }));
  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { delta: -100, raison: 'correction' }),
    (error) => {
      expectError(error, 400, 'Adjustment would result in negative stock: current=50, delta=-100');
      return true;
    }
  );
});

test('ajuster increases quantiteRestante and creates AJUSTEMENT mouvement', async () => {
  const fakeSession = makeFakeSession();
  let committed = false;
  fakeSession.commitTransaction = async () => { committed = true; };
  const updatedLot = { ...validLot, quantiteRestante: 250 };
  let ajusterArgs;
  let mouvementData;
  let mouvementOptions;

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(LotStockRepository, 'findById', async () => validLot);
  stub(LotStockRepository, 'ajusterQuantiteRestante', async (id, delta, opts) => {
    ajusterArgs = { id, delta, opts };
    return updatedLot;
  });
  stub(MouvementRepository, 'create', async (data, options) => {
    mouvementData = data;
    mouvementOptions = options;
    return { _id: 'mv-adj-1', ...data };
  });

  const result = await LotStockService.ajuster(ids.lot, { delta: 50, raison: 'Restock received' });

  assert.deepEqual(result.lot, updatedLot);
  assert.equal(ajusterArgs.delta, 50);
  assert.equal(ajusterArgs.opts.session, fakeSession);
  assert.equal(mouvementData.type, 'AJUSTEMENT');
  assert.equal(mouvementData.quantite, 50);
  assert.equal(mouvementData.raison, 'Restock received');
  assert.equal(mouvementOptions.session, fakeSession);
  assert.ok(committed);
});

test('ajuster decreases quantiteRestante and records absolute quantite in mouvement', async () => {
  const fakeSession = makeFakeSession();
  const updatedLot = { ...validLot, quantiteRestante: 150 };
  let mouvementData;

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(LotStockRepository, 'findById', async () => validLot);
  stub(LotStockRepository, 'ajusterQuantiteRestante', async () => updatedLot);
  stub(MouvementRepository, 'create', async (data) => { mouvementData = data; return data; });

  const result = await LotStockService.ajuster(ids.lot, { delta: -50, raison: 'Damage write-off' });

  assert.equal(result.lot.quantiteRestante, 150);
  assert.equal(mouvementData.type, 'AJUSTEMENT');
  assert.equal(mouvementData.quantite, 50);
  assert.equal(mouvementData.raison, 'Damage write-off');
});

test('ajuster allows delta equal to quantiteRestante (reduces to zero)', async () => {
  const fakeSession = makeFakeSession();
  const lotWithExact = { ...validLot, quantiteRestante: 100 };
  const updatedLot = { ...lotWithExact, quantiteRestante: 0 };

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(LotStockRepository, 'findById', async () => lotWithExact);
  stub(LotStockRepository, 'ajusterQuantiteRestante', async () => updatedLot);
  stub(MouvementRepository, 'create', async (data) => data);

  const result = await LotStockService.ajuster(ids.lot, { delta: -100, raison: 'Full writeoff' });
  assert.equal(result.lot.quantiteRestante, 0);
});

test('ajuster throws 400 when concurrent $gte guard returns null', async () => {
  const fakeSession = makeFakeSession();
  let aborted = false;
  fakeSession.abortTransaction = async () => { aborted = true; };

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(LotStockRepository, 'findById', async () => validLot);
  stub(LotStockRepository, 'ajusterQuantiteRestante', async () => null);

  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { delta: -200, raison: 'race' }),
    (error) => {
      expectError(error, 400, 'Adjustment would result in negative stock (concurrent update detected)');
      return true;
    }
  );
  assert.equal(aborted, true);
});

test('ajuster aborts transaction when lot update throws', async () => {
  let aborted = false;
  const fakeSession = makeFakeSession();
  fakeSession.abortTransaction = async () => { aborted = true; };
  const dbError = new Error('disk full');

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(LotStockRepository, 'findById', async () => validLot);
  stub(LotStockRepository, 'ajusterQuantiteRestante', async () => { throw dbError; });

  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { delta: 10, raison: 'test' }),
    (error) => { assert.equal(error, dbError); return true; }
  );
  assert.equal(aborted, true);
});

test('ajuster aborts transaction when mouvement creation throws', async () => {
  let aborted = false;
  const fakeSession = makeFakeSession();
  fakeSession.abortTransaction = async () => { aborted = true; };
  const dbError = new Error('mouvement write failed');

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(LotStockRepository, 'findById', async () => validLot);
  stub(LotStockRepository, 'ajusterQuantiteRestante', async () => ({ ...validLot, quantiteRestante: 210 }));
  stub(MouvementRepository, 'create', async () => { throw dbError; });

  await assert.rejects(
    () => LotStockService.ajuster(ids.lot, { delta: 10, raison: 'test' }),
    (error) => { assert.equal(error, dbError); return true; }
  );
  assert.equal(aborted, true);
});

test('ajuster trims raison before saving', async () => {
  const fakeSession = makeFakeSession();
  let savedRaison;

  stub(mongoose, 'startSession', async () => fakeSession);
  stub(LotStockRepository, 'findById', async () => validLot);
  stub(LotStockRepository, 'ajusterQuantiteRestante', async () => validLot);
  stub(MouvementRepository, 'create', async (data) => { savedRaison = data.raison; return data; });

  await LotStockService.ajuster(ids.lot, { delta: 5, raison: '  Trimmed reason  ' });
  assert.equal(savedRaison, 'Trimmed reason');
});
