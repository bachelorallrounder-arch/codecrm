// src/models/Course.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const CourseSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, trim: true, index: true }, 
  slug: { type: String, trim: true, index: true },  
  description: { type: String, default: "" },
  active: { type: Boolean, default: true },
  meta: { type: Schema.Types.Mixed }, 
}, {
  timestamps: true
});
// CourseSchema.index({ name: 1 }, { unique: true });
CourseSchema.index({ name: "text", description: "text" });

CourseSchema.pre("save", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name.toString().toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/\-+/g, "-")
      .replace(/^\-|\-$/g, "");
  }
  next();
});

CourseSchema.statics.findOrCreateByName = async function (name, opts = {}) {
  if (!name) throw new Error("Course name required");
  const Course = this;
  const trimmed = name.trim();
  let doc = await Course.findOne({ name: trimmed });
  if (doc) return doc;
  const toCreate = { name: trimmed, ...opts };
  try {
    doc = await Course.create(toCreate);
    return doc;
  } catch (err) {
    if (err.code === 11000) {
      return Course.findOne({ name: trimmed });
    }
    throw err;
  }
};

const Course = mongoose.models.Course || mongoose.model("Course", CourseSchema);
export default Course;
