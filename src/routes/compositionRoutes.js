const express = require('express');
const CompositionController = require('../controllers/CompositionController');

const router = express.Router();

router.post('/compositions', CompositionController.create);
router.get('/produits/:produitId/compositions', CompositionController.findByProduct);
router.patch('/compositions/:id', CompositionController.update);
router.delete('/compositions/:id', CompositionController.delete);

module.exports = router;
