const LigneOrdre = require('../models/LigneOrdre');

const LigneOrdreRepository = {
  create(data, options = {}) {
    if (options.session) {
      return LigneOrdre.create([data], { session: options.session }).then((docs) => docs[0]);
    }
    return LigneOrdre.create(data);
  },

  createMany(items, options = {}) {
    if (options.session) {
      return LigneOrdre.create(items, { session: options.session });
    }
    return LigneOrdre.create(items);
  },

  findByOrdre(ordreId, options = {}) {
    const query = LigneOrdre.find({ ordre: ordreId }).populate('matiere');
    if (options.session) {
      query.session(options.session);
    }
    return query;
  },

  updateConsommation(id, quantiteConsommee, options = {}) {
    return LigneOrdre.findByIdAndUpdate(
      id,
      { quantiteConsommee },
      { new: true, runValidators: true, session: options.session }
    );
  },

  findById(id) {
    return LigneOrdre.findById(id).populate('matiere');
  },
};

module.exports = LigneOrdreRepository;
