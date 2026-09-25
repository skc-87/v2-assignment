const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  studentId: { type: String, required: true, index: true },
  studentName: { type: String, required: true },
  fileCategory: { type: String, enum: ['handwriting_sample', 'assignment'], required: true, index: true },
  fileName: { type: String, required: true },

  // Cloud storage (Cloudinary) — preferred
  fileUrl: { type: String, default: null },
  cloudinaryId: { type: String, default: null },

  // Local / MongoDB buffer fallback — used when Cloudinary is not configured
  fileData: { type: Buffer, default: null },

  contentType: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },

  // Teacher assignment — student selects which teacher this submission is for
  teacherId: { type: String, default: null, index: true },
  teacherName: { type: String, default: null },

  // Handwriting verification results
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'mismatch', 'mismatch_with_note'],
    default: 'pending',
  },
  similarityScore: { type: Number, default: null },
  studentNote: { type: String, default: null },

  // Teacher grading
  marks: { type: String, default: null },
});

module.exports = mongoose.model('File', fileSchema);
