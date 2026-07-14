// controllers/demoController.js
import Demo from "../models/Demo.js";
import Lead from "../models/Lead.js";
import AuditLog from "../models/AuditLog.js";
import { enqueueFileUpload } from "../backup/driveUploader.js";
import { upsertLeadToMonthlyCsv } from "../backup/localBackup.js";

export const bookDemo = async (req, res) => {
  try {
    const leadId = req.params.id;
    const { date, time, trainer } = req.body;
    if (!date) return res.status(400).json({ message: "date required" });

    const lead = await Lead.findById(leadId);
    if (!lead) return res.status(404).json({ message: "lead not found" });

    const demo = await Demo.create({
      lead: leadId,
      counsellor: req.user._id,
      trainer,
      createdBy: req.user._id,
      date,
      time
    });

    // update lead status AFTER demo is created
    lead.status = "demo_booked";
    await lead.save();

    // reload and populate lead for CSV (get latest values and names)
    const refreshedLead = await Lead.findById(leadId)
      .populate("createdBy", "name")
      .populate("assigned_to", "name")
      .populate("convertedBy", "name")
      .lean();

    const csvPath = upsertLeadToMonthlyCsv(refreshedLead);
    enqueueFileUpload(csvPath);

    // audit
    await AuditLog.create({
      user: req.user._id,
      action: "book_demo",
      entity: "Demo",
      entityId: demo._id,
      details: demo
    });

    // return the populated demo for the client
    const out = await Demo.findById(demo._id)
      .populate("createdBy", "name email")
      .populate("trainer", "name")
      .lean();

    return res.status(201).json(out);
  } catch (err) {
    console.error("bookDemo error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateDemo = async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const demo = await Demo.findById(id);
    if (!demo) return res.status(404).json({ message: "Not found" });

    Object.assign(demo, body);
    await demo.save();

    // find associated lead using demo.lead
    const lead = await Lead.findById(demo.lead);
    if (lead) {
      // refresh populated lead
      const refreshedLead = await Lead.findById(lead._id)
        .populate("createdBy", "name")
        .populate("assigned_to", "name")
        .populate("convertedBy", "name")
        .lean();

      const csvPath = upsertLeadToMonthlyCsv(refreshedLead);
      enqueueFileUpload(csvPath);
    }

    // audit
    await AuditLog.create({
      user: req.user._id,
      action: "update_demo",
      entity: "Demo",
      entityId: demo._id,
      details: body
    });

    const out = await Demo.findById(demo._id)
      .populate("createdBy", "name email")
      .populate("trainer", "name")
      .lean();

    return res.json(out);
  } catch (err) {
    console.error("updateDemo error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const listDemosForLead = async (req, res) => {
  try {
    const leadId = req.params.id;
    const demos = await Demo.find({ lead: leadId })
      .populate("createdBy", "name email")
      .populate("trainer", "name")
      .lean();
    res.json(demos);
  } catch (err) {
    console.error("listDemosForLead error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
