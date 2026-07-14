// src/models/ImportJob.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const importJobSchema = new Schema({
  filename: String,
  status: { type: String, enum: ["pending","processing","completed","failed"], default: "pending" },
  total: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  failures: [ { row: Number, reason: String } ],
  createdAt: { type: Date, default: Date.now }
});

const ImportJob = mongoose.models.ImportJob || mongoose.model("ImportJob", importJobSchema);
export default ImportJob;
