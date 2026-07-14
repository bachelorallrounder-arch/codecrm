// server.js
import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/db.js";
import mongoose from "mongoose";

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;

// if (!MONGO_URI || typeof MONGO_URI !== "string" || MONGO_URI.trim() === "") {
//   console.error("FATAL: MONGO_URI is not set. Please add MONGO_URI to your .env or environment.");
//   process.exit(1);
// }

let server;

const start = async () => {
  try {
    console.log("Mongo_Uri:" , MONGO_URI);
    await connectDB(MONGO_URI);
    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (pid=${process.pid})`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

start();


const shutdown = async (signal) => {
  try {
    console.log(`Received ${signal}. Shutting down...`);
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      console.log("HTTP server closed.");
    }
    // Close mongoose connection (if open)
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log("MongoDB connection closed.");
    }
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  // Optionally shutdown here as well
});
