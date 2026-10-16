const express = require('express');
const OrdreController = require('../controllers/OrdreController');

const router = express.Router();

router.post('/ordres', OrdreController.create);
router.get('/ordres', OrdreController.findAll);
router.get('/ordres/:id', OrdreController.findById);
router.post('/ordres/:id/demarrer', OrdreController.demarrer);
router.post('/ordres/:id/start', OrdreController.demarrer);
router.post('/ordres/:id/terminer', OrdreController.terminer);
router.post('/ordres/:id/complete', OrdreController.terminer);
router.post('/ordres/:id/annuler', OrdreController.annuler);
router.post('/ordres/:id/cancel', OrdreController.annuler);

module.exports = router;
