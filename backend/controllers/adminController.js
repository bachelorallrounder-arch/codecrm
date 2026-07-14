// backend/controllers/adminController.js
import fs from "fs";
import { promisify } from "util";
import streamifier from "streamifier";
import { parse as csvParse } from "csv-parse";
import xlsx from "xlsx";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import Lead from "../models/Lead.js";
import Brand from "../models/Brand.js";

export const createUser = async (req, res) => {
  const { name, email, password, role, assignedBrands } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: "name, email, password required" });

  const bcryptModule = await import("bcryptjs");
  const bcrypt = bcryptModule.default || bcryptModule; // handle both ESM and CJS shapes
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({ name, email, passwordHash, role, assignedBrands });
  await AuditLog.create({ user: req.user._id, action: "create_user", entity: "User", entityId: user._id });
  res.status(201).json(user);
};

export const updateUser = async (req, res) => {
  const id = req.params.id;
  const body = req.body;
  const user = await User.findById(id);
  if (!user) return res.status(404).json({ message: "Not found" });
  if (body.password) {
    const bcryptModule = await import("bcryptjs");
    const bcrypt = bcryptModule.default || bcryptModule;
    user.passwordHash = await bcrypt.hash(body.password, 10);
    delete body.password;
  }
  Object.assign(user, body);
  await user.save();
  await AuditLog.create({ user: req.user._id, action: "update_user", entity: "User", entityId: id });
  res.json(user);
};

export const getAuditLogs = async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const logs = await AuditLog.find().sort({ createdAt: -1 }).skip((page-1)*limit).limit(Number(limit)).populate("user", "name email");
  res.json(logs);
};

export const reassignLeads = async (req, res) => {
  const { fromCounsellor, toCounsellor } = req.body;
  if (!fromCounsellor || !toCounsellor) return res.status(400).json({ message: "fromCounsellor and toCounsellor required" });
  const result = await Lead.updateMany({ assigned_to: fromCounsellor }, { assigned_to: toCounsellor });
  await AuditLog.create({ user: req.user._id, action: "reassign_leads", details: { fromCounsellor, toCounsellor, matched: result.matchedCount, modified: result.modifiedCount }});
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
};

export const reportsSummary = async (req, res) => {
  const totalLeads = await Lead.countDocuments();
  const converted = await Lead.countDocuments({ status: "converted" });
  const demoBooked = await Lead.countDocuments({ status: "demo_booked" });
  const overdue = await Lead.countDocuments({ next_follow_up: { $lt: new Date() } });
  res.json({ totalLeads, converted, demoBooked, overdue });
};
export const getUsers=async(req,res)=>{
   const { role } = req.query;
  const users = await User.find(role ? { role } : {});
  res.json({ users });
};