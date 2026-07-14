// src/controllers/conversionController.js
import Conversion from "../models/Conversion.js";
import Lead from "../models/Lead.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";

function sumPayments(payments = []) {
  return payments.reduce((s, p) => s + (Number(p?.amount) || 0), 0);
}

async function enrichConversionWithUserNames(conv) {
  if (!conv) return conv;
  let obj = conv.toObject ? conv.toObject() : JSON.parse(JSON.stringify(conv));
  const userIdSet = new Set();

  if (obj.counsellor && typeof obj.counsellor === "object" && obj.counsellor._id) {
  } else if (obj.counsellor) {
    userIdSet.add(String(obj.counsellor));
  }

  if (obj.lead && obj.lead.convertedBy) {
    if (typeof obj.lead.convertedBy === "object" && obj.lead.convertedBy._id ) {
    } else {
      userIdSet.add(String(obj.lead.convertedBy));
    }
  }

  if (Array.isArray(obj.payments)) {
    for (const p of obj.payments) {
      if (p.createdBy) {
        if (typeof p.createdBy === "object" && p.createdBy._id) {
        } else {
          userIdSet.add(String(p.createdBy));
        }
      }
    }
  }

  if (Array.isArray(obj.reminders)) {
    for (const r of obj.reminders) {
      if (r.createdBy) {
        if (typeof r.createdBy === "object" && r.createdBy._id) {
        } else {
          userIdSet.add(String(r.createdBy));
        }
      }
    }
  }

  if (userIdSet.size > 0) {
    const ids = Array.from(userIdSet);
    const users = await User.find({ _id: { $in: ids } }).select("name email").lean();
    const map = new Map(users.map(u => [String(u._id), u]));
    if (Array.isArray(obj.payments)) {
      for (const p of obj.payments) {
        let created = null;
        if (p.createdBy) {
          if (typeof p.createdBy === "object" && p.createdBy._id) created = p.createdBy;
          else created = map.get(String(p.createdBy)) || null;
        }
        p.createdByObj = created;
        p.createdByName = created ? (created.name || created.email || String(created._id)) : null;
      }
    }
    if (Array.isArray(obj.reminders)) {
      for (const r of obj.reminders) {
        let created = null;
        if (r.createdBy) {
          if (typeof r.createdBy === "object" && r.createdBy._id) created = r.createdBy;
          else created = map.get(String(r.createdBy)) || null;
        }
        r.createdByObj = created;
        r.createdByName = created ? (created.name || created.email || String(created._id)) : null;
      }
    }
    // counsellor could be id
    if (obj.counsellor && typeof obj.counsellor !== "object") {
      const c = map.get(String(obj.counsellor));
      if (c) obj.counsellor = c;
    }
    // lead.convertedBy
    if (obj.lead && obj.lead.convertedBy && typeof obj.lead.convertedBy !== "object") {
      const c = map.get(String(obj.lead.convertedBy));
      if (c) obj.lead.convertedBy = c;
    }
  } else {
    // even if no lookups, ensure payments have createdByName if populated
    if (Array.isArray(obj.payments)) {
      for (const p of obj.payments) {
        if (p.createdBy && typeof p.createdBy === "object") {
          p.createdByObj = p.createdBy;
          p.createdByName = p.createdBy.name || p.createdBy.email || String(p.createdBy._id);
        } else {
          p.createdByObj = null;
          p.createdByName = null;
        }
      }
    }
    if (Array.isArray(obj.reminders)) {
      for (const r of obj.reminders) {
        if (r.createdBy && typeof r.createdBy === "object") {
          r.createdByObj = r.createdBy;
          r.createdByName = r.createdBy.name || r.createdBy.email || String(r.createdBy._id);
        } else {
          r.createdByObj = null;
          r.createdByName = null;
        }
      }
    }
  }

  // convenience top-level field: convertedByName (from lead.convertedBy if present)
  if (obj.lead && obj.lead.convertedBy) {
    if (typeof obj.lead.convertedBy === "object") {
      obj.convertedByName = obj.lead.convertedBy.name || obj.lead.convertedBy.email || String(obj.lead.convertedBy._id);
    } else {
      obj.convertedByName = String(obj.lead.convertedBy);
    }
  } else {
    obj.convertedByName = obj.convertedByName || null;
  }

  return obj;
}

/* ---------- Controller functions ---------- */

