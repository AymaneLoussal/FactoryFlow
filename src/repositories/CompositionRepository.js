const CompositionProduit = require('../models/CompositionProduit');

const CompositionRepository = {
  create(data) {
    return CompositionProduit.create(data);
  },

  findById(id) {
    return CompositionProduit.findById(id);
  },

  findByProduct(produitId) {
    return CompositionProduit.find({ produit: produitId });
  },

  findByProductAndMaterial(produitId, matiereId) {
    return CompositionProduit.findOne({
      produit: produitId,
      matiere: matiereId,
    });
  },

  updateById(id, data) {
    return CompositionProduit.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  },

  deleteById(id) {
    return CompositionProduit.findByIdAndDelete(id);
  },
};

module.exports = CompositionRepository;
