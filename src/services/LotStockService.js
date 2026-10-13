const mongoose = require('mongoose');
const LotStockRepository = require('../repositories/LotStockRepository');
const MouvementRepository = require('../repositories/MouvementRepository');
const MatiereRepository = require('../repositories/MatiereRepository');

const ALLOWED_FIELDS = ['numeroLot', 'matiere', 'quantite', 'dateEntree', 'dateExpiration'];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateObjectId(value, fieldName) {
  const isObjectId =
    value instanceof mongoose.Types.ObjectId ||
    (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value));

  if (!isObjectId) {
    throw createError(`${fieldName} must be a valid MongoDB ObjectId`, 400);
  }
}

function parseDate(value, fieldName) {
  if (value == null) {
    throw createError(`${fieldName} is required`, 400);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw createError(`${fieldName} must be a valid date`, 400);
  }
  return date;
}

const LotStockService = {
  async enregistrerEntree(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createError('Lot data is required', 400);
    }

    const unexpectedFields = Object.keys(data).filter(
      (field) => !ALLOWED_FIELDS.includes(field)
    );
    if (unexpectedFields.length > 0) {
      throw createError(`Unsupported lot field(s): ${unexpectedFields.join(', ')}`, 400);
    }

    if (data.matiere == null) {
      throw createError('matiere is required', 400);
    }
    validateObjectId(data.matiere, 'matiere');

    if (data.numeroLot == null || typeof data.numeroLot !== 'string' || data.numeroLot.trim().length === 0) {
      throw createError('numeroLot must be a non-empty string', 400);
    }

    if (data.quantite == null) {
      throw createError('quantite is required', 400);
    }
    if (typeof data.quantite !== 'number' || !Number.isFinite(data.quantite) || data.quantite <= 0) {
      throw createError('quantite must be a finite positive number', 400);
    }

    const dateEntree = parseDate(data.dateEntree, 'dateEntree');

    let dateExpiration = null;
    if (data.dateExpiration != null) {
      dateExpiration = parseDate(data.dateExpiration, 'dateExpiration');
      if (dateExpiration < dateEntree) {
        throw createError('dateExpiration cannot be earlier than dateEntree', 400);
      }
    }

    const matiereId = new mongoose.Types.ObjectId(data.matiere);
    const matiere = await MatiereRepository.findById(matiereId);
    if (!matiere) {
      throw createError('Matiere not found', 404);
    }

    const existing = await LotStockRepository.findByNumeroLot(data.numeroLot.trim());
    if (existing) {
      throw createError('A stock lot with this number already exists', 409);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const lot = await LotStockRepository.create(
        {
          numeroLot: data.numeroLot.trim(),
          matiere: matiereId,
          quantiteInitiale: data.quantite,
          quantiteRestante: data.quantite,
          dateEntree,
          ...(dateExpiration != null && { dateExpiration }),
        },
        { session }
      );

      await MouvementRepository.create(
        {
          type: 'ENTREE',
          matiere: matiereId,
          lot: lot._id,
          quantite: data.quantite,
          date: dateEntree,
        },
        { session }
      );

      await session.commitTransaction();
      return lot;
    } catch (error) {
      await session.abortTransaction();
      if (error.code === 11000) {
        throw createError('A stock lot with this number already exists', 409);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  },

  async findAll(query) {
    const filter = {};
    if (query && query.matiere != null) {
      validateObjectId(query.matiere, 'matiere');
      filter.matiere = new mongoose.Types.ObjectId(query.matiere);
    }
    return LotStockRepository.findAll(filter);
  },

  async findById(id) {
    validateObjectId(id, 'id');
    const lot = await LotStockRepository.findById(id);
    if (!lot) {
      throw createError('LotStock not found', 404);
    }
    return lot;
  },

  async getStockDisponible(matiereId) {
    validateObjectId(matiereId, 'matiereId');

    const objectId = new mongoose.Types.ObjectId(matiereId);
    const matiere = await MatiereRepository.findById(objectId);
    if (!matiere) {
      throw createError('Matiere not found', 404);
    }

    const result = await LotStockRepository.sumQuantiteRestanteByMatiere(objectId);
    const total = result.length > 0 ? result[0].total : 0;

    return { matiere, stockDisponible: total };
  },
};

module.exports = LotStockService;
