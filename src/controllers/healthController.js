function getHealth(_req, res) {
  res.status(200).json({ status: 'ok', message: 'FactoryFlow API is running' });
}

module.exports = { getHealth };