export const convertLead = async (req, res, next) => {
  try {
    const leadIdOrConvId = req.params.id;
    const { course, amount_paid, total_fee, payment_mode, joining_date } = req.body;
    let lead = null;
    try {
      lead = await Lead.findById(leadIdOrConvId);
    } catch (e) {
      // ignore invalid id
    }

    let conv = null;
    if (!lead) {
      conv = await Conversion.findById(leadIdOrConvId);
      if (conv) lead = await Lead.findById(conv.lead);
    }

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    if (!conv) {
      conv = await Conversion.findOne({ lead: lead._id });
    }

    if (!conv) {
      // create new conversion
      conv = new Conversion({
        lead: lead._id,
        course: course || (lead.course_interest || "Unknown"),
        amount_paid: amount_paid != null ? Number(amount_paid) : 0,
        total_fee: total_fee != null ? Number(total_fee) : undefined,
        payment_mode: payment_mode || undefined,
        joining_date: joining_date ? new Date(joining_date) : undefined,
        counsellor: req.user && req.user._id ? req.user._id : undefined,
        payments: [],
        reminders: []
      });

      // if initial amount_paid provided, record it as a payment entry (keeps history)
      if (amount_paid != null && Number(amount_paid) > 0) {
        conv.payments.push({
          amount: Number(amount_paid),
          method: payment_mode || "online",
          date: joining_date ? new Date(joining_date) : new Date(),
          note: "Initial conversion amount",
          createdBy: req.user && req.user._id ? req.user._id : undefined,
          createdAt: new Date()
        });
        conv.amount_paid = sumPayments(conv.payments);
      }

      await conv.save();
    } else {
      if (course) conv.course = course;
      if (total_fee !== undefined) conv.total_fee = Number(total_fee);
      if (payment_mode) conv.payment_mode = payment_mode;
      if (joining_date) conv.joining_date = new Date(joining_date);
      if (amount_paid !== undefined) {
        conv.amount_paid = Number(amount_paid);
      }
      conv.counsellor = conv.counsellor || (req.user && req.user._id) || conv.counsellor;
      await conv.save();
    }

    lead.status = "converted";
    if (req.user && req.user._id) {
      lead.convertedBy = req.user._id;
    }
    await lead.save();

    await AuditLog.create({
      user: req.user && req.user._id,
      action: "convert_lead",
      entity: "Conversion",
      entityId: conv._id,
      details: { conversionId: conv._id, lead: lead._id }
    });

    const raw = await Conversion.findById(conv._id)
      .populate("counsellor", "name email")
      .populate({
        path: "lead",
        populate: { path: "convertedBy", select: "name email" }
      });

    const out = await enrichConversionWithUserNames(raw);
    return res.status(201).json(out);
  } catch (err) {
    console.error("convertLead error:", err);
    return next(err);
  }
};

export const convertedLead = async (req, res, next) => {
  try {
    const id = req.params.id;
    let conv = await Conversion.findOne({ lead: id }).populate("counsellor", "name email");
    if (!conv) {
      try {
        conv = await Conversion.findById(id).populate("counsellor", "name email");
      } catch (e) {
      }
    }

    if (!conv) return res.status(404).json({ message: "Conversion not found" });

    const raw = await Conversion.findById(conv._id)
      .populate("counsellor", "name email")
      .populate({
        path: "lead",
        populate: { path: "convertedBy", select: "name email" }
      });

    const out = await enrichConversionWithUserNames(raw);
    return res.json(out);
  } catch (err) {
    console.error("convertedLead error:", err);
    return next(err);
  }
};

export const addPayment = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { amount, method, date, note, total_fee } = req.body;

    if (amount == null || Number.isNaN(Number(amount))) {
      return res.status(400).json({ message: "amount is required and must be numeric" });
    }
    let conv = null;
    try {
      conv = await Conversion.findById(id);
    } catch (e) {
    }
    if (!conv) {
      const lead = await Lead.findById(id);
      if (!lead) return res.status(404).json({ message: "Lead not found for creating payment" });

      conv = await Conversion.findOne({ lead: lead._id });
      if (!conv) {
        conv = new Conversion({
          lead: lead._id,
          course: req.body.course || lead.course_interest || "Unknown",
          amount_paid: 0,
          total_fee: total_fee !== undefined ? Number(total_fee) : undefined,
          counsellor: req.user && req.user._id ? req.user._id : undefined,
          payments: [],
          reminders: []
        });
      }
    }

    const paymentEntry = {
      amount: Number(amount),
      method: method || req.body.payment_mode || "online",
      date: date ? new Date(date) : new Date(),
      note: note || undefined,
      createdBy: req.user && req.user._id ? req.user._id : undefined,
      createdAt: new Date()
    };

    conv.payments = conv.payments || [];
    conv.payments.push(paymentEntry);
    conv.amount_paid = sumPayments(conv.payments);
    if (total_fee !== undefined) conv.total_fee = Number(total_fee);
    await conv.save();

    try {
      const lead = await Lead.findById(conv.lead);
      if (lead) {
        lead.status = "converted";
        await lead.save();
      }
    } catch (e) {
      // ignore
    }

    await AuditLog.create({
      user: req.user && req.user._id,
      action: "add_payment",
      entity: "Conversion",
      entityId: conv._id,
      details: { payment: paymentEntry, new_amount_paid: conv.amount_paid }
    });

    const outRaw = await Conversion.findById(conv._id)
      .populate("counsellor", "name email")
      .populate({
        path: "lead",
        populate: { path: "convertedBy", select: "name email" }
      });

    const out = await enrichConversionWithUserNames(outRaw);
    return res.status(201).json(out);
  } catch (err) {
    console.error("addPayment error:", err);
    return next(err);
  }
};

