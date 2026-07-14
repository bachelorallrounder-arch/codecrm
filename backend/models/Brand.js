// src/models/Brand.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const brandSchema = new Schema({
  name: { type: String, required: true },
  // <-- add this courses field so populate("courses") works
  courses: [{ type: Schema.Types.ObjectId, ref: "Course" }],
  whatsappMode: { type: String, enum: ["mobile", "web"], default: "mobile" },
  whatsappWebUrl: { type: String },
  templates: [{
    key: String,
    text: String
  }]
}, {
  timestamps: true
});

// // optional: add indexes or text index if needed
// brandSchema.index({ name: 1 });

const Brand = mongoose.models.Brand || mongoose.model("Brand", brandSchema);
export default Brand;
