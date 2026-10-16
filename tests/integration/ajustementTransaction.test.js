const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const LotStock = require('../../src/models/LotStock');
const Matiere = require('../../src/models/Matiere');
const Mouvement = require('../../src/models/Mouvement');
const LotStockService = require('../../src/services/LotStockService');

function getTestDatabaseUri() {
  if (process.env.TEST_MONGO_URI) return process.env.TEST_MONGO_URI;
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI.replace(/\/[^/?]+(\?|$)/, '/factoryflow_test_ajust_tx$1');
  }
  return 'mongodb://127.0.0.1:27017/factoryflow_test_ajust_tx?directConnection=true';
}

const TEST_DB_URI = getTestDatabaseUri();
let isReplSetReady = false;

async function safeCleanTestDb() {
  if (
    mongoose.connection &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.db &&
    mongoose.connection.db.databaseName === 'factoryflow_test_ajust_tx'
  ) {
    await mongoose.connection.dropDatabase();
  }
}

test.before(async () => {
  try {
    await mongoose.connect(TEST_DB_URI, { serverSelectionTimeoutMS: 1500 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (hello.setName) {
      await safeCleanTestDb();
      isReplSetReady = true;
    } else {
      await mongoose.disconnect();
    }
  } catch {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
});

test.after(async () => {
  if (isReplSetReady && mongoose.connection.readyState === 1) {
    try { await safeCleanTestDb(); } finally { await mongoose.disconnect(); }
  }
});

test('real MongoDB transaction: AJUSTEMENT increase updates lot and creates mouvement', async (t) => {
  if (!isReplSetReady) {
    t.skip('MongoDB replica set rs0 is not active on this host (standalone MongoDB detected or Docker stopped)');
    return;
  }

  const matiere = await Matiere.create({ reference: 'MAT-ADJ-1', nom: 'Bois', unite: 'kg', seuilAlerte: 10 });
  const lot = await LotStock.create({
    numeroLot: 'LOT-ADJ-1',
    matiere: matiere._id,
    quantiteInitiale: 100,
    quantiteRestante: 100,
    dateEntree: new Date('2024-03-01'),
  });

  const result = await LotStockService.ajuster(String(lot._id), { delta: 50, raison: 'Receiving extra stock' });

  assert.equal(result.lot.quantiteRestante, 150);
  assert.equal(result.mouvement.type, 'AJUSTEMENT');
  assert.equal(result.mouvement.quantite, 50);
  assert.equal(result.mouvement.raison, 'Receiving extra stock');

  const dbLot = await LotStock.findById(lot._id);
  assert.equal(dbLot.quantiteRestante, 150);

  const dbMouvements = await Mouvement.find({ lot: lot._id, type: 'AJUSTEMENT' });
  assert.equal(dbMouvements.length, 1);
  assert.equal(dbMouvements[0].quantite, 50);
});

test('real MongoDB transaction: AJUSTEMENT decrease updates lot and creates mouvement', async (t) => {
  if (!isReplSetReady) {
    t.skip('MongoDB replica set rs0 is not active on this host (standalone MongoDB detected or Docker stopped)');
    return;
  }

  const lot = await LotStock.findOne({ numeroLot: 'LOT-ADJ-1' });

  const result = await LotStockService.ajuster(String(lot._id), { delta: -30, raison: 'Damage correction' });

  assert.equal(result.lot.quantiteRestante, 120);
  assert.equal(result.mouvement.quantite, 30);
  assert.equal(result.mouvement.raison, 'Damage correction');

  const dbLot = await LotStock.findById(lot._id);
  assert.equal(dbLot.quantiteRestante, 120);
});

test('real MongoDB transaction: AJUSTEMENT rejects negative stock', async (t) => {
  if (!isReplSetReady) {
    t.skip('MongoDB replica set rs0 is not active on this host (standalone MongoDB detected or Docker stopped)');
    return;
  }

  const lot = await LotStock.findOne({ numeroLot: 'LOT-ADJ-1' });
  const beforeQuantite = lot.quantiteRestante;

  await assert.rejects(
    () => LotStockService.ajuster(String(lot._id), { delta: -99999, raison: 'overdraft attempt' }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('Adjustment would result in negative stock'));
      return true;
    }
  );

  // DB state must be unchanged
  const dbLot = await LotStock.findById(lot._id);
  assert.equal(dbLot.quantiteRestante, beforeQuantite);

  const dbMouvements = await Mouvement.find({ lot: lot._id, type: 'AJUSTEMENT' });
  assert.equal(dbMouvements.length, 1); // only the increase from the first test
});