export const getPayments = async (req, res, next) => {
  try {
    const id = req.params.id;
    let conv = null;
    try {
      conv = await Conversion.findById(id);
    } catch (e) {
      // ignore
    }

    if (!conv) conv = await Conversion.findOne({ lead: id });

    if (!conv) return res.status(404).json({ message: "Conversion not found" });

    const raw = await Conversion.findById(conv._id)
      .populate({
        path: "lead",
        populate: { path: "convertedBy", select: "name email" }
      })
      .populate("counsellor", "name email");

    const out = await enrichConversionWithUserNames(raw);
    return res.json({ payments: out.payments || [], amount_paid: out.amount_paid ?? sumPayments(out.payments || []), total_fee: out.total_fee ?? null });
  } catch (err) {
    console.error("getPayments error:", err);
    return next(err);
  }
};

export const scheduleReminder = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { when, message } = req.body;
    if (!when) return res.status(400).json({ message: "when (ISO date) required" });

    let conv = null;
    try {
      conv = await Conversion.findById(id);
    } catch (e) { /* ignore */ }

    if (!conv) {
      const lead = await Lead.findById(id);
      if (!lead) return res.status(404).json({ message: "Conversion or Lead not found" });
      conv = await Conversion.findOne({ lead: lead._id }) || new Conversion({ lead: lead._id, payments: [], reminders: [] });
    }

    conv.reminders = conv.reminders || [];
    const reminder = {
      when: new Date(when),
      message: message || "",
      createdBy: req.user && req.user._id,
      createdAt: new Date(),
      sent: false
    };
    conv.reminders.push(reminder);
    await conv.save();

    await AuditLog.create({
      user: req.user && req.user._id,
      action: "schedule_reminder",
      entity: "Conversion",
      entityId: conv._id,
      details: reminder
    });

    const outRaw = await Conversion.findById(conv._id)
      .populate("counsellor", "name email")
      .populate({
        path: "lead",
        populate: { path: "convertedBy", select: "name email" }
      });

    const out = await enrichConversionWithUserNames(outRaw);
    return res.status(201).json(out);
  } catch (err) {
    console.error("scheduleReminder error:", err);
    return next(err);
  }
};

export const markFullyPaid = async (req, res, next) => {
  try {
    const id = req.params.id;
    let conv = null;
    try {
      conv = await Conversion.findById(id);
    } catch (e) { /* ignore */ }

    if (!conv) {
      const lead = await Lead.findById(id);
      if (!lead) return res.status(404).json({ message: "Conversion or Lead not found" });
      conv = await Conversion.findOne({ lead: lead._id });
      if (!conv) {
        conv = new Conversion({ lead: lead._id, payments: [], reminders: [] });
      }
    }

    conv.payments = conv.payments || [];
    const totalFee = conv.total_fee != null ? Number(conv.total_fee) : null;
    const alreadyPaid = sumPayments(conv.payments) || Number(conv.amount_paid || 0) || 0;

    let createdPayment = null;
    if (totalFee != null && alreadyPaid < totalFee) {
      const remaining = Number(totalFee - alreadyPaid);
      const paymentEntry = {
        amount: remaining,
        method: req.body.method || "mark_paid",
        date: req.body.date ? new Date(req.body.date) : new Date(),
        note: req.body.note || "Marked fully paid",
        createdBy: req.user && req.user._id,
        createdAt: new Date()
      };
      conv.payments.push(paymentEntry);
      createdPayment = paymentEntry;
    }

    conv.amount_paid = sumPayments(conv.payments);

    if (conv.total_fee != null && conv.amount_paid >= conv.total_fee) {
      conv.cleared = true;
    }

    await conv.save();
    try {
      const lead = await Lead.findById(conv.lead);
      if (lead) {
        lead.status = "converted";
        if (conv.total_fee != null && conv.amount_paid >= conv.total_fee) {
          lead.payment_cleared = true;
        }
        await lead.save();
      }
    } catch (e) { /* ignore */ }

    await AuditLog.create({
      user: req.user && req.user._id,
      action: "mark_fully_paid",
      entity: "Conversion",
      entityId: conv._id,
      details: { createdPayment, amount_paid: conv.amount_paid, total_fee: conv.total_fee }
    });

    const outRaw = await Conversion.findById(conv._id)
      .populate("counsellor", "name email")
      .populate({
        path: "lead",
        populate: { path: "convertedBy", select: "name email" }
      });

    const out = await enrichConversionWithUserNames(outRaw);
    return res.status(200).json(out);
  } catch (err) {
    console.error("markFullyPaid error:", err);
    return next(err);
  }
};
