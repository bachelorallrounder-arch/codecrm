import express from "express";
import multer from "multer";
import { createUser, updateUser, getAuditLogs, reassignLeads, reportsSummary, getUsers } from "../controllers/adminController.js";
import { authenticate } from "../middleware/auth.js";
import { permit } from "../middleware/roles.js";
import { getCoursePerformance } from "../controllers/courseController.js";
const router = express.Router();

router.post("/users", authenticate, permit("admin"), createUser);
router.put("/users/:id", authenticate, permit("admin"), updateUser);
router.get("/audit-logs", authenticate, permit("admin"), getAuditLogs);
router.post("/reassign", authenticate, permit("admin"), reassignLeads);
router.get("/reports/summary", authenticate, permit("admin"), reportsSummary);
router.get("/users", authenticate,permit("admin"),getUsers);
router.get("/course-performance",getCoursePerformance);

export default router;
