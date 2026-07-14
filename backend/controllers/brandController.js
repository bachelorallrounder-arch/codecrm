// controllers/brandController.js
import Brand from "../models/Brand.js";
import Course from "../models/Course.js";
import Lead from "../models/Lead.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import mongoose from "mongoose";

/**
 * normalizeCourseIds
 * - Accepts: array of course ids, course names, or course objects
 * - Returns: array of unique mongoose ObjectId instances
 */
async function normalizeCourseIds(courses = []) {
  if (!Array.isArray(courses)) return [];

  const outIds = [];

  for (const c of courses) {
    if (!c) continue;

    // Already an ObjectId instance
    if (c instanceof mongoose.Types.ObjectId) {
      outIds.push(c);
      continue;
    }

    // Plain JS object with _id
    if (typeof c === "object" && c._id) {
      // if _id is string or ObjectId
      if (typeof c._id === "string" && /^[0-9a-fA-F]{24}$/.test(c._id)) {
        outIds.push(new mongoose.Types.ObjectId(c._id));
      } else if (c._id instanceof mongoose.Types.ObjectId) {
        outIds.push(c._id);
      }
      continue;
    }

    // If string looks like ObjectId hex
    if (typeof c === "string" && /^[0-9a-fA-F]{24}$/.test(c)) {
      outIds.push(new mongoose.Types.ObjectId(c));
      continue;
    }

    // If string but not an ObjectId => treat as course name, find or create
    if (typeof c === "string") {
      const courseDoc = await Course.findOrCreateByName(c.trim());
      if (courseDoc && courseDoc._id) outIds.push(courseDoc._id);
      continue;
    }
  }

  // dedupe by hex string and return ObjectId instances
  const unique = Array.from(new Set(outIds.map(id => id.toString())))
    .map(hex => new mongoose.Types.ObjectId(hex));

  return unique;
}

/* ----------------- CRUD ----------------- */

export const createBrand = async (req, res) => {
  try {
    const { name, whatsappMode, whatsappWebUrl, templates, courses } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });

    const exists = await Brand.findOne({ name: name.trim() });
    if (exists) return res.status(409).json({ message: "Brand with this name already exists" });

    const courseIds = await normalizeCourseIds(Array.isArray(courses) ? courses : []);

    const brand = await Brand.create({
      name: name.trim(),
      whatsappMode,
      whatsappWebUrl,
      templates: Array.isArray(templates) ? templates : [],
      courses: courseIds
    });

    await AuditLog.create({
      user: req.user?._id,
      action: "create_brand",
      entity: "Brand",
      entityId: brand._id,
      details: { name: brand.name, courses: courseIds }
    });

    await brand.populate({ path: "courses", select: "name code active" });
    res.status(201).json(brand);
  } catch (err) {
    console.error("createBrand error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to create brand", error: err.message });
  }
};

export const listBrands = async (req, res) => {
  try {
    const { populateCourses, courseId } = req.query;
    console.log("[brands] listBrands called, populateCourses=", populateCourses, "courseId=", courseId);

    const q = Brand.find().sort({ name: 1 });

    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      q.where("courses").in([new mongoose.Types.ObjectId(courseId)]);
    }

    if (populateCourses === "true" || populateCourses === true) {
      q.populate({ path: "courses", select: "name code active" });
      const brands = await q.lean().exec();
      return res.json(brands);
    }

    const brands = await q.lean().exec();
    res.json(brands);
  } catch (err) {
    console.error("listBrands error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to list brands", error: err.message });
  }
};

export const getBrand = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    const { populateCourses } = req.query;
    let q = Brand.findById(id);

    if (populateCourses === "true" || populateCourses === true) {
      q = q.populate({ path: "courses", select: "name code active" });
      const brand = await q.lean().exec();
      if (!brand) return res.status(404).json({ message: "Not found" });
      return res.json(brand);
    }

    const brand = await q.lean().exec();
    if (!brand) return res.status(404).json({ message: "Not found" });
    res.json(brand);
  } catch (err) {
    console.error("getBrand error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to get brand", error: err.message });
  }
};

export const getBrandCourses = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    const brand = await Brand.findById(id).populate({ path: "courses", select: "name code active" }).select("courses").lean();
    if (!brand) return res.status(404).json({ message: "Brand not found" });
    res.json(Array.isArray(brand.courses) ? brand.courses : []);
  } catch (err) {
    console.error("getBrandCourses error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to get brand courses", error: err.message });
  }
};

export const updateBrand = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    const brand = await Brand.findById(id);
    if (!brand) return res.status(404).json({ message: "Not found" });

    if (typeof body.name === "string") brand.name = body.name.trim();
    if (body.whatsappMode !== undefined) brand.whatsappMode = body.whatsappMode;
    if (body.whatsappWebUrl !== undefined) brand.whatsappWebUrl = body.whatsappWebUrl;
    if (Array.isArray(body.templates)) brand.templates = body.templates;

    if (body.courses) {
      const normalized = await normalizeCourseIds(body.courses);
      brand.courses = normalized;
    }

    await brand.save();

    await AuditLog.create({
      user: req.user?._id,
      action: "update_brand",
      entity: "Brand",
      entityId: brand._id,
      details: body
    });

    await brand.populate({ path: "courses", select: "name code active" });
    res.json(brand);
  } catch (err) {
    console.error("updateBrand error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to update brand", error: err.message });
  }
};

export const deleteBrand = async (req, res) => {
  try {
    const id = req.params.id;
    const force = req.query.force === "true";

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    const brand = await Brand.findById(id);
    if (!brand) return res.status(404).json({ message: "Not found" });

    const leadExists = await Lead.exists({ brand: brand._id });
    if (leadExists && !force) {
      return res.status(400).json({
        message: "Brand has leads associated. Use ?force=true to delete anyway (not recommended)."
      });
    }

    await Brand.deleteOne({ _id: id });

    await User.updateMany(
      { $or: [{ assignedBrands: brand._id }, { "brandCourseAssignments.brand": brand._id }] },
      {
        $pull: {
          assignedBrands: brand._id,
          brandCourseAssignments: { brand: brand._id }
        }
      }
    );

    await AuditLog.create({
      user: req.user?._id,
      action: "delete_brand",
      entity: "Brand",
      entityId: id,
      details: { force }
    });

    res.json({ message: "deleted" });
  } catch (err) {
    console.error("deleteBrand error:", err && err.stack ? err.stack : err);
    res.status(500).json({ message: "Failed to delete brand", error: err.message });
  }
};
