const connectDB = require('../config/db');
const createApp = require('../server');

let app;

module.exports = async function handler(req, res) {
  let mongoClient;
  try {
    mongoClient = await connectDB();
  } catch (err) {
    console.error('Unable to connect to MongoDB:', err.message);
    return res.status(503).send('Service temporarily unavailable');
  }

  if (!app) {
    app = createApp(mongoClient);
  }

  return app(req, res);
};
