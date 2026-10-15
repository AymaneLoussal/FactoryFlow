const mongoose = require('mongoose');
const OrdreRepository = require('../repositories/OrdreRepository');
const LigneOrdreRepository = require('../repositories/LigneOrdreRepository');
const LotStockRepository = require('../repositories/LotStockRepository');
const MouvementRepository = require('../repositories/MouvementRepository');
const CompositionProduit = require('../models/CompositionProduit');
const Produit = require('../models/Produit');

const ALLOWED_CREATE_FIELDS = ['reference', 'produit', 'quantite', 'datePlanification', 'operateur'];

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
  if (value == null) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw createError(`${fieldName} must be a valid date`, 400);
  }
  return date;
}

const OrdreService = {
  async create(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createError('Order data is required', 400);
    }

    const unexpectedFields = Object.keys(data).filter(
      (field) => !ALLOWED_CREATE_FIELDS.includes(field)
    );
    if (unexpectedFields.length > 0) {
      throw createError(`Unsupported order field(s): ${unexpectedFields.join(', ')}`, 400);
    }

    if (data.reference == null || typeof data.reference !== 'string' || data.reference.trim().length === 0) {
      throw createError('reference must be a non-empty string', 400);
    }

    if (data.produit == null) {
      throw createError('produit is required', 400);
    }
    validateObjectId(data.produit, 'produit');

    if (data.quantite == null) {
      throw createError('quantite is required', 400);
    }
    if (
      typeof data.quantite !== 'number' ||
      !Number.isFinite(data.quantite) ||
      !Number.isInteger(data.quantite) ||
      data.quantite < 1
    ) {
      throw createError('quantite must be an integer greater than or equal to 1', 400);
    }

    let datePlanification = null;
    if (data.datePlanification != null) {
      datePlanification = parseDate(data.datePlanification, 'datePlanification');
    }

    if (data.operateur != null) {
      validateObjectId(data.operateur, 'operateur');
    }

    const trimmedReference = data.reference.trim();
    const existingRef = await OrdreRepository.findByReference(trimmedReference);
    if (existingRef) {
      throw createError('An order with this reference already exists', 409);
    }

    const produitId = new mongoose.Types.ObjectId(data.produit);
    const produit = await Produit.findById(produitId);
    if (!produit) {
      throw createError('Produit not found', 404);
    }

    const compositions = await CompositionProduit.find({ produit: produitId }).populate('matiere');
    if (!compositions || compositions.length === 0) {
      throw createError('Product has no composition defined', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await OrdreRepository.create(
        {
          reference: trimmedReference,
          produit: produitId,
          quantite: data.quantite,
          status: 'PLANIFIE',
          ...(datePlanification && { datePlanification }),
          ...(data.operateur && { operateur: new mongoose.Types.ObjectId(data.operateur) }),
        },
        { session }
      );

      const ligneDocs = compositions.map((comp) => ({
        ordre: order._id,
        matiere: comp.matiere._id,
        quantiteUnitaire: comp.quantiteUnitaire,
        quantiteDemandee: data.quantite * comp.quantiteUnitaire,
        quantiteConsommee: 0,
        unite: comp.matiere.unite || 'unite',
      }));

      const lignes = await LigneOrdreRepository.createMany(ligneDocs, { session });

      await session.commitTransaction();

      const orderObj = order.toObject ? order.toObject() : { ...order };
      return {
        ...orderObj,
        lignes,
      };
    } catch (error) {
      await session.abortTransaction();
      if (error.code === 11000) {
        throw createError('An order with this reference already exists', 409);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  },

  async findAll(query = {}) {
    const filter = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.produit) {
      validateObjectId(query.produit, 'produit');
      filter.produit = new mongoose.Types.ObjectId(query.produit);
    }
    return OrdreRepository.findAll(filter);
  },

  async findById(id) {
    validateObjectId(id, 'id');
    const order = await OrdreRepository.findById(id);
    if (!order) {
      throw createError('OrdreFabrication not found', 404);
    }

    const lignes = await LigneOrdreRepository.findByOrdre(order._id);
    const orderObj = order.toObject ? order.toObject() : { ...order };
    return {
      ...orderObj,
      lignes,
    };
  },

  async demarrer(id) {
    validateObjectId(id, 'id');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const order = await OrdreRepository.findById(id, { session });
      if (!order) {
        throw createError('OrdreFabrication not found', 404);
      }

      if (order.status === 'EN_COURS') {
        throw createError('Order is already in progress', 409);
      }
      if (order.status === 'TERMINE') {
        throw createError('Order is already completed', 409);
      }
      if (order.status === 'ANNULE') {
        throw createError('Order is cancelled', 409);
      }
      if (order.status !== 'PLANIFIE') {
        throw createError(`Cannot start order with status ${order.status}`, 409);
      }

      let lines = await LigneOrdreRepository.findByOrdre(order._id, { session });
      if (!lines || lines.length === 0) {
        const compositions = await CompositionProduit.find({ produit: order.produit })
          .populate('matiere')
          .session(session);

        if (!compositions || compositions.length === 0) {
          throw createError('Product has no composition defined', 400);
        }

        const ligneDocs = compositions.map((comp) => ({
          ordre: order._id,
          matiere: comp.matiere._id,
          quantiteUnitaire: comp.quantiteUnitaire,
          quantiteDemandee: order.quantite * comp.quantiteUnitaire,
          quantiteConsommee: 0,
          unite: comp.matiere.unite || 'unite',
        }));

        lines = await LigneOrdreRepository.createMany(ligneDocs, { session });
      }

      const needsByMatiere = new Map();
      for (const line of lines) {
        const matiereId = String(line.matiere._id || line.matiere);
        const needed = line.quantiteDemandee - line.quantiteConsommee;
        if (needed > 0) {
          if (!needsByMatiere.has(matiereId)) {
            needsByMatiere.set(matiereId, {
              matiereId,
              matiereDoc: line.matiere,
              totalNeeded: 0,
              lines: [],
            });
          }
          const item = needsByMatiere.get(matiereId);
          item.totalNeeded += needed;
          item.lines.push(line);
        }
      }

      const availabilityByMatiere = new Map();
      for (const [matiereIdStr, item] of needsByMatiere.entries()) {
        const matiereObjectId = new mongoose.Types.ObjectId(matiereIdStr);
        const lots = await LotStockRepository.findAvailableByMatiere(matiereObjectId, { session });
        const available = lots.reduce((acc, lot) => acc + lot.quantiteRestante, 0);

        if (available < item.totalNeeded) {
          const matiereName = item.matiereDoc?.nom || item.matiereDoc?.reference || matiereIdStr;
          throw createError(
            `Insufficient stock for material ${matiereName}: required ${item.totalNeeded}, available ${available}`,
            400
          );
        }

        availabilityByMatiere.set(matiereIdStr, {
          lots,
          totalNeeded: item.totalNeeded,
          lines: item.lines,
        });
      }

      const createdMouvements = [];
      const updatedLines = [];

      for (const [matiereIdStr, item] of availabilityByMatiere.entries()) {
        const matiereObjectId = new mongoose.Types.ObjectId(matiereIdStr);
        let remainingToConsume = item.totalNeeded;

        for (const lot of item.lots) {
          if (remainingToConsume <= 0) break;
          const take = Math.min(lot.quantiteRestante, remainingToConsume);

          await LotStockRepository.updateQuantiteRestante(
            lot._id,
            lot.quantiteRestante - take,
            { session }
          );

          const mouvement = await MouvementRepository.create(
            {
              type: 'SORTIE',
              matiere: matiereObjectId,
              lot: lot._id,
              quantite: take,
              ordre: order._id,
              ...(order.operateur && { user: order.operateur._id || order.operateur }),
              raison: `Consommation pour ordre ${order.reference}`,
              date: new Date(),
            },
            { session }
          );

          createdMouvements.push(mouvement);
          remainingToConsume -= take;
        }

        for (const line of item.lines) {
          const updatedLine = await LigneOrdreRepository.updateConsommation(
            line._id,
            line.quantiteDemandee,
            { session }
          );
          updatedLines.push(updatedLine);
        }
      }

      const updatedOrder = await OrdreRepository.updateStatus(
        order._id,
        'EN_COURS',
        { dateDebut: new Date() },
        { session }
      );

      await session.commitTransaction();

      const orderObj = updatedOrder.toObject ? updatedOrder.toObject() : { ...updatedOrder };
      return {
        message: 'Order started successfully',
        ordre: orderObj,
        mouvements: createdMouvements,
        lignes: updatedLines,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  },
};

module.exports = OrdreService;
