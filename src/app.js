const express = require('express');
const healthRoutes = require('./routes/healthRoutes');

const app = express();

app.use(express.json());
app.use('/api', healthRoutes);

module.exports = app;
