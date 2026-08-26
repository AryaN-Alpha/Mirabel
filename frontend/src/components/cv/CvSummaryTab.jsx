import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle, buttonStyle } from "../CvPage";

export default function CvSummaryTab({ sections, updateSections }) {
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
      const result = await regenerateCvSection("summary", sections.summary, instructions);
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
    <div className="flex flex-col gap-3">
      <textarea
        value={sections.summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={6}
        placeholder="A short professional summary…"
        className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
        style={inputStyle}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
      <button
        onClick={handleRewrite}
        disabled={busy || !sections.summary.trim()}
        className="self-start flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
        style={{ ...buttonStyle, opacity: busy || !sections.summary.trim() ? 0.5 : 1 }}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        Ask AI to rewrite
      </button>
      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
