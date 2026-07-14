// src/controllers/courseController.js
import Course from "../models/Course.js";
import Brand from "../models/Brand.js";
import Lead from "../models/Lead.js";
import Conversion from "../models/Conversion.js";
import AuditLog from "../models/AuditLog.js";
import mongoose from "mongoose";

export const createCourse = async (req, res) => {
  try {
    const { name, code, description, active, meta } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const existing = await Course.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: "Course already exists" });

    const course = await Course.create({
      name: name.trim(),
      code: code?.trim(),
      description: description ?? "",
      active: active === undefined ? true : !!active,
      meta: meta ?? {}
    });

    await AuditLog.create({ user: req.user?._id, action: "create_course", entity: "Course", entityId: course._id, details: course });
    res.status(201).json(course);
  } catch (err) {
    console.error("createCourse", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};

export const listCourses = async (req, res) => {
  try {
    const { q, active, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (active !== undefined) filter.active = active === "true";
    if (q) filter.$text = { $search: q };

    const skip = (Math.max(1, +page) - 1) * Math.max(1, +limit);
    const courses = await Course.find(filter).sort({ name: 1 }).skip(skip).limit(Math.max(1, +limit));
    res.json(courses);
  } catch (err) {
    console.error("listCourses", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};

export const getCourse = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Not found" });
    res.json(course);
  } catch (err) {
    console.error("getCourse", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};

export const updateCourse = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Not found" });

    if (typeof body.name === "string") course.name = body.name.trim();
    if (typeof body.code === "string") course.code = body.code.trim();
    if (typeof body.description === "string") course.description = body.description;
    if (typeof body.active === "boolean") course.active = body.active;
    if (body.meta !== undefined) course.meta = body.meta;

    await course.save();
    await AuditLog.create({ user: req.user?._id, action: "update_course", entity: "Course", entityId: course._id, details: body });
    res.json(course);
  } catch (err) {
    console.error("updateCourse", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const id = req.params.id;
    const force = req.query.force === "true";
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    const course = await Course.findById(id);
    if (!course) return res.status(404).json({ message: "Not found" });

    const leadExists = await Lead.exists({ course: course._id });
    if (leadExists && !force) {
      return res.status(400).json({ message: "Course has leads. Use ?force=true to delete anyway." });
    }

    await Brand.updateMany({ courses: course._id }, { $pull: { courses: course._id } });

    await Course.deleteOne({ _id: id });
    await AuditLog.create({ user: req.user?._id, action: "delete_course", entity: "Course", entityId: id, details: { force } });
    res.json({ message: "deleted" });
  } catch (err) {
    console.error("deleteCourse", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};

export const getCoursePerformance = async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(0);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    to.setHours(23,59,59,999);
    const courseFilter = {};
    if (req.query.courseId && mongoose.Types.ObjectId.isValid(req.query.courseId)) {
      courseFilter.course = mongoose.Types.ObjectId(req.query.courseId);
    }
    const pipeline = [
      { $match: { createdAt: { $gte: from, $lte: to }, ...(courseFilter) } },
      { $lookup: {
        from: "conversions",
        localField: "_id",
        foreignField: "lead",
        as: "conversions"
      }},

      { $project: {
        course: 1,
        brand: 1,
        source: 1,
        converted: { $cond: [{ $gt: [{ $size: "$conversions" }, 0] }, 1, 0] },
        revenue: { $sum: "$conversions.amount" }
      }},

      { $group: {
        _id: { course: "$course", brand: "$brand", source: "$source" },
        leadsCount: { $sum: 1 },
        convertedCount: { $sum: "$converted" },
        totalRevenue: { $sum: "$revenue" }
      }},
      { $group: {
        _id: { course: "$_id.course", brand: "$_id.brand" },
        sources: { $push: {
          source: "$_id.source",
          leadsCount: "$leadsCount",
          convertedCount: "$convertedCount",
          totalRevenue: "$totalRevenue"
        }},
        brandLeads: { $sum: "$leadsCount" },
        brandConverted: { $sum: "$convertedCount" },
        brandRevenue: { $sum: "$totalRevenue" }
      }},

      { $group: {
        _id: "$_id.course",
        brands: { $push: {
          brandId: "$_id.brand",
          sources: "$sources",
          brandLeads: "$brandLeads",
          brandConverted: "$brandConverted",
          brandRevenue: "$brandRevenue"
        }},
        totalLeads: { $sum: "$brandLeads" },
        totalConverted: { $sum: "$brandConverted" },
        totalRevenue: { $sum: "$brandRevenue" }
      }},

      { $lookup: {
        from: "courses", localField: "_id", foreignField: "_id", as: "courseDoc"
      }},

      { $unwind: { path: "$courseDoc", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$brands", preserveNullAndEmptyArrays: true } },

      { $lookup: {
        from: "brands", localField: "brands.brandId", foreignField: "_id", as: "brands.brandDoc"
      }},

      { $unwind: { path: "$brands.brandDoc", preserveNullAndEmptyArrays: true } },
      { $project: {
        courseId: "$_id",
        courseName: "$courseDoc.name",
        totalLeads: 1,
        totalConverted: 1,
        totalRevenue: 1,
        brand: {
          brandId: "$brands.brandId",
          brandName: "$brands.brandDoc.name",
          brandLeads: "$brands.brandLeads",
          brandConverted: "$brands.brandConverted",
          brandRevenue: "$brands.brandRevenue",
          sources: "$brands.sources"
        }
      }},
      { $group: {
        _id: { courseId: "$courseId", courseName: "$courseName", totalLeads: "$totalLeads", totalConverted: "$totalConverted", totalRevenue: "$totalRevenue" },
        brands: { $push: "$brand" }
      }},

      { $project: {
        _id: 0,
        courseId: "$_id.courseId",
        courseName: "$_id.courseName",
        totalLeads: "$_id.totalLeads",
        totalConverted: "$_id.totalConverted",
        totalRevenue: "$_id.totalRevenue",
        brands: 1
      }},

      { $sort: { courseName: 1 } }
    ];

    const results = await Lead.aggregate(pipeline).allowDiskUse(true);
    res.json({ from, to, count: results.length, results });
  } catch (err) {
    console.error("getCoursePerformance", err);
    res.status(500).json({ message: "Internal error", error: err.message });
  }
};
