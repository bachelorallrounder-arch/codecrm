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
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
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