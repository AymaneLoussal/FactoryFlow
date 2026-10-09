const mongoose = require('mongoose');

const ligneOrdreSchema = new mongoose.Schema(
  {
    ordre: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrdreFabrication',
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
    quantiteDemandee: {
      type: Number,
      required: true,
      min: [Number.MIN_VALUE, 'quantiteDemandee must be greater than 0'],
      validate: {
        validator: Number.isFinite,
        message: 'quantiteDemandee must be a finite number',
      },
    },
    quantiteConsommee: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isFinite,
        message: 'quantiteConsommee must be a finite number',
      },
    },
    unite: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

ligneOrdreSchema.pre('validate', function validateConsumedQuantity(next) {
  if (
    this.quantiteConsommee != null &&
    this.quantiteDemandee != null &&
    this.quantiteConsommee > this.quantiteDemandee
  ) {
    this.invalidate(
      'quantiteConsommee',
      'quantiteConsommee cannot exceed quantiteDemandee'
    );
  }

  next();
});

module.exports = mongoose.model('LigneOrdre', ligneOrdreSchema);
