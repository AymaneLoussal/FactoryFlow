const express = require('express');
const OrdreController = require('../controllers/OrdreController');

const router = express.Router();

router.post('/ordres', OrdreController.create);
router.get('/ordres', OrdreController.findAll);
router.get('/ordres/:id', OrdreController.findById);
router.post('/ordres/:id/demarrer', OrdreController.demarrer);
router.post('/ordres/:id/start', OrdreController.demarrer);

module.exports = router;
