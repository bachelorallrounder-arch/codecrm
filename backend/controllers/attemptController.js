// controllers/attemptController.js
import Attempt from "../models/Attempt.js";
import Lead from "../models/Lead.js";
import AuditLog from "../models/AuditLog.js";
import { upsertLeadToMonthlyCsv } from "../backup/localBackup.js";
import { enqueueFileUpload } from "../backup/driveUploader.js";
import { appendAudit } from "../backup/auditLogger.js";

export const addAttempt = async (req, res) => {
  try {
    const leadId = req.params.id;
    const { result, remark } = req.body;
    if (!result) return res.status(400).json({ message: "result required" });

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: "lead not found" });

    // only assigned counsellor or admin can add
    if (req.user.role === "counsellor" && lead.assigned_to && lead.assigned_to.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const attemptNumber = (lead.attempts_count || 0) + 1;

    const attempt = await Attempt.create({
      lead: leadId,
      counsellor: req.user._id,
      attempt_number: attemptNumber,
      result,
      createdBy: req.user._id,
      remark
    });

    // update lead
    lead.attempts_count = attemptNumber;
    lead.status = lead.status === "converted" ? "converted" : "attempting";
    if (["call_back", "fee_enquiry", "demo_request", "answered"].includes(result)) lead.is_hot = true;

    await lead.save();
    appendAudit({
      action: "add_attempt",
      entity: "Attempt",
      entityId: attempt._id.toString(),
      userId: req.user._id.toString(),
      userName: req.user.name || "",
      details: { leadId, result, remark, attemptNumber }
    });
    // reload the lead (populated) after updating
    const refreshedLead = await Lead.findById(leadId)
      .populate("createdBy", "name")
      .populate("assigned_to", "name")
      .populate("convertedBy", "name")
      .lean();

    // upsert into CSV and enqueue upload
    const csvPath = upsertLeadToMonthlyCsv(refreshedLead);
    enqueueFileUpload(csvPath);

    // audit
    await AuditLog.create({
      user: req.user._id,
      action: "add_attempt",
      entity: "Attempt",
      entityId: attempt._id,
      details: attempt
    });

    // Return the attempt populated so client gets user name immediately
    const populated = await Attempt.findById(attempt._id)
      .populate("createdBy", "name email")
      .populate("counsellor", "name email")
      .lean();

    return res.status(201).json(populated);
  } catch (err) {
    console.error("addAttempt error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const listAttempts = async (req, res) => {
  try {
    const leadId = req.params.id;
    // populate createdBy and counsellor (both helpful)
    const attempts = await Attempt.find({ lead: leadId })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email")
      .populate("counsellor", "name email")
      .lean();
    res.json(attempts);
  } catch (err) {
    console.error("listAttempts error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
