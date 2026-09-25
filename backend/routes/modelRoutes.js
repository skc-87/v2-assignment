const express = require("express");
const { modelController } = require("../controllers/modelController");
const faceController = require("../controllers/faceController");
const attendanceController = require("../controllers/attendanceController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const router = express.Router();

// All model routes require authentication
router.use(authMiddleware);

// Model operations (teacher only)
router.post("/fetch-file-path", requireRole("teacher"), modelController.fetchFilePath);
// Students can compare their own handwriting; teachers can compare any student
router.get("/compare-handwriting/:studentId", requireRole("teacher", "student"), modelController.compareHandwriting);

// Face recognition
router.get("/students", requireRole("teacher", "admin"), faceController.getStudents);
router.post("/register-face", requireRole("teacher", "admin"), faceController.registerFace);
router.post("/take-attendance", requireRole("teacher"), faceController.takeAttendance);

// Attendance management
router.put("/update-attendance-status", requireRole("teacher", "admin"), attendanceController.updateAttendanceStatus);
router.get("/get-attendance", requireRole("teacher", "admin"), attendanceController.getAttendance);
router.get("/get-all-attendance", requireRole("teacher", "admin"), attendanceController.getAllAttendance);
router.get("/attendance-statistics", requireRole("teacher", "admin"), attendanceController.getAttendanceStatistics);

module.exports = router;