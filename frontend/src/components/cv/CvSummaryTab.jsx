import { useState } from "react";
import { Loader2 } from "lucide-react";
import { regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space } from "../homeTheme";
import { GhostLink, ErrorNote, underlineInputStyle } from "../homeWidgets";

export default function CvSummaryTab({ cvId, sections, updateSections }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setSummary(value) {
    updateSections((s) => ({ ...s, summary: value }));
  }

  async function handleRewrite() {
    if (!sections.summary.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection(cvId, "summary", sections.summary, instructions);
      if (result.error) {
        setError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        setSummary(result.text);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't rewrite that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <textarea
        value={sections.summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={6}
        placeholder="A short professional summary…"
        className="w-full resize-y"
        style={underlineInputStyle}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        style={{ ...underlineInputStyle, marginTop: space[3] }}
      />
      <div style={{ marginTop: space[4] }}>
        <GhostLink onClick={handleRewrite} disabled={busy || !sections.summary.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Ask AI to rewrite →
        </GhostLink>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
