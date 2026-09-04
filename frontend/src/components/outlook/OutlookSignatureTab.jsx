import { useEffect, useState } from "react";
import { FileSignature, Loader2 } from "lucide-react";
import { getOutlookSignature, setOutlookSignature } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import { OutlineButton, GlassPanel, PanelEyebrow, ErrorNote } from "../homeWidgets";
import { fieldStyle } from "../OutlookPage";

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

  return (
    <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px`, maxWidth: 720 }}>
      <PanelEyebrow icon={FileSignature}>Signature</PanelEyebrow>
      {loading ? (
        <div className="w-full flex items-center justify-center" style={{ padding: `${space[7]}px 0`, color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: cream(0.6) }}>
            Used to sign off AI-generated replies and new emails. Not fetched automatically — paste it once here.
          </p>
          <ErrorNote>{loadError}</ErrorNote>
          <textarea
            value={signatureInput}
            onChange={(e) => setSignatureInput(e.target.value)}
            placeholder={"Best,\nYour Name"}
            rows={4}
            className="w-full resize-y"
            style={{ ...fieldStyle, marginTop: space[4], fontSize: 15, lineHeight: 1.7 }}
          />
          <div className="flex items-center" style={{ gap: space[4], marginTop: space[4] }}>
            <OutlineButton onClick={handleSaveSignature} disabled={sigBusy || !signatureDirty}>
              {sigBusy ? "Saving…" : "Save signature"}
            </OutlineButton>
            <ErrorNote>{sigError}</ErrorNote>
          </div>
        </>
      )}
    </GlassPanel>
  );
}
