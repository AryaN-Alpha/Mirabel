import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { generateCvSection, regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import { labelStyle, GhostLink, OutlineButton, IconButton, ErrorNote, entryCardStyle } from "../homeWidgets";
import { fieldStyle, textareaFieldStyle } from "./cvFieldStyle";

function AddProjectForm({ cvId, onAdd }) {
  const [title, setTitle] = useState("");
  const [tech, setTech] = useState("");
  const [link, setLink] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await generateCvSection(cvId, "projects", { title, tech, one_liner: oneLiner });
      if (result.error) {
        setError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        setDraft(result.text);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't generate a description."));
    } finally {
      setBusy(false);
    }
  }

  function handleAccept() {
    onAdd({ id: crypto.randomUUID(), title, tech, link, description: draft });
    setTitle("");
    setTech("");
    setLink("");
    setOneLiner("");
    setDraft("");
  }

  return (
    <div style={{ ...entryCardStyle, border: `1px dashed ${cream(0.16)}`, background: "transparent" }}>
      <div style={labelStyle}>+ Add project</div>
      <div className="flex flex-col" style={{ marginTop: space[3], gap: space[3] }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" style={fieldStyle} />
        <input value={tech} onChange={(e) => setTech(e.target.value)} placeholder="Tech stack" style={fieldStyle} />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (optional)" style={fieldStyle} />
        <input value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} placeholder="What does it do?" style={fieldStyle} />
      </div>
      <div style={{ marginTop: space[3] }}>
        <GhostLink onClick={handleGenerate} disabled={busy || !title.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Generate with AI →
        </GhostLink>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {draft && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full resize-y"
            style={{ ...textareaFieldStyle, marginTop: space[3] }}
          />
          <div style={{ marginTop: space[3] }}>
            <OutlineButton onClick={handleAccept}>Add to CV</OutlineButton>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectEntry({ cvId, entry, onChange, onRemove }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRewrite() {
    if (!entry.description.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection(cvId, "projects", entry.description, instructions);
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
        <div className="flex-1 flex" style={{ gap: space[4] }}>
          <input
            value={entry.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Project title"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <input
            value={entry.tech}
            onChange={(e) => onChange({ tech: e.target.value })}
            placeholder="Tech stack"
            style={{ ...fieldStyle, flex: 1 }}
          />
        </div>
        <IconButton onClick={onRemove} title="Remove project" danger>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <input
        value={entry.link}
        onChange={(e) => onChange({ link: e.target.value })}
        placeholder="Link (optional)"
        style={{ ...fieldStyle, marginTop: space[3] }}
      />
      <textarea
        value={entry.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={4}
        className="w-full resize-y"
        style={{ ...textareaFieldStyle, marginTop: space[3] }}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        style={{ ...fieldStyle, marginTop: space[3] }}
      />
      <div style={{ marginTop: space[3] }}>
        <GhostLink onClick={handleRewrite} disabled={busy || !entry.description.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Regenerate →
        </GhostLink>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function CvProjectsTab({ cvId, sections, updateSections }) {
  function setEntries(fn) {
    updateSections((s) => ({ ...s, projects: fn(s.projects) }));
  }

  function removeEntry(id) {
    setEntries((entries) => entries.filter((e) => e.id !== id));
  }

  function updateEntry(id, patch) {
    setEntries((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addEntry(project) {
    setEntries((entries) => [...entries, project]);
  }

  return (
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      <AddProjectForm cvId={cvId} onAdd={addEntry} />
      {sections.projects.map((entry) => (
        <ProjectEntry
          key={entry.id}
          cvId={cvId}
          entry={entry}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
        />
      ))}
    </div>
  );
}
