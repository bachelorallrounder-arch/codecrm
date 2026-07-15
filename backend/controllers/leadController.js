import Lead from "../models/Lead.js";
import Attempt from "../models/Attempt.js";
import Remark from "../models/Remark.js";
import Demo from "../models/Demo.js";
import Conversion from "../models/Conversion.js";
import AuditLog from "../models/AuditLog.js";
import Brand from "../models/Brand.js";
import { calcPriority } from "../utils/calcPriority.js";
import { detectIntent } from "../utils/intentDetection.js";
import mongoose from "mongoose";
import {deleteLeadFromMonthlyCsv, upsertLeadToMonthlyCsv } from "../backup/localBackup.js";
import { enqueueFileUpload } from "../backup/driveUploader.js";

export const createLead = async (req, res) => {
  const body = req.body;
  const userId = req.user._id;
  // require short form: name, phone_primary, brand
  if (!body.name || !body.phone_primary || !body.brand) {
    return res.status(400).json({ message: "name, phone_primary and brand are required" });
  }
  const brand = await Brand.findById(body.brand);
  if (!brand) return res.status(400).json({ message: "Invalid brand" });

  const lead = new Lead({
    name: body.name,
    phone_primary: body.phone_primary,
    phone_secondary: body.phone_secondary,
    email:body.email,
    brand: body.brand,
    course_interest: body.course_interest,
    source: body.source,
    assigned_to: body.assigned_to,
    createdBy: userId,
    next_follow_up: body.next_follow_up,
    notes: body.notes
  });

  // initial intent & priority
  lead.intent_level = detectIntent(body.notes || body.source || "");
  lead.priority_score = calcPriority({ sourceScore: 1, courseDemand: 1, attemptSuccess: 0, isHot: false, freshnessScore: 2, demoBooked: false });

  const saved = await lead.save()
  const csvPath = upsertLeadToMonthlyCsv(saved);
  enqueueFileUpload(csvPath);
  await AuditLog.create({ user: req.user._id, action: "create_lead", entity: "Lead", entityId: saved._id, details: saved });

  res.status(201).json(saved);
};

export const listLeads = async (req, res) => {
  // Filters: brand, source, counsellor, course, status
  const { brand, source, counsellor, course, status, quickFilter, sortBy, page = 1, limit = 25, search } = req.query;
  const query = {};

  if (brand) query.brand = brand;
  if (source) query.source = source;
  if (counsellor) query.assigned_to = counsellor;
  if (course) query.course_interest = course;
  if (status) query.status = status;

  if (req.user.role === "counsellor") {
    // counsellor sees assigned leads only
    query.assigned_to = req.user._id;
  }

  if (quickFilter) {
    if (quickFilter === "Hot") query.is_hot = true;
    if (quickFilter === "Overdue") query.next_follow_up = { $lt: new Date() };
    if (quickFilter === "Fresh") query.createdAt = { $gte: new Date(Date.now() - 24*60*60*1000) };
    if (quickFilter === "Demo Booked") query.status = "demo_booked";
  }

  if (search) {
    query.$or = [
      { name: new RegExp(search, "i") },
      { phone_primary: new RegExp(search, "i") }
    ];
  }

  let sort = { createdAt: -1 };
  if (sortBy === "priority") sort = { priority_score: -1 };
  if (sortBy === "followup") sort = { next_follow_up: 1 };

  const total = await Lead.countDocuments(query);
  const leads = await Lead.find(query)
  .populate("brand", "name")
  .populate("course_interest", "name")
  .populate("assigned_to", "name email")
  .sort(sort)
  .skip((page - 1) * limit)
  .limit(Number(limit));

  res.json({ total, page: Number(page), limit: Number(limit), results: leads });
};

export const getLead = async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });
  const lead = await Lead.findById(id)
  .populate("brand", "name")
  .populate("course_interest", "name")
  .populate("assigned_to", "name email")
  .populate("createdBy", "name email")
  .populate("updatedBy", "name email")
  .populate("convertedBy", "name email");
  if (!lead) return res.status(404).json({ message: "Not found" });

  // If counsellor, ensure assigned
  if (req.user.role === "counsellor" && (!lead.assigned_to || lead.assigned_to._id.toString() !== req.user._id.toString())) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // timeline: attempts, remarks, demos, conversions
  const attempts = await Attempt.find({ lead: id }).populate("counsellor", "name email").populate("createdBy", "name email");
  const remarks = await Remark.find({ lead: id }).populate("user", "name email").populate("createdBy", "name email");
  const demos = await Demo.find({ lead: id }).populate("counsellor", "name email").populate("createdBy", "name email");
  const conversions = await Conversion.find({ lead: id }).populate("createdBy", "name email");

  res.json({ lead, timeline: { attempts, remarks, demos, conversions } });
};

export const updateLead = async (req, res) => {
  const id = req.params.id;
  const body = req.body;

  const lead = await Lead.findById(id);
  if (!lead) return res.status(404).json({ message: "Not found" });

  // if counsellor trying to update not assigned lead -> forbidden
  if (req.user.role === "counsellor" && lead.assigned_to && lead.assigned_to.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Forbidden" });
  }

  Object.assign(lead, body);

  // Recompute priority/intent
  lead.intent_level = detectIntent(lead.notes || "");

  const saved = await lead.save();
  const refreshedLead = await Lead.findById(id)
  .populate('createdBy', 'name')
  .populate('assigned_to', 'name')
  .populate('convertedBy', 'name')
  .lean();

  const csvPath = upsertLeadToMonthlyCsv(refreshedLead);
  enqueueFileUpload(csvPath);
  await AuditLog.create({ user: req.user._id, action: "update_lead", entity: "Lead", entityId: saved._id, details: body });
  res.json(saved);
};

export const deleteLead = async (req, res) => {
   try {
  const id = req.params.id;
   const lead = await Lead.findByIdAndDelete(id);
    if (!lead) return res.status(404).json({ message: "not found" });
    // remove from CSV
    const deleted = deleteLeadFromMonthlyCsv(id);
    // also create an audit log if you have one
    res.json({ message: "deleted", csvDeleted: deleted });
  } catch (err) {
    console.error("deleteLead error:", err);
    res.status(500).json({ message: "internal error" });
  }
};
