const mongoose = require('mongoose');

let connectionPromise;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your environment.');
  }

  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    })
      .then(() => {
        console.log('MongoDB connected');
      })
      .finally(() => {
        connectionPromise = undefined;
      });
  }

  await connectionPromise;
}

function getMongoClient() {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) {
    throw new Error('MongoDB must be connected before creating the session store.');
  }

  return mongoose.connection.getClient();
}

module.exports = connectDB;
module.exports.getMongoClient = getMongoClient;
