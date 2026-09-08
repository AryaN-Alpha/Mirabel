import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getAgentTask, startAgentTask } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, danger, space, cream, glassBorder, surface, radius, motion } from "../homeTheme";
import { ErrorNote, GlassPanel, PanelEyebrow } from "../homeWidgets";
import ChatInput from "../ChatInput";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

const SUGGESTED_PROMPTS = [
  "How is my Threads presence performing?",
  "What is my daily Threads publishing quota remaining?",
  "Suggest 3 viral thread hooks for this week",
  "How can I optimize my Threads profile biography?",
  "Summarize my recent Threads publishing activity",
];

const POLL_INTERVAL_MS = 1500;
const MAX_CONSECUTIVE_POLL_FAILURES = 5;
const NON_TERMINAL = new Set(["queued", "running", "awaiting_confirmation", "awaiting_clarification"]);

export default function ThreadsResearchTab() {
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function ask(instruction) {
    if (busy) return;
    setBusy(true);
    setError("");
    const entryId = `${Date.now()}`;
    setEntries((prev) => [...prev, { id: entryId, instruction, status: "queued", resultText: "" }]);

    function finish(patch) {
      setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e)));
      clearInterval(pollRef.current);
      setBusy(false);
    }

    try {
      const task = await startAgentTask(`Threads: ${instruction}`);
      setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, taskId: task.id, status: task.status } : e)));

      let consecutiveFailures = 0;
      pollRef.current = setInterval(async () => {
        try {
          const updated = await getAgentTask(task.id);
          consecutiveFailures = 0;
          if (NON_TERMINAL.has(updated.status)) {
            setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, status: updated.status } : e)));
            return;
          }
          finish({ status: updated.status, resultText: updated.result_text, errorMessage: updated.error_message });
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            finish({ status: "failed", errorMessage: "Lost connection to the server while researching." });
          }
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't reach the AI research agent."));
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      <div style={entrance(0)}>
        <GlassPanel elevated float={1} delay={-1.3} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={Search}>Threads AI Research &amp; Ideation</PanelEyebrow>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: cream(0.6) }}>
            Ask Mirabel anything about your connected Meta Threads account, content strategy, or quota limits.
            Answers are grounded in real data and platform best practices.
          </p>

          <div className="flex flex-wrap" style={{ gap: space[2], marginTop: space[4] }}>
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => !busy && ask(p)}
                disabled={busy}
                className="border-none cursor-pointer hover:bg-white/10"
                style={{
                  padding: `${space[2]}px ${space[3]}px`,
                  borderRadius: 20,
                  border: `1px solid ${glassBorder.medium}`,
                  background: surface.sunken,
                  fontSize: 12.5,
                  color: cream(0.62),
                  opacity: busy ? 0.5 : 1,
                  transition: `background ${motion.hover}`,
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <ChatInput onSend={ask} disabled={busy} placeholder="Ask Mirabel about your Threads strategy..." />
          </div>
        </GlassPanel>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {entries.length > 0 && (
        <div className="flex flex-col gap-4">
          {entries.map((entry) => (
            <GlassPanel key={entry.id} style={{ padding: `${space[5]}px ${space[6]}px` }}>
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-sm" style={{ color: text.bright }}>
                  {entry.instruction}
                </span>
                {NON_TERMINAL.has(entry.status) ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color: cream(0.5) }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Analyzing your Threads account...</span>
                  </div>
                ) : entry.status === "failed" ? (
                  <span className="text-xs text-red-400">{entry.errorMessage || "Research failed."}</span>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap mt-1" style={{ color: text.cream }}>
                    {entry.resultText}
                  </p>
                )}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
