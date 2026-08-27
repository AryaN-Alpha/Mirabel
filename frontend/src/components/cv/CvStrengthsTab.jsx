import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space } from "../homeTheme";
import { GhostLink, IconButton, ErrorNote, entryCardStyle, underlineInputStyle } from "../homeWidgets";

function emptyStrength() {
  return { id: crypto.randomUUID(), title: "", description: "" };
}

function StrengthEntry({ cvId, entry, onChange, onRemove }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRewrite() {
    if (!entry.description.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection(cvId, "strengths", entry.description, instructions);
      if (result.error) {
        setError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        onChange({ description: result.text });
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't rewrite that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={entryCardStyle}>
      <div className="flex items-start justify-between gap-3">
        <input
          value={entry.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Strength (e.g. Analytical & Problem-Solving)"
          style={{ ...underlineInputStyle, flex: 1 }}
        />
        <IconButton onClick={onRemove} title="Remove strength" danger>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <textarea
        value={entry.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="A short line backing this up…"
        rows={2}
        className="w-full resize-y"
        style={{ ...underlineInputStyle, marginTop: space[3] }}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        style={{ ...underlineInputStyle, marginTop: space[3] }}
      />
      <div style={{ marginTop: space[3] }}>
        <GhostLink onClick={handleRewrite} disabled={busy || !entry.description.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Ask AI to rewrite →
        </GhostLink>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function CvStrengthsTab({ cvId, sections, updateSections }) {
  function setEntries(fn) {
    updateSections((s) => ({ ...s, strengths: fn(s.strengths) }));
  }

  function addEntry() {
    setEntries((entries) => [...entries, emptyStrength()]);
  }

  function removeEntry(id) {
    setEntries((entries) => entries.filter((e) => e.id !== id));
  }

  function updateEntry(id, patch) {
    setEntries((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  return (
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      {sections.strengths.map((entry) => (
        <StrengthEntry
          key={entry.id}
          cvId={cvId}
          entry={entry}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
        />
      ))}
      <GhostLink onClick={addEntry} muted style={{ alignSelf: "flex-start" }}>
        <Plus size={13} /> Add strength
      </GhostLink>
    </div>
  );
}
