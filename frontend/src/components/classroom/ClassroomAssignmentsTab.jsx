import { useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import { getClassroomCoursework, solveClassroomCoursework } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { GhostLink, OutlineButton, EmptyState, ErrorNote } from "../homeWidgets";

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
    <fieldset disabled={disabled} className="border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
      <div className="flex items-center flex-wrap" style={{ gap: space[5] ?? 23 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{
            padding: `${space[2]}px 0`,
            background: "transparent",
            border: 0,
            borderBottom: `1px solid ${cream(0.16)}`,
            color: text.cream,
            fontSize: 15,
            outline: "none",
            colorScheme: "dark",
          }}
        />
        <GhostLink onClick={() => load(date)}>
          {date ? "Show assignments due that day" : "Show next due assignment"}
        </GhostLink>
        {date && (
          <GhostLink
            muted
            onClick={() => {
              setDate("");
              load("");
            }}
          >
            Clear
          </GhostLink>
        )}
      </div>

      <ErrorNote>{solveError}</ErrorNote>

      {loading ? (
        <p style={{ fontSize: 15, marginTop: space[6], color: cream(0.5) }}>Loading…</p>
      ) : error ? (
        <EmptyState>
          {error}
          <br />
          <GhostLink onClick={() => load(date)}>Retry</GhostLink>
        </EmptyState>
      ) : !coursework || coursework.length === 0 ? (
        <EmptyState>
          <ClipboardList size={22} strokeWidth={1.6} style={{ color: cream(0.3), display: "block", margin: "0 auto 12px" }} />
          {date ? "Nothing due that day." : "No upcoming assignments found."}
        </EmptyState>
      ) : (
        <div className="flex flex-col" style={{ marginTop: space[6] }}>
          {coursework.map((item) => {
            const unsupported = UNSUPPORTED_WORK_TYPES.has(item.workType);
            const solving = solvingId === item.id;
            return (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4"
                style={{ padding: `${space[5] ?? 23}px ${space[3]}px`, borderBottom: `1px solid ${cream(0.09)}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontFamily: fontHeading, fontSize: 20, color: text.base }}>
                    {item.title}
                  </p>
                  <p style={{ fontSize: 12, marginTop: 4, color: cream(0.45) }}>
                    {item.course_name} · {WORK_TYPE_LABELS[item.workType] || item.workType} · {formatDue(item.due_datetime)}
                  </p>
                </div>
                {unsupported ? (
                  <span style={{ fontSize: 13, color: cream(0.35), whiteSpace: "nowrap" }} title="Solving this coursework type isn't supported yet.">
                    Not supported
                  </span>
                ) : (
                  <OutlineButton onClick={() => handleSolve(item)} disabled={solving}>
                    {solving && <Loader2 size={13} className="animate-spin" />}
                    {solving ? "Solving…" : "Solve with AI"}
                  </OutlineButton>
                )}
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
