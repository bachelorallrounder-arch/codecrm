// backend/routes/demos.js
import express from "express";
import { bookDemo, updateDemo, listDemosForLead } from "../controllers/demoController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();

router.post("/:id/demos", authenticate, bookDemo);
router.get("/:id/demos", authenticate, listDemosForLead);
router.put("/demos/:id", authenticate, updateDemo);

export default router;
