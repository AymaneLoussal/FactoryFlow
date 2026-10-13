const mongoose = require('mongoose');

const compositionProduitSchema = new mongoose.Schema(
  {
    produit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Produit',
      required: true,
    },
    matiere: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Matiere',
      required: true,
    },
    quantiteUnitaire: {
      type: Number,
      required: true,
      min: [Number.MIN_VALUE, 'quantiteUnitaire must be greater than 0'],
      validate: {
        validator: Number.isFinite,
        message: 'quantiteUnitaire must be a finite number',
      },
    },
  },
  { timestamps: true }
);

compositionProduitSchema.index({ produit: 1, matiere: 1 }, { unique: true });

module.exports = mongoose.model('CompositionProduit', compositionProduitSchema);
