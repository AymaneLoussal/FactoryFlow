require('dotenv').config();

const app = require('./src/app');
const connectToDatabase = require('./src/config/database');

const port = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectToDatabase();
    app.listen(port, () => {
      console.log(`FactoryFlow API listening on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start FactoryFlow API:', error.message);
    process.exit(1);
  }
}

startServer();
