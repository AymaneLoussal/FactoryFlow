const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Produit = require('../../src/models/Produit');
const Matiere = require('../../src/models/Matiere');
const CompositionProduit = require('../../src/models/CompositionProduit');
const LotStock = require('../../src/models/LotStock');
const Mouvement = require('../../src/models/Mouvement');
const OrdreFabrication = require('../../src/models/OrdreFabrication');
const LigneOrdre = require('../../src/models/LigneOrdre');
const OrdreService = require('../../src/services/OrdreService');

const TEST_DB_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/factoryflow_test_fifo_tx?directConnection=true';

let isReplSetReady = false;

test.before(async () => {
  try {
    await mongoose.connect(TEST_DB_URI, { serverSelectionTimeoutMS: 1500 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (hello.setName) {
      await mongoose.connection.dropDatabase();
      isReplSetReady = true;
    } else {
      await mongoose.disconnect();
    }
  } catch (error) {
    // MongoDB or replica set not reachable
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
});

test.after(async () => {
  if (isReplSetReady && mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }
});

test('real MongoDB transaction: executes FIFO multi-lot consumption atomically', async (t) => {
  if (!isReplSetReady) {
    t.skip('MongoDB replica set rs0 is not active on this host (standalone MongoDB detected or Docker stopped)');
    return;
  }

  // 1. Setup real product, material, and composition in MongoDB
  const produit = await Produit.create({
    reference: 'PROD-REAL-1',
    nom: 'Table basse',
  });

  const matiere = await Matiere.create({
    reference: 'MAT-REAL-BOIS',
    nom: 'Chene massif',
    unite: 'm3',
    seuilAlerte: 5,
  });

  await CompositionProduit.create({
    produit: produit._id,
    matiere: matiere._id,
    quantiteUnitaire: 2,
  });

  // 2. Setup 3 lots with different dates
  const lot1 = await LotStock.create({
    numeroLot: 'LOT-REAL-1',
    matiere: matiere._id,
    quantiteInitiale: 10,
    quantiteRestante: 10,
    dateEntree: new Date('2024-01-01'),
  });

  const lot2 = await LotStock.create({
    numeroLot: 'LOT-REAL-2',
    matiere: matiere._id,
    quantiteInitiale: 10,
    quantiteRestante: 10,
    dateEntree: new Date('2024-01-05'),
  });

  const lot3 = await LotStock.create({
    numeroLot: 'LOT-REAL-3',
    matiere: matiere._id,
    quantiteInitiale: 20,
    quantiteRestante: 20,
    dateEntree: new Date('2024-01-10'),
  });

  // 3. Create planned order requiring 12 tables => 12 * 2 = 24 m3 of wood
  const orderRes = await OrdreService.create({
    reference: 'OF-REAL-001',
    produit: String(produit._id),
    quantite: 12,
  });

  const orderId = orderRes._id;

  // 4. Start the order using real MongoDB transaction
  const startRes = await OrdreService.demarrer(String(orderId));
  assert.equal(startRes.message, 'Order started successfully');

  // 5. Verify database records in MongoDB directly
  const refreshedLot1 = await LotStock.findById(lot1._id);
  const refreshedLot2 = await LotStock.findById(lot2._id);
  const refreshedLot3 = await LotStock.findById(lot3._id);

  // FIFO check:
  assert.equal(refreshedLot1.quantiteRestante, 0);
  assert.equal(refreshedLot2.quantiteRestante, 0);
  assert.equal(refreshedLot3.quantiteRestante, 16);

  // 6. Verify Mouvement records created in MongoDB
  const mouvements = await Mouvement.find({ ordre: orderId }).sort({ createdAt: 1 });
  assert.equal(mouvements.length, 3);

  assert.equal(mouvements[0].type, 'SORTIE');
  assert.equal(String(mouvements[0].lot), String(lot1._id));
  assert.equal(mouvements[0].quantite, 10);

  assert.equal(mouvements[1].type, 'SORTIE');
  assert.equal(String(mouvements[1].lot), String(lot2._id));
  assert.equal(mouvements[1].quantite, 10);

  assert.equal(mouvements[2].type, 'SORTIE');
  assert.equal(String(mouvements[2].lot), String(lot3._id));
  assert.equal(mouvements[2].quantite, 4);

  // 7. Verify order status in MongoDB
  const refreshedOrder = await OrdreFabrication.findById(orderId);
  assert.equal(refreshedOrder.status, 'EN_COURS');
  assert.ok(refreshedOrder.dateDebut instanceof Date);

  // 8. Verify LigneOrdre quantiteConsommee in MongoDB
  const lines = await LigneOrdre.find({ ordre: orderId });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantiteDemandee, 24);
  assert.equal(lines[0].quantiteConsommee, 24);

  // 9. Retry: start again should fail with 409 and not consume any more stock
  await assert.rejects(
    () => OrdreService.demarrer(String(orderId)),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.message, 'Order is already in progress');
      return true;
    }
  );

  const lot3AfterRetry = await LotStock.findById(lot3._id);
  assert.equal(lot3AfterRetry.quantiteRestante, 16);
});

test('real MongoDB transaction: aborts and rolls back completely when stock is insufficient', async (t) => {
  if (!isReplSetReady) {
    t.skip('MongoDB replica set rs0 is not active on this host (standalone MongoDB detected or Docker stopped)');
    return;
  }

  const produit = await Produit.findOne({ reference: 'PROD-REAL-1' });
  const matiere = await Matiere.findOne({ reference: 'MAT-REAL-BOIS' });

  // Currently only 16 m3 left in Lot 3. Create order for 10 tables => 20 m3 needed.
  const orderRes = await OrdreService.create({
    reference: 'OF-REAL-INSUFFICIENT',
    produit: String(produit._id),
    quantite: 10,
  });

  const orderId = orderRes._id;

  // Attempt to start order
  await assert.rejects(
    () => OrdreService.demarrer(String(orderId)),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('Insufficient stock'));
      return true;
    }
  );

  // Check that real DB state was NOT modified:
  const lot3 = await LotStock.findOne({ numeroLot: 'LOT-REAL-3' });
  assert.equal(lot3.quantiteRestante, 16);

  const orderInDb = await OrdreFabrication.findById(orderId);
  assert.equal(orderInDb.status, 'PLANIFIE');

  const mouvements = await Mouvement.find({ ordre: orderId });
  assert.equal(mouvements.length, 0);
});
