const LotStockService = require('../services/LotStockService');

async function enregistrerEntree(req, res, next) {
  try {
    const lot = await LotStockService.enregistrerEntree(req.body);
    return res.status(201).json(lot);
  } catch (error) {
    return next(error);
  }
}

async function findAll(req, res, next) {
  try {
    const lots = await LotStockService.findAll(req.query);
    return res.status(200).json(lots);
  } catch (error) {
    return next(error);
  }
}

async function findById(req, res, next) {
  try {
    const lot = await LotStockService.findById(req.params.id);
    return res.status(200).json(lot);
  } catch (error) {
    return next(error);
  }
}

async function getStockDisponible(req, res, next) {
  try {
    const result = await LotStockService.getStockDisponible(req.params.matiereId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function ajuster(req, res, next) {
  try {
    const result = await LotStockService.ajuster(req.params.id, req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { enregistrerEntree, findAll, findById, getStockDisponible, ajuster };
