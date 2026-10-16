const LotStock = require('../models/LotStock');

const LotStockRepository = {
  create(data, options) {
    if (options && options.session) {
      return LotStock.create([data], { session: options.session }).then((docs) => docs[0]);
    }
    return LotStock.create(data);
  },

  findById(id) {
    return LotStock.findById(id).populate('matiere');
  },

  findByNumeroLot(numeroLot) {
    return LotStock.findOne({ numeroLot });
  },

  findAll(filter) {
    return LotStock.find(filter || {}).populate('matiere');
  },

  sumQuantiteRestanteByMatiere(matiereId) {
    return LotStock.aggregate([
      { $match: { matiere: matiereId } },
      { $group: { _id: null, total: { $sum: '$quantiteRestante' } } },
    ]);
  },

  findAvailableByMatiere(matiereId, options = {}) {
    const query = LotStock.find({
      matiere: matiereId,
      quantiteRestante: { $gt: 0 },
    }).sort({ dateEntree: 1, _id: 1 });

    if (options && options.session) {
      query.session(options.session);
    }
    return query;
  },

  updateQuantiteRestante(id, quantiteRestante, options = {}) {
    return LotStock.findByIdAndUpdate(
      id,
      { quantiteRestante },
      { new: true, runValidators: true, session: options && options.session }
    );
  },

  /**
   * Atomically applies a signed delta (positive = increase, negative = decrease)
   * to quantiteRestante using $inc. For negative deltas the $gte guard ensures
   * the result never drops below 0 even under concurrent requests.
   * Returns the updated document, or null when the guard prevents the update.
   */
  ajusterQuantiteRestante(id, delta, options = {}) {
    const filter = { _id: id };
    if (delta < 0) {
      filter.quantiteRestante = { $gte: -delta };
    }
    return LotStock.findOneAndUpdate(
      filter,
      { $inc: { quantiteRestante: delta } },
      { new: true, runValidators: true, session: options && options.session }
    );
  },
};

module.exports = LotStockRepository;