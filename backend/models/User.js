// src/models/User.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const brandCourseAssignmentSchema = new Schema({
  brand: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
  course: { type: Schema.Types.ObjectId, ref: "Course", required: true }
}, { _id: false });

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["admin", "counsellor"], default: "counsellor" },
  assignedBrands: [{ type: Schema.Types.ObjectId, ref: "Brand" }],
  assignedCourses: [{ type: Schema.Types.ObjectId, ref: "Course" }],

  brandCourseAssignments: [brandCourseAssignmentSchema],

  createdAt: { type: Date, default: Date.now },
  lastAssignedAt: { type: Date } 
});

userSchema.index({ role: 1 });
userSchema.index({ assignedCourses: 1 });
userSchema.index({ "brandCourseAssignments.brand": 1, "brandCourseAssignments.course": 1 });

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
