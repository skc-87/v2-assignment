const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    date: { type: String, required: true, index: true },   // YYYY-MM-DD
    time: { type: String, required: true },                 // HH:MM:SS
    subject: { type: String, required: true, index: true },
    status: { type: String, enum: ['Present', 'Absent'], required: true },
    proofImageUrl: { type: String, default: null },
    proofCloudinaryId: { type: String, default: null },
  },
  { timestamps: true }
);

// Compound index for efficient queries: filter by date + subject, or by student
attendanceSchema.index({ date: 1, subject: 1 });
attendanceSchema.index({ studentId: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
