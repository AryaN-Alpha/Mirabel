import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getOutlookSignature, setOutlookSignature } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../OutlookPage";

export default function OutlookSignatureTab() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [signatureInput, setSignatureInput] = useState("");
  const [signatureSaved, setSignatureSaved] = useState("");
  const [sigBusy, setSigBusy] = useState(false);
  const [sigError, setSigError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    getOutlookSignature()
      .then((data) => {
        if (cancelled) return;
        setSignatureInput(data.signature);
        setSignatureSaved(data.signature);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err, "Couldn't load your signature."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signatureDirty = signatureInput !== signatureSaved;

  async function handleSaveSignature() {
    setSigBusy(true);
    setSigError("");
    try {
      const data = await setOutlookSignature(signatureInput);
      setSignatureSaved(data.signature);
    } catch (err) {
      setSigError(getErrorMessage(err, "Couldn't save signature."));
    } finally {
      setSigBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] mb-2.5 px-1" style={{ color: "rgba(243,233,226,0.4)" }}>
        Signature
      </p>
      <p className="text-[12px] px-1 mb-2.5" style={{ color: "rgba(243,233,226,0.5)" }}>
        Used to sign off AI-generated replies and new emails. Not fetched automatically — paste it once here.
      </p>
      {loadError && (
        <p className="text-[12px] px-1 mb-2.5" style={{ color: "rgba(224,140,140,0.9)" }}>
          {loadError}
        </p>
      )}
      <textarea
        value={signatureInput}
        onChange={(e) => setSignatureInput(e.target.value)}
        placeholder={"Best,\nYour Name"}
        rows={4}
        className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y mb-2.5"
        style={inputStyle}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleSaveSignature}
          disabled={sigBusy || !signatureDirty}
          className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
          style={{
            background: "rgba(243,233,226,0.1)",
            color: "#f3e9e2",
            opacity: sigBusy || !signatureDirty ? 0.4 : 1,
          }}
        >
          {sigBusy ? "Saving…" : "Save signature"}
        </button>
        {sigError && (
          <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
            {sigError}
          </p>
        )}
      </div>
    </div>
  );
}
