const express = require("express");
const multer = require("multer");
const {
  uploadFile,
  getAllFiles,
  uploadFileByTeacher,
  viewHandwritingSample,
  viewAssignment,
  evaluateAssignment,
  getStudentAssignments,
  getTeachers,
  deleteAssignment,
  submitStudentNote,
} = require("../controllers/fileController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const router = express.Router();

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    ALLOWED_MIME_TYPES.includes(file.mimetype) ? cb(null, true)
      : cb(new Error("Invalid file type. Only JPEG, PNG, and PDF files are allowed."));
  },
});

// Teacher listing — any authenticated user can see the list
router.get("/teachers", authMiddleware, getTeachers);

// Student uploads
router.post("/upload", authMiddleware, requireRole("student"), upload.single("file"),
  (req, res, next) => { if (!req.file) return res.status(400).json({ error: "No file uploaded!" }); next(); }, uploadFile);

// Teacher uploads (handwriting samples)
router.post("/upload/teacher", authMiddleware, requireRole("teacher"), upload.single("file"), uploadFileByTeacher);

// File listing
router.get("/all-files", authMiddleware, requireRole("teacher", "admin"), getAllFiles);

// File viewing
router.get("/view-assignment/:studentId", authMiddleware, viewAssignment);
router.get("/view-sample/:studentId", authMiddleware, viewHandwritingSample);

// Evaluation
router.put("/evaluate/:fileId", authMiddleware, requireRole("teacher"), evaluateAssignment);

// Student assignment history
router.get("/student-assignments/:studentId", authMiddleware, getStudentAssignments);

// Student deletes their own assignment (e.g., after mismatch, to re-upload)
router.delete("/assignment/:fileId", authMiddleware, requireRole("student"), deleteAssignment);

// Student submits explanation note for a mismatched assignment
router.patch("/assignment/:fileId/note", authMiddleware, requireRole("student"), submitStudentNote);

module.exports = router;
