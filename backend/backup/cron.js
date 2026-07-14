// backup/cron.js (updated)
import cron from "node-cron";
import { createLastMonthExcel } from "./monthlyExcel.js"; // optional if you keep monthly individual excel
import { createMasterWorkbookAll } from "./masterWorkbook.js";

const DEBUG = process.env.BACKUP_DEBUG === "true";
function log(...args) { if (DEBUG) console.log("[backup-cron]", ...args); }

cron.schedule("10 1 1 * *", async () => {
  try {
    log("Running monthly exports (last month xlsx + master workbook)");
    try { await createLastMonthExcel(); } catch (e) { log("createLastMonthExcel:", e.message || e); }
    await createMasterWorkbookAll();
    log("Monthly export complete");
  } catch (err) {
    console.error("[cron] monthly export failed", err.errors || err.message || err);
  }
});

// Optionally, create a master workbook at startup (uncomment if desired)
// (async () => { try { await createMasterWorkbookAll(); log("Initial master workbook created"); } catch(e){ log("startup create failed", e.message||e); } })();

