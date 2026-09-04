import { useEffect, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import {
  getClassroomCoursework,
  getClassroomCourseworkDetail,
  solveClassroomCoursework,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { downloadTextFile } from "../../utils/download";
import { fontHeading, fontMono, text, space, radius, cream } from "../homeTheme";
import { GhostLink, OutlineButton, GlassPanel, PanelEyebrow, EmptyState, ErrorNote } from "../homeWidgets";
import { fieldStyle } from "../ClassroomPage";

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
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({}); // id -> { loading, error, data }
  const [instructions, setInstructions] = useState({}); // id -> string

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

  function toggleExpand(item) {
    const nextId = expandedId === item.id ? null : item.id;
    setExpandedId(nextId);
    if (nextId && !details[item.id]) {
      setDetails((prev) => ({ ...prev, [item.id]: { loading: true, error: "", data: null } }));
      getClassroomCourseworkDetail(item.course_id, item.id)
        .then((data) => setDetails((prev) => ({ ...prev, [item.id]: { loading: false, error: "", data } })))
        .catch((err) =>
          setDetails((prev) => ({
            ...prev,
            [item.id]: { loading: false, error: getErrorMessage(err, "Couldn't load the full assignment."), data: null },
          }))
        );
    }
  }

  function handleDownload(item) {
    const detail = details[item.id]?.data;
    const lines = [item.title, item.course_name, ""];
    if (detail?.description) lines.push(detail.description, "");
    if (detail?.attachment_text) lines.push("--- Attached document ---", detail.attachment_text);
    downloadTextFile(`${item.title || "assignment"}.txt`, lines.join("\n"));
  }

  async function handleSolve(item) {
    setSolvingId(item.id);
    setSolveError("");
    try {
      await solveClassroomCoursework({
        course_id: item.course_id,
        coursework_id: item.id,
        extra_instructions: instructions[item.id],
      });
      onSolved?.();
    } catch (err) {
      setSolveError(getErrorMessage(err, "Couldn't generate a solution for that assignment."));
    } finally {
      setSolvingId(null);
    }
  }

  return (
    <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px` }}>
      <PanelEyebrow icon={ClipboardList}>Assignments</PanelEyebrow>
      <fieldset disabled={disabled} className="border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
        <div className="flex items-center flex-wrap" style={{ gap: space[5] ?? 23 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ ...fieldStyle, width: "auto", padding: `${space[2]}px ${space[3]}px`, fontSize: 14, colorScheme: "dark" }}
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
          <div className="w-full flex items-center justify-center" style={{ padding: `${space[7]}px 0`, color: cream(0.4) }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
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
            {coursework.map((item, i) => {
              const unsupported = UNSUPPORTED_WORK_TYPES.has(item.workType);
              const solving = solvingId === item.id;
              const expanded = expandedId === item.id;
              const detail = details[item.id];
              return (
                <div key={item.id} style={{ borderRadius: radius.sm, background: i % 2 === 1 ? cream(0.025) : "transparent" }}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleExpand(item);
                    }}
                    className="no-underline flex items-start justify-between gap-4"
                    style={{ padding: `${space[4]}px ${space[3]}px`, borderBottom: `1px solid ${cream(0.09)}`, color: "inherit" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ fontFamily: fontHeading, fontSize: 20, color: text.base }}>
                        {item.title}
                      </p>
                      <p style={{ fontSize: 12, marginTop: 4, color: cream(0.45) }}>
                        {item.course_name} · {WORK_TYPE_LABELS[item.workType] || item.workType} ·{" "}
                        <span style={{ fontFamily: fontMono, fontVariantNumeric: "tabular-nums" }}>{formatDue(item.due_datetime)}</span>
                      </p>
                    </div>
                    {unsupported && (
                      <span style={{ fontSize: 13, color: cream(0.35), whiteSpace: "nowrap" }} title="Solving this coursework type isn't supported yet.">
                        Not supported
                      </span>
                    )}
                  </a>

                  {expanded && (
                    <div style={{ padding: `0 ${space[3]}px ${space[5]}px`, borderBottom: `1px solid ${cream(0.09)}` }}>
                      {detail?.loading ? (
                        <p style={{ fontSize: 13, color: cream(0.5) }}>Loading full assignment…</p>
                      ) : detail?.error ? (
                        <ErrorNote>{detail.error}</ErrorNote>
                      ) : (
                        <div
                          style={{
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: cream(0.75),
                            whiteSpace: "pre-wrap",
                            maxHeight: 260,
                            overflowY: "auto",
                            padding: space[3],
                            border: `1px solid ${cream(0.09)}`,
                            borderRadius: radius.md,
                          }}
                        >
                          {detail?.data?.description || "No description provided."}
                          {detail?.data?.attachment_text && (
                            <>
                              <p style={{ marginTop: space[4], fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: cream(0.4) }}>
                                Attached document
                              </p>
                              {detail.data.attachment_text}
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex items-center flex-wrap" style={{ gap: space[5] ?? 23, marginTop: space[4] }}>
                        <GhostLink muted disabled={!detail || detail.loading} onClick={() => handleDownload(item)}>
                          Download assignment
                        </GhostLink>
                      </div>

                      {!unsupported && (
                        <>
                          <textarea
                            value={instructions[item.id] || ""}
                            onChange={(e) => setInstructions((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Additional instructions for the AI (optional) — e.g. desired length, tone, or what to focus on"
                            rows={2}
                            maxLength={2000}
                            className="w-full resize-y"
                            style={{ ...fieldStyle, marginTop: space[4], fontSize: 13 }}
                          />
                          <div style={{ marginTop: space[4] }}>
                            <OutlineButton onClick={() => handleSolve(item)} disabled={solving}>
                              {solving && <Loader2 size={13} className="animate-spin" />}
                              {solving ? "Solving…" : "Solve with AI"}
                            </OutlineButton>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </fieldset>
    </GlassPanel>
  );
}
