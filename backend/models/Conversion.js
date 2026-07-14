// src/models/Conversion.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const paymentSchema = new Schema({
  amount: { type: Number, required: true },
  method: { type: String }, // e.g. online, cash, bank_transfer, upi
  date: { type: Date, default: Date.now },
  note: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" }, // <-- added
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const convSchema = new Schema({
  lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
  course: { type: String, required: true },
  amount_paid: { type: Number, default: 0 },
  total_fee: { type: Number },
  payment_mode: { type: String },
  joining_date: { type: Date },
  counsellor: { type: Schema.Types.ObjectId, ref: "User" },
  payments: { type: [paymentSchema], default: [] }, // embedded payments
  convertedBy: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedAt: { type: Date, default: Date.now },
  cleared: { type: Boolean, default: false }
});

// keep updatedAt in sync
convSchema.pre("save", function(next) {
  this.updatedAt = new Date();
  next();
});

// index for fast lookups by lead
// convSchema.index({ lead: 1 });

const Conversion = mongoose.models.Conversion || mongoose.model("Conversion", convSchema);
export default Conversion;
