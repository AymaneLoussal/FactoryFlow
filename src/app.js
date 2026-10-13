const express = require('express');
const healthRoutes = require('./routes/healthRoutes');
const compositionRoutes = require('./routes/compositionRoutes');
const matiereRoutes = require('./routes/matiereRoutes');

const app = express();

app.use(express.json());
app.use('/api', healthRoutes);
app.use('/api', compositionRoutes);
app.use('/api', matiereRoutes);

app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((error, _req, res, _next) => {
  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode <= 599
      ? error.statusCode
      : 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction && statusCode >= 500
    ? 'Internal server error'
    : error.message || 'Internal server error';

  res.status(statusCode).json({
    status: 'error',
    message,
  });
});

module.exports = app;
