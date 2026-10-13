const mongoose = require('mongoose');
const Matiere = require('../models/Matiere');
const Produit = require('../models/Produit');
const CompositionRepository = require('../repositories/CompositionRepository');

const ALLOWED_FIELDS = ['produit', 'matiere', 'quantiteUnitaire'];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

function validateObjectId(value, fieldName) {
  const isObjectId =
    value instanceof mongoose.Types.ObjectId ||
    (typeof value === 'string' && /^[a-f\d]{24}$/i.test(value));

  if (!isObjectId) {
    throw createError(`${fieldName} must be a valid MongoDB ObjectId`, 400);
  }
}

function ensureAllowedFields(data) {
  const unexpectedFields = Object.keys(data).filter(
    (field) => !ALLOWED_FIELDS.includes(field)
  );

  if (unexpectedFields.length > 0) {
    throw createError(
      `Unsupported composition field(s): ${unexpectedFields.join(', ')}`,
      400
    );
  }
}

function validateQuantiteUnitaire(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw createError('quantiteUnitaire must be a finite number greater than 0', 400);
  }
}

async function ensureProduitExists(produitId) {
  const produit = await Produit.findById(produitId);
  if (!produit) {
    throw createError('Produit not found', 404);
  }
}

async function ensureMatiereExists(matiereId) {
  const matiere = await Matiere.findById(matiereId);
  if (!matiere) {
    throw createError('Matiere not found', 404);
  }
}

function isSameId(firstId, secondId) {
  return String(firstId) === String(secondId);
}

const CompositionService = {
  async create(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createError('Composition data is required', 400);
    }

    ensureAllowedFields(data);

    if (data.produit == null || data.matiere == null || data.quantiteUnitaire == null) {
      throw createError('produit, matiere, and quantiteUnitaire are required', 400);
    }

    validateObjectId(data.produit, 'produit');
    validateObjectId(data.matiere, 'matiere');
    validateQuantiteUnitaire(data.quantiteUnitaire);
    await ensureProduitExists(data.produit);
    await ensureMatiereExists(data.matiere);

    const existingComposition = await CompositionRepository.findByProductAndMaterial(
      data.produit,
      data.matiere
    );
    if (existingComposition) {
      throw createError('A composition already exists for this product and material', 409);
    }

    try {
      return await CompositionRepository.create({
        produit: data.produit,
        matiere: data.matiere,
        quantiteUnitaire: data.quantiteUnitaire,
      });
    } catch (error) {
      if (error.code === 11000) {
        throw createError('A composition already exists for this product and material', 409);
      }
      throw error;
    }
  },

  async findByProduct(produitId) {
    validateObjectId(produitId, 'produitId');
    await ensureProduitExists(produitId);
    return CompositionRepository.findByProduct(produitId);
  },

  async update(id, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createError('Composition update data is required', 400);
    }

    ensureAllowedFields(data);
    validateObjectId(id, 'id');

    if (Object.keys(data).length === 0) {
      throw createError('At least one composition field must be provided for update', 400);
    }

    const composition = await CompositionRepository.findById(id);
    if (!composition) {
      throw createError('Composition not found', 404);
    }

    const updateData = {};
    for (const field of ALLOWED_FIELDS) {
      if (hasOwn(data, field)) {
        updateData[field] = data[field];
      }
    }

    if (hasOwn(updateData, 'produit')) {
      if (updateData.produit == null) {
        throw createError('produit is required', 400);
      }
      validateObjectId(updateData.produit, 'produit');
      await ensureProduitExists(updateData.produit);
    }

    if (hasOwn(updateData, 'matiere')) {
      if (updateData.matiere == null) {
        throw createError('matiere is required', 400);
      }
      validateObjectId(updateData.matiere, 'matiere');
      await ensureMatiereExists(updateData.matiere);
    }

    if (hasOwn(updateData, 'quantiteUnitaire')) {
      validateQuantiteUnitaire(updateData.quantiteUnitaire);
    }

    const resultingProduitId = hasOwn(updateData, 'produit')
      ? updateData.produit
      : composition.produit;
    const resultingMatiereId = hasOwn(updateData, 'matiere')
      ? updateData.matiere
      : composition.matiere;
    const pairChanged =
      !isSameId(resultingProduitId, composition.produit) ||
      !isSameId(resultingMatiereId, composition.matiere);

    if (pairChanged) {
      const duplicate = await CompositionRepository.findByProductAndMaterial(
        resultingProduitId,
        resultingMatiereId
      );
      if (duplicate && !isSameId(duplicate._id, composition._id)) {
        throw createError(
          'A composition already exists for this product and material',
          409
        );
      }
    }

    try {
      const updatedComposition = await CompositionRepository.updateById(id, updateData);
      if (!updatedComposition) {
        throw createError('Composition not found', 404);
      }
      return updatedComposition;
    } catch (error) {
      if (error.code === 11000) {
        throw createError('A composition already exists for this product and material', 409);
      }
      throw error;
    }
  },

  async delete(id) {
    validateObjectId(id, 'id');
    const composition = await CompositionRepository.findById(id);
    if (!composition) {
      throw createError('Composition not found', 404);
    }

    const deletedComposition = await CompositionRepository.deleteById(id);
    if (!deletedComposition) {
      throw createError('Composition not found', 404);
    }
    return deletedComposition;
  },
};

module.exports = CompositionService;
