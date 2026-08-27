import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { processBraindump } from "../../services/api";
import { chatDegradedMessage, getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { labelStyle, GhostLink, IconButton, ErrorNote, entryCardStyle, underlineInputStyle } from "../homeWidgets";

export default function BraindumpPanel({ projectId, onAccept }) {
  const [transcript, setTranscript] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [addingIndex, setAddingIndex] = useState(null);
  const [addedIndexes, setAddedIndexes] = useState(new Set());

  async function handleProcess() {
    if (!transcript.trim()) return;
    setProcessing(true);
    setError("");
    setSuggestions(null);
    setAddedIndexes(new Set());
    try {
      const data = await processBraindump(projectId, transcript);
      if (data.error) {
        setError(chatDegradedMessage(data.reason));
      } else if (data.tasks.length === 0) {
        setError("No actionable tasks found in that.");
      } else {
        setSuggestions(data.tasks);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't process that brain dump."));
    } finally {
      setProcessing(false);
    }
  }

  async function handleAccept(task, index) {
    setAddingIndex(index);
    try {
      await onAccept(task);
      setAddedIndexes((prev) => new Set(prev).add(index));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't add that card."));
    } finally {
      setAddingIndex(null);
    }
  }

  function handleDiscard(index) {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div style={{ paddingBottom: space[6], borderBottom: `1px solid ${cream(0.1)}` }}>
      <div style={labelStyle}>Brain dump → tasks</div>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Ramble about everything you need to do — this'll pull out the actual tasks."
        rows={4}
        maxLength={4000}
        className="w-full resize-y"
        style={{ ...underlineInputStyle, marginTop: space[3] }}
      />
      <div style={{ marginTop: space[3] }}>
        <GhostLink onClick={handleProcess} disabled={processing || !transcript.trim()}>
          {processing && <Loader2 size={13} className="animate-spin" />}
          Process →
        </GhostLink>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-col" style={{ gap: space[3], marginTop: space[5] ?? 23 }}>
          {suggestions.map((task, index) => (
            <div key={index} className="flex items-start justify-between gap-4" style={entryCardStyle}>
              <div className="flex flex-col" style={{ gap: 4 }}>
                <span style={{ fontFamily: fontHeading, fontSize: 18, color: text.base }}>{task.title}</span>
                {task.description_markdown && (
                  <span style={{ fontSize: 13, color: cream(0.55) }}>{task.description_markdown}</span>
                )}
                <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: cream(0.4) }}>
                  {task.priority} priority · {task.effort} effort
                  {task.due_date ? ` · due ${task.due_date}` : ""}
                </span>
              </div>
              {addedIndexes.has(index) ? (
                <span style={{ fontSize: 12, color: "#8fd6a8", flexShrink: 0 }}>Added</span>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton onClick={() => handleAccept(task, index)} disabled={addingIndex === index} title="Add card">
                    {addingIndex === index ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                  </IconButton>
                  <IconButton onClick={() => handleDiscard(index)} title="Discard" danger>
                    <X size={14} />
                  </IconButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
