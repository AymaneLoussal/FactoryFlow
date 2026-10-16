const OrdreService = require('../services/OrdreService');

async function create(req, res, next) {
  try {
    const ordre = await OrdreService.create(req.body);
    return res.status(201).json(ordre);
  } catch (error) {
    return next(error);
  }
}

async function findAll(req, res, next) {
  try {
    const ordres = await OrdreService.findAll(req.query);
    return res.status(200).json(ordres);
  } catch (error) {
    return next(error);
  }
}

async function findById(req, res, next) {
  try {
    const ordre = await OrdreService.findById(req.params.id);
    return res.status(200).json(ordre);
  } catch (error) {
    return next(error);
  }
}

async function demarrer(req, res, next) {
  try {
    const result = await OrdreService.demarrer(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function terminer(req, res, next) {
  try {
    const result = await OrdreService.terminer(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function annuler(req, res, next) {
  try {
    const result = await OrdreService.annuler(req.params.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  create,
  findAll,
  findById,
  demarrer,
  terminer,
  annuler,
};
