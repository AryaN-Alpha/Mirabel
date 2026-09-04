import { useEffect, useState } from "react";
import { Loader2, Trash2, Mail } from "lucide-react";
import {
  coverLetterExportUrl,
  createCoverLetter,
  deleteCoverLetter,
  getCoverLetter,
  listCoverLetters,
  updateCoverLetter,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import { GhostLink, OutlineButton, IconButton, ErrorNote, PanelEyebrow } from "../homeWidgets";
import { fieldStyle, textareaFieldStyle } from "./cvFieldStyle";

export default function CvCoverLetterTab({ cvId }) {
  const [letters, setLetters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [letter, setLetter] = useState(null);

  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle");

  function refreshList() {
    listCoverLetters(cvId)
      .then((data) => setLetters(data.cover_letters))
      .catch(() => {});
  }

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvId]);

  useEffect(() => {
    if (!selectedId) {
      setLetter(null);
      return;
    }
    getCoverLetter(cvId, selectedId)
      .then(setLetter)
      .catch((err) => setError(getErrorMessage(err, "Couldn't load that letter.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleGenerate() {
    if (!jobDescription.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const data = await createCoverLetter(cvId, {
        job_description: jobDescription,
        job_title: jobTitle,
        company_name: companyName,
      });
      if (data.error) {
        setError(
          data.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        refreshList();
        setSelectedId(data.id);
        setLetter(data);
        setJobDescription("");
        setJobTitle("");
        setCompanyName("");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't generate a cover letter."));
    } finally {
      setGenerating(false);
    }
  }

  async function handleTextChange(text) {
    setLetter((prev) => ({ ...prev, generated_text: text }));
    setSaveState("saving");
    try {
      await updateCoverLetter(cvId, selectedId, { generated_text: text });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function handleDelete(id) {
    try {
      await deleteCoverLetter(cvId, id);
      if (id === selectedId) {
        setSelectedId(null);
        setLetter(null);
      }
      refreshList();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete that letter."));
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      <div className="flex flex-col" style={{ gap: space[3] }}>
        <PanelEyebrow icon={Mail}>Generate a cover letter</PanelEyebrow>
        <input
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="Job title (optional)"
          style={fieldStyle}
        />
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company (optional)"
          style={fieldStyle}
        />
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={5}
          placeholder="Paste the job description…"
          className="w-full resize-y"
          style={textareaFieldStyle}
        />
        <GhostLink onClick={handleGenerate} disabled={generating || !jobDescription.trim()}>
          {generating && <Loader2 size={13} className="animate-spin" />}
          Generate cover letter →
        </GhostLink>
        <ErrorNote>{error}</ErrorNote>
      </div>

      {letters.length > 0 && (
        <div className="flex flex-col" style={{ gap: space[1] }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: cream(0.4) }}>
            Past letters
          </span>
          {letters.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between"
              style={{
                padding: `${space[2]}px ${space[2]}px`,
                borderRadius: 6,
                background: l.id === selectedId ? "rgba(255,151,131,0.06)" : "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedId(l.id)}
                className="border-none bg-transparent cursor-pointer text-left"
                style={{ fontSize: 13, color: l.id === selectedId ? cream(0.95) : cream(0.6) }}
              >
                {l.job_title || "Untitled"}
                {l.company_name ? ` — ${l.company_name}` : ""}
              </button>
              <IconButton onClick={() => handleDelete(l.id)} title="Delete letter" danger>
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))}
        </div>
      )}

      {letter && (
        <div className="flex flex-col" style={{ gap: space[2] }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: cream(0.4) }}>
              Letter text
            </span>
            {saveState !== "idle" && (
              <span style={{ fontSize: 11, color: cream(0.4) }}>
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Couldn't save"}
              </span>
            )}
          </div>
          <textarea
            value={letter.generated_text}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={12}
            className="w-full resize-y"
            style={textareaFieldStyle}
          />
          <div style={{ marginTop: space[2] }}>
            <OutlineButton onClick={() => window.open(coverLetterExportUrl(cvId, letter.id), "_blank")}>
              Download PDF
            </OutlineButton>
          </div>
        </div>
      )}
    </div>
  );
}
