import express from "express";
import { createLead, listLeads, getLead, updateLead, deleteLead } from "../controllers/leadController.js";
import { authenticate } from "../middleware/auth.js";
import { permit } from "../middleware/roles.js";
const router = express.Router();

router.post("/", authenticate, createLead);
router.get("/", authenticate, listLeads);
router.get("/:id", authenticate, getLead);
router.put("/:id", authenticate, updateLead);
router.delete("/:id", authenticate,permit("admin"), deleteLead);

export default router;
