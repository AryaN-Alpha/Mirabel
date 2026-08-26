import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { processBraindump } from "../../services/api";
import { chatDegradedMessage, getErrorMessage } from "../../utils/errors";
import { cardStyle, inputStyle } from "../KanbanPage";

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
    <div className="rounded-3xl p-5 flex flex-col gap-3" style={cardStyle}>
      <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "rgba(243,233,226,0.4)" }}>
        Brain dump → tasks
      </p>
      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Ramble about everything you need to do — this'll pull out the actual tasks."
        rows={4}
        maxLength={4000}
        className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
        style={inputStyle}
      />
      <button
        onClick={handleProcess}
        disabled={processing || !transcript.trim()}
        className="self-start flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
        style={{
          background: "rgba(243,233,226,0.1)",
          color: "#f3e9e2",
          opacity: processing || !transcript.trim() ? 0.5 : 1,
        }}
      >
        {processing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.8} />}
        Process
      </button>

      {error && (
        <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {suggestions.map((task, index) => (
            <div
              key={index}
              className="rounded-2xl p-3 flex items-start justify-between gap-3"
              style={{ background: "rgba(243,233,226,0.04)", border: "1px solid rgba(243,233,226,0.08)" }}
            >
              <div className="flex flex-col gap-1">
                <p className="text-[13px]" style={{ color: "#f3e9e2" }}>
                  {task.title}
                </p>
                {task.description_markdown && (
                  <p className="text-[11.5px]" style={{ color: "rgba(243,233,226,0.5)" }}>
                    {task.description_markdown}
                  </p>
                )}
                <p className="text-[10.5px]" style={{ color: "rgba(243,233,226,0.35)" }}>
                  {task.priority} priority · {task.effort} effort
                  {task.due_date ? ` · due ${task.due_date}` : ""}
                </p>
              </div>
              {addedIndexes.has(index) ? (
                <span className="text-[11px] shrink-0" style={{ color: "#8fd6a8" }}>
                  Added
                </span>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleAccept(task, index)}
                    disabled={addingIndex === index}
                    className="w-7 h-7 grid place-items-center rounded-full border-none cursor-pointer"
                    style={{ background: "rgba(140,190,160,0.16)", color: "#8fd6a8" }}
                  >
                    {addingIndex === index ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                  </button>
                  <button
                    onClick={() => handleDiscard(index)}
                    className="w-7 h-7 grid place-items-center rounded-full border-none cursor-pointer"
                    style={{ background: "rgba(224,140,140,0.14)", color: "rgba(224,140,140,0.8)" }}
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
