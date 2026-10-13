const mongoose = require('mongoose');

const STATUTS_ORDRE = ['PLANIFIE', 'EN_COURS', 'TERMINE', 'ANNULE'];

const ordreFabricationSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    produit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Produit',
      required: true,
    },
    quantite: {
      type: Number,
      required: true,
      min: [1, 'quantite must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'quantite must be an integer',
      },
    },
    operateur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: STATUTS_ORDRE,
      required: true,
      default: 'PLANIFIE',
    },
    datePlanification: {
      type: Date,
    },
    dateDebut: {
      type: Date,
    },
    dateFin: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrdreFabrication', ordreFabricationSchema);
