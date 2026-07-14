// src/models/AuditLog.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const auditSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  action: { type: String, required: true },
  entity: { type: String },
  entityId: { type: Schema.Types.ObjectId },
  details: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema);
export default AuditLog;
