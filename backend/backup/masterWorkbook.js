// backup/masterWorkbook.js
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { uploadFileImmediate } from "./driveUploader.js";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const OUT_FOLDER = path.join(BACKUP_DIR, "excel");
const OUT_FILE = path.join(OUT_FOLDER, "leads-all-months.xlsx");
const HISTORY_FILE = path.join(BACKUP_DIR, "history", "deleted-leads.csv");
const DEBUG = process.env.BACKUP_DEBUG === "true";

function log(...args) { if (DEBUG) console.log("[masterWorkbook]", ...args); }

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

/** read a CSV file and return array of rows (arrays) including header */
function readCsv(filepath) {
  const raw = fs.readFileSync(filepath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  return lines.map(parseCsvLine);
}

function listMonthDirs() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map(d => d.name)
    .sort();
}

/** build workbook: monthly sheets + Deleted History sheet from history file */
export async function createMasterWorkbookWithHistory() {
  fs.mkdirSync(OUT_FOLDER, { recursive: true });
  const workbook = new ExcelJS.Workbook();

  // 1) monthly sheets
  const months = listMonthDirs();
  for (const month of months) {
    const csvPath = path.join(BACKUP_DIR, month, `leads-${month}.csv`);
    if (!fs.existsSync(csvPath)) continue;
    try {
      const rows = readCsv(csvPath);
      const sheet = workbook.addWorksheet(month.slice(0,31));
      rows.forEach(r => sheet.addRow(r));
      // autosize
      sheet.columns.forEach(col => {
        let max = 8;
        col.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value ? String(cell.value) : "";
          if (v.length > max) max = Math.min(v.length, 120);
        });
        col.width = Math.min(max + 2, 160);
      });
      log("added month sheet", month, "rows:", rows.length);
    } catch (err) {
      console.error("[masterWorkbook] error adding month", month, err);
    }
  }

  // 2) Deleted History sheet from backups/history/deleted-leads.csv
  const historySheet = workbook.addWorksheet("Deleted History");
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const lines = fs.readFileSync(HISTORY_FILE, "utf8").split(/\r?\n/).filter(Boolean);
      // header
      const headerCols = parseCsvLine(lines[0]);
      historySheet.addRow(headerCols);
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        historySheet.addRow(cols);
      }
      historySheet.columns.forEach(col => {
        let max = 8;
        col.eachCell({ includeEmpty: true }, cell => {
          const v = cell.value ? String(cell.value) : "";
          if (v.length > max) max = Math.min(v.length, 200);
        });
        col.width = Math.min(max + 2, 200);
      });
      log("added Deleted History sheet rows:", Math.max(0, lines.length - 1));
    } catch (err) {
      console.error("[masterWorkbook] failed reading history file", err);
      // still create an empty header
      historySheet.addRow(["deletion_ts","lead_id","deleted_from_month","deleted_by","lead_json"]);
    }
  } else {
    // no history file: create header
    historySheet.addRow(["deletion_ts","lead_id","deleted_from_month","deleted_by","lead_json"]);
  }

  // write workbook and upload
  await workbook.xlsx.writeFile(OUT_FILE);
  log("Wrote master workbook to", OUT_FILE);
  try {
    await uploadFileImmediate(OUT_FILE);
    log("Uploaded master workbook to Drive");
  } catch (err) {
    console.error("[masterWorkbook] upload failed", err);
  }

  return OUT_FILE;
}

export async function createMasterWorkbookAll() {
  return createMasterWorkbookWithHistory();
}
