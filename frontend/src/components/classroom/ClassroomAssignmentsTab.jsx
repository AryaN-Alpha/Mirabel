import { useEffect, useState } from "react";
import { ClipboardList, Loader2, Sparkles } from "lucide-react";
import { getClassroomCoursework, solveClassroomCoursework } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../ClassroomPage";

const UNSUPPORTED_WORK_TYPES = new Set(["MULTIPLE_CHOICE_QUESTION", "MATERIAL"]);

const WORK_TYPE_LABELS = {
  ASSIGNMENT: "Assignment",
  SHORT_ANSWER_QUESTION: "Short answer",
  MULTIPLE_CHOICE_QUESTION: "Multiple choice",
  MATERIAL: "Material",
};

function formatDue(iso) {
  if (!iso) return "No due date";
  return `Due ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function ClassroomAssignmentsTab({ disabled, onSolved }) {
  const [date, setDate] = useState("");
  const [coursework, setCoursework] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [solvingId, setSolvingId] = useState(null);
  const [solveError, setSolveError] = useState("");

  function load(dateValue) {
    setLoading(true);
    setError("");
    getClassroomCoursework({ date: dateValue || undefined })
      .then((data) => setCoursework(data.coursework))
      .catch((err) => setError(getErrorMessage(err, "Couldn't load assignments.")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load("");
  }, []);

  async function handleSolve(item) {
    setSolvingId(item.id);
    setSolveError("");
    try {
      await solveClassroomCoursework({ course_id: item.course_id, coursework_id: item.id });
      onSolved?.();
    } catch (err) {
      setSolveError(getErrorMessage(err, "Couldn't generate a solution for that assignment."));
    } finally {
      setSolvingId(null);
    }
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4 border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3.5 py-2 rounded-full text-[12.5px] outline-none"
          style={inputStyle}
        />
        <button
          onClick={() => load(date)}
          className="px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
          style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2" }}
        >
          {date ? "Show assignments due that day" : "Show next due assignment"}
        </button>
        {date && (
          <button
            onClick={() => {
              setDate("");
              load("");
            }}
            className="px-3.5 py-2 rounded-full text-[12.5px] border-none cursor-pointer bg-transparent"
            style={{ color: "rgba(243,233,226,0.5)" }}
          >
            Clear
          </button>
        )}
      </div>

      {solveError && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {solveError}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[13px]" style={{ color: "rgba(224,140,140,0.9)" }}>
            {error}
          </p>
          <button
            onClick={() => load(date)}
            className="px-4 py-2 rounded-full text-[13px] border-none cursor-pointer"
            style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2" }}
          >
            Retry
          </button>
        </div>
      ) : !coursework || coursework.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <ClipboardList size={22} strokeWidth={1.6} style={{ color: "rgba(243,233,226,0.3)" }} />
          <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.45)" }}>
            {date ? "Nothing due that day." : "No upcoming assignments found."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {coursework.map((item) => {
            const unsupported = UNSUPPORTED_WORK_TYPES.has(item.workType);
            const solving = solvingId === item.id;
            return (
              <div key={item.id} className="rounded-2xl px-4 py-3.5" style={{ background: "rgba(243,233,226,0.03)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] truncate mb-0.5" style={{ color: "#f3e9e2" }}>
                      {item.title}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(243,233,226,0.4)" }}>
                      {item.course_name} · {WORK_TYPE_LABELS[item.workType] || item.workType} · {formatDue(item.due_datetime)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSolve(item)}
                    disabled={unsupported || solving}
                    title={unsupported ? "Solving this coursework type isn't supported yet." : undefined}
                    className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
                    style={{
                      background: unsupported
                        ? "rgba(243,233,226,0.06)"
                        : "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
                      color: unsupported ? "rgba(243,233,226,0.35)" : "#2c1c16",
                      opacity: solving ? 0.6 : 1,
                      cursor: unsupported ? "default" : "pointer",
                    }}
                  >
                    {solving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.8} />}
                    {solving ? "Solving…" : "Solve with AI"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
