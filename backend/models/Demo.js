import mongoose from "mongoose";
const { Schema } = mongoose;

const demoSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
  counsellor: { type: Schema.Types.ObjectId, ref: "User" },
  trainer: { type: String },
  date: { type: Date, required: true },
  time: { type: String },
  status: { type: String, enum: ["scheduled","completed","cancelled"], default: "scheduled" },
  post_demo_remark: { type: String },
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  createdAt: { type: Date, default: Date.now }
});

const Demo = mongoose.models.Demo || mongoose.model("Demo", demoSchema);
export default Demo;
