const express = require('express');
const LotStockController = require('../controllers/LotStockController');

const router = express.Router();

router.post('/lots', LotStockController.enregistrerEntree);
router.get('/lots', LotStockController.findAll);
router.get('/lots/:id', LotStockController.findById);
router.get('/matieres/:matiereId/stock', LotStockController.getStockDisponible);
router.patch('/lots/:id/ajuster', LotStockController.ajuster);

module.exports = router;
