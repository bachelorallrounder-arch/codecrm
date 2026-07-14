// src/models/Lead.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const leadSchema = new Schema({
  name: { type: String, required: true },
  phone_primary: { type: String, required: true },
  phone_secondary: { type: String },
  email:{type:String},
  brand: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
  course_interest: { type: Schema.Types.ObjectId, ref: "Course" },
  source: { type: String },
  assigned_to: { type: Schema.Types.ObjectId, ref: "User" },
  status: { type: String, enum: ["new","attempting","demo_booked","converted","cold","not_interested"], default: "new" },
  next_follow_up: { type: Date },
  intent_level: { type: String, enum: ["low","medium","high"], default: "low" },
  is_hot: { type: Boolean, default: false },
  attempts_count: { type: Number, default: 0 },
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  createdAt: { type: Date, default: Date.now },
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",index:true},
  convertedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  updatedAt: { type: Date, default: Date.now },
  notes: { type: String }
});

leadSchema.pre("save", function(next){
  this.updatedAt = new Date();
  next();
});

const Lead = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
export default Lead;
leadSchema.post("save", async function(doc) {
  try {
    const backup = await import("../../backup/localBackup.js");
    const audit = await import("../../backup/auditLogger.js");
    const flattened = {
      ...doc.toObject ? doc.toObject() : doc,
    };
    try {
      backup.upsertLeadToMonthlyCsv(flattened);
    } catch (e) {
      console.error("[Lead.post.save] upsertLeadToMonthlyCsv failed", e);
    }
    try {
      const user = (doc.updatedBy || doc.createdBy) || "";
      audit.appendAudit({
        action: doc.isNew ? "lead_create" : "lead_update",
        entity: "Lead",
        entityId: doc._id?.toString?.(),
        userId: user?.toString?.() ?? "",
        userName: "", 
        details: doc 
      });
    } catch (e) {
      console.error("[Lead.post.save] audit append failed", e);
    }
  } catch (err) {
    console.error("[Lead.post.save] middleware error", err);
  }
});

leadSchema.post("findOneAndUpdate", async function(doc) {
  if (!doc) return;
  try {
    const backup = await import("../../backup/localBackup.js");
    const audit = await import("../../backup/auditLogger.js");
    try { backup.upsertLeadToMonthlyCsv(doc); } catch (e) { console.error("[Lead.post.findOneAndUpdate] upsert failed", e); }
    try {
      audit.appendAudit({
        action: "lead_findOneAndUpdate",
        entity: "Lead",
        entityId: doc._id?.toString?.(),
        userId: "",
        userName: "",
        details: this.getUpdate ? this.getUpdate() : doc
      });
    } catch (e) { console.error("[Lead.post.findOneAndUpdate] audit failed", e); }
  } catch (err) { console.error("[Lead.post.findOneAndUpdate] middleware error", err); }
});

leadSchema.post("findOneAndDelete", async function(doc) {
  if (!doc) return;
  try {
    const backup = await import("../../backup/localBackup.js");
    const audit = await import("../../backup/auditLogger.js");
    try { backup.deleteLeadFromMonthlyCsv(doc._id?.toString?.()); } catch (e) { console.error("[Lead.post.findOneAndDelete] delete failed", e); }
    try {
      audit.appendAudit({
        action: "lead_delete",
        entity: "Lead",
        entityId: doc._id?.toString?.(),
        userId: "",
        userName: "",
        details: doc
      });
    } catch (e) { console.error("[Lead.post.findOneAndDelete] audit failed", e); }
  } catch (err) { console.error("[Lead.post.findOneAndDelete] middleware error", err); }
});

leadSchema.post("remove", async function(doc) {
  if (!doc) return;
  try {
    const backup = await import("../../backup/localBackup.js");
    const audit = await import("../../backup/auditLogger.js");
    try { backup.deleteLeadFromMonthlyCsv(doc._id?.toString?.()); } catch (e) { console.error("[Lead.post.remove] delete failed", e); }
    try {
      audit.appendAudit({
        action: "lead_remove",
        entity: "Lead",
        entityId: doc._id?.toString?.(),
        userId: "",
        userName: "",
        details: doc
      });
    } catch (e) { console.error("[Lead.post.remove] audit failed", e); }
  } catch (err) { console.error("[Lead.post.remove] middleware error", err); }
});