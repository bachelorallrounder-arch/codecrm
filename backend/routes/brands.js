// routes/brands.js
import express from "express";
import { createBrand, listBrands, getBrand, updateBrand, deleteBrand } from "../controllers/brandController.js";
import { authenticate } from "../middleware/auth.js";
import { permit } from "../middleware/roles.js";

const router = express.Router();

// Admin-only brand management
router.post("/", authenticate, permit("admin"), createBrand);
router.get("/", authenticate, permit("admin","counsellor"), listBrands);
router.get("/:id", authenticate, permit("admin","counsellor"), getBrand);
router.put("/:id", authenticate, permit("admin"), updateBrand);
router.delete("/:id", authenticate, permit("admin"), deleteBrand);

export default router;
