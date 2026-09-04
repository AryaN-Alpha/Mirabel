// Feature: AI Playlist Generator (spec section 25). Deliberately reuses the
// existing agent/task infrastructure (startAgentTask + approve/reject +
// AgentTaskPanel) instead of a bespoke AI pipeline — CLAUDE.md's "Extending
// the system" section says new LLM call sites should reuse the existing
// tool registry and provider plumbing, not re-derive it. The actual
// playlist-building tools (search_spotify, create_spotify_playlist, ...)
// live in agent/tools/spotify_tools.py; create_spotify_playlist requires
// human confirmation before anything is written to the user's real Spotify
// account (spec section 48), which AgentTaskPanel already renders.
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { approveAgentTask, getAgentTask, rejectAgentTask, startAgentTask } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { text, accent, space, radius, cream, surface, glassBorder, bg } from "../homeTheme";
import { underlineSelectStyle, OutlineButton, ErrorNote, GlassPanel, PanelEyebrow } from "../homeWidgets";
import { fieldStyle } from "./spotifyShared";
import AgentTaskPanel from "../agent/AgentTaskPanel";

const POLL_MS = 1500;
const NON_TERMINAL = new Set(["queued", "running", "awaiting_confirmation", "awaiting_clarification"]);
const MOODS = ["", "Energetic", "Chill", "Focus", "Happy", "Melancholy", "Romantic", "Party"];

const PANEL_PALETTE = {
  text: text.base,
  muted: cream(0.55),
  border: cream(0.16),
  accent: accent[400],
  danger: "rgba(224,140,140,0.95)",
};

export default function SpotifyAIPlaylistTab() {
  const [prompt, setPrompt] = useState("");
  const [mood, setMood] = useState("");
  const [duration, setDuration] = useState("");
  const [task, setTask] = useState(null);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    if (!task || !NON_TERMINAL.has(task.status)) return undefined;
    pollRef.current = setInterval(() => {
      getAgentTask(task.id)
        .then(setTask)
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [task]);

  async function handleGenerate(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setStarting(true);
    setError("");
    const parts = [`Create a Spotify playlist for: "${prompt.trim()}".`];
    if (mood) parts.push(`Mood: ${mood}.`);
    if (duration) parts.push(`Target length: about ${duration} minutes.`);
    parts.push(
      "Search Spotify for fitting tracks, then propose a name and create the playlist with those tracks. Ask before creating anything."
    );
    try {
      const created = await startAgentTask(parts.join(" "));
      setTask(created);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't start playlist generation."));
    } finally {
      setStarting(false);
    }
  }

  async function handleApprove(editedArgs) {
    setBusy(true);
    try {
      setTask(await approveAgentTask(task.id, editedArgs));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't approve."));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      setTask(await rejectAgentTask(task.id));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't reject."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
      <GlassPanel elevated glow style={{ padding: `${space[6]}px ${space[6]}px` }}>
        <PanelEyebrow icon={Sparkles}>AI Playlist Generator</PanelEyebrow>
        <p style={{ fontSize: 14, color: cream(0.55), marginTop: -space[2] }}>
          Describe what you want to hear — Mirabel will search Spotify and propose a playlist for your approval.
        </p>

        <form onSubmit={handleGenerate} style={{ marginTop: space[5] }}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='"An energetic 60-minute workout playlist with modern pop and hip-hop."'
            rows={3}
            disabled={starting}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
          <div className="flex items-center gap-6 flex-wrap" style={{ marginTop: space[4] }}>
            <label className="flex flex-col" style={{ gap: 4, fontSize: 11, color: cream(0.45), textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Mood
              <select value={mood} onChange={(e) => setMood(e.target.value)} style={underlineSelectStyle}>
                {MOODS.map((m) => (
                  <option key={m} value={m} style={{ background: bg }}>
                    {m || "Any"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col" style={{ gap: 4, fontSize: 11, color: cream(0.45), textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Duration (minutes)
              <input
                type="number"
                min={5}
                max={300}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                style={{ ...fieldStyle, width: 100, padding: `${space[2]}px ${space[3]}px` }}
              />
            </label>
          </div>
          <div style={{ marginTop: space[6] }}>
            <OutlineButton onClick={handleGenerate} disabled={starting || !prompt.trim()}>
              {starting ? <Loader2 size={14} className="animate-spin" /> : "Generate Playlist"}
            </OutlineButton>
          </div>
        </form>

        <ErrorNote>{error}</ErrorNote>
      </GlassPanel>

      {task && (
        <div
          style={{
            marginTop: space[6],
            padding: space[5] ?? 23,
            border: `1px solid ${glassBorder.soft}`,
            borderRadius: radius.md,
            background: surface.sunken,
          }}
        >
          <AgentTaskPanel task={task} busy={busy} palette={PANEL_PALETTE} onApprove={handleApprove} onReject={handleReject} />
        </div>
      )}
    </div>
  );
}
