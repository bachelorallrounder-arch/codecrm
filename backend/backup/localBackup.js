// backup/localBackup.js
import fs from "fs";
import path from "path";
import { format } from "date-fns";
import { enqueueFileUpload } from "./driveUploader.js"; // enqueue debounced upload

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const DEBUG = process.env.BACKUP_DEBUG === "true";
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function log(...args) { if (DEBUG) console.log("[localBackup]", ...args); }
function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {} }

function getName(obj) {
  if (obj === undefined || obj === null) return "";
  if (typeof obj === "string" && obj.trim() !== "") return obj;
  if (typeof obj === "number") return String(obj.name);
  if (typeof obj === "object") {
    if (obj.name) return String(obj.name);
    if (obj.fullName) return String(obj.fullName);
    try { return obj.toString(); } catch (e) { return ""; }
  }
  return "";
}

function qVal(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") {
    try {
      return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
    } catch (e) {
      return '""';
    }
  }
  const s = String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function leadToCsvRow(lead) {
  const createdAt = lead.createdAt ? new Date(lead.createdAt) : new Date();
  return [
    qVal(lead._id?.toString?.() ?? lead._id ?? ""),
    qVal(createdAt.toISOString()),
    qVal(lead.updatedAt ? new Date(lead.updatedAt).toISOString() : ""),
    qVal(format(createdAt, "yyyy-MM")),
    qVal(lead.name || ""),
    qVal(lead.email || ""),
    qVal(lead.phone || lead.phone_primary || ""),
    qVal(lead.source || ""),
    qVal(getName(lead.course_interest) || lead.course || ""),
    qVal(getName(lead.brand) || ""),
    qVal(getName(lead.createdBy)),
    qVal(getName(lead.assigned_to)),
    qVal(lead.notes || ""),
    qVal(lead.status || ""),
    qVal(lead.next_follow_up ? new Date(lead.next_follow_up).toISOString() : ""),
    qVal(lead.result || ""),
    qVal(lead.remark || ""),
    qVal(lead.attempts_count ?? (Array.isArray(lead.attempts) ? lead.attempts.length : "")),
    qVal(getName(lead.convertedBy)),
    qVal(lead.meta || {})
  ].join(",") + "\n";
}

const headerColumns = [
  "lead_id","created_at","updated_at","month","name","email","phone","source","course","brand",
  "createdBy","assigned_to","notes","status","next_follow_up","result","remark","attempts_count","convertedBy","meta_json"
];

/** parse a quoted CSV line into array of fields (handles escaped quotes) */
function parseCsvLine(line) {
  const res = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { res.push(cur); cur = ""; continue; }
    cur += ch;
  }
  res.push(cur);
  return res;
}

/** parse CSV line into object using headerColumns mapping */
function csvLineToObject(line) {
  const fields = parseCsvLine(line);
  const obj = {};
  for (let i = 0; i < headerColumns.length; i++) {
    obj[headerColumns[i]] = fields[i] ?? "";
  }
  return obj;
}

/**
 * Upsert a lead row into monthly CSV file (one row per lead_id)
 * Returns filepath
 */
export function upsertLeadToMonthlyCsv(lead) {
  if (!lead) throw new Error("lead required for upsert");
  const createdAt = lead.createdAt ? new Date(lead.createdAt) : new Date();
  const month = format(createdAt, "yyyy-MM");
  const folder = path.join(BACKUP_DIR, month);
  ensureDir(folder);

  const filename = `leads-${month}.csv`;
  const filepath = path.join(folder, filename);

  if (!fs.existsSync(filepath)) {
    const header = headerColumns.join(",") + "\n";
    fs.writeFileSync(filepath, header + leadToCsvRow(lead), "utf8");
    log("created CSV and wrote lead", filepath);
    try { enqueueFileUpload(filepath); } catch(e){ log("enqueue failed", e); }
    return filepath;
  }

  const content = fs.readFileSync(filepath, "utf8");
  const lines = content.split(/\r?\n/);
  const headerLine = lines[0] || headerColumns.join(",");
  const dataLines = lines.slice(1).filter(Boolean);

  const leadId = lead._id?.toString?.() ?? lead._id ?? "";
  const newRow = leadToCsvRow(lead).trim();

  let found = false;
  const outLines = dataLines.map(line => {
    // extract first column
    let id = "";
    if (line.startsWith('"')) {
      // parse quoted field
      let i = 1, val = "";
      while (i < line.length) {
        if (line[i] === '"' && line[i+1] === '"') { val += '"'; i += 2; continue; }
        if (line[i] === '"') { i++; break; }
        val += line[i++];
      }
      id = val;
    } else {
      const idx = line.indexOf(",");
      id = idx === -1 ? line : line.slice(0, idx);
    }
    if (String(id) === String(leadId)) {
      found = true;
      return newRow;
    }
    return line;
  });

  if (!found) outLines.push(newRow);

  const tmp = filepath + `.${Date.now()}.tmp`;
  const final = headerLine + "\n" + outLines.join("\n") + "\n";
  fs.writeFileSync(tmp, final, "utf8");
  fs.renameSync(tmp, filepath);
  log(found ? "updated lead in CSV" : "appended new lead to CSV", filepath);

  try { enqueueFileUpload(filepath); } catch(e){ log("enqueue failed", e); }
  return filepath;
}

