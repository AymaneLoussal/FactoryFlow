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
};

module.exports = LotStockRepository;