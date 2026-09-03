import { useState } from "react";
import { Loader2 } from "lucide-react";
import { applyCvTailoring, regenerateCvSection, tailorCvToJob } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import { GhostLink, ErrorNote, underlineInputStyle, Tag } from "../homeWidgets";

const SECTION_LABELS = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  certifications: "Certifications",
  skills: "Skills",
  education: "Education",
  strengths: "Strengths",
};

export default function CvTailorTab({ cvId, sections, updateSections, onJumpToTab, onTailoredCvCreated }) {
  const [jobDescription, setJobDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [rewritingSummary, setRewritingSummary] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  async function handleTailor() {
    if (!jobDescription.trim()) return;
    setBusy(true);
    setError("");
    try {
      const data = await tailorCvToJob(cvId, jobDescription);
      if (data.error) {
        setError(
          data.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't check that against your CV."));
    } finally {
      setBusy(false);
    }
  }

  // Only "summary" is a single string, so it's the one section a suggestion
  // can be safely auto-applied to — experience/projects/etc. hold multiple
  // entries and the AI has no way to say *which* one it means, so those just
  // jump to the tab and let the existing per-entry "Ask AI to rewrite"
  // (with the suggestion's note pasted in as instructions) handle it.
  async function handleRewriteSummary(note) {
    setRewritingSummary(true);
    try {
      const res = await regenerateCvSection(cvId, "summary", sections.summary, note);
      if (!res.error) updateSections((s) => ({ ...s, summary: res.text }));
    } catch {
      // silently leave the summary unchanged — the suggestion row stays visible to retry
    } finally {
      setRewritingSummary(false);
    }
  }

  // Applies every current suggestion (summary, skills, and each multi-entry
  // section's flagged notes) in one backend call, into a brand-new CV rather
  // than mutating this one — the original stays exactly as-is either way.
  async function handleApplyAndSave() {
    setApplying(true);
    setApplyError("");
    try {
      const data = await applyCvTailoring(cvId, result.suggestions, result.missing_keywords);
      onTailoredCvCreated?.(data);
    } catch (err) {
      setApplyError(getErrorMessage(err, "Couldn't create the tailored CV."));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: space[4] }}>
      <textarea
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        rows={6}
        placeholder="Paste the job description…"
        className="w-full resize-y"
        style={underlineInputStyle}
      />
      <GhostLink onClick={handleTailor} disabled={busy || !jobDescription.trim()}>
        {busy && <Loader2 size={13} className="animate-spin" />}
        Check against this job →
      </GhostLink>
      <ErrorNote>{error}</ErrorNote>

      {result && (
        <div className="flex flex-col" style={{ gap: space[4], marginTop: space[2] }}>
          <div>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: cream(0.4) }}>
              Match score
            </span>
            <p style={{ fontSize: 22, marginTop: space[1] }}>
              {result.match_score != null ? `${result.match_score}/100` : "—"}
            </p>
          </div>

          {result.missing_keywords.length > 0 && (
            <div>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: cream(0.4) }}>
                Missing keywords
              </span>
              <div className="flex flex-wrap" style={{ gap: space[1], marginTop: space[2] }}>
                {result.missing_keywords.map((kw, i) => (
                  <Tag key={i}>{kw}</Tag>
                ))}
              </div>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div>
              <GhostLink onClick={handleApplyAndSave} disabled={applying}>
                {applying && <Loader2 size={13} className="animate-spin" />}
                Auto-update & save as new CV →
              </GhostLink>
              <p style={{ fontSize: 12, marginTop: space[1], color: cream(0.4) }}>
                Applies these suggestions and saves the result as a new CV — this one is left untouched.
              </p>
              <ErrorNote>{applyError}</ErrorNote>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div className="flex flex-col" style={{ gap: space[3] }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: cream(0.4) }}>
                Suggestions
              </span>
              {result.suggestions.map((s, i) => (
                <div key={i} style={{ fontSize: 13, color: cream(0.75) }}>
                  <span style={{ color: cream(0.45) }}>{SECTION_LABELS[s.section_type] || s.section_type}: </span>
                  {s.note}
                  <div className="flex items-center" style={{ gap: space[4], marginTop: space[1] }}>
                    {s.section_type === "summary" ? (
                      <GhostLink onClick={() => handleRewriteSummary(s.note)} disabled={rewritingSummary} muted>
                        {rewritingSummary && <Loader2 size={11} className="animate-spin" />}
                        Rewrite now →
                      </GhostLink>
                    ) : (
                      <GhostLink onClick={() => onJumpToTab?.(s.section_type)} muted>
                        Jump to {SECTION_LABELS[s.section_type] || s.section_type} →
                      </GhostLink>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
