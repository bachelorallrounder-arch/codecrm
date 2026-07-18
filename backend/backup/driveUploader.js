// backup/driveUploader.js
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const CRED_PATH = process.env.GOOGLE_OAUTH_CREDENTIALS || "./config/oauth-client.json";
const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN || "./token.json";
const DRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID;
const UPLOAD_DEBOUNCE_MS = Number(process.env.UPLOAD_DEBOUNCE_MS || 7000);
const CACHE_PATH = path.join(process.cwd(), ".drive_cache.json");
const DEBUG = process.env.BACKUP_DEBUG === "true";

function log(...args) { if (DEBUG) console.log("[driveUploader]", ...args); }

/* Basic env check */
if (!DRIVE_FOLDER_ID) {
  console.warn("[driveUploader] WARNING: GDRIVE_FOLDER_ID not set. Drive uploads will not succeed until set.");
}

/* Read credentials/token if available */
let credentials = null;
let token = null;

try {
  if (process.env.GOOGLE_OAUTH_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS_JSON);
  } else {
    credentials = JSON.parse(fs.readFileSync(CRED_PATH, "utf8"));
  }
} catch (e) {
  console.error("Unable to load credentials", e.message);
}

try {
  if (process.env.GOOGLE_OAUTH_TOKEN_JSON) {
    token = JSON.parse(process.env.GOOGLE_OAUTH_TOKEN_JSON);
  } else {
    token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  }
} catch (e) {
  console.error("Unable to load token", e.message);
}

/* Initialize Drive client if possible */
let driveClient = null;
if (credentials && token) {
  try {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web || {};
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, (redirect_uris && redirect_uris[0]) || "");
    oAuth2Client.setCredentials(token);
    driveClient = google.drive({ version: "v3", auth: oAuth2Client });
  } catch (e) {
    console.error("[driveUploader] failed to init drive client", e);
    driveClient = null;
  }
} else {
  log("Drive client not initialized (missing credentials/token)");
}

/* Cache */
let fileIdCache = {};
try { fileIdCache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch (e) { fileIdCache = {}; }
function saveCache() { try { fs.writeFileSync(CACHE_PATH, JSON.stringify(fileIdCache, null, 2)); } catch (e) {} }

/* Helpers */
async function findFileId(filename) {
  if (!driveClient) throw new Error("Drive client not initialized");

  const key = `${DRIVE_FOLDER_ID}/${filename}`;

  // Verify cached file still exists
  if (fileIdCache[key]) {
    try {
      await driveClient.files.get({
        fileId: fileIdCache[key],
        fields: "id",
      });

      return fileIdCache[key];
    } catch (err) {
      log("Cached file no longer exists. Removing cache.");

      delete fileIdCache[key];
      saveCache();
    }
  }

  const q = `'${DRIVE_FOLDER_ID}' in parents and name='${filename.replace(/'/g, "\\'")}' and trashed=false`;

  const res = await driveClient.files.list({
    q,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 1,
  });

  const files = res.data.files || [];

  if (files.length) {
    fileIdCache[key] = files[0].id;
    saveCache();
    return files[0].id;
  }

  return null;
}

/* Upload or update */
export async function uploadOrUpdateFile(localPath, filename, mimeType = "text/csv") {
  if (!driveClient) throw new Error("Drive client not initialized");
  if (!localPath || typeof localPath !== "string") throw new Error("Invalid localPath");
  const abs = path.resolve(localPath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const fileId = await findFileId(filename);
  const media = { mimeType, body: fs.createReadStream(abs) };
  if (fileId) {
  try {

    log("updating file", filename, "fileId:", fileId);

    await driveClient.files.update({
      fileId,
      media,
    });

    return fileId;

  } catch (err) {

    // Cached file deleted from Drive
    if (err.code === 404 || err.status === 404) {

      log("Drive file missing. Recreating...");

      delete fileIdCache[`${DRIVE_FOLDER_ID}/${filename}`];
      saveCache();

    } else {

      throw err;

    }
  }
}

// Create brand new file
log("creating file", filename);

const res = await driveClient.files.create({
  requestBody: {
    name: filename,
    parents: [DRIVE_FOLDER_ID],
  },
  media,
  fields: "id",
});

const newId = res.data.id;

fileIdCache[`${DRIVE_FOLDER_ID}/${filename}`] = newId;

saveCache();

log("created fileId", newId);

return newId;
}

/* Immediate upload */
export async function uploadFileImmediate(localFilePath) {
  const filename = path.basename(localFilePath || "");
  if (!filename) {
    throw new Error("uploadFileImmediate: empty filename");
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === ".xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
  try {
    return await uploadOrUpdateFile(localFilePath, filename, mime);
  } catch (err) {
    console.error("[driveUploader] uploadFileImmediate failed", err && err.message ? err.message : err);
    throw err;
  }
}

/* Debounced enqueue uploader */
const pending = new Map(); // filename -> { timer, path }

/* Defensive enqueue: validate path exists before scheduling and log caller stack */
export function enqueueFileUpload(localFilePath) {
  try {
    if (!localFilePath || typeof localFilePath !== "string") {
      console.warn("[driveUploader] enqueueFileUpload called with invalid path:", localFilePath);
      console.warn((new Error()).stack.split("\n").slice(2,6).join("\n"));
      return;
    }
    const abs = path.resolve(localFilePath);
    if (!fs.existsSync(abs)) {
      console.warn("[driveUploader] enqueueFileUpload: file does not exist:", abs);
      console.warn("[driveUploader] caller stack:\n", (new Error()).stack.split("\n").slice(2,8).join("\n"));
      return;
    }
    const filename = path.basename(abs);
    if (!filename) {
      console.warn("[driveUploader] enqueueFileUpload: basename empty for", abs);
      return;
    }

    if (pending.has(filename)) {
      clearTimeout(pending.get(filename).timer);
    }
    const timer = setTimeout(async () => {
      try {
        log("Uploading", filename, "from", abs);
        const ext = path.extname(filename).toLowerCase();
        const mime = ext === ".xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv";
        await uploadOrUpdateFile(abs, filename, mime);
        log("Upload done:", filename);
      } catch (err) {
        console.error("[driveUploader] upload failed", err && err.message ? err.message : err);
      } finally {
        pending.delete(filename);
      }
    }, UPLOAD_DEBOUNCE_MS);

    pending.set(filename, { timer, path: abs });
    log("queued upload for", filename, "absPath:", abs);
  } catch (err) {
    console.error("[driveUploader] enqueueFileUpload error", err);
  }
}
