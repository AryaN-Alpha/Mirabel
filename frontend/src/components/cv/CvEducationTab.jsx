import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space } from "../homeTheme";
import { GhostLink, IconButton, ErrorNote, entryCardStyle, underlineInputStyle } from "../homeWidgets";

function emptyEducation() {
  return { id: crypto.randomUUID(), school: "", degree: "", location: "", start_date: "", end_date: "", details: "" };
}

function EducationEntry({ cvId, entry, onChange, onRemove }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRewrite() {
    if (!entry.details.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection(cvId, "education", entry.details, instructions);
      if (result.error) {
        setError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        onChange({ details: result.text });
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
        <div className="flex-1 flex flex-col" style={{ gap: space[3] }}>
          <div className="flex" style={{ gap: space[4] }}>
            <input
              value={entry.degree}
              onChange={(e) => onChange({ degree: e.target.value })}
              placeholder="Degree"
              style={{ ...underlineInputStyle, flex: 1 }}
            />
            <input
              value={entry.school}
              onChange={(e) => onChange({ school: e.target.value })}
              placeholder="School"
              style={{ ...underlineInputStyle, flex: 1 }}
            />
          </div>
          <div className="flex" style={{ gap: space[4] }}>
            <input
              value={entry.location}
              onChange={(e) => onChange({ location: e.target.value })}
              placeholder="Location"
              style={{ ...underlineInputStyle, flex: 1 }}
            />
            <input
              value={entry.start_date}
              onChange={(e) => onChange({ start_date: e.target.value })}
              placeholder="Start"
              style={{ ...underlineInputStyle, width: 90, flex: "0 0 auto" }}
            />
            <input
              value={entry.end_date}
              onChange={(e) => onChange({ end_date: e.target.value })}
              placeholder="End"
              style={{ ...underlineInputStyle, width: 90, flex: "0 0 auto" }}
            />
          </div>
        </div>
        <IconButton onClick={onRemove} title="Remove education" danger>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <textarea
        value={entry.details}
        onChange={(e) => onChange({ details: e.target.value })}
        placeholder="Details, honors, coursework…"
        rows={3}
        className="w-full resize-y"
        style={{ ...underlineInputStyle, marginTop: space[4] }}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        style={{ ...underlineInputStyle, marginTop: space[3] }}
      />
      <div style={{ marginTop: space[3] }}>
        <GhostLink onClick={handleRewrite} disabled={busy || !entry.details.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Ask AI to rewrite →
        </GhostLink>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function CvEducationTab({ cvId, sections, updateSections }) {
  function setEntries(fn) {
    updateSections((s) => ({ ...s, education: fn(s.education) }));
  }

  function addEntry() {
    setEntries((entries) => [...entries, emptyEducation()]);
  }

  function removeEntry(id) {
    setEntries((entries) => entries.filter((e) => e.id !== id));
  }

  function updateEntry(id, patch) {
    setEntries((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  return (
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      {sections.education.map((entry) => (
        <EducationEntry
          key={entry.id}
          cvId={cvId}
          entry={entry}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
        />
      ))}
      <GhostLink onClick={addEntry} muted style={{ alignSelf: "flex-start" }}>
        <Plus size={13} /> Add education
      </GhostLink>
    </div>
  );
}
