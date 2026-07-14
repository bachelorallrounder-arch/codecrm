//routes/import.js

import express from "express";
import multer from "multer";
import { assignBulkLeads, importLeads } from "../controllers/importController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();

const upload = multer({ dest: "/tmp/uploads", limits: { fileSize: 50 * 1024 * 1024 } }); 
router.post("/leads", authenticate, upload.single("file"), importLeads);
router.post
router.post("/leads/assign-bulk", authenticate, assignBulkLeads);

export default router;
