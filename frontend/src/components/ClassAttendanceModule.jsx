import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import Webcam from "react-webcam";
import { GradientText, CountUp } from "./reactbits";
const ClassAttendanceModule = ({ token, apiUrl }) => {
  const getCurrentLocalDate = () => {
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    return localDate.toISOString().split("T")[0];
  };
  const [formData, setFormData] = useState({ subject: "", date: getCurrentLocalDate(), image: "" });
  const [currentRecords, setCurrentRecords] = useState([]);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [searchDate, setSearchDate] = useState("");
  const [activeTab, setActiveTab] = useState("current");
  const [editingStatus, setEditingStatus] = useState({});
  const [statistics, setStatistics] = useState(null);
  const [selectedProofUrl, setSelectedProofUrl] = useState(null);
  const [latestProofUrl, setLatestProofUrl] = useState(null);
  const webcamRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.match(/^image\//)) { toast.error("Please select an image file"); return; }
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData({ ...formData, image: event.target.result });
      toast.success("Attendance image loaded");
    };
    reader.readAsDataURL(file);
  };
  useEffect(() => {
    if (activeTab === "current") { fetchAttendanceRecords(); fetchAttendanceStatistics(); }
  }, [activeTab, formData.date, formData.subject]);
  useEffect(() => {
    if (activeTab === "history") { fetchAllAttendanceRecords(); }
  }, [activeTab]);
  const fetchAttendanceRecords = async () => {
    try {
      setIsLoadingRecords(true);
      const response = await axios.get(`${apiUrl}/get-attendance?date=${formData.date}`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) {
        setCurrentRecords(response.data.records || []);
        if (response.data.proofImageUrl) setLatestProofUrl(response.data.proofImageUrl);
        setEditingStatus({});
      }
    } catch (error) {
      console.error("Error fetching attendance:", error.message);
      toast.error("Failed to load attendance records");
    } finally { setIsLoadingRecords(false); }
  };
  const fetchAllAttendanceRecords = async () => {
    try {
      setIsLoadingRecords(true);
      const response = await axios.get(`${apiUrl}/get-all-attendance`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) { setHistoryRecords(response.data.records || []); setEditingStatus({}); }
    } catch (error) {
      console.error("Error fetching all attendance:", error.message);
      toast.error("Failed to load attendance history");
    } finally { setIsLoadingRecords(false); }
  };
  const fetchAttendanceStatistics = async () => {
    try {
      setIsLoadingStats(true);
      const url = formData.subject
        ? `${apiUrl}/attendance-statistics?date=${formData.date}&subject=${formData.subject}`
        : `${apiUrl}/attendance-statistics?date=${formData.date}`;
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) { setStatistics(response.data.statistics); }
    } catch (error) {
      console.error("Error fetching statistics:", error.message);
      toast.error("Failed to load attendance statistics");
    } finally { setIsLoadingStats(false); }
  };
  const toggleAttendanceStatus = async (record, newStatus) => {
    if (!record._id) { toast.error("Cannot update record: Missing record ID"); return; }
    try {
      setEditingStatus((prev) => ({ ...prev, [record._id]: true }));
      const response = await axios.put(`${apiUrl}/update-attendance-status`,
        { recordId: record._id, status: newStatus },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      if (response.data.success) {
        if (activeTab === "current") {
          setCurrentRecords(currentRecords.map((r) => r._id === record._id ? { ...r, status: newStatus } : r));
        } else {
          setHistoryRecords(historyRecords.map((r) => r._id === record._id ? { ...r, status: newStatus } : r));
        }
        fetchAttendanceStatistics();
        toast.success(`Status updated to ${newStatus}`);
      } else { toast.error(response.data.message || "Failed to update status"); }
    } catch (error) {
      console.error("Error updating attendance status:", error.message);
      toast.error(error.response?.data?.message || "Failed to update status");
    } finally { setEditingStatus((prev) => ({ ...prev, [record._id]: false })); }
  };
  const handleStatusToggle = (record) => {
    toggleAttendanceStatus(record, record.status === "Present" ? "Absent" : "Present");
  };
  const groupRecordsByDate = () => {
    const grouped = {};
    historyRecords.forEach((record) => {
      const date = record.date;
      if (!date) return;
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(record);
    });
    return grouped;
  };
  const getFilteredRecords = () => {
    const grouped = groupRecordsByDate();
    if (searchDate) return { [searchDate]: grouped[searchDate] || [] };
    return grouped;
  };
  const captureImage = () => {
    if (!webcamRef.current) { toast.error("Camera not ready. Please wait and try again."); return; }
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) { toast.error("Unable to capture image"); return; }
    setFormData({ ...formData, image: imageSrc });
    setShowCamera(false);
    toast.success("Image captured successfully");
  };
  const handleTakeAttendance = async () => {
    if (!formData.subject) { toast.error("Please select a subject"); return; }
    if (!formData.image) { toast.error("Please capture an image for attendance"); return; }
    const alreadyTaken = currentRecords.some((r) => r.subject?.toLowerCase() === formData.subject.trim().toLowerCase());
    if (alreadyTaken) {
      toast.warn(`Attendance for "${formData.subject}" has already been taken today. Please choose a different subject.`);
      return;
    }
    try {
      setIsLoading(true);
      const payload = { subject: formData.subject.trim(), image: formData.image, date: formData.date };
      const response = await axios.post(`${apiUrl}/take-attendance`, payload, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (response.data.success) {
        if (response.data.proof_image_url) {
          setLatestProofUrl(response.data.proof_image_url);
        }
        await fetchAttendanceRecords();
        await fetchAttendanceStatistics();
        setFormData((prev) => ({ ...prev, image: "" }));
        setShowCamera(false);
        toast.success(response.data.message || `Attendance recorded successfully`);
      } else { toast.error(response.data.message || "Attendance recording failed"); }
    } catch (error) {
      console.error("Attendance error:", error.message);
      toast.error(error.response?.data?.message || "Failed to record attendance.");
    } finally { setIsLoading(false); }
  };
  const renderStatistics = () => (
    <div className="mb-6 p-5 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100/60">
      <h3 className="text-base font-bold mb-4 text-slate-800 flex items-center gap-2">
        <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        <GradientText colors={["#6366f1", "#8b5cf6", "#6366f1"]} animationSpeed={4}>Attendance Statistics</GradientText>
      </h3>
      {isLoadingStats ? (
        <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600"></div></div>
      ) : statistics ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-emerald-100/60">
              <div className="text-2xl font-bold text-emerald-600"><CountUp from={0} to={statistics.present} separator="" duration={0.8} /></div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Present</div>
              <div className="text-xs font-medium text-emerald-500 mt-0.5"><CountUp from={0} to={statistics.presentPercentage} separator="" duration={0.8} />%</div>
            </div>
            <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-red-100/60">
              <div className="text-2xl font-bold text-red-600"><CountUp from={0} to={statistics.absent} separator="" duration={0.8} /></div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Absent</div>
              <div className="text-xs font-medium text-red-500 mt-0.5"><CountUp from={0} to={statistics.absentPercentage} separator="" duration={0.8} />%</div>
            </div>
            <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-indigo-100/60">
              <div className="text-2xl font-bold text-indigo-600"><CountUp from={0} to={statistics.total} separator="" duration={0.8} /></div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Total Records</div>
            </div>
          </div>
          {statistics.bySubject && Object.keys(statistics.bySubject).length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold text-sm mb-3 text-slate-700">Statistics by Subject</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(statistics.bySubject).map(([subject, stats]) => (
                  <div key={subject} className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-sm text-slate-800">{subject}</span>
                      <span className="text-xs font-medium text-slate-400">{stats.total} total</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-emerald-600">{stats.present} present ({stats.presentPercentage}%)</span>
                      <span className="text-red-600">{stats.absent} absent ({stats.absentPercentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-slate-400 text-sm">No statistics available for selected date</div>
      )}
    </div>
  );
  const renderCurrentDateTable = () => (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50/80">
          <tr>
            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Student ID</th>
            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Name</th>
            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Time</th>
            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Subject</th>
            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Status</th>
            <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">AI Proof</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {currentRecords.map((record) => (
            <tr key={record._id} className={`hover:bg-indigo-50/30 transition-colors ${record.status === 'Absent' ? 'bg-red-50/50' : ''}`}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{record.student_id || 'N/A'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{record.name || 'N/A'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{record.time || 'N/A'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{record.subject || 'N/A'}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <button onClick={() => handleStatusToggle(record)} disabled={editingStatus[record._id]}
                  className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full transition-all duration-200 ${record.status === "Present" ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-red-100 text-red-800 hover:bg-red-200"} ${editingStatus[record._id] ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}>
                  {editingStatus[record._id] ? 'Updating...' : record.status || 'N/A'}
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {(record.proofImageUrl || latestProofUrl) ? (
                  <button onClick={() => setSelectedProofUrl(record.proofImageUrl || latestProofUrl)}
                    className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-semibold px-2.5 py-1 rounded-lg border border-indigo-200/60 transition shadow-sm"
                    title="View photo with AI detection boxes">
                    <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Proof
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">None</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const renderHistoryTables = () => {
    const groupedRecords = getFilteredRecords();
    return (
      <div className="space-y-6">
        {Object.entries(groupedRecords).map(([date, records]) => (
          <div key={date} className="border border-slate-200/80 rounded-xl overflow-hidden">
            <h4 className="bg-gradient-to-r from-slate-50 to-white px-5 py-3.5 border-b border-slate-200/60 font-semibold text-slate-800 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              {new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Student ID</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Name</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Time</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Subject</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-widest">AI Proof</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {records.map((record) => (
                    <tr key={record._id} className={`hover:bg-indigo-50/30 transition-colors ${record.status === "Absent" ? "bg-red-50/50" : ""}`}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-900">{record.student_id || "N/A"}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-900">{record.name || "N/A"}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-500">{record.time || "N/A"}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-500">{record.subject || "N/A"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <button onClick={() => handleStatusToggle(record)} disabled={editingStatus[record._id]}
                          className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full transition-all duration-200 ${record.status === "Present" ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-red-100 text-red-800 hover:bg-red-200"} ${editingStatus[record._id] ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:shadow-md"}`}>
                          {editingStatus[record._id] ? "Updating..." : record.status || "N/A"}
                        </button>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm">
                        {record.proofImageUrl ? (
                          <button onClick={() => setSelectedProofUrl(record.proofImageUrl)}
                            className="inline-flex items-center gap-1 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-semibold px-2 py-0.5 rounded-lg border border-indigo-200/60 transition shadow-sm"
                            title="View photo with AI detection boxes">
                            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Proof
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };
  return (
    <div className="mb-8 p-6 rounded-2xl bg-white/80 backdrop-blur-sm shadow-lg shadow-slate-200/60 border border-slate-100/80">
      <h2 className="text-xl font-bold mb-6 text-slate-800 flex items-center gap-2.5">
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-200/50">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </span>
        <GradientText colors={["#10b981", "#14b8a6", "#10b981"]} animationSpeed={4}>Class Attendance</GradientText>
      </h2>
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
        <button className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === "current" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setActiveTab("current")}>Today's Attendance</button>
        <button className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${activeTab === "history" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setActiveTab("history")}>Attendance History</button>
      </div>
      {activeTab === "current" && (
        <>
          {!showCamera && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label htmlFor="subject-select" className="block text-sm font-medium text-slate-700 mb-1">Subject *</label>
                <select id="subject-select" name="subject" value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-slate-50/50 text-sm" required disabled={isLoading}>
                  <option value="">Select Subject</option>
                  <option value="Mathematics">Mathematics</option>
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                  <option value="Biology">Biology</option>
                </select>
              </div>
              <div>
                <label htmlFor="attendance-date" className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input id="attendance-date" name="date" type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-slate-50/50 text-sm" max={getCurrentLocalDate()} disabled={isLoading} />
              </div>
              <div className="flex flex-col">
                <label className="block text-sm font-medium text-slate-700 mb-1">Face Capture *</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => {
                    if (!formData.subject) {
                      toast.warn("Please select a Subject from the dropdown before opening the camera.");
                      return;
                    }
                    setShowCamera(true);
                  }}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${!formData.subject || isLoading ? "bg-slate-100 text-slate-500 hover:bg-slate-200" : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200/50 hover:shadow-lg hover:-translate-y-0.5"}`}>
                    {formData.image ? "Recapture" : "Capture Face"}
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" id="attendance-file-upload" />
                  <label htmlFor="attendance-file-upload" className="px-3 py-2.5 border border-slate-200 rounded-xl text-center cursor-pointer text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center">
                    Upload
                  </label>
                </div>
              </div>
            </div>
          )}
          {showCamera && (
            <div className="mb-6 p-5 border border-slate-200/80 rounded-2xl bg-slate-50/50">
              <div className="w-full max-w-md mx-auto space-y-3">
                <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-black">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ width: 1280, height: 720, facingMode: "user" }}
                    onUserMediaError={(err) => {
                      console.error("Attendance camera error:", err);
                      toast.error("Camera access failed. Please ensure camera permissions are allowed in your browser address bar.");
                    }}
                    className="w-full rounded-2xl"
                  />
                </div>
                <div className="flex space-x-3">
                  <button onClick={captureImage} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all text-sm">Capture</button>
                  <button onClick={() => setShowCamera(false)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-all text-sm">Cancel</button>
                </div>
              </div>
            </div>
          )}
          {formData.image && !showCamera && (
            <div className="mb-6 flex flex-col items-center">
              <div className="w-full max-w-md border rounded-md p-1 mb-3">
                <img src={formData.image} alt="Captured for attendance" className="w-full rounded-md" />
              </div>
              <button onClick={() => setFormData({ ...formData, image: "" })} className="px-4 py-2 bg-rose-100 text-rose-700 rounded-xl font-semibold hover:bg-rose-200 transition-all text-sm" disabled={isLoading}>Remove Image</button>
            </div>
          )}
          <div className="flex justify-end mb-6">
            <button onClick={handleTakeAttendance} disabled={isLoading || !formData.subject || !formData.image}
              className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${isLoading || !formData.subject || !formData.image ? "bg-slate-200 cursor-not-allowed text-slate-400" : "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200/50 hover:shadow-lg hover:-translate-y-0.5"}`}>
              {isLoading ? "Processing..." : "Take Attendance"}
            </button>
          </div>
          {renderStatistics()}
        </>
      )}
      {activeTab === "history" && (
        <div className="mb-6 p-4 bg-slate-50/50 rounded-xl border border-slate-200/60">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <label htmlFor="search-date" className="block text-sm font-semibold text-slate-700 mb-1.5">Filter by Date</label>
              <input id="search-date" name="searchDate" type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition bg-white text-sm" max={getCurrentLocalDate()} />
            </div>
            <button onClick={() => setSearchDate("")} className="mt-2 md:mt-7 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors text-sm">Clear Filter</button>
          </div>
        </div>
      )}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-lg font-semibold text-slate-800">{activeTab === "current" ? `Attendance for ${formData.date}` : "Attendance History"}</h3>
          <div className="flex items-center gap-2.5">
            {(latestProofUrl || currentRecords.some((r) => r.proofImageUrl)) && (
              <button
                type="button"
                onClick={() => setSelectedProofUrl(latestProofUrl || currentRecords.find((r) => r.proofImageUrl)?.proofImageUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60 shadow-sm transition"
              >
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                View Class Photo Proof
              </button>
            )}
            <button onClick={activeTab === "current" ? fetchAttendanceRecords : fetchAllAttendanceRecords} disabled={isLoadingRecords}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${isLoadingRecords ? "bg-slate-100 cursor-not-allowed text-slate-400" : "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"}`}>
              Refresh
            </button>
          </div>
        </div>
        {isLoadingRecords ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600"></div></div>
        ) : activeTab === "current" ? (
          currentRecords.length > 0 ? renderCurrentDateTable() : (
            <div className="text-center py-10 text-slate-400">
              <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              No attendance records found.
            </div>
          )
        ) : historyRecords.length > 0 ? renderHistoryTables() : (
          <div className="text-center py-10 text-slate-400">
            <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            No attendance history found.
          </div>
        )}
      </div>

      {selectedProofUrl && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Class Attendance Photo Proof
                </h3>
                <p className="text-xs text-slate-500">AI detection annotations (Green = Matched Student, Red = Unknown Face)</p>
              </div>
              <button onClick={() => setSelectedProofUrl(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-950 flex-1 flex items-center justify-center min-h-[300px] p-2">
              <img src={selectedProofUrl} alt="Class Attendance Proof" className="max-w-full max-h-[55vh] object-contain rounded-lg" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <span className="w-3 h-3 rounded-sm border-2 border-emerald-500 bg-emerald-100/60"></span>
                  Green: Recognized
                </span>
                <span className="flex items-center gap-1.5 text-red-600 font-semibold">
                  <span className="w-3 h-3 rounded-sm border-2 border-red-500 bg-red-100/60"></span>
                  Red: Unknown
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 italic">
                <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Auto-deleted after 7 days to preserve storage
              </div>
              <div className="flex gap-2">
                <a href={selectedProofUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 transition">
                  Open Full Size
                </a>
                <button onClick={() => setSelectedProofUrl(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ClassAttendanceModule;
