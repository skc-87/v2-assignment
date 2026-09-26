import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { GradientText, ShinyText } from "./reactbits";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Ticket,
  QrCode,
  Trash2,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Camera,
  CameraOff,
  X,
  RefreshCw,
  Plus,
  Eye
} from "lucide-react";

const tabs = [
  { key: "create", label: "Create Event", icon: <Plus size={16} /> },
  { key: "passes", label: "Generate Passes", icon: <Ticket size={16} /> },
  { key: "scanner", label: "QR Scanner", icon: <QrCode size={16} /> },
  { key: "events", label: "My Events", icon: <Calendar size={16} /> },
];

const fadeTab = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } }
};

const InputField = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1.5">
      {label}
      {required && <span className="text-rose-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputCls =
  "w-full p-3 border border-slate-200 rounded-xl bg-slate-50/50 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition text-sm";

const EventManager = ({ token, apiUrl }) => {
  const [activeTab, setActiveTab] = useState("create");
  const [events, setEvents] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedEventPasses, setSelectedEventPasses] = useState([]);
  const [loadingEventPasses, setLoadingEventPasses] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // Scanner state
  const [scannerResult, setScannerResult] = useState(null);
  const [qrInput, setQrInput] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // My Events state
  const [viewingPassesEvent, setViewingPassesEvent] = useState(null);
  const [modalPasses, setModalPasses] = useState([]);
  const [loadingModalPasses, setLoadingModalPasses] = useState(false);
  const [modalPassSearch, setModalPassSearch] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    venue: "",
    organizer: ""
  });

  useEffect(() => {
    fetchEvents();
    fetchStudents();
  }, [token, apiUrl]);

  // Clean up camera on unmount or tab change
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "scanner") {
      stopCamera();
    }
  }, [activeTab]);

  // When selected event changes in passes tab, fetch its issued passes
  useEffect(() => {
    if (selectedEvent) {
      fetchEventPasses(selectedEvent);
    } else {
      setSelectedEventPasses([]);
    }
  }, [selectedEvent]);

  const fetchEvents = async () => {
    try {
      const response = await axios.get(`${apiUrl}/events`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(response.data.events || []);
    } catch (error) {
      toast.error("Failed to fetch events");
    }
  };

  const fetchStudents = async () => {
    try {
      const response = await axios.get(`${apiUrl}/events/students/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStudents(response.data.students || []);
    } catch (error) {
      toast.error("Failed to fetch students");
    }
  };

  const fetchEventPasses = async (eventId) => {
    if (!eventId) return;
    setLoadingEventPasses(true);
    try {
      const response = await axios.get(`${apiUrl}/events/${eventId}/passes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedEventPasses(response.data.passes || []);
    } catch (error) {
      console.error("Failed to fetch event passes:", error.message);
    } finally {
      setLoadingEventPasses(false);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await axios.post(`${apiUrl}/events/create`, eventForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success("Event created successfully!");
      setEvents([response.data.event, ...events]);
      setEventForm({ title: "", description: "", date: "", time: "", venue: "", organizer: "" });
      setActiveTab("events");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create event");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"? All generated passes for this event will also be deleted.`)) {
      return;
    }
    try {
      const response = await axios.delete(`${apiUrl}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(response.data.message || "Event deleted successfully");
      setEvents(events.filter(e => e.eventId !== eventId));
      if (selectedEvent === eventId) {
        setSelectedEvent(null);
        setSelectedEventPasses([]);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to delete event");
    }
  };

  const handleGeneratePasses = async () => {
    if (!selectedEvent || selectedStudents.length === 0) {
      toast.error("Please select an event and at least one student");
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.post(
        `${apiUrl}/events/${selectedEvent}/generate-passes`,
        { studentIds: selectedStudents },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        toast.success(response.data.message);
        if (response.data.errors?.length > 0) {
          response.data.errors.forEach(err => toast.warning(err));
        }
        setSelectedStudents([]);
        fetchEventPasses(selectedEvent);
      } else {
        toast.error(response.data.message || "Failed to generate passes");
      }
    } catch (error) {
      console.error("Generate passes error:", error.message);
      toast.error(error.response?.data?.message || "Failed to generate passes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQRScan = async (qrData) => {
    if (!qrData || !qrData.trim()) return;
    try {
      const response = await axios.post(
        `${apiUrl}/events/validate-qr`,
        { qrData: qrData.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setScannerResult(response.data);
      if (response.data.valid) {
        toast.success(response.data.message);
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to validate QR code");
    }
  };

  // Camera QR Scanner logic
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);

      // Check if BarcodeDetector is supported
      if ("BarcodeDetector" in window) {
        const barcodeDetector = new window.BarcodeDetector({ formats: ["qr_code"] });
        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current && videoRef.current.readyState === 4) {
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const qrValue = barcodes[0].rawValue;
                stopCamera();
                setQrInput(qrValue);
                handleQRScan(qrValue);
              }
            } catch (err) {
              // Ignore frame detection errors
            }
          }
        }, 500);
      } else {
        toast.info("Point camera at QR code. Paste QR text below for manual scan if camera detection is unavailable.");
      }
    } catch (err) {
      console.error("Camera access error:", err);
      toast.error("Could not access camera. Please check permissions or paste QR data manually.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // View Passes Modal
  const openPassesModal = async (event) => {
    setViewingPassesEvent(event);
    setLoadingModalPasses(true);
    setModalPassSearch("");
    try {
      const response = await axios.get(`${apiUrl}/events/${event.eventId}/passes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setModalPasses(response.data.passes || []);
    } catch (error) {
      toast.error("Failed to load passes for this event");
      setModalPasses([]);
    } finally {
      setLoadingModalPasses(false);
    }
  };

  // Helper set for students who already have a pass
  const issuedStudentIds = new Set(
    selectedEventPasses.map(p => p.studentId?._id || p.studentId)
  );

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q)
    );
  });

  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const selectAllStudents = () => {
    setSelectedStudents(filteredStudents.map(s => s._id));
  };

  const selectUnassignedStudents = () => {
    const unassigned = filteredStudents
      .filter(s => !issuedStudentIds.has(s._id))
      .map(s => s._id);
    setSelectedStudents(unassigned);
  };

  const clearSelection = () => setSelectedStudents([]);

  const generateEventQRData = (event) =>
    JSON.stringify({
      eventId: event.eventId,
      type: "event_info",
      title: event.title,
      date: event.date,
      time: event.time
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/80 backdrop-blur-sm shadow-lg shadow-slate-200/60 border border-slate-100/80 p-6"
    >
      <h2 className="text-xl font-bold text-slate-800 mb-5 flex items-center gap-2.5">
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 shadow-md shadow-violet-200/50">
          <Calendar size={18} className="text-white" />
        </span>
        <GradientText colors={["#8b5cf6", "#a78bfa", "#8b5cf6"]} animationSpeed={4}>
          Event Management
        </GradientText>
      </h2>

      {/* Tabs Header */}
      <div className="flex gap-1 p-1 bg-slate-100/80 rounded-xl mb-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200 ${
              activeTab === t.key
                ? "text-white"
                : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
            }`}
          >
            {activeTab === t.key && (
              <motion.div
                layoutId="eventTabBg"
                className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-lg shadow-md"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {t.icon}
              {t.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* TAB 1: CREATE EVENT */}
        {activeTab === "create" && (
          <motion.div key="create" {...fadeTab}>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              <GradientText colors={["#6366f1", "#8b5cf6", "#6366f1"]} animationSpeed={4}>
                Create New Event
              </GradientText>
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              <ShinyText text="Fill in the details to schedule an event and generate official digital passes." speed={3} className="text-sm" />
            </p>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <InputField label="Event Title" required>
                <input
                  type="text"
                  required
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Annual Tech Symposium 2026"
                  maxLength={100}
                />
              </InputField>
              <InputField label="Description">
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  rows="3"
                  className={`${inputCls} resize-none`}
                  placeholder="Brief agenda or instructions for attendees"
                  maxLength={200}
                />
              </InputField>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Date" required>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    value={eventForm.date}
                    onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                    className={inputCls}
                  />
                </InputField>
                <InputField label="Time" required>
                  <input
                    type="time"
                    required
                    value={eventForm.time}
                    onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
                    className={inputCls}
                  />
                </InputField>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Venue" required>
                  <input
                    type="text"
                    required
                    value={eventForm.venue}
                    onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. Main Auditorium, Hall B"
                    maxLength={50}
                  />
                </InputField>
                <InputField label="Organizer" required>
                  <input
                    type="text"
                    required
                    value={eventForm.organizer}
                    onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })}
                    className={inputCls}
                    placeholder="e.g. Dept. of Computer Science"
                    maxLength={50}
                  />
                </InputField>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5" /> Create Event & Setup Passes
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {/* TAB 2: GENERATE PASSES */}
        {activeTab === "passes" && (
          <motion.div key="passes" {...fadeTab}>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              <GradientText colors={["#10b981", "#14b8a6", "#10b981"]} animationSpeed={4}>
                Generate Event Passes
              </GradientText>
            </h3>
            <p className="text-sm text-slate-400 mb-5">Select an event and select students to issue QR passes to their accounts.</p>

            <InputField label="Select Target Event" required>
              <select
                value={selectedEvent || ""}
                onChange={(e) => setSelectedEvent(e.target.value)}
                className={inputCls}
              >
                <option value="">Choose an event</option>
                {events.map((event) => (
                  <option key={event._id} value={event.eventId}>
                    {event.title} — {new Date(event.date).toLocaleDateString()} at {event.time} ({event.venue})
                  </option>
                ))}
              </select>
            </InputField>

            {/* Event Passes Summary Bar if event selected */}
            {selectedEvent && (
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs sm:text-sm">
                  <span className="text-slate-600">
                    Total Students: <strong>{students.length}</strong>
                  </span>
                  <span className="text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-full font-medium">
                    Issued: <strong>{selectedEventPasses.length}</strong>
                  </span>
                  <span className="text-indigo-700 bg-indigo-100/70 px-2.5 py-1 rounded-full font-medium">
                    Unassigned: <strong>{Math.max(0, students.length - selectedEventPasses.length)}</strong>
                  </span>
                </div>
                {loadingEventPasses && <span className="text-xs text-slate-400 animate-pulse">Syncing passes...</span>}
              </div>
            )}

            <div className="mt-5 mb-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-600">Select Students</label>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-xs font-semibold">
                    {selectedStudents.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={selectUnassignedStudents}
                    className="font-medium text-emerald-600 hover:text-emerald-800 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition"
                  >
                    Select Unassigned
                  </button>
                  <button
                    onClick={selectAllStudents}
                    className="font-medium text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearSelection}
                    className="font-medium text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Student Search */}
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by student name, email, department..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                />
              </div>

              {/* Student Checklist */}
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    {students.length === 0 ? "No approved students found" : "No students match your search"}
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const hasPass = issuedStudentIds.has(student._id);
                    const isSelected = selectedStudents.includes(student._id);
                    return (
                      <label
                        key={student._id}
                        className={`flex items-center justify-between p-3 hover:bg-indigo-50/30 transition-colors cursor-pointer ${
                          hasPass ? "bg-emerald-50/20" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleStudentSelection(student._id)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded cursor-pointer"
                          />
                          <div className="truncate">
                            <span className="text-sm font-medium text-slate-700">{student.name}</span>
                            <span className="text-xs text-slate-400 ml-2">({student.email})</span>
                            {(student.department || student.year) && (
                              <span className="text-[11px] text-slate-500 ml-2 font-mono">
                                • {student.department} {student.year ? `Yr ${student.year}` : ""}
                              </span>
                            )}
                          </div>
                        </div>

                        {hasPass && (
                          <span className="shrink-0 text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 size={12} /> Pass Issued
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <button
              onClick={handleGeneratePasses}
              disabled={!selectedEvent || selectedStudents.length === 0 || isLoading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-200/50 hover:shadow-xl hover:shadow-emerald-300/50 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Ticket className="w-5 h-5" /> Generate {selectedStudents.length} Pass{selectedStudents.length !== 1 ? "es" : ""}
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* TAB 3: QR SCANNER (Camera + Paste) */}
        {activeTab === "scanner" && (
          <motion.div key="scanner" {...fadeTab}>
            <h3 className="text-lg font-semibold text-slate-800 mb-1">
              <GradientText colors={["#6366f1", "#8b5cf6", "#6366f1"]} animationSpeed={4}>
                QR Code Scanner
              </GradientText>
            </h3>
            <p className="text-sm text-slate-400 mb-5">
              Validate event entry passes using your webcam or paste the QR data directly.
            </p>

            {/* Live Camera Scanner Box */}
            <div className="mb-6 p-5 rounded-2xl bg-slate-900 text-white shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                  <Camera size={18} className="text-indigo-400" /> Live Camera Scanner
                </span>
                <button
                  onClick={isCameraActive ? stopCamera : startCamera}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    isCameraActive
                      ? "bg-rose-500 hover:bg-rose-600 text-white"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white"
                  }`}
                >
                  {isCameraActive ? (
                    <>
                      <CameraOff size={14} /> Stop Camera
                    </>
                  ) : (
                    <>
                      <Camera size={14} /> Start Camera
                    </>
                  )}
                </button>
              </div>

              {isCameraActive ? (
                <div className="relative aspect-video max-h-72 w-full mx-auto rounded-xl overflow-hidden bg-black flex items-center justify-center border border-slate-700">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  {/* Targeting Reticle */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-dashed border-indigo-400 rounded-2xl animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 border border-dashed border-slate-700 rounded-xl">
                  <Camera size={36} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-xs">Click "Start Camera" to scan student event passes via webcam.</p>
                </div>
              )}
            </div>

            {/* Manual QR Input Fallback */}
            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 p-5 rounded-2xl border border-slate-200/60 mb-5">
              <div className="flex items-center gap-2 mb-3 text-xs text-slate-500 font-medium">
                <QrCode size={14} className="text-indigo-500" /> Manual Code Validation
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Paste QR code JSON string here..."
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && qrInput.trim()) handleQRScan(qrInput.trim());
                  }}
                  className={inputCls}
                />
                <button
                  onClick={() => {
                    if (qrInput.trim()) handleQRScan(qrInput.trim());
                  }}
                  disabled={!qrInput.trim()}
                  className="px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                >
                  Validate
                </button>
              </div>
            </div>

            {/* Scan Result Banner */}
            <AnimatePresence>
              {scannerResult && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-5 rounded-2xl border ${
                    scannerResult.valid ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h4
                      className={`font-semibold flex items-center gap-2 text-base ${
                        scannerResult.valid ? "text-emerald-800" : "text-rose-800"
                      }`}
                    >
                      {scannerResult.valid ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Valid Pass — Entry Approved
                        </>
                      ) : (
                        <>
                          <XCircle className="w-5 h-5 text-rose-600" /> Entry Denied
                        </>
                      )}
                    </h4>
                    <button
                      onClick={() => setScannerResult(null)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className={`mt-2 text-sm ${scannerResult.valid ? "text-emerald-700" : "text-rose-700"}`}>
                    {scannerResult.message}
                  </p>

                  {scannerResult.data && (
                    <div className="mt-4 pt-3 border-t border-slate-200/50 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {scannerResult.data.studentName && (
                        <div>
                          <span className="text-slate-400">Student: </span>
                          <strong className="text-slate-700">{scannerResult.data.studentName}</strong>
                        </div>
                      )}
                      {scannerResult.data.studentEmail && (
                        <div>
                          <span className="text-slate-400">Email: </span>
                          <span className="text-slate-700">{scannerResult.data.studentEmail}</span>
                        </div>
                      )}
                      {scannerResult.data.eventTitle && (
                        <div>
                          <span className="text-slate-400">Event: </span>
                          <strong className="text-slate-700">{scannerResult.data.eventTitle}</strong>
                        </div>
                      )}
                      {scannerResult.data.venue && (
                        <div>
                          <span className="text-slate-400">Venue: </span>
                          <span className="text-slate-700">{scannerResult.data.venue}</span>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* TAB 4: MY EVENTS */}
        {activeTab === "events" && (
          <motion.div key="events" {...fadeTab}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">
                  <GradientText colors={["#6366f1", "#8b5cf6", "#6366f1"]} animationSpeed={4}>
                    My Events
                  </GradientText>
                </h3>
                <p className="text-sm text-slate-400">Manage your created events, passes, and track student attendance.</p>
              </div>
              <button
                onClick={fetchEvents}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 flex items-center gap-1.5 transition"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Calendar size={48} className="mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No events created yet</p>
                <p className="text-sm mt-1">Click "Create Event" to schedule your first event.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((event, i) => (
                  <motion.div
                    key={event._id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="border border-slate-200/80 rounded-2xl p-5 hover:shadow-md hover:border-indigo-200/60 transition-all group bg-white"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors text-base">
                            {event.title}
                          </h4>
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                            {event.status || "Active"}
                          </span>
                        </div>
                        {event.description && (
                          <p className="text-slate-500 text-sm mt-1 line-clamp-2">{event.description}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-indigo-500" />
                            {new Date(event.date).toLocaleDateString()} at {event.time}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <MapPin size={14} className="text-rose-500" />
                            {event.venue}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <User size={14} className="text-emerald-500" />
                            {event.organizer}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400 font-mono">ID: {event.eventId}</p>
                      </div>

                      {/* Event Info QR Code */}
                      <div className="text-center shrink-0">
                        <div className="p-2 bg-white rounded-xl border border-slate-200/80 shadow-sm">
                          <QRCodeSVG value={generateEventQRData(event)} size={68} level="M" />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">Event Info</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setSelectedEvent(event.eventId);
                            setActiveTab("passes");
                          }}
                          className="text-xs px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-1.5"
                        >
                          <Ticket size={14} /> Generate Passes
                        </button>
                        <button
                          onClick={() => openPassesModal(event)}
                          className="text-xs px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition flex items-center gap-1.5"
                        >
                          <Eye size={14} /> View Issued Passes
                        </button>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(generateEventQRData(event));
                            toast.success("Event QR data copied to clipboard");
                          }}
                          className="text-xs px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition flex items-center gap-1.5"
                        >
                          Copy QR
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteEvent(event.eventId, event.title)}
                        className="text-xs px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200/80 transition flex items-center gap-1.5 ml-auto"
                        title="Delete Event"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: VIEW ISSUED PASSES */}
      <AnimatePresence>
        {viewingPassesEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[85vh] flex flex-col border border-slate-100"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Ticket className="text-indigo-600" size={20} />
                    Passes for {viewingPassesEvent.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(viewingPassesEvent.date).toLocaleDateString()} at {viewingPassesEvent.time} • {viewingPassesEvent.venue}
                  </p>
                </div>
                <button
                  onClick={() => setViewingPassesEvent(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-3 my-4">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <div className="text-xs text-slate-400 font-medium">Issued</div>
                  <div className="text-lg font-bold text-slate-800">{modalPasses.length}</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                  <div className="text-xs text-emerald-600 font-medium">Attended (Used)</div>
                  <div className="text-lg font-bold text-emerald-700">
                    {modalPasses.filter(p => p.isUsed).length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-center">
                  <div className="text-xs text-indigo-600 font-medium">Pending Entry</div>
                  <div className="text-lg font-bold text-indigo-700">
                    {modalPasses.filter(p => !p.isUsed).length}
                  </div>
                </div>
              </div>

              {/* Pass Search */}
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter attendees by student name or pass ID..."
                  value={modalPassSearch}
                  onChange={(e) => setModalPassSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {/* Attendees List */}
              <div className="overflow-y-auto flex-1 border border-slate-100 rounded-xl divide-y divide-slate-100">
                {loadingModalPasses ? (
                  <div className="text-center py-10 text-slate-400 text-sm animate-pulse">
                    Loading attendees...
                  </div>
                ) : modalPasses.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">
                    No passes have been issued for this event yet.
                  </div>
                ) : (
                  modalPasses
                    .filter(p => {
                      const q = modalPassSearch.toLowerCase();
                      return (
                        p.studentId?.name?.toLowerCase().includes(q) ||
                        p.studentId?.email?.toLowerCase().includes(q) ||
                        p.passId?.toLowerCase().includes(q)
                      );
                    })
                    .map((pass) => (
                      <div key={pass._id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                        <div>
                          <div className="font-semibold text-slate-800 text-sm">{pass.studentId?.name || "Student"}</div>
                          <div className="text-slate-400">{pass.studentId?.email}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">Pass: {pass.passId}</div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-block ${
                              pass.isUsed
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            }`}
                          >
                            {pass.isUsed ? "Used / Attended" : "Active / Unused"}
                          </span>
                          {pass.isUsed && pass.usedAt && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              Scanned {new Date(pass.usedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>

              {/* Close Button */}
              <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setViewingPassesEvent(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default EventManager;