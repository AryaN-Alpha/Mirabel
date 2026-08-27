import { useEffect, useState } from "react";
import { getOutlookSignature, setOutlookSignature } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import { labelStyle, OutlineButton, ErrorNote } from "../homeWidgets";

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
    return <p style={{ fontSize: 15, color: cream(0.5) }}>Loading…</p>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={labelStyle}>Signature</div>
      <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: space[2], color: cream(0.6) }}>
        Used to sign off AI-generated replies and new emails. Not fetched automatically — paste it once here.
      </p>
      <ErrorNote>{loadError}</ErrorNote>
      <textarea
        value={signatureInput}
        onChange={(e) => setSignatureInput(e.target.value)}
        placeholder={"Best,\nYour Name"}
        rows={4}
        className="w-full resize-y"
        style={{
          marginTop: space[4],
          padding: `${space[3]}px 0`,
          background: "transparent",
          border: 0,
          borderBottom: `1px solid ${cream(0.16)}`,
          color: cream(1),
          fontSize: 15,
          outline: "none",
        }}
      />
      <div className="flex items-center" style={{ gap: space[4], marginTop: space[4] }}>
        <OutlineButton onClick={handleSaveSignature} disabled={sigBusy || !signatureDirty}>
          {sigBusy ? "Saving…" : "Save signature"}
        </OutlineButton>
        <ErrorNote>{sigError}</ErrorNote>
      </div>
    </div>
  );
}
