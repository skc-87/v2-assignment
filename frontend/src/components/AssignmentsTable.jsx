import DataTable from "./DataTable";
import EvaluationButton from "./EvaluationButton";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useState } from "react";
import { GradientText } from "./reactbits";

const handleViewFile = async (url, fileName) => {
  try {
    const token = sessionStorage.getItem("authToken");
    const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" });
    const blob = new Blob([response.data], { type: response.headers["content-type"] || "application/octet-stream" });
    const blobUrl = window.URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
    setTimeout(() => window.URL.revokeObjectURL(blobUrl), 120000);
  } catch { alert("Failed to load file. Please try again."); }
};

const VerificationBadge = ({ status, score, studentNote }) => {
  const badgeMap = {
    verified: { bg: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", label: "Verified" },
    mismatch: { bg: "bg-red-50 text-red-700", dot: "bg-red-500", label: "Mismatch" },
    mismatch_with_note: { bg: "bg-amber-50 text-amber-700", dot: "bg-amber-500", label: "Flagged" },
    pending: { bg: "bg-slate-100 text-slate-600", dot: "bg-slate-400", label: "Pending" },
  };
  const badge = badgeMap[status] || badgeMap.pending;

  const [showNote, setShowNote] = useState(false);

  return (
    <div>
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full ${badge.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
        {badge.label}
        {score != null && <span className="ml-0.5 font-bold">{score.toFixed(1)}%</span>}
      </span>
      {status === "mismatch_with_note" && studentNote && (
        <div className="mt-1.5">
          <button
            onClick={() => setShowNote(!showNote)}
            className="text-[11px] text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1 transition-colors"
          >
            📝 {showNote ? "Hide note" : "View student note"}
          </button>
          <AnimatePresence>
            {showNote && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 p-2.5 bg-amber-50 border border-amber-200/60 rounded-lg text-[11px] text-amber-800 italic">
                  "{studentNote}"
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const AssignmentsTable = ({ data, isLoading, API_BASE_URL, searchTerm, handleEvaluate }) => {
  const filteredData = data.filter((assignment) => assignment.studentName?.toLowerCase().includes(searchTerm.toLowerCase()));
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="my-8 p-6 rounded-2xl bg-white/80 backdrop-blur-sm shadow-lg shadow-slate-200/60 border border-slate-100/80">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-200/50">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </span>
            <GradientText colors={["#6366f1", "#8b5cf6", "#6366f1"]} animationSpeed={4}>Assignments</GradientText>
          </h2>
          {filteredData.length > 0 && (
            <span className="px-3 py-1 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded-full">
              {filteredData.length} {filteredData.length === 1 ? 'assignment' : 'assignments'}
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200/80">
          <DataTable title="assignments" data={filteredData}
            columns={[
              { key: "studentName", header: "Student Name", headerClass: "font-semibold text-slate-700", cellClass: "font-medium text-slate-900" },
              { key: "fileName", header: "Title", headerClass: "font-semibold text-slate-700", cellClass: "text-slate-800" },
              { key: "verification", header: "Verification", headerClass: "font-semibold text-slate-700",
                render: (item) => (
                  <VerificationBadge
                    status={item.verificationStatus}
                    score={item.similarityScore}
                    studentNote={item.studentNote}
                  />
                )},
              { key: "uploadDate", header: "Upload Date", headerClass: "font-semibold text-slate-700", cellClass: "text-slate-500", render: (item) => new Date(item.uploadDate).toLocaleString() },
              { key: "actions", header: "File", headerClass: "font-semibold text-slate-700",
                render: (item) => (
                  <button onClick={() => handleViewFile(`${API_BASE_URL}/view-assignment/${item.studentId}`, `assignment-${item.studentName}`)}
                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium text-sm transition-colors cursor-pointer bg-transparent border-none"
                    aria-label={`Download assignment for ${item.studentName}`}>
                    View
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )},
              { key: "evaluation", header: "Evaluation", headerClass: "font-semibold text-slate-700",
                render: (item) => (
                  <EvaluationButton assignment={item} onEvaluate={handleEvaluate} isEvaluated={item.marks !== null && item.marks !== undefined} />
                )}
            ]}
            isLoading={isLoading}
            emptyMessage={
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mb-3">
                  <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-base font-medium text-slate-500">No assignments found</p>
                {searchTerm && <p className="text-sm text-slate-400 mt-1">Try adjusting your search</p>}
              </div>
            }
            rowClass="hover:bg-indigo-50/30 transition-colors duration-150"
            headerClass="bg-slate-50/80 text-left"
            loadingComponent={
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 border-t-indigo-600"></div>
              </div>
            }
          />
        </div>
      </div>
    </motion.div>
  );
};

export default AssignmentsTable;