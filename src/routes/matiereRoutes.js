const express = require('express');
const MatiereController = require('../controllers/MatiereController');

const router = express.Router();

router.post('/matieres', MatiereController.create);
router.get('/matieres', MatiereController.findAll);
router.get('/matieres/:id', MatiereController.findById);
router.patch('/matieres/:id', MatiereController.update);
router.delete('/matieres/:id', MatiereController.delete);

module.exports = router;
