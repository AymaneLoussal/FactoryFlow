const CompositionService = require('../services/CompositionService');

async function create(req, res, next) {
  try {
    const composition = await CompositionService.create(req.body);
    return res.status(201).json(composition);
  } catch (error) {
    return next(error);
  }
}

async function findByProduct(req, res, next) {
  try {
    const compositions = await CompositionService.findByProduct(req.params.produitId);
    return res.status(200).json(compositions);
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const composition = await CompositionService.update(req.params.id, req.body);
    return res.status(200).json(composition);
  } catch (error) {
    return next(error);
  }
}

async function deleteComposition(req, res, next) {
  try {
    const composition = await CompositionService.delete(req.params.id);
    return res.status(200).json({
      message: 'Composition deleted successfully',
      composition,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  create,
  findByProduct,
  update,
  delete: deleteComposition,
};
