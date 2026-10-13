const MatiereService = require('../services/MatiereService');

async function create(req, res, next) {
  try {
    const matiere = await MatiereService.create(req.body);
    return res.status(201).json(matiere);
  } catch (error) {
    return next(error);
  }
}

async function findAll(req, res, next) {
  try {
    const matieres = await MatiereService.findAll();
    return res.status(200).json(matieres);
  } catch (error) {
    return next(error);
  }
}

async function findById(req, res, next) {
  try {
    const matiere = await MatiereService.findById(req.params.id);
    return res.status(200).json(matiere);
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const matiere = await MatiereService.update(req.params.id, req.body);
    return res.status(200).json(matiere);
  } catch (error) {
    return next(error);
  }
}

async function deleteMatiere(req, res, next) {
  try {
    const matiere = await MatiereService.delete(req.params.id);
    return res.status(200).json({
      message: 'Matiere deleted successfully',
      matiere,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  create,
  findAll,
  findById,
  update,
  delete: deleteMatiere,
};
