// src/routes/course.js (Express)
import express from "express";
import { createCourse, listCourses, getCourse, updateCourse, deleteCourse } from "../controllers/courseController.js";
import {permit} from "../middleware/roles.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", listCourses);
router.get("/:id", getCourse);
router.post("/", authenticate, permit("admin"), createCourse);
router.put("/:id",authenticate,  permit("admin"), updateCourse);
router.delete("/:id", authenticate, permit("admin"), deleteCourse);

export default router;
