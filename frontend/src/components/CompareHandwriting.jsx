import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../config";
import { GradientText, ShinyText } from "./reactbits";

const CompareHandwriting = ({ studentId, isReadyForComparison, onComparisonFailed }) => {
  const [comparisonResult, setComparisonResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [randomFact, setRandomFact] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [progress, setProgress] = useState(0);

  // Mismatch action states
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [studentNote, setStudentNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [deletingAssignment, setDeletingAssignment] = useState(false);

  const funFacts = [
    "Handwriting can reveal over 5,000 personality traits!",
    "No two people write the same – even identical twins.",
    "Leonardo da Vinci wrote in mirror writing.",
    "The word 'graphology' comes from Greek: 'graph' = write, 'ology' = study.",
    "Your brain makes over 1000 decisions per second when you write!",
    "Writing by hand activates more regions of the brain than typing.",
    "Cursive writing improves fine motor skills and brain development.",
    "Some schools in the world still teach calligraphy as a subject.",
    "In the digital age, handwritten notes are shown to improve memory retention.",
    "The loops and slants in your handwriting may reflect your mood and confidence.",
  ];

  useEffect(() => {
    if (loading) {
      const timer = setInterval(() => {
        setProgress((prev) => Math.min(prev + Math.floor(Math.random() * 10) + 5, 95));
      }, 800);
      return () => clearInterval(timer);
    } else {
      setProgress(0);
    }
  }, [loading]);

  const handleCompare = async () => {
    const token = sessionStorage.getItem("authToken");
    if (!token) { toast.error("User not authenticated. Please log in."); return; }

    setLoading(true);
    setComparisonResult(null);
    setError(null);
    setShowNoteInput(false);
    setStudentNote("");
    setRandomFact(funFacts[Math.floor(Math.random() * funFacts.length)]);

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/model/compare-handwriting/${studentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = response.data;

      // Both "success" (matched) and "mismatch" (didn't match) are valid completed results
      if (data.status === "success" || data.status === "mismatch") {
        setComparisonResult(data);
        setProgress(100);
        toast.success("Analysis complete!");
      } else {
        throw new Error(data.message || "Comparison failed with an unknown error.");
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || "Server error while comparing handwriting.";
      setError(errorMessage);
      toast.error(`Analysis Failed: ${errorMessage}`);
      if (onComparisonFailed) onComparisonFailed(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAndReupload = async () => {
    const fileId = comparisonResult?.fileId;
    if (!fileId) { toast.error("Cannot identify assignment to delete."); return; }

    const token = sessionStorage.getItem("authToken");
    setDeletingAssignment(true);
    try {
      await axios.delete(`${API_BASE_URL}/api/files/assignment/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Assignment deleted. You can now upload a new one.");
      setComparisonResult(null);
      if (onComparisonFailed) onComparisonFailed(true);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete assignment.");
    } finally {
      setDeletingAssignment(false);
    }
  };

  const handleSubmitWithNote = async () => {
    const fileId = comparisonResult?.fileId;
    if (!fileId) { toast.error("Cannot identify assignment."); return; }
    if (!studentNote.trim()) { toast.error("Please enter an explanation note."); return; }

    const token = sessionStorage.getItem("authToken");
    setSubmittingNote(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/files/assignment/${fileId}/note`,
        { note: studentNote.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Assignment submitted with your note. Your teacher will review it.");
      setComparisonResult(null);
      setShowNoteInput(false);
      setStudentNote("");
      if (onComparisonFailed) onComparisonFailed(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to submit note.");
    } finally {
      setSubmittingNote(false);
    }
  };

  // Determine matched state
  const isMatched = comparisonResult?.matched === true;
  const isMismatch = comparisonResult && comparisonResult.matched === false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-8 p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-100/80"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2.5">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-200/50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </span>
          Handwriting Analysis
        </h3>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <ShinyText text={showDetails ? "Hide details" : "How it works"} speed={3} className="text-sm" />
        </button>
      </div>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-xl text-sm text-slate-700 border border-indigo-100/60">
              <p className="mb-3 font-medium text-indigo-800">Our AI-powered system analyzes:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  "Letter shapes and formations",
                  "Spacing between words and letters",
                  "Pen pressure and stroke patterns",
                  "Slant angles and baseline alignment",
                  "Unique flourishes and signatures",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={handleCompare}
        disabled={!isReadyForComparison || loading || comparisonResult !== null}
        className={`w-full py-3.5 font-semibold rounded-xl flex justify-center items-center gap-2.5 transition-all duration-300 ${
          loading
            ? "bg-slate-300 cursor-not-allowed text-slate-500"
            : isMatched
            ? "bg-emerald-600 text-white cursor-not-allowed shadow-md shadow-emerald-200"
            : isMismatch
            ? "bg-rose-100 text-rose-700 border border-rose-200 cursor-not-allowed"
            : !isReadyForComparison
            ? "bg-slate-200 cursor-not-allowed text-slate-400"
            : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50 hover:-translate-y-0.5"
        }`}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analyzing...
          </>
        ) : isMatched ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Handwriting Verified
          </>
        ) : isMismatch ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Mismatch Detected — See Options Below
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Compare Handwriting
          </>
        )}
      </button>

      {!isReadyForComparison && comparisonResult === null && (
        <p className="text-center text-sm text-slate-400 mt-2.5">
          Upload an assignment first to enable comparison.
        </p>
      )}

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-5"
          >
            <div className="flex justify-between text-xs text-slate-500 mb-1.5">
              <span className="font-medium">Analyzing samples...</span>
              <span className="font-semibold text-indigo-600">{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            {randomFact && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 p-3 bg-amber-50 border border-amber-200/60 rounded-xl text-sm text-amber-800 flex items-start gap-2"
              >
                <span className="text-base leading-none mt-0.5">💡</span>
                <span><strong>Did you know?</strong> {randomFact}</span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Comparison Result ── */}
      <AnimatePresence>
        {comparisonResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`mt-6 p-5 rounded-2xl border-2 ${isMatched ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className={`flex items-center justify-center w-10 h-10 rounded-full ${isMatched ? "bg-emerald-100" : "bg-red-100"}`}>
                {isMatched ? (
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </span>
              <div>
                <h4 className={`text-lg font-bold ${isMatched ? "text-emerald-800" : "text-red-800"}`}>
                  <GradientText
                    colors={isMatched ? ["#059669", "#10b981", "#059669"] : ["#dc2626", "#ef4444", "#dc2626"]}
                    animationSpeed={3}
                  >
                    {isMatched ? "Match Found ✓" : "Mismatch Detected"}
                  </GradientText>
                </h4>
                <p className="text-sm text-slate-500">AI analysis complete</p>
              </div>
            </div>

            {/* Similarity Score */}
            <div className={`p-3 rounded-xl ${isMatched ? "bg-emerald-100/60" : "bg-red-100/60"}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-slate-600">Average Similarity:</span>
                <span className={`text-2xl font-bold ${isMatched ? "text-emerald-700" : "text-red-700"}`}>
                  {comparisonResult.average_similarity?.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1.5">
                Individual page scores: {comparisonResult.individual_similarities?.join("%, ")}%
              </div>
            </div>

            {/* ── Mismatch Action Cards ── */}
            {isMismatch && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-5"
              >
                <p className="text-sm text-red-700 font-medium mb-3">
                  The handwriting doesn't match your sample. Choose an action:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Delete & Re-upload */}
                  <button
                    onClick={handleDeleteAndReupload}
                    disabled={deletingAssignment}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-all text-center group"
                  >
                    <span className="w-10 h-10 rounded-full bg-red-100 group-hover:bg-red-200 flex items-center justify-center transition-colors">
                      {deletingAssignment ? (
                        <svg className="animate-spin h-5 w-5 text-red-600" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </span>
                    <span className="text-sm font-semibold text-red-700">
                      {deletingAssignment ? "Deleting..." : "Delete & Re-upload"}
                    </span>
                    <span className="text-[11px] text-red-500">Remove this and upload a clearer copy</span>
                  </button>

                  {/* Option 2: Submit with Note */}
                  <button
                    onClick={() => setShowNoteInput(true)}
                    disabled={showNoteInput}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center group ${
                      showNoteInput ? "border-amber-300 bg-amber-100" : "border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300"
                    }`}
                  >
                    <span className="w-10 h-10 rounded-full bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center transition-colors">
                      <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold text-amber-700">Submit with Note</span>
                    <span className="text-[11px] text-amber-500">Explain the mismatch to your teacher</span>
                  </button>
                </div>

                {/* Note Input Area */}
                <AnimatePresence>
                  {showNoteInput && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 overflow-hidden"
                    >
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <label className="block text-sm font-medium text-amber-800 mb-2">
                          📝 Explain why the handwriting may look different:
                        </label>
                        <textarea
                          value={studentNote}
                          onChange={(e) => setStudentNote(e.target.value)}
                          placeholder="e.g., 'The lighting was poor when I photographed my assignment' or 'I used a different pen type' or 'This is my handwriting, just written in a hurry'"
                          maxLength={1000}
                          rows={3}
                          className="w-full p-3 border border-amber-200 rounded-xl bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition text-sm resize-none"
                        />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] text-amber-500">{studentNote.length}/1000 characters</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setShowNoteInput(false); setStudentNote(""); }}
                              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSubmitWithNote}
                              disabled={submittingNote || !studentNote.trim()}
                              className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all ${
                                submittingNote || !studentNote.trim()
                                  ? "bg-slate-300 cursor-not-allowed"
                                  : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-md shadow-amber-200/50"
                              }`}
                            >
                              {submittingNote ? "Submitting..." : "Confirm & Submit"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-3"
          >
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CompareHandwriting;