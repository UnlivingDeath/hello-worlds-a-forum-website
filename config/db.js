const mongoose = require('mongoose');

let connectionPromise;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your environment.');
  }

  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return mongoose.connection.getClient();
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
      .then(() => {
        console.log('MongoDB connected');
      })
      .finally(() => {
        connectionPromise = undefined;
      });
  }

  await connectionPromise;
  const client = mongoose.connection.getClient();
  if (!client) {
    throw new Error('MongoDB connected without exposing its client.');
  }
  return client;
}

module.exports = connectDB;
