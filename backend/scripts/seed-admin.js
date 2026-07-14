import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("MONGO_URI missing in .env"); process.exit(1); }

(async () => {
  await mongoose.connect(MONGO_URI);
  if (await User.findOne({ role: "admin" })) { console.log("Admin already exists"); process.exit(0); }
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await User.create({ name: "Admin User", email: "admin@example.com", passwordHash, role: "admin", assignedBrands: [] });
  console.log("Created admin:", admin.email);
  await mongoose.disconnect();
  process.exit(0);
})();
