// src/models/Remark.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const remarkSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true },
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  createdAt: { type: Date, default: Date.now }
});

const Remark = mongoose.models.Remark || mongoose.model("Remark", remarkSchema);
export default Remark;
