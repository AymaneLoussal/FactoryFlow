const Matiere = require('../models/Matiere');

const MatiereRepository = {
  create(data) {
    return Matiere.create(data);
  },

  findById(id) {
    return Matiere.findById(id);
  },

  findByReference(reference) {
    return Matiere.findOne({ reference });
  },

  findAll() {
    return Matiere.find();
  },

  updateById(id, data) {
    return Matiere.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
  },

  deleteById(id) {
    return Matiere.findByIdAndDelete(id);
  },
};

module.exports = MatiereRepository;
