// routes/remarks.js (fix)
import express from "express";
import { addRemark, listRemarks } from "../controllers/remarkController.js";
import { authenticate } from "../middleware/auth.js";
const router = express.Router({ mergeParams: true });

router.post("/:id/remarks", authenticate, addRemark);
router.get("/:id/remarks", authenticate, listRemarks);

export default router;
