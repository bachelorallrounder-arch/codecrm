import mongoose from "mongoose";
import Lead from "../models/Lead.js";
import Brand from "../models/Brand.js";
import Course from "../models/Course.js";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import { upsertLeadToMonthlyCsv } from "../backup/localBackup.js";
import { enqueueFileUpload } from "../backup/driveUploader.js";
export const createWebsiteLead = async (req, res) => {
  try {
    console.log("========== WEBSITE LEAD ==========");
    console.log(req.body);
    const {
      name,
      phone,
      mobile,
      email,
      language,
      source_page,
      page,
      brand,
      course,
      source,
      remarks,
    } = req.body;
    const phoneNumber = mobile || phone;
    const pageUrl = page || source_page;
    if (!name || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Name and Mobile are required",
      });
    }
    // const duplicate = await Lead.findOne({
    //   $or: [
    //     { phone_primary: phoneNumber },
    //     ...(email ? [{ email }] : []),
    //   ],
    // });
    // if (duplicate) {
    //   return res.json({
    //     success: true,
    //     duplicate: true,
    //     leadId: duplicate._id,
    //     message: "Lead already exists",
    //   });
    // }
    let brandDoc = null;
    if (brand) {
      brandDoc = await Brand.findOne({
        name: new RegExp(`^${brand}$`, "i"),
      });
      if (!brandDoc) {
        brandDoc = await Brand.create({
          name: brand.trim(),
        });
      }
    } else {
      brandDoc = await Brand.findOne();
    }
    if (!brandDoc) {
      return res.status(400).json({
        success: false,
        message: "No Brand available.",
      });
    }
    let courseDoc = null;
    if (course) {
      courseDoc = await Course.findOne({
        name: new RegExp(`^${course}$`, "i"),
      });
      if (!courseDoc) {
        courseDoc = await Course.create({
          name: course.trim(),
        });
      }
      if (
        !brandDoc.courses.some(
          (id) => id.toString() === courseDoc._id.toString()
        )
      ) {
        brandDoc.courses.push(courseDoc._id);
        await brandDoc.save();
      }
    }
    let counsellor = null;

    if (courseDoc) {
      counsellor = await User.findOne({
        role: "counsellor",
        assignedCourses: courseDoc._id,
      });
    }
    const lead = await Lead.create({
      name,
      phone_primary: phoneNumber,
      email,
      brand: brandDoc._id,
      course_interest: courseDoc?._id,
      source: source || "Website",
      assigned_to: counsellor?._id,
      status: "new",
      notes: `Website Lead
      Language : ${language || "-"}
      Page :${pageUrl || "-"}${remarks || ""}`,
    });
    const populatedLead = await Lead.findById(lead._id)
  .populate("brand", "name")
  .populate("course_interest", "name")
  .populate("assigned_to", "name")
  .lean();

const csvPath = upsertLeadToMonthlyCsv(populatedLead);
enqueueFileUpload(csvPath);
    await AuditLog.create({
      user: null,
      action: "website_lead",
      entity: "Lead",
      entityId: lead._id,
      details: req.body,
    });
    return res.status(201).json({
      success: true,
      leadId: lead._id,
      message: "Lead created successfully",
    });
  } catch (err) {
    console.error("createWebsiteLead:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};