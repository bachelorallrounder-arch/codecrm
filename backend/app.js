// app.js
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import leadsRoutes from "./routes/leads.js";
import attemptsRoutes from "./routes/attempts.js";
import remarksRoutes from "./routes/remarks.js";
import demosRoutes from "./routes/demos.js";
import conversionsRoutes from "./routes/conversions.js";
import importRoutes from "./routes/import.js";
import adminRoutes from "./routes/admin.js";
import brandRoutes from './routes/brands.js';
import courseRoutes from "./routes/course.js"; 
import publicLeadRoutes from "./routes/publicLeadRoutes.js";

import './backup/cron.js';

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/auth", authRoutes);
app.use("/leads", leadsRoutes);
app.use("/leads", attemptsRoutes);
app.use("/leads", remarksRoutes);
app.use("/leads", demosRoutes);
app.use("/conversions", conversionsRoutes);
app.use("/import", importRoutes);
app.use("/admin", adminRoutes);
app.use("/brands",brandRoutes);
app.use("/courses",courseRoutes);
app.use("/public/leads",publicLeadRoutes);
console.log("✅ Public lead routes loaded");

app.use((req, res) => {
  res.status(404).json({ message: "Not Found" });
});


app.use((err, req, res, next) => {
  console.error(err && err.stack ? err.stack : err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Internal Server Error" });
});

export default app;