/**
 * Append deleted lead snapshot into backups/history/deleted-leads.csv
 * Stores: deletion_ts,lead_id,deleted_from_month,deleted_by,lead_json
 */
function appendDeletedHistory(leadSnapshot = {}, deletedBy = "") {
  try {
    const histDir = path.join(BACKUP_DIR, "history");
    ensureDir(histDir);
    const histFile = path.join(histDir, "deleted-leads.csv");
    const header = `"deletion_ts","lead_id","deleted_from_month","deleted_by","lead_json"\n`;
    if (!fs.existsSync(histFile)) fs.writeFileSync(histFile, header, "utf8");

    const ts = new Date().toISOString();
    const leadId = (leadSnapshot && (leadSnapshot.lead_id || leadSnapshot._id)) ? String(leadSnapshot.lead_id || leadSnapshot._id) : "";
    const month = leadSnapshot && leadSnapshot.created_at ? (leadSnapshot.month || format(new Date(leadSnapshot.created_at), "yyyy-MM")) : (leadSnapshot.month || "");
    const safeJson = JSON.stringify(leadSnapshot).replace(/"/g, '""');

    const row = [
      `"${ts}"`,
      `"${leadId.replace(/"/g,'""')}"`,
      `"${(month||"").replace(/"/g,'""')}"`,
      `"${String(deletedBy || "").replace(/"/g,'""')}"`,
      `"${safeJson}"`
    ].join(",") + "\n";

    fs.appendFileSync(histFile, row, "utf8");
    log("appended deleted history", histFile);
    try { enqueueFileUpload(histFile); } catch(e){ log("enqueue history enqueue failed", e); }
  } catch (err) {
    console.error("[localBackup] appendDeletedHistory failed", err);
  }
}

/**
 * Delete a lead by leadId. If monthProvided is set, delete from that month file only.
 * When we delete, we also append the removed row into history file.
 */
export function deleteLeadFromMonthlyCsv(leadId, monthProvided = null, deletedBy = "") {
  if (!leadId) throw new Error("leadId required");

  function tryDelete(filepath) {
    if (!fs.existsSync(filepath)) return false;
    const content = fs.readFileSync(filepath, "utf8");
    const lines = content.split(/\r?\n/);
    const headerLine = lines[0] || headerColumns.join(",");
    const dataLines = lines.slice(1).filter(Boolean);

    let deleted = false;
    let removedLine = null;
    const out = dataLines.filter(line => {
      let id = "";
      if (line.startsWith('"')) {
        let i = 1, val = "";
        while (i < line.length) {
          if (line[i] === '"' && line[i+1] === '"') { val += '"'; i += 2; continue; }
          if (line[i] === '"') { i++; break; }
          val += line[i++];
        }
        id = val;
      } else {
        const idx = line.indexOf(",");
        id = idx === -1 ? line : line.slice(0, idx);
      }
      if (String(id) === String(leadId)) {
        deleted = true;
        removedLine = line;
        return false; // filter out
      }
      return true;
    });

    if (!deleted) return false;

    // save removedLine to history (parsed to object)
    try {
      const snapshot = csvLineToObject(removedLine);
      appendDeletedHistory(snapshot, deletedBy || "");
    } catch (e) {
      log("failed to append deleted snapshot:", e);
    }

    const tmp = filepath + `.${Date.now()}.tmp`;
    const final = headerLine + "\n" + out.join("\n") + (out.length ? "\n" : "");
    fs.writeFileSync(tmp, final, "utf8");
    fs.renameSync(tmp, filepath);
    log("deleted lead", leadId, "from", filepath);
    try { enqueueFileUpload(filepath); } catch(e){ log("enqueue failed", e); }
    return true;
  }

  if (monthProvided) {
    const filepath = path.join(BACKUP_DIR, monthProvided, `leads-${monthProvided}.csv`);
    return tryDelete(filepath);
  }

  const months = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map(d => d.name);

  for (const m of months) {
    const filepath = path.join(BACKUP_DIR, m, `leads-${m}.csv`);
    const ok = tryDelete(filepath);
    if (ok) return true;
  }

  log("deleteLead: not found", leadId);
  return false;
}
