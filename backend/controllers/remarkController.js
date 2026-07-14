// controllers/remarkController.js
import Remark from "../models/Remark.js";
import Lead from "../models/Lead.js";
import AuditLog from "../models/AuditLog.js";

export const addRemark = async (req, res) => {
  const leadId = req.params.id;
  const { text, next_follow_up } = req.body;

  if (!text) return res.status(400).json({ message: "text required" });
  // next_follow_up optional? If you want it optional remove this check — but your current code requires it
  if (!next_follow_up)
    return res.status(400).json({
      message: "next_follow_up is mandatory on remark"
    });

  const lead = await Lead.findById(leadId);
  if (!lead) return res.status(404).json({ message: "lead not found" });

  const remark = await Remark.create({
    lead: leadId,
    user: req.user._id,
    createdBy: req.user._id,
    text,
    next_follow_up: next_follow_up ? new Date(next_follow_up) : undefined
  });

  lead.next_follow_up = next_follow_up ? new Date(next_follow_up) : lead.next_follow_up;
  await lead.save();

  await AuditLog.create({
    user: req.user._id,
    action: "add_remark",
    entity: "Remark",
    entityId: remark._id,
    details: remark
  });

  // return populated remark
  const populated = await Remark.findById(remark._id)
    .populate("createdBy", "name email")
    .populate("user", "name email")
    .lean();

  res.status(201).json(populated);
};

export const listRemarks = async (req, res) => {
  const leadId = req.params.id;
  const remarks = await Remark.find({ lead: leadId })
    .sort({ createdAt: -1 })
    .populate("createdBy", "name email")
    .populate("user", "name email")
    .lean();
  res.json(remarks);
};
