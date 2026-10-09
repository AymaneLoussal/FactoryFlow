const mongoose = require('mongoose');

const TYPES_MOUVEMENT = ['ENTREE', 'SORTIE', 'AJUSTEMENT'];

const mouvementSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: TYPES_MOUVEMENT,
    },
    matiere: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Matiere',
      required: true,
    },
    lot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LotStock',
      required: true,
    },
    quantite: {
      type: Number,
      required: true,
      min: [Number.MIN_VALUE, 'quantite must be greater than 0'],
      validate: {
        validator: Number.isFinite,
        message: 'quantite must be a finite number',
      },
    },
    ordre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrdreFabrication',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    raison: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mouvement', mouvementSchema);
