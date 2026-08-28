import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { deleteClassroomDraft, listClassroomDrafts, turnInClassroomDraft, updateClassroomDraft } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { downloadTextFile } from "../../utils/download";
import { fontHeading, text, space, cream } from "../homeTheme";
import { GhostLink, OutlineButton, EmptyState, ErrorNote, underlineInputStyle } from "../homeWidgets";

const CONFIRM_WINDOW_MS = 4000;

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ClassroomDraftsTab({ disabled, onChanged }) {
  const [drafts, setDrafts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listClassroomDrafts()
      .then((data) => {
        if (!cancelled) setDrafts(data.drafts);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load drafts."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loading) {
    return <p style={{ fontSize: 15, color: cream(0.5) }}>Loading…</p>;
  }

  if (error) {
    return (
      <EmptyState>
        {error}
        <br />
        <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
      </EmptyState>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <EmptyState>
        <FileText size={22} strokeWidth={1.6} style={{ color: cream(0.3), display: "block", margin: "0 auto 12px" }} />
        No drafts yet — solve an assignment from the Assignments tab.
      </EmptyState>
    );
  }

  return (
    <fieldset disabled={disabled} className="flex flex-col border-none p-0 m-0" style={{ opacity: disabled ? 0.5 : 1 }}>
      {drafts.map((draft) => (
        <DraftRow
          key={draft.id}
          draft={draft}
          expanded={expandedId === draft.id}
          onToggle={() => setExpandedId((id) => (id === draft.id ? null : draft.id))}
          onChanged={() => {
            setReloadToken((n) => n + 1);
            onChanged?.();
          }}
        />
      ))}
    </fieldset>
  );
}

function DraftRow({ draft, expanded, onToggle, onChanged }) {
  const [answerText, setAnswerText] = useState(draft.answer_text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const confirmTimerRef = useRef(null);

  const isTurnedIn = draft.status === "turned_in";

  function handleDownloadAnswer() {
    downloadTextFile(`${draft.coursework_title || "answer"}.txt`, answerText);
  }

  function handleDownloadAssignment() {
    const lines = [draft.coursework_title, draft.course_name, ""];
    if (draft.coursework_description) lines.push(draft.coursework_description, "");
    if (draft.attachment_text) lines.push("--- Attached document ---", draft.attachment_text);
    downloadTextFile(`${draft.coursework_title || "assignment"}.txt`, lines.join("\n"));
  }

  useEffect(() => {
    return () => clearTimeout(confirmTimerRef.current);
  }, []);

  async function handleSave() {
    setBusy(true);
    setError("");
    try {
      await updateClassroomDraft(draft.id, { answer_text: answerText });
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that draft."));
    } finally {
      setBusy(false);
    }
  }

  function handleTurnInClick() {
    if (!confirming) {
      setConfirming(true);
      confirmTimerRef.current = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
      return;
    }
    clearTimeout(confirmTimerRef.current);
    setConfirming(false);
    doTurnIn();
  }

  async function doTurnIn() {
    setBusy(true);
    setError("");
    try {
      await updateClassroomDraft(draft.id, { answer_text: answerText });
      await turnInClassroomDraft(draft.id);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't turn that assignment in."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      await deleteClassroomDraft(draft.id);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete that draft."));
      setBusy(false);
    }
  }

  return (
    <div style={{ borderBottom: `1px solid ${cream(0.09)}` }}>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className="no-underline flex items-start justify-between gap-4"
        style={{ padding: `${space[5] ?? 23}px ${space[3]}px`, color: "inherit" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate" style={{ fontFamily: fontHeading, fontSize: 20, color: text.base }}>
            {draft.coursework_title || "(untitled)"}
          </p>
          <p style={{ fontSize: 12, marginTop: 4, color: cream(0.45) }}>
            {draft.course_name} · {isTurnedIn ? "Turned in" : "Draft"} · {formatDate(draft.updated_at)}
          </p>
        </div>
      </a>

      {expanded && (
        <div style={{ padding: `0 ${space[3]}px ${space[5]}px` }}>
          <GhostLink muted onClick={() => setShowAssignment((v) => !v)}>
            {showAssignment ? "Hide original assignment" : "View original assignment"}
          </GhostLink>

          {showAssignment && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: cream(0.7),
                whiteSpace: "pre-wrap",
                maxHeight: 220,
                overflowY: "auto",
                marginTop: space[3],
                padding: space[3],
                border: `1px solid ${cream(0.09)}`,
                borderRadius: 6,
              }}
            >
              {draft.coursework_description || "No description provided."}
              {draft.attachment_text && (
                <>
                  <p style={{ marginTop: space[3], fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: cream(0.4) }}>
                    Attached document
                  </p>
                  {draft.attachment_text}
                </>
              )}
            </div>
          )}

          {draft.extra_instructions && (
            <p style={{ fontSize: 12, marginTop: space[3], color: cream(0.45), fontStyle: "italic" }}>
              Instructions given: {draft.extra_instructions}
            </p>
          )}

          <div className="flex items-center flex-wrap" style={{ gap: space[5] ?? 23, marginTop: space[4] }}>
            <GhostLink muted onClick={handleDownloadAssignment}>
              Download assignment
            </GhostLink>
            <GhostLink muted onClick={handleDownloadAnswer} disabled={!answerText.trim()}>
              Download answer
            </GhostLink>
          </div>

          {isTurnedIn ? (
            <p style={{ fontSize: 13, marginTop: space[4], color: cream(0.5) }}>
              Turned in {formatDate(draft.google_turned_in_at)}.
              {draft.solution_doc_url && (
                <>
                  {" "}
                  <a href={draft.solution_doc_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    View the submitted doc ↗
                  </a>
                </>
              )}
            </p>
          ) : (
            <>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                rows={6}
                className="w-full resize-y"
                style={{ ...underlineInputStyle, marginTop: space[4] }}
              />
              <ErrorNote>{error}</ErrorNote>
              <div className="flex items-center" style={{ gap: space[5] ?? 23, marginTop: space[4] }}>
                <GhostLink onClick={handleSave} disabled={busy} muted>
                  Save
                </GhostLink>
                <OutlineButton onClick={handleTurnInClick} disabled={busy || !answerText.trim()} danger={confirming}>
                  {confirming ? "Confirm turn-in?" : "Turn in"}
                </OutlineButton>
                <GhostLink onClick={handleDelete} disabled={busy} danger>
                  Delete
                </GhostLink>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
