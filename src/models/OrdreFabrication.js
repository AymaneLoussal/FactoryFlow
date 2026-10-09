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
      min: [Number.MIN_VALUE, 'quantite must be greater than 0'],
      validate: {
        validator: Number.isFinite,
        message: 'quantite must be a finite number',
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
