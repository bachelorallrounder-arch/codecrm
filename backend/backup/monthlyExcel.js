// backup/monthlyExcel.js
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { format, subMonths } from "date-fns";
import { uploadFileImmediate } from "./driveUploader.js";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
const DEBUG = process.env.BACKUP_DEBUG === "true";

function log(...args) { if (DEBUG) console.log("[monthlyExcel]", ...args); }

function readCsvRows(filepath) {
  const content = fs.readFileSync(filepath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  const rows = lines.map(line => {
    const res = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i+1] === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        res.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    res.push(cur);
    return res;
  });
  return rows;
}
export async function createMonthlyExcel(monthStr /* e.g. "2025-12" */) {
  const folder = path.join(BACKUP_DIR, monthStr);
  if (!fs.existsSync(folder)) {
    throw new Error("No backup folder for month: " + monthStr);
  }
  const csvFile = path.join(folder, `leads-${monthStr}.csv`);
  if (!fs.existsSync(csvFile)) {
    throw new Error("CSV not found: " + csvFile);
  }

  const rows = readCsvRows(csvFile);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Leads ${monthStr}`);

  rows.forEach(r => sheet.addRow(r));

  sheet.columns.forEach(col => {
    let max = 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value ? String(cell.value) : "";
      if (v.length > max) max = Math.min(v.length, 60);
    });
    col.width = max + 2;
  });

  // create output path
  const outFolder = path.join(BACKUP_DIR, "excel");
  fs.mkdirSync(outFolder, { recursive: true });
  const outPath = path.join(outFolder, `leads-${monthStr}.xlsx`);
  await workbook.xlsx.writeFile(outPath);
  log("Created Excel:", outPath);

  // upload immediately (no debounce) because monthly export is infrequent
  await uploadFileImmediate(outPath);
  return outPath;
}
export async function createLastMonthExcel() {
  const last = subMonths(new Date(), 1);
  const monthStr = format(last, "yyyy-MM");
  return createMonthlyExcel(monthStr);
}
