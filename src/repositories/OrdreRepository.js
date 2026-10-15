const OrdreFabrication = require('../models/OrdreFabrication');

const OrdreRepository = {
  create(data, options = {}) {
    if (options.session) {
      return OrdreFabrication.create([data], { session: options.session }).then((docs) => docs[0]);
    }
    return OrdreFabrication.create(data);
  },

  findById(id, options = {}) {
    const query = OrdreFabrication.findById(id).populate('produit').populate('operateur');
    if (options.session) {
      query.session(options.session);
    }
    return query;
  },

  findByReference(reference) {
    return OrdreFabrication.findOne({ reference });
  },

  findAll(filter = {}) {
    return OrdreFabrication.find(filter).populate('produit').populate('operateur');
  },

  updateStatus(id, status, extraData = {}, options = {}) {
    return OrdreFabrication.findOneAndUpdate(
      { _id: id },
      { status, ...extraData },
      { new: true, runValidators: true, session: options.session }
    );
  },
};

module.exports = OrdreRepository;
