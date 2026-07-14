import express from "express";
import { addAttempt, listAttempts } from "../controllers/attemptController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router({ mergeParams: true });

router.post("/:id/attempts", authenticate, addAttempt); // POST /leads/:id/attempts
router.get("/:id/attempts", authenticate, listAttempts);

export default router;
