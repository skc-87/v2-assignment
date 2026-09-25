const FileModel = require('../models/File');

const isValidStudentId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9]{1,24}$/.test(id);
};

const HANDWRITING_SERVICE_URL = process.env.HANDWRITING_SERVICE_URL;

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

const callHandwritingService = async (endpoint, payload, authToken, timeoutMs = 60000) => {
  if (!HANDWRITING_SERVICE_URL) {
    return { status: "error", message: "Handwriting service is not configured." };
  }
  try {
    const response = await fetchWithTimeout(`${HANDWRITING_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken || ""}`,
      },
      body: JSON.stringify(payload || {}),
    }, timeoutMs);

    // Read raw text first so we can log it if JSON parsing fails
    const text = await response.text();
    console.log(`[Model Service] ${endpoint} → HTTP ${response.status} | Body: ${text.slice(0, 300)}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { status: "error", message: "Invalid response from handwriting service." };
    }

    // Normalize FastAPI's { detail: "..." } format to { status, message }
    if (data.detail !== undefined && !data.status) {
      data.status = "error";
      data.message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      return { status: "error", message: "Handwriting service timed out." };
    }
    return { status: "error", message: "Failed to reach handwriting service." };
  }
};

const getFriendlyErrorMessage = (errorCode) => {
  const errorMessages = {
    "handwriting_sample_not_found": "Handwriting sample not found. Please upload it first.",
    "assignment_not_found": "Assignment not found. Please upload the assignment file.",
    "failed_to_save_sample": "Failed to process the handwriting sample.",
    "failed_to_save_assignment": "Failed to process the assignment file.",
    "mongodb_not_set": "Server configuration error.",
    "database_connection_failed": "Could not connect to the database.",
    "record_not_found": "Attendance record not found.",
    "invalid_status": "Invalid status value. Must be 'Present' or 'Absent'.",
    "update_failed": "Failed to update attendance record.",
  };
  return errorMessages[errorCode] || (errorCode || "").replace(/_/g, " ") || "An unknown error occurred.";
};

/**
 * Update the assignment's verification status and similarity score in MongoDB.
 * This replaces the old deleteAssignmentFromDB approach — we PRESERVE the file.
 */
async function updateAssignmentVerification(studentId, status, similarityScore = null) {
  try {
    const assignment = await FileModel.findOne(
      { studentId, fileCategory: "assignment" },
      null,
      { sort: { uploadDate: -1 } }
    );
    if (assignment) {
      assignment.verificationStatus = status;
      if (similarityScore !== null) assignment.similarityScore = similarityScore;
      await assignment.save();
      console.log(`[Verification] Updated assignment for student ${studentId}: status=${status}, score=${similarityScore}`);
      return assignment;
    } else {
      console.log(`[Verification] No assignment found to update for student ${studentId}`);
      return null;
    }
  } catch (err) {
    console.error(`[Verification] Failed to update assignment for student ${studentId}:`, err.message);
    return null;
  }
}

const modelController = {
  fetchFilePath: async (req, res) => {
    const { student_id, fileCategory } = req.body;
    const authToken = req.headers.authorization?.split(" ")[1];
    if (!authToken || !student_id || !fileCategory) {
      return res.status(400).json({ status: "error", message: "Missing required fields" });
    }
    if (!isValidStudentId(student_id)) {
      return res.status(400).json({ status: "error", message: "Invalid student ID format" });
    }
    const allowedCategories = ["handwriting_sample", "assignment", "all"];
    if (!allowedCategories.includes(fileCategory)) {
      return res.status(400).json({ status: "error", message: "Invalid file category" });
    }
    try {
      const result = await callHandwritingService("/fetch-files", { student_id, fileCategory }, authToken, 60000);
      if (result.status !== "success") {
        return res.status(400).json({ status: "error", message: result.message || "File fetch failed" });
      }
      res.json({ status: "success", message: "Files fetched successfully", files: result.files });
    } catch (error) {
      res.status(400).json({ status: "error", message: getFriendlyErrorMessage(error.message) });
    }
  },

  compareHandwriting: async (req, res) => {
    const { studentId } = req.params;
    const authToken = req.headers.authorization?.split(" ")[1];

    if (!authToken || !studentId) {
      return res.status(400).json({ status: "error", message: "Missing student ID or token" });
    }
    if (!isValidStudentId(studentId)) {
      return res.status(400).json({ status: "error", message: "Invalid student ID format" });
    }
    if (req.user.role === "student" && req.user.id !== studentId) {
      return res.status(403).json({ status: "error", message: "You can only compare your own handwriting." });
    }

    try {
      // Find the assignment so we can return its fileId to the frontend
      const assignment = await FileModel.findOne(
        { studentId, fileCategory: "assignment" },
        "_id",
        { sort: { uploadDate: -1 } }
      );

      console.log(`[Step 1/2] Fetching files for student: ${studentId}`);
      const fetchResult = await callHandwritingService("/fetch-files", { student_id: studentId, fileCategory: "all" }, authToken, 60000);

      if (fetchResult.status !== "success") {
        const msg = (fetchResult.message || "").toLowerCase();
        const isMissingSample =
          msg.includes("handwriting_sample_not_found") ||
          msg.includes("handwriting sample not found");

        // Do NOT delete the assignment — just report the error
        return res.status(400).json({
          status: fetchResult.status || "error",
          message: getFriendlyErrorMessage(fetchResult.message) || "File fetch failed.",
          fileId: assignment?._id || null,
          ...fetchResult,
        });
      }

      console.log(`[Step 2/2] Comparing handwriting for student: ${studentId}`);
      const compareResult = await callHandwritingService("/compare-handwriting", { student_id: studentId }, authToken, 120000);

      // Mismatch — comparison ran successfully but handwriting didn't match
      if (compareResult.status === "success" && compareResult.matched === false) {
        // Update assignment with mismatch status instead of deleting it
        await updateAssignmentVerification(studentId, "mismatch", compareResult.average_similarity);

        return res.status(200).json({
          status: "mismatch",
          message: "Handwriting mismatch detected. You can submit with a note or delete and re-upload.",
          fileId: assignment?._id || null,
          average_similarity: compareResult.average_similarity,
          individual_similarities: compareResult.individual_similarities,
          threshold: compareResult.threshold,
          matched: false,
        });
      }

      // Comparison failed for another reason
      if (compareResult.status !== "success") {
        return res.status(400).json({
          status: compareResult.status || "error",
          message: getFriendlyErrorMessage(compareResult.message) || "Handwriting comparison failed.",
          fileId: assignment?._id || null,
          ...compareResult,
        });
      }

      // Full success — handwriting matched!
      await updateAssignmentVerification(studentId, "verified", compareResult.average_similarity);

      return res.status(200).json({
        status: "success",
        message: "Handwriting comparison completed successfully. Your assignment is verified!",
        fileId: assignment?._id || null,
        ...compareResult,
      });

    } catch (error) {
      console.error(`[Error] Compare handwriting failed for student ${studentId}:`, error.message);
      return res.status(500).json({
        status: "error",
        message: "Unexpected server error during handwriting comparison.",
      });
    }
  },
};

module.exports = { modelController, getFriendlyErrorMessage };