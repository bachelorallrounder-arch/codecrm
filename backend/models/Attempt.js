// src/models/Attempt.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const attemptSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
  counsellor: { type: Schema.Types.ObjectId, ref: "User", required: true },
  attempt_number: { type: Number, required: true },
  result: { type: String, required: true },
  remark: { type: String },
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  createdAt: { type: Date, default: Date.now }
});

const Attempt = mongoose.models.Attempt || mongoose.model("Attempt", attemptSchema);
export default Attempt;
