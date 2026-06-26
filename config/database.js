// config/database.js
// ─── MongoDB Atlas Connection ─────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('[DB] FATAL: MONGO_URI is not defined in environment variables.');
  process.exit(1);
}

const CONNECTION_OPTIONS = {
  // Keeps the connection alive through network hiccups
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let isConnected = false;

async function connectDB() {
  if (isConnected) {
    console.log('[DB] Using existing MongoDB connection.');
    return;
  }

  try {
    const conn = await mongoose.connect(MONGO_URI, CONNECTION_OPTIONS);
    isConnected = true;
    // Log host only — never log the full URI (it contains credentials)
    console.log(`[DB] MongoDB Atlas connected: ${conn.connection.host}`);
  } catch (err) {
    // Log the category of error but not the full message (may contain URI fragments)
    console.error(`[DB] Connection failed: ${err.name}`);
    process.exit(1);
  }
}

// Graceful shutdown — closes connection when Node process exits
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('[DB] MongoDB connection closed on app termination.');
  process.exit(0);
});

module.exports = connectDB;
