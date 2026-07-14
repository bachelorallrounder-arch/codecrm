import express from "express";
import { addPayment, convertedLead, convertLead,getPayments, markFullyPaid, scheduleReminder} from "../controllers/conversionController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router();

router.post("/:id/convert", authenticate, convertLead);
router.get("/:id/converted", authenticate, convertedLead);
router.post("/:id/payments", authenticate, addPayment);
router.get("/:id/payments",authenticate,getPayments);
router.post("/:id/schedule-reminder", authenticate, scheduleReminder);
router.post("/:id/mark-paid", authenticate, markFullyPaid);

export default router;
