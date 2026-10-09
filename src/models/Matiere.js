const mongoose = require('mongoose');

const matiereSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    nom: {
      type: String,
      required: true,
      trim: true,
    },
    unite: {
      type: String,
      required: true,
    },
    seuilAlerte: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Matiere', matiereSchema);
