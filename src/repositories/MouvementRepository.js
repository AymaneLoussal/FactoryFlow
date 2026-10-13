const Mouvement = require('../models/Mouvement');

const MouvementRepository = {
  create(data, options) {
    if (options && options.session) {
      return Mouvement.create([data], { session: options.session }).then((docs) => docs[0]);
    }
    return Mouvement.create(data);
  },

  findByLot(lotId) {
    return Mouvement.find({ lot: lotId });
  },
};

module.exports = MouvementRepository;
