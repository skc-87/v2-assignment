const mongoose = require("mongoose");
const File = require("../models/File");
const User = require("../models/User");
const cloudinary = require("cloudinary").v2;

// ── Cloudinary configuration ──────────────────────────────────────────────────
const isCloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("[Cloudinary] Configured — files will be uploaded to cloud storage.");
} else {
  console.log("[Cloudinary] Not configured — files will be stored in MongoDB buffer (fallback).");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const VALID_FILE_CATEGORIES = ["handwriting_sample", "assignment"];
const sanitizeFilename = (name) => (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");

/**
 * Upload a file buffer to Cloudinary.
 * Returns { fileUrl, cloudinaryId } on success or null if Cloudinary is not configured.
 */
const uploadToCloudinary = async (fileBuffer, options = {}) => {
  if (!isCloudinaryConfigured) return null;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || "edutrack",
        resource_type: "auto", // handles images AND PDFs
        public_id: options.publicId || undefined,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          fileUrl: result.secure_url,
          cloudinaryId: result.public_id,
        });
      }
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Delete a file from Cloudinary by its public ID.
 * Tries "image" first (all handwriting samples & assignments are PNG/JPG),
 * then falls back to "raw" (for PDFs/documents) if not found.
 */
const deleteFromCloudinary = async (cloudinaryId) => {
  if (!isCloudinaryConfigured || !cloudinaryId) return false;
  try {
    // 1. Try deleting as "image" (handles PNG, JPG, JPEG)
    const imgRes = await cloudinary.uploader.destroy(cloudinaryId, { resource_type: "image" });
    if (imgRes && imgRes.result === "ok") {
      console.log(`[Cloudinary] Successfully deleted image: ${cloudinaryId}`);
      return true;
    }

    // 2. If not found as image, try as "raw" (handles PDFs and arbitrary binaries)
    const rawRes = await cloudinary.uploader.destroy(cloudinaryId, { resource_type: "raw" });
    if (rawRes && rawRes.result === "ok") {
      console.log(`[Cloudinary] Successfully deleted raw resource: ${cloudinaryId}`);
      return true;
    }

    // 3. Fallback attempt with "auto"
    const autoRes = await cloudinary.uploader.destroy(cloudinaryId, { resource_type: "auto" });
    if (autoRes && autoRes.result === "ok") {
      console.log(`[Cloudinary] Successfully deleted auto resource: ${cloudinaryId}`);
      return true;
    }

    console.warn(`[Cloudinary] Resource ${cloudinaryId} could not be found to delete:`, imgRes?.result || rawRes?.result);
    return false;
  } catch (err) {
    console.error(`[Cloudinary] Error deleting ${cloudinaryId}:`, err.message);
    return false;
  }
};

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/files/teachers — List all approved teachers for the student dropdown.
 */
exports.getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: "teacher", status: "approved" })
      .select("_id name email")
      .sort({ name: 1 });
    res.status(200).json(teachers);
  } catch (error) {
    console.error("Get teachers error:", error.message);
    res.status(500).json({ message: "Failed to fetch teachers" });
  }
};

/**
 * POST /api/files/upload — Student uploads an assignment or handwriting sample.
 */
