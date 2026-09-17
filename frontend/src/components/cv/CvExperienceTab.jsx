import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream, accent, radius, fontMono } from "../homeTheme";
import { GhostLink, IconButton, ErrorNote, entryCardStyle } from "../homeWidgets";
import { fieldStyle, textareaFieldStyle } from "./cvFieldStyle";

function emptyExperience() {
  return { id: crypto.randomUUID(), title: "", company: "", location: "", start_date: "", end_date: "", bullets: [] };
}

function ExperienceEntry({
  cvId,
  entry,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bulletsText = entry.bullets.join("\n");

  async function handleRewrite() {
    if (!bulletsText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection(cvId, "experience", bulletsText, instructions);
      if (result.error) {
        setError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        onChange({
          bullets: result.text
            .split("\n")
            .map((line) => line.replace(/^[-•]\s*/, "").trim())
            .filter(Boolean),
        });
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't rewrite that."));
    } finally {
      setBusy(false);
    }
  }

  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      style={{
        ...entryCardStyle,
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Role Header: Role index badge, summary preview, reordering arrows & delete */}
      <div
        className="flex items-center justify-between"
        style={{
          marginBottom: space[3],
          paddingBottom: space[2],
          borderBottom: `1px solid ${cream(0.08)}`,
        }}
      >
        <div className="flex items-center min-w-0" style={{ gap: space[2] }}>
          <span
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              letterSpacing: "0.06em",
              padding: "2px 7px",
              borderRadius: radius.sm,
              background: "rgba(255, 151, 131, 0.1)",
              border: "1px solid rgba(255, 151, 131, 0.22)",
              color: accent[300],
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Role #{index + 1}
          </span>
          {(entry.title || entry.company) && (
            <span
              style={{
                fontSize: 12,
                color: cream(0.6),
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {[entry.title, entry.company].filter(Boolean).join(" • ")}
            </span>
          )}
        </div>
        <div className="flex items-center shrink-0" style={{ gap: 2 }}>
          <IconButton disabled={isFirst} onClick={onMoveUp} title={isFirst ? "First role" : "Move up"}>
            <ChevronUp size={15} />
          </IconButton>
          <IconButton disabled={isLast} onClick={onMoveDown} title={isLast ? "Last role" : "Move down"}>
            <ChevronDown size={15} />
          </IconButton>
          <IconButton onClick={onRemove} title="Remove experience" danger>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: space[3] }}>
        <div className="flex" style={{ gap: space[4] }}>
          <input
            value={entry.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Job title"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <input
            value={entry.company}
            onChange={(e) => onChange({ company: e.target.value })}
            placeholder="Company"
            style={{ ...fieldStyle, flex: 1 }}
          />
        </div>
        <div className="flex" style={{ gap: space[4] }}>
          <input
            value={entry.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Location"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <input
            value={entry.start_date}
            onChange={(e) => onChange({ start_date: e.target.value })}
            placeholder="Start"
            style={{ ...fieldStyle, width: 100, flex: "0 0 auto" }}
          />
          <input
            value={entry.end_date}
            onChange={(e) => onChange({ end_date: e.target.value })}
            placeholder="End"
            style={{ ...fieldStyle, width: 100, flex: "0 0 auto" }}
          />
        </div>
      </div>

      <textarea
        value={bulletsText}
        onChange={(e) => onChange({ bullets: e.target.value.split("\n") })}
        placeholder="One bullet per line…"
        rows={4}
        className="w-full resize-y"
        style={{ ...textareaFieldStyle, marginTop: space[4] }}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        style={{ ...fieldStyle, marginTop: space[3] }}
      />
      <div style={{ marginTop: space[3] }}>
        <GhostLink onClick={handleRewrite} disabled={busy || !bulletsText.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Ask AI to rewrite →
        </GhostLink>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function CvExperienceTab({ cvId, sections, updateSections }) {
  function setEntries(fn) {
    updateSections((s) => ({ ...s, experience: fn(s.experience || []) }));
  }

  function addEntry() {
    setEntries((entries) => [...entries, emptyExperience()]);
  }

  function removeEntry(id) {
    setEntries((entries) => entries.filter((e) => e.id !== id));
  }

  function updateEntry(id, patch) {
    setEntries((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function moveEntry(index, direction) {
    const targetIndex = index + direction;
    setEntries((entries) => {
      if (targetIndex < 0 || targetIndex >= entries.length) return entries;
      const next = [...entries];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  const experiences = sections?.experience || [];

  return (
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      {experiences.map((entry, index) => (
        <ExperienceEntry
          key={entry.id || index}
          cvId={cvId}
          entry={entry}
          index={index}
          total={experiences.length}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
          onMoveUp={() => moveEntry(index, -1)}
          onMoveDown={() => moveEntry(index, 1)}
        />
      ))}
      <GhostLink onClick={addEntry} muted style={{ alignSelf: "flex-start" }}>
        <Plus size={13} /> Add experience
      </GhostLink>
    </div>
  );
}

