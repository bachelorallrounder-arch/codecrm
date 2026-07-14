// backup/auditLogger.js
import fs from "fs";
import path from "path";
import { format } from "date-fns";
import { enqueueFileUpload } from "./driveUploader.js"; // used to push audit files to Drive (debounced)

const AUDIT_DIR = process.env.BACKUP_DIR ? path.join(process.env.BACKUP_DIR, "audit") : path.join(process.cwd(), "backups", "audit");
const DEBUG = process.env.BACKUP_DEBUG === "true";
fs.mkdirSync(AUDIT_DIR, { recursive: true });

function log(...args) { if (DEBUG) console.log("[auditLogger]", ...args); }

function safeString(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") {
    try { return JSON.stringify(v).replace(/"/g,'""'); } catch (e) { return String(v); }
  }
  return String(v).replace(/"/g,'""');
}

export function appendAudit(payload = {}) {
  try {
    const date = new Date();
    const day = format(date, "yyyy-MM-dd");
    const file = path.join(AUDIT_DIR, `audit-${day}.csv`);
    const header = `"timestamp","action","entity","entityId","userId","userName","details","meta"\n`;

    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, header, "utf8");
    }

    const row = [
      `"${date.toISOString()}"`,
      `"${safeString(payload.action)}"`,
      `"${safeString(payload.entity)}"`,
      `"${safeString(payload.entityId)}"`,
      `"${safeString(payload.userId)}"`,
      `"${safeString(payload.userName)}"`,
      `"${safeString(payload.details)}"`,
      `"${safeString(payload.meta || "")}"`
    ].join(",") + "\n";

    fs.appendFileSync(file, row, "utf8");
    log("audit appended", file);

    // enqueue upload of today's audit file (debounced by driveUploader)
    try { enqueueFileUpload(file); } catch (e) { log("failed to enqueue audit upload", e.message || e); }

  } catch (err) {
    console.error("[auditLogger] append failed", err);
  }
}
