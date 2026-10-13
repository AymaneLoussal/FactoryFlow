const mongoose = require('mongoose');
const MatiereRepository = require('../repositories/MatiereRepository');
const CompositionProduit = require('../models/CompositionProduit');
const LotStock = require('../models/LotStock');

const ALLOWED_FIELDS = ['reference', 'nom', 'unite', 'seuilAlerte'];

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
      `Unsupported material field(s): ${unexpectedFields.join(', ')}`,
      400
    );
  }
}

function validateString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError(`${fieldName} must be a non-empty string`, 400);
  }
}

function validateSeuilAlerte(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw createError(
      'seuilAlerte must be a finite number greater than or equal to 0',
      400
    );
  }
}

const MatiereService = {
  async create(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createError('Material data is required', 400);
    }

    ensureAllowedFields(data);

    if (
      data.reference == null ||
      data.nom == null ||
      data.unite == null ||
      data.seuilAlerte == null
    ) {
      throw createError(
        'reference, nom, unite, and seuilAlerte are required',
        400
      );
    }

    validateString(data.reference, 'reference');
    validateString(data.nom, 'nom');
    validateString(data.unite, 'unite');
    validateSeuilAlerte(data.seuilAlerte);

    const trimmedReference = data.reference.trim();
    const existing = await MatiereRepository.findByReference(trimmedReference);
    if (existing) {
      throw createError('A material with this reference already exists', 409);
    }

    try {
      return await MatiereRepository.create({
        reference: trimmedReference,
        nom: data.nom.trim(),
        unite: data.unite.trim(),
        seuilAlerte: data.seuilAlerte,
      });
    } catch (error) {
      if (error.code === 11000) {
        throw createError('A material with this reference already exists', 409);
      }
      throw error;
    }
  },

  async findAll() {
    return MatiereRepository.findAll();
  },

  async findById(id) {
    validateObjectId(id, 'id');
    const matiere = await MatiereRepository.findById(id);
    if (!matiere) {
      throw createError('Matiere not found', 404);
    }
    return matiere;
  },

  async update(id, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createError('Material update data is required', 400);
    }

    ensureAllowedFields(data);
    validateObjectId(id, 'id');

    if (Object.keys(data).length === 0) {
      throw createError(
        'At least one material field must be provided for update',
        400
      );
    }

    const matiere = await MatiereRepository.findById(id);
    if (!matiere) {
      throw createError('Matiere not found', 404);
    }

    const updateData = {};

    if (hasOwn(data, 'reference')) {
      if (data.reference == null) {
        throw createError('reference is required', 400);
      }
      validateString(data.reference, 'reference');
      const trimmedReference = data.reference.trim();
      if (trimmedReference !== matiere.reference) {
        const existing = await MatiereRepository.findByReference(trimmedReference);
        if (existing && String(existing._id) !== String(matiere._id)) {
          throw createError('A material with this reference already exists', 409);
        }
      }
      updateData.reference = trimmedReference;
    }

    if (hasOwn(data, 'nom')) {
      if (data.nom == null) {
        throw createError('nom is required', 400);
      }
      validateString(data.nom, 'nom');
      updateData.nom = data.nom.trim();
    }

    if (hasOwn(data, 'unite')) {
      if (data.unite == null) {
        throw createError('unite is required', 400);
      }
      validateString(data.unite, 'unite');
      updateData.unite = data.unite.trim();
    }

    if (hasOwn(data, 'seuilAlerte')) {
      if (data.seuilAlerte == null) {
        throw createError('seuilAlerte is required', 400);
      }
      validateSeuilAlerte(data.seuilAlerte);
      updateData.seuilAlerte = data.seuilAlerte;
    }

    try {
      const updated = await MatiereRepository.updateById(id, updateData);
      if (!updated) {
        throw createError('Matiere not found', 404);
      }
      return updated;
    } catch (error) {
      if (error.code === 11000) {
        throw createError('A material with this reference already exists', 409);
      }
      throw error;
    }
  },

  async delete(id) {
    validateObjectId(id, 'id');

    const matiere = await MatiereRepository.findById(id);
    if (!matiere) {
      throw createError('Matiere not found', 404);
    }

    const referencedInComposition = await CompositionProduit.findOne({ matiere: id });
    if (referencedInComposition) {
      throw createError(
        'Cannot delete material: referenced in product compositions',
        409
      );
    }

    const referencedInLot = await LotStock.findOne({ matiere: id });
    if (referencedInLot) {
      throw createError(
        'Cannot delete material: referenced in stock lots',
        409
      );
    }

    const deleted = await MatiereRepository.deleteById(id);
    if (!deleted) {
      throw createError('Matiere not found', 404);
    }
    return deleted;
  },
};

module.exports = MatiereService;
