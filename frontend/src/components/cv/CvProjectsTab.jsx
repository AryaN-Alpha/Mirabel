import { useState } from "react";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { generateCvSection, regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle, buttonStyle, primaryButtonStyle } from "../CvPage";

function AddProjectForm({ onAdd }) {
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
      const result = await generateCvSection("projects", { title, tech, one_liner: oneLiner });
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
    <div
      className="rounded-2xl p-4 flex flex-col gap-2.5"
      style={{ background: "rgba(243,233,226,0.05)", border: "1px dashed rgba(243,233,226,0.16)" }}
    >
      <p className="text-[11px] uppercase tracking-[0.08em] px-1" style={{ color: "rgba(243,233,226,0.4)" }}>
        + Add project
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Project title"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
      <input
        value={tech}
        onChange={(e) => setTech(e.target.value)}
        placeholder="Tech stack"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Link (optional)"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
      <input
        value={oneLiner}
        onChange={(e) => setOneLiner(e.target.value)}
        placeholder="What does it do?"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
      <button
        onClick={handleGenerate}
        disabled={busy || !title.trim()}
        className="self-start flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
        style={{ ...buttonStyle, opacity: busy || !title.trim() ? 0.5 : 1 }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        Generate with AI
      </button>
      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}
      {draft && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
            style={inputStyle}
          />
          <button
            onClick={handleAccept}
            className="self-start px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
            style={primaryButtonStyle}
          >
            Add to CV
          </button>
        </>
      )}
    </div>
  );
}

function ProjectEntry({ entry, onChange, onRemove }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRewrite() {
    if (!entry.description.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection("projects", entry.description, instructions);
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
    <div
      className="rounded-2xl p-4 flex flex-col gap-2.5"
      style={{ background: "rgba(243,233,226,0.04)", border: "1px solid rgba(243,233,226,0.08)" }}
    >
      <div className="flex gap-2">
        <input
          value={entry.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Project title"
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <input
          value={entry.tech}
          onChange={(e) => onChange({ tech: e.target.value })}
          placeholder="Tech stack"
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
      </div>
      <input
        value={entry.link}
        onChange={(e) => onChange({ link: e.target.value })}
        placeholder="Link (optional)"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
      <textarea
        value={entry.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={4}
        className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
        style={inputStyle}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        className="w-full px-3.5 py-2 rounded-full text-[12.5px] outline-none"
        style={inputStyle}
      />
      <div className="flex items-center justify-between">
        <button
          onClick={handleRewrite}
          disabled={busy || !entry.description.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
          style={{ ...buttonStyle, opacity: busy || !entry.description.trim() ? 0.5 : 1 }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Regenerate
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded-full border-none cursor-pointer"
          style={{ background: "transparent", color: "rgba(224,140,140,0.85)" }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function CvProjectsTab({ sections, updateSections }) {
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
    <div className="flex flex-col gap-5">
      <AddProjectForm onAdd={addEntry} />
      {sections.projects.map((entry) => (
        <ProjectEntry
          key={entry.id}
          entry={entry}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
        />
      ))}
    </div>
  );
}
