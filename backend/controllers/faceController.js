const mongoose = require("mongoose");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const cloudinary = require("cloudinary").v2;

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
}

const uploadToCloudinary = async (fileBuffer, options = {}) => {
  if (!isCloudinaryConfigured) return null;
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || "edutrack/attendance_proofs",
        resource_type: "image",
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

const cleanupOldAttendanceProofs = async () => {
  if (!isCloudinaryConfigured) return;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oldRecords = await Attendance.find({
      proofCloudinaryId: { $ne: null },
      createdAt: { $lt: sevenDaysAgo }
    }).select("proofCloudinaryId");

    const uniqueIds = [...new Set(oldRecords.map(r => r.proofCloudinaryId).filter(Boolean))];
    for (const cid of uniqueIds) {
      try {
        console.log(`[Cloudinary] Auto-deleting 7-day-old attendance proof: ${cid}`);
        await cloudinary.uploader.destroy(cid, { resource_type: "image" });
      } catch (e) {
        console.warn(`[Cloudinary Auto-Delete Error] ${cid}:`, e.message);
      }
    }
    if (uniqueIds.length > 0) {
      await Attendance.updateMany(
        { proofCloudinaryId: { $in: uniqueIds } },
        { $set: { proofImageUrl: null, proofCloudinaryId: null } }
      );
    }
  } catch (err) {
    console.error("[Auto-Delete Proofs Error]", err.message);
  }
};

if (isCloudinaryConfigured) {
  setInterval(cleanupOldAttendanceProofs, 24 * 60 * 60 * 1000);
}
const VALID_IMAGE_REGEX = /^data:image\/(jpeg|jpg|png);base64,/;
const VALID_ID_REGEX = /^[a-zA-Z0-9]+$/;
const VALID_NAME_REGEX = /^[a-zA-Z\s.'-]{1,100}$/;
const ALLOWED_EXTS = ["jpeg", "jpg", "png"];
const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL;

const fetchWithTimeout = async (url, options = {}, timeoutMs = 60000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const callFaceService = async (endpoint, payload, authToken, timeoutMs = 60000) => {
  if (!FACE_SERVICE_URL) {
    return { success: false, message: "Face service is not configured." };
  }
  try {
    const response = await fetchWithTimeout(`${FACE_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken || ""}`,
      },
      body: JSON.stringify(payload || {}),
    }, timeoutMs);

    // Read raw text first so we can log it if JSON parsing fails
    const text = await response.text();
    console.log(`[Face Service] ${endpoint} → HTTP ${response.status} | Body: ${text.slice(0, 300)}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, message: "Invalid response from face service." };
    }

    // Normalize FastAPI's { detail: "..." } to { success, message }
    if (data.detail !== undefined && data.success === undefined) {
      data.success = false;
      data.message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      return { success: false, message: "Face service timed out." };
    }
    return { success: false, message: "Failed to reach face service." };
  }
};

const faceController = {
  getStudents: async (req, res) => {
    try {
      const students = await User.find({ role: "student", status: "approved" })
        .select("_id name email")
        .sort({ name: 1 });
      return res.status(200).json({ success: true, students });
    } catch (err) {
      console.error("[GET STUDENTS ERROR]", err.message);
      return res.status(500).json({ success: false, message: "Failed to fetch students" });
    }
  },

  registerFace: async (req, res) => {
    try {
      const { name, image } = req.body;
      let { student_id } = req.body;
      const token = req.headers.authorization?.split(" ")[1] || "";
      if (student_id) student_id = String(student_id).trim();
      const trimmedName = name ? String(name).trim() : "";
      if ((!student_id && !trimmedName) || !image || !token) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      if (!VALID_IMAGE_REGEX.test(image)) {
        return res.status(400).json({ success: false, message: "Invalid image format" });
      }
      const ext = image.split(";")[0].split("/")[1];
      if (!ALLOWED_EXTS.includes(ext)) {
        return res.status(400).json({ success: false, message: "Invalid image type" });
      }

      let studentUser = null;
      if (student_id && mongoose.Types.ObjectId.isValid(student_id)) {
        studentUser = await User.findOne({ _id: student_id, role: "student", status: "approved" });
      }
      if (!studentUser) {
        const lookupKey = student_id || trimmedName;
        studentUser = await User.findOne({
          role: "student",
          status: "approved",
          $or: [
            { email: lookupKey.toLowerCase() },
            { name: new RegExp(`^${lookupKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
            ...(trimmedName ? [{ name: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }] : [])
          ]
        });
      }

      if (!studentUser) {
        return res.status(404).json({ success: false, message: "Approved student not found. Please verify the student name or ID." });
      }

      const finalStudentId = studentUser._id.toString();
      const finalName = studentUser.name;

      const result = await callFaceService("/register-face", { student_id: finalStudentId, name: finalName, image }, token, 90000);
      return res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("[REGISTER ERROR]", err.message);
      return res.status(500).json({ success: false, message: "Face registration failed" });
    }
  },

  takeAttendance: async (req, res) => {
    try {
      const { subject, image, date } = req.body;
      const token = req.headers.authorization?.split(" ")[1] || "";
      if (!subject || !image || !date || !token) {
        return res.status(400).json({ success: false, message: "Missing fields" });
      }
      if (typeof subject !== "string" || subject.length > 100 || !/^[a-zA-Z0-9\s._-]+$/.test(subject)) {
        return res.status(400).json({ success: false, message: "Invalid subject format" });
      }
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
      }
      if (!VALID_IMAGE_REGEX.test(image)) {
        return res.status(400).json({ success: false, message: "Invalid image" });
      }
      const ext = image.split(";")[0].split("/")[1];
      if (!ALLOWED_EXTS.includes(ext)) {
        return res.status(400).json({ success: false, message: "Invalid image type" });
      }
      const result = await callFaceService("/take-attendance", { subject, image, date }, token, 60000);

      if (result.success && result.processed_image && String(result.processed_image).startsWith("data:image")) {
        try {
          if (isCloudinaryConfigured) {
            const existingWithProof = await Attendance.findOne({ subject, date, proofCloudinaryId: { $ne: null } }).select("proofCloudinaryId");
            if (existingWithProof?.proofCloudinaryId) {
              try {
                await cloudinary.uploader.destroy(existingWithProof.proofCloudinaryId, { resource_type: "image" });
              } catch (delErr) {
                console.warn("[Cloudinary] Could not delete previous proof image:", delErr.message);
              }
            }
          }
          const base64Data = result.processed_image.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const cloudData = await uploadToCloudinary(buffer, {
            folder: "edutrack/attendance_proofs",
            publicId: `proof_${subject.replace(/[^a-zA-Z0-9]/g, "_")}_${date}_${Date.now()}`
          });
          if (cloudData?.fileUrl) {
            await Attendance.updateMany(
              { subject, date },
              { $set: { proofImageUrl: cloudData.fileUrl, proofCloudinaryId: cloudData.cloudinaryId } }
            );
            result.proof_image_url = cloudData.fileUrl;
            console.log(`[Cloudinary] Uploaded attendance proof to edutrack/attendance_proofs: ${cloudData.fileUrl}`);
          }
        } catch (uploadErr) {
          console.warn("[Cloudinary] Failed to upload attendance proof photo:", uploadErr.message);
        }
      }

      // Run background auto-cleanup of proofs older than 7 days
      cleanupOldAttendanceProofs().catch(() => {});

      return res.status(result.success ? 200 : 400).json(result);
    } catch (err) {
      console.error("[ATTENDANCE ERROR]", err.message);
      return res.status(500).json({ success: false, message: "Attendance processing failed" });
    }
  },
};

module.exports = faceController;