exports.uploadFile = async (req, res) => {
  const { fileCategory, teacherId, teacherName } = req.body;
  const studentId = req.user?.id;

  if (!fileCategory || !VALID_FILE_CATEGORIES.includes(fileCategory)) {
    return res.status(400).json({ message: "Invalid file category. Must be 'handwriting_sample' or 'assignment'." });
  }
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  // Assignments must have a teacher assigned
  if (fileCategory === "assignment" && !teacherId) {
    return res.status(400).json({ message: "Please select a teacher for this assignment." });
  }

  try {
    const user = await User.findById(studentId).select("name");
    const studentName = user ? user.name : "Unknown";

    // Validate teacher if provided
    let resolvedTeacherName = teacherName || null;
    if (teacherId) {
      const teacher = await User.findOne({ _id: teacherId, role: "teacher", status: "approved" }).select("name");
      if (!teacher) return res.status(400).json({ message: "Selected teacher not found or not approved." });
      resolvedTeacherName = teacher.name;
    }

    // Try uploading to Cloudinary; fallback to buffer
    let cloudData = null;
    try {
      cloudData = await uploadToCloudinary(req.file.buffer, {
        folder: `edutrack/${fileCategory}`,
        publicId: `${studentId}_${fileCategory}_${Date.now()}`,
      });
    } catch (cloudErr) {
      console.warn("[Cloudinary] Upload failed, falling back to buffer:", cloudErr.message);
    }

    const newFile = new File({
      studentId,
      studentName,
      fileCategory,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      fileUrl: cloudData?.fileUrl || null,
      cloudinaryId: cloudData?.cloudinaryId || null,
      fileData: cloudData ? null : req.file.buffer,
      teacherId: teacherId || null,
      teacherName: resolvedTeacherName,
      uploadDate: new Date(),
      verificationStatus: "pending",
    });

    await newFile.save();
    const { fileData, ...fileMeta } = newFile.toObject();
    res.status(201).json({ message: "File uploaded successfully!", file: fileMeta });
  } catch (error) {
    console.error("Upload error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * POST /api/files/upload/teacher — Teacher uploads a handwriting sample for a student.
 */
exports.uploadFileByTeacher = async (req, res) => {
  const { fileCategory, studentName, studentId } = req.body;
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!fileCategory || !VALID_FILE_CATEGORIES.includes(fileCategory)) {
    return res.status(400).json({ message: "Invalid file category. Must be 'handwriting_sample' or 'assignment'." });
  }
  if (!studentId && !studentName) {
    return res.status(400).json({ message: "Either studentId or studentName must be provided." });
  }

  try {
    let student;
    if (studentId && studentName) {
      student = await User.findOne({ _id: studentId, name: studentName, role: "student" });
    } else if (studentId) {
      student = await User.findOne({ _id: studentId, role: "student" });
    } else {
      const matches = await User.find({ name: studentName, role: "student" }).select("_id name").limit(2);
      if (matches.length > 1) {
        return res.status(400).json({ message: "Multiple students with this name. Please provide studentId to disambiguate." });
      }
      student = matches[0] || null;
    }
    if (!student) return res.status(404).json({ message: "Student not found or not a student." });

    // Try uploading to Cloudinary
    let cloudData = null;
    try {
      cloudData = await uploadToCloudinary(req.file.buffer, {
        folder: `edutrack/${fileCategory}`,
        publicId: `${student._id}_${fileCategory}_${Date.now()}`,
      });
    } catch (cloudErr) {
      console.warn("[Cloudinary] Upload failed, falling back to buffer:", cloudErr.message);
    }

    if (fileCategory === "handwriting_sample") {
      const studentIdStr = String(student._id);
      const existingSamples = await File.find({
        $or: [{ studentId: studentIdStr }, { studentId: student._id }],
        fileCategory: "handwriting_sample",
      });

      if (existingSamples.length > 0) {
        // Clean up all old Cloudinary files for this student's samples
        for (const oldSample of existingSamples) {
          if (oldSample.cloudinaryId) {
            console.log(`[Cloudinary] Deleting previous handwriting sample image: ${oldSample.cloudinaryId}`);
            await deleteFromCloudinary(oldSample.cloudinaryId);
          }
        }

        // Keep the first document to update, clean up any duplicate records
        const [primarySample, ...duplicates] = existingSamples;
        if (duplicates.length > 0) {
          await File.deleteMany({ _id: { $in: duplicates.map((d) => d._id) } });
        }

        primarySample.fileUrl = cloudData?.fileUrl || null;
        primarySample.cloudinaryId = cloudData?.cloudinaryId || null;
        primarySample.fileData = cloudData ? null : req.file.buffer;
        primarySample.fileName = req.file.originalname;
        primarySample.contentType = req.file.mimetype;
        primarySample.studentName = student.name;
        primarySample.uploadDate = new Date();
        await primarySample.save();

        const { fileData: _fd, ...sampleMeta } = primarySample.toObject();
        return res.status(200).json({ message: "Handwriting sample updated by teacher.", file: sampleMeta });
      }
    }

    const newFile = new File({
      studentId: student._id,
      studentName: student.name,
      fileCategory,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      fileUrl: cloudData?.fileUrl || null,
      cloudinaryId: cloudData?.cloudinaryId || null,
      fileData: cloudData ? null : req.file.buffer,
      uploadDate: new Date(),
    });
    await newFile.save();
    const { fileData: _fd2, ...teacherFileMeta } = newFile.toObject();
    res.status(201).json({ message: "File uploaded by teacher successfully!", file: teacherFileMeta });
  } catch (error) {
    console.error("Teacher upload error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * GET /api/files/all-files — Teacher gets files (assignments filtered to their own).
 */
exports.getAllFiles = async (req, res) => {
  try {
    const files = await File.find().select("-fileData");
    const handwritingSamples = files.filter(f => f.fileCategory === "handwriting_sample");

    // Teachers only see assignments submitted to them; admins see all
    let assignments;
    if (req.user.role === "admin") {
      assignments = files.filter(f => f.fileCategory === "assignment");
    } else {
      // Teachers see assignments assigned directly to them, plus legacy submissions without a teacherId
      assignments = files.filter(
        f => f.fileCategory === "assignment" && (!f.teacherId || f.teacherId === req.user.id)
      );
    }

    res.status(200).json({ handwritingSamples, assignments });
  } catch (error) {
    console.error("Fetch files error:", error.message);
    res.status(500).json({ message: "Failed to fetch files" });
  }
};

/**
 * GET /api/files/view-assignment/:studentId — View/download an assignment file.
 */
exports.viewAssignment = async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role !== "teacher" && req.user.role !== "admin" && (req.user.role !== "student" || req.user.id !== studentId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  try {
    const assignment = await File.findOne({ studentId, fileCategory: "assignment" }).sort({ uploadDate: -1 });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // If stored on Cloudinary, redirect to the URL
    if (assignment.fileUrl) {
      return res.redirect(assignment.fileUrl);
    }

    // Otherwise serve from buffer
    res.set({
      "Content-Type": assignment.contentType,
      "Content-Disposition": `inline; filename="${sanitizeFilename(assignment.fileName)}"`,
    });
    res.send(assignment.fileData);
  } catch (error) {
    res.status(500).json({ error: "Server error while downloading" });
  }
};

/**
 * GET /api/files/view-sample/:studentId — View a handwriting sample.
 */
exports.viewHandwritingSample = async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role !== "teacher" && req.user.role !== "admin" && (req.user.role !== "student" || req.user.id !== studentId)) {
    return res.status(403).json({ error: "Access denied" });
  }
  try {
    const sample = await File.findOne({ studentId, fileCategory: "handwriting_sample" }).sort({ uploadDate: -1 });
    if (!sample) return res.status(404).json({ error: "Handwriting sample not found" });

    if (sample.fileUrl) {
      return res.redirect(sample.fileUrl);
    }

    res.set({
      "Content-Type": sample.contentType,
      "Content-Disposition": `inline; filename="${sanitizeFilename(sample.fileName)}"`,
    });
    res.send(sample.fileData);
  } catch (error) {
    res.status(500).json({ error: "Server error while viewing sample" });
  }
};

/**
 * PUT /api/files/evaluate/:fileId — Teacher grades an assignment.
 */
exports.evaluateAssignment = async (req, res) => {
  const { fileId } = req.params;
  const { marks } = req.body;
  if (!isValidObjectId(fileId)) return res.status(400).json({ message: "Invalid file ID" });
  if (marks === undefined || marks === null) return res.status(400).json({ message: "Marks are required" });
  const marksNum = Number(marks);
  if (isNaN(marksNum) || marksNum < 0 || marksNum > 100) {
    return res.status(400).json({ message: "Marks must be a number between 0 and 100" });
  }
  try {
    const updatedFile = await File.findByIdAndUpdate(fileId, { $set: { marks: String(marksNum) } }, { new: true }).select("-fileData");
    if (!updatedFile) return res.status(404).json({ message: "Assignment not found" });
    res.status(200).json({ message: "Marks added successfully", file: updatedFile });
  } catch (error) {
    console.error("Evaluate error:", error.message);
    res.status(500).json({ message: "Failed to evaluate assignment" });
  }
};

/**
 * GET /api/files/student-assignments/:studentId — Student views their own submission history.
 */
exports.getStudentAssignments = async (req, res) => {
  const { studentId } = req.params;
  if (req.user.role !== "teacher" && req.user.role !== "admin" && (req.user.role !== "student" || req.user.id !== studentId)) {
    return res.status(403).json({ message: "Access denied" });
  }
  try {
    const files = await File.find({ studentId, fileCategory: 'assignment' }).select("-fileData").sort({ uploadDate: -1 });
    res.json(files);
  } catch (error) {
    console.error("Student assignments error:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

/**
 * DELETE /api/files/assignment/:fileId — Student deletes their own mismatched/pending assignment.
 */
exports.deleteAssignment = async (req, res) => {
  const { fileId } = req.params;
  if (!isValidObjectId(fileId)) return res.status(400).json({ message: "Invalid file ID" });

  try {
    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ message: "Assignment not found" });
    if (file.studentId !== req.user.id) return res.status(403).json({ message: "You can only delete your own assignments." });
    if (file.fileCategory !== "assignment") return res.status(400).json({ message: "Can only delete assignments." });

    // Clean up Cloudinary if applicable
    if (file.cloudinaryId) {
      await deleteFromCloudinary(file.cloudinaryId);
    }

    await File.findByIdAndDelete(fileId);
    res.status(200).json({ message: "Assignment deleted successfully." });
  } catch (error) {
    console.error("Delete assignment error:", error.message);
    res.status(500).json({ message: "Failed to delete assignment" });
  }
};

/**
 * PATCH /api/files/assignment/:fileId/note — Student submits explanation note for a mismatched assignment.
 */
exports.submitStudentNote = async (req, res) => {
  const { fileId } = req.params;
  const { note } = req.body;

  if (!isValidObjectId(fileId)) return res.status(400).json({ message: "Invalid file ID" });
  if (!note || typeof note !== "string" || note.trim().length === 0) {
    return res.status(400).json({ message: "A note explaining the mismatch is required." });
  }
  if (note.trim().length > 1000) {
    return res.status(400).json({ message: "Note must be 1000 characters or less." });
  }

  try {
    const file = await File.findById(fileId);
    if (!file) return res.status(404).json({ message: "Assignment not found" });
    if (file.studentId !== req.user.id) return res.status(403).json({ message: "You can only add notes to your own assignments." });
    if (file.verificationStatus !== "mismatch") {
      return res.status(400).json({ message: "Notes can only be added to assignments with a mismatch status." });
    }

    file.studentNote = note.trim();
    file.verificationStatus = "mismatch_with_note";
    await file.save();

    const { fileData, ...fileMeta } = file.toObject();
    res.status(200).json({ message: "Note submitted successfully. Your assignment has been flagged for teacher review.", file: fileMeta });
  } catch (error) {
    console.error("Submit note error:", error.message);
    res.status(500).json({ message: "Failed to submit note" });
  }
};