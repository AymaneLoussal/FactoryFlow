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
};

module.exports = LotStockRepository;