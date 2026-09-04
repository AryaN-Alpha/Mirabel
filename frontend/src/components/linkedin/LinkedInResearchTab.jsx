import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getAgentTask, startAgentTask } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, danger, space, cream, glassBorder, surface, radius, motion } from "../homeTheme";
import { ErrorNote, GlassPanel, PanelEyebrow } from "../homeWidgets";
import ChatInput from "../ChatInput";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

const SUGGESTED_PROMPTS = [
  "How is my LinkedIn doing?",
  "What should I improve on my LinkedIn profile?",
  "What changed on my LinkedIn profile recently?",
  "How is my LinkedIn content performing?",
  "What should I focus on this week for LinkedIn?",
];

const POLL_INTERVAL_MS = 1500;
const MAX_CONSECUTIVE_POLL_FAILURES = 5;
const NON_TERMINAL = new Set(["queued", "running", "awaiting_confirmation", "awaiting_clarification"]);

export default function LinkedInResearchTab() {
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function ask(instruction) {
    if (busy) return; // ChatInput/suggested prompts already gate this, but guard defensively against overlap
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
      const task = await startAgentTask(`LinkedIn: ${instruction}`);
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
          // A transient network blip shouldn't permanently freeze the entry on "Researching…" —
          // keep polling until MAX_CONSECUTIVE_POLL_FAILURES, then surface a real error.
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
          <PanelEyebrow icon={Search}>AI research</PanelEyebrow>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: cream(0.6) }}>
            Ask anything about your connected LinkedIn data. Answers are grounded in what's actually stored —
            profile, profile history, publishing activity, and automation status. LinkedIn is the only data source
            used here.
          </p>

          <div className="flex flex-wrap" style={{ gap: space[2], marginTop: space[4] }}>
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => !busy && ask(p)}
                disabled={busy}
                className="border-none cursor-pointer"
                style={{
                  padding: `${space[2]}px ${space[3]}px`,
                  borderRadius: 20,
                  border: `1px solid ${glassBorder.medium}`,
                  background: surface.sunken,
                  fontSize: 12.5,
                  color: cream(0.62),
                  opacity: busy ? 0.5 : 1,
                  transition: `border-color ${motion.hover}, color ${motion.hover}`,
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div style={{ marginTop: space[5] }}>
            <ChatInput onSend={ask} disabled={busy} />
          </div>

          <ErrorNote>{error}</ErrorNote>
        </GlassPanel>
      </div>

      {entries.length > 0 && (
        <div style={entrance(0.1)}>
          <GlassPanel float={2} delay={-3.7} style={{ padding: `${space[6]}px ${space[7]}px` }}>
            <PanelEyebrow>Research history</PanelEyebrow>
            <div className="flex flex-col" style={{ gap: space[4] }}>
              {entries
                .slice()
                .reverse()
                .map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      padding: `${space[4]}px ${space[5]}px`,
                      borderRadius: radius.md,
                      border: `1px solid ${glassBorder.soft}`,
                      background: surface.sunken,
                    }}
                  >
                    <p style={{ fontFamily: fontHeading, fontSize: 17, color: accent[300] }}>{entry.instruction}</p>
                    {NON_TERMINAL.has(entry.status) ? (
                      <div className="flex items-center" style={{ gap: space[2], marginTop: space[2], color: cream(0.4) }}>
                        <Loader2 size={14} className="animate-spin" />
                        <span style={{ fontSize: 13 }}>Researching…</span>
                      </div>
                    ) : entry.status === "failed" ? (
                      <p style={{ fontSize: 14, marginTop: space[2], color: danger[300] }}>
                        {entry.errorMessage || "Couldn't complete that research."}
                      </p>
                    ) : (
                      <p style={{ fontSize: 15, marginTop: space[2], lineHeight: 1.75, color: text.cream, whiteSpace: "pre-wrap" }}>
                        {entry.resultText || "No answer text was returned."}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
