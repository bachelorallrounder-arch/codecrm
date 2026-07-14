//controllers/importController.js
import fs from "fs";
import mongoose from "mongoose";
import xlsx from "xlsx";
import { parse as csvParser } from "csv-parse";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import Lead from "../models/Lead.js";
import Brand from "../models/Brand.js";

function normalizeKey(k) {
  return String(k || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function mapRowToLead(row) {
  const get = (keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "")
        return String(row[k]).trim();
    }
    return undefined;
  };

  const name = get(["name", "full_name", "student_name"]);
  const phone = get([
    "mobile",
    "phone",
    "phone_primary",
    "phone_primary_number",
    "mobilenumber",
  ]);
  const email = get(["email", "email_address", "emailid"]);
  const brandVal = get(["brand", "brand_name"]);
  const course = get(["course", "course_interest", "course_name"]);
  const source = get(["source", "lead_source"]);

  return { name, phone, email, brandVal, course, source, raw: row };
}

// ------------------------------
//  MAIN IMPORT CONTROLLER
// ------------------------------
export async function importLeads(req, res) {
  const file = req.file;
  if (!file)
    return res.status(400).json({ success: false, error: "No file uploaded" });

  const tmpPath = file.path;
  const ext = (file.originalname || "").split(".").pop().toLowerCase();
  const createMissingBrands =
    String(req.body.createMissingBrands || "").toLowerCase() === "true";

  // get user role + assigned brands
  const currentUser = req.user;
  const isCounsellor =
    currentUser.role === "counsellor" || currentUser.role === "Counsellor";

  const counsellorBrandIds = Array.isArray(currentUser.assignedBrands)
    ? currentUser.assignedBrands.map((b) => String(b))
    : [];

  const results = {
    totalRows: 0,
    importedCount: 0,
    skippedDuplicates: 0,
    skippedDueToBrand: 0, // <-- NEW for counsellor brand filtering
    createdBrands: [],
    errors: [],
  };

  async function cleanupAndReturn(statusCode, payload) {
    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {}
    return res.status(statusCode).json(payload);
  }

  // Brand Cache + Creator
  const brandCache = new Map();
  async function getOrCreateBrandId(brandName) {
    if (!brandName) return null;
    const key = String(brandName).trim().toLowerCase();
    if (brandCache.has(key)) return brandCache.get(key);

    // find
    const found = await Brand.findOne({
      $or: [{ name: brandName }, { name_lower: key }],
    })
      .collation({ locale: "en", strength: 2 })
      .lean();

    if (found) {
      brandCache.set(key, found._id);
      return found._id;
    }

    // Counsellors are NOT allowed to create brands
    if (isCounsellor || !createMissingBrands) {
      brandCache.set(key, null);
      return null;
    }

    // admin creates brand
    const newBrand = new Brand({ name: brandName });
    await newBrand.save();
    brandCache.set(key, newBrand._id);
    results.createdBrands.push({ name: brandName, id: newBrand._id });

    return newBrand._id;
  }

  // ------------------------------
  //    CSV IMPORT
  // ------------------------------
  if (ext === "csv" || ext === "txt") {
    const stream = fs.createReadStream(tmpPath);
    const parser = csvParser({
      mapHeaders: ({ header }) => normalizeKey(header),
    });

    const BATCH_SIZE = 500;
    let batch = [];

    const flushBatch = async (rows) => {
      const bulkOps = [];

      for (const { mapped } of rows) {
        const brandId = mapped.brandVal
          ? await getOrCreateBrandId(mapped.brandVal)
          : null;

        // --- COUNSELLOR RESTRICTION ---
        if (isCounsellor) {
          if (!brandId || !counsellorBrandIds.includes(String(brandId))) {
            results.skippedDueToBrand++;
            continue;
          }
        }

        const phoneNormalized = String(mapped.phone || "").replace(/\D/g, "");
        if (!phoneNormalized) {
          results.errors.push({
            reason: "Invalid phone after normalization",
            row: mapped.raw,
          });
          continue;
        }

        bulkOps.push({
          updateOne: {
            filter: { phone_primary: phoneNormalized },
            update: {
              $setOnInsert: {
                name: mapped.name,
                phone_primary: phoneNormalized,
                email: mapped.email || undefined,
                brand: brandId || undefined,
                course_interest: mapped.course || undefined,
                source: mapped.source || undefined,
                createdBy: currentUser._id,
                assigned_to: isCounsellor ? currentUser._id : undefined, // auto-assign counsellor
                createdAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }

      if (!bulkOps.length) return;

      const writeRes = await Lead.bulkWrite(bulkOps, { ordered: false });
      const upserts =
        writeRes.upsertedCount ||
        (writeRes.upsertedIds
          ? Object.keys(writeRes.upsertedIds).length
          : 0);

      results.importedCount += upserts;
      results.skippedDuplicates += bulkOps.length - upserts;
    };

    await new Promise((resolve, reject) => {
      stream
        .pipe(parser)
        .on("data", (row) => {
          parser.pause();
          results.totalRows++;

          const mapped = mapRowToLead(row);
          if (!mapped.name || !mapped.phone) {
            results.errors.push({
              row: results.totalRows,
              reason: "Missing name or phone",
              rowData: row,
            });
            parser.resume();
            return;
          }

          batch.push({ mapped, rawRow: row });

          if (batch.length >= BATCH_SIZE) {
            flushBatch(batch)
              .then(() => {
                batch = [];
                parser.resume();
              })
              .catch(reject);
          } else parser.resume();
        })
        .on("end", async () => {
          if (batch.length) await flushBatch(batch);
          resolve();
        })
        .on("error", reject);
    });

    return cleanupAndReturn(200, { success: true, ...results });
  }

  // ------------------------------
  //    EXCEL IMPORT
  // ------------------------------
  if (ext === "xlsx" || ext === "xls") {
    const workbook = xlsx.readFile(tmpPath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet)
      return cleanupAndReturn(400, {
        success: false,
        error: "No sheets found",
      });

    const rawRows = xlsx.utils.sheet_to_json(sheet, {
      defval: "",
      raw: false,
    });
    results.totalRows = rawRows.length;

    const BATCH = 1000;

    for (let i = 0; i < rawRows.length; i += BATCH) {
      const chunk = rawRows.slice(i, i + BATCH);
      const bulkOps = [];

      for (const row of chunk) {
        const normalizedRow = {};
        for (const k of Object.keys(row))
          normalizedRow[normalizeKey(k)] = row[k];

        const mapped = mapRowToLead(normalizedRow);

        if (!mapped.name || !mapped.phone) {
          results.errors.push({
            row: i + 1,
            reason: "Missing name or phone",
            rowData: row,
          });
          continue;
        }

        const brandId = mapped.brandVal
          ? await getOrCreateBrandId(mapped.brandVal)
          : null;

        // --- COUNSELLOR brand check ---
        if (isCounsellor) {
          if (!brandId || !counsellorBrandIds.includes(String(brandId))) {
            results.skippedDueToBrand++;
            continue;
          }
        }

        const phoneNormalized = String(mapped.phone || "").replace(/\D/g, "");
        if (!phoneNormalized) {
          results.errors.push({
            row: i + 1,
            reason: "Invalid phone",
            rowData: mapped.raw,
          });
          continue;
        }

        bulkOps.push({
          updateOne: {
            filter: { phone_primary: phoneNormalized },
            update: {
              $setOnInsert: {
                name: mapped.name,
                phone_primary: phoneNormalized,
                email: mapped.email || undefined,
                brand: brandId || undefined,
                course_interest: mapped.course || undefined,
                source: mapped.source || undefined,
                createdBy: currentUser._id,
                assigned_to: isCounsellor ? currentUser._id : undefined,
                createdAt: new Date(),
              },
            },
            upsert: true,
          },
        });
      }

      if (bulkOps.length) {
        const writeRes = await Lead.bulkWrite(bulkOps, { ordered: false });
        const upserts =
          writeRes.upsertedCount ||
          (writeRes.upsertedIds
            ? Object.keys(writeRes.upsertedIds).length
            : 0);

        results.importedCount += upserts;
        results.skippedDuplicates += bulkOps.length - upserts;
      }
    }

    return cleanupAndReturn(200, { success: true, ...results });
  }

  return cleanupAndReturn(400, {
    success: false,
    error: "Unsupported file type. Upload CSV or Excel",
  });
}

export async function assignBulkLeads(req, res) {
  try {
    const { leadIds, userId } = req.body;

    if (!Array.isArray(leadIds) || leadIds.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "leadIds required" });

    if (!userId)
      return res
        .status(400)
        .json({ success: false, message: "userId required" });

    if (!mongoose.isValidObjectId(userId))
      return res
        .status(400)
        .json({ success: false, message: "invalid userId" });

    const user = await User.findById(userId).lean();
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const assignedBrands = Array.isArray(user.assignedBrands)
      ? user.assignedBrands.map((b) => String(b))
      : [];

    if (!assignedBrands.length)
      return res.status(400).json({
        success: false,
        message: "User has no assigned brands.",
      });

    const validIds = leadIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const matched = await Lead.find({
      _id: { $in: validIds },
      brand: { $in: assignedBrands },
    })
      .select("_id")
      .lean();

    const matchedIds = matched.map((l) => l._id);

    const updateRes = await Lead.updateMany(
      { _id: { $in: matchedIds } },
      { assigned_to: userId }
    );

    return res.json({
      success: true,
      matchedCount: matchedIds.length,
      updated: updateRes.modifiedCount || 0,
      affectedIds: matchedIds,
    });
  } catch (err) {
    console.error("assignBulkLeads error", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
