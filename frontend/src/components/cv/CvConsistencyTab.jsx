import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { checkCvConsistency, regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream, danger, warning } from "../homeTheme";
import { GhostLink, ErrorNote, PanelEyebrow, EmptyState } from "../homeWidgets";

const SECTION_LABELS = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  certifications: "Certifications",
  skills: "Skills",
  education: "Education",
  strengths: "Strengths",
};

const SEVERITY_COLOR = {
  high: danger[400],
  medium: warning[400],
  low: cream(0.5),
};

export default function CvConsistencyTab({ cvId, sections, updateSections, onJumpToTab }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState(null);
  const [rewritingSummary, setRewritingSummary] = useState(false);

  async function handleCheck() {
    setBusy(true);
    setError("");
    try {
      const data = await checkCvConsistency(cvId);
      if (data.error) {
        setError(
          data.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        setIssues(data.issues);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't check your CV."));
    } finally {
      setBusy(false);
    }
  }

  // Same summary-only auto-apply reasoning as CvTailorTab.jsx — it's the
  // one section that isn't a list of entries, so a fix note can be applied
  // unambiguously; everything else just jumps to its tab.
  async function handleRewriteSummary(message) {
    setRewritingSummary(true);
    try {
      const res = await regenerateCvSection(cvId, "summary", sections.summary, message);
      if (!res.error) updateSections((s) => ({ ...s, summary: res.text }));
    } catch {
      // leave it unchanged — the issue stays visible to retry
    } finally {
      setRewritingSummary(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: space[4] }}>
      <PanelEyebrow icon={ShieldCheck}>Consistency check</PanelEyebrow>
      <GhostLink onClick={handleCheck} disabled={busy} style={{ marginTop: -space[2] }}>
        {busy && <Loader2 size={13} className="animate-spin" />}
        Check my CV →
      </GhostLink>
      <ErrorNote>{error}</ErrorNote>

      {issues && issues.length === 0 && <EmptyState>No consistency issues found — looks good.</EmptyState>}

      {issues && issues.length > 0 && (
        <div className="flex flex-col" style={{ gap: space[3] }}>
          {issues.map((issue, i) => (
            <div
              key={i}
              style={{
                fontSize: 13,
                padding: space[3],
                borderRadius: 6,
                borderLeft: `2px solid ${SEVERITY_COLOR[issue.severity] || SEVERITY_COLOR.medium}`,
                background: "rgba(7,6,8,0.3)",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: SEVERITY_COLOR[issue.severity] || SEVERITY_COLOR.medium,
                }}
              >
                {issue.severity}
              </span>
              <span style={{ color: cream(0.45) }}> · {SECTION_LABELS[issue.section_type] || issue.section_type}</span>
              <p style={{ color: cream(0.75), marginTop: space[1] }}>{issue.message}</p>
              <div className="flex items-center" style={{ gap: space[4], marginTop: space[1] }}>
                {issue.section_type === "summary" ? (
                  <GhostLink onClick={() => handleRewriteSummary(issue.message)} disabled={rewritingSummary} muted>
                    {rewritingSummary && <Loader2 size={11} className="animate-spin" />}
                    Rewrite now →
                  </GhostLink>
                ) : (
                  <GhostLink onClick={() => onJumpToTab?.(issue.section_type)} muted>
                    Jump to {SECTION_LABELS[issue.section_type] || issue.section_type} →
                  </GhostLink>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
