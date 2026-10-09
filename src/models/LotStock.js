const mongoose = require('mongoose');

const lotStockSchema = new mongoose.Schema(
  {
    numeroLot: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    matiere: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Matiere',
      required: true,
    },
    quantiteInitiale: {
      type: Number,
      required: true,
      min: 0,
    },
    quantiteRestante: {
      type: Number,
      required: true,
      min: 0,
    },
    dateEntree: {
      type: Date,
      required: true,
    },
    dateExpiration: {
      type: Date,
    },
  },
  { timestamps: true }
);

lotStockSchema.pre('validate', function validateRemainingQuantity(next) {
  if (
    this.quantiteInitiale != null &&
    this.quantiteRestante != null &&
    this.quantiteRestante > this.quantiteInitiale
  ) {
    this.invalidate(
      'quantiteRestante',
      'quantiteRestante cannot be greater than quantiteInitiale'
    );
  }

  next();
});

module.exports = mongoose.model('LotStock', lotStockSchema);
