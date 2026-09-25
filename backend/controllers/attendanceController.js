const Attendance = require("../models/Attendance");

const emptyStats = () => ({
  total: 0, present: 0, absent: 0, presentPercentage: 0, absentPercentage: 0, bySubject: {}
});

const attendanceController = {
  /**
   * PUT /api/model/update-attendance-status — Teacher toggles a student's attendance status.
   */
  updateAttendanceStatus: async (req, res) => {
    const { recordId, status } = req.body;
    if (!recordId || !status) {
      return res.status(400).json({ success: false, message: "Missing required fields: recordId and status are required" });
    }
    if (!['Present', 'Absent'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value. Must be 'Present' or 'Absent'" });
    }
    try {
      // recordId can be a MongoDB _id or a legacy composite ID (studentId_date_time)
      let record;
      if (recordId.match(/^[a-f\d]{24}$/i)) {
        // MongoDB ObjectId format
        record = await Attendance.findByIdAndUpdate(recordId, { status }, { new: true });
      } else {
        // Legacy composite ID format: studentId_date_time-with-hyphens
        const parts = recordId.split('_');
        if (parts.length < 3) {
          return res.status(400).json({ success: false, message: "Invalid recordId format." });
        }
        const studentId = parts[0];
        const date = parts[1];
        const time = parts.slice(2).join(':').replace(/-/g, ':');
        record = await Attendance.findOneAndUpdate(
          { studentId, date, time },
          { status },
          { new: true }
        );
      }

      if (!record) {
        return res.status(404).json({ success: false, message: "Attendance record not found" });
      }

      res.status(200).json({
        success: true,
        message: "Attendance status updated successfully",
        data: {
          _id: record._id,
          recordId: record._id,
          studentId: record.studentId,
          date: record.date,
          time: record.time,
          status: record.status,
          updatedAt: record.updatedAt || new Date().toISOString(),
        }
      });
    } catch (error) {
      console.error("Update Attendance Error:", error.message);
      res.status(500).json({ success: false, message: "Failed to update attendance status" });
    }
  },

  /**
   * GET /api/model/get-attendance — Get attendance records, optionally filtered by date.
   */
  getAttendance: async (req, res) => {
    try {
      const { date } = req.query;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
      const skip = (page - 1) * limit;

      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, message: "Invalid date format. Please use YYYY-MM-DD" });
      }

      const filter = date ? { date } : {};
      const total = await Attendance.countDocuments(filter);
      const records = await Attendance.find(filter)
        .sort({ date: -1, time: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Map records to include a stable _id for frontend
      const mappedRecords = records.map(r => ({
        _id: r._id,
        student_id: r.studentId,
        name: r.name,
        date: r.date,
        time: r.time,
        subject: r.subject,
        status: r.status,
        proofImageUrl: r.proofImageUrl || null,
      }));

      const latestProofUrl = mappedRecords.find(r => r.proofImageUrl)?.proofImageUrl || null;

      res.status(200).json({
        success: true,
        records: mappedRecords,
        proofImageUrl: latestProofUrl,
        count: total,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      console.error("Error processing attendance request:", error.message);
      res.status(500).json({ success: false, message: "Failed to process attendance records" });
    }
  },

  /**
   * GET /api/model/get-all-attendance — Get all attendance records with pagination.
   */
  getAllAttendance: async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
      const skip = (page - 1) * limit;

      const total = await Attendance.countDocuments();
      const records = await Attendance.find()
        .sort({ date: -1, time: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const mappedRecords = records.map(r => ({
        _id: r._id,
        student_id: r.studentId,
        name: r.name,
        date: r.date,
        time: r.time,
        subject: r.subject,
        status: r.status,
        proofImageUrl: r.proofImageUrl || null,
      }));

      return res.status(200).json({
        success: true,
        records: mappedRecords,
        count: total,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Failed to process attendance records" });
    }
  },

  /**
   * GET /api/model/attendance-statistics — Aggregated attendance stats.
   */
  getAttendanceStatistics: async (req, res) => {
    try {
      const { date, subject } = req.query;

      const filter = {};
      if (date) filter.date = date;
      if (subject) filter.subject = subject;

      const records = await Attendance.find(filter).lean();

      if (!records.length) {
        return res.status(200).json({ success: true, statistics: emptyStats() });
      }

      const statistics = {
        total: 0, present: 0, absent: 0,
        presentPercentage: 0, absentPercentage: 0,
        bySubject: {}, byDate: {}
      };

      for (const record of records) {
        const { date: recDate, subject: recSubject, status } = record;
        statistics.total++;
        if (status === 'Present') statistics.present++;
        else if (status === 'Absent') statistics.absent++;

        // By subject
        if (!statistics.bySubject[recSubject]) statistics.bySubject[recSubject] = { total: 0, present: 0, absent: 0 };
        statistics.bySubject[recSubject].total++;
        if (status === 'Present') statistics.bySubject[recSubject].present++;
        if (status === 'Absent') statistics.bySubject[recSubject].absent++;

        // By date
        if (!statistics.byDate[recDate]) statistics.byDate[recDate] = { total: 0, present: 0, absent: 0 };
        statistics.byDate[recDate].total++;
        if (status === 'Present') statistics.byDate[recDate].present++;
        if (status === 'Absent') statistics.byDate[recDate].absent++;
      }

      if (statistics.total > 0) {
        statistics.presentPercentage = ((statistics.present / statistics.total) * 100).toFixed(1);
        statistics.absentPercentage = ((statistics.absent / statistics.total) * 100).toFixed(1);
        Object.values(statistics.bySubject).forEach(s => {
          s.presentPercentage = s.total > 0 ? ((s.present / s.total) * 100).toFixed(1) : "0";
          s.absentPercentage = s.total > 0 ? ((s.absent / s.total) * 100).toFixed(1) : "0";
        });
        Object.values(statistics.byDate).forEach(d => {
          d.presentPercentage = d.total > 0 ? ((d.present / d.total) * 100).toFixed(1) : "0";
          d.absentPercentage = d.total > 0 ? ((d.absent / d.total) * 100).toFixed(1) : "0";
        });
      }

      res.status(200).json({ success: true, statistics, filters: { date, subject } });
    } catch (error) {
      console.error("Error generating statistics:", error.message);
      res.status(500).json({ success: false, message: "Failed to generate attendance statistics" });
    }
  }
};

module.exports = attendanceController;