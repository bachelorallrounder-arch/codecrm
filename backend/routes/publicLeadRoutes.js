import express from "express";
import { createWebsiteLead } from "../controllers/publicLeadController.js";
import { verifyWebsiteApiKey } from "../middleware/verifyWebsiteApiKey.js";

const router = express.Router();

router.post("/website", verifyWebsiteApiKey, createWebsiteLead);

export default router;