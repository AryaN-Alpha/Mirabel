import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { uploadCv } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { primaryButtonStyle } from "../CvPage";

export default function CvUploadPrompt({ onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Please upload a PDF file.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await uploadCv(file);
      onUploaded(data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't process that PDF."));
    } finally {
      setBusy(false);
      // Without this, re-selecting the same filename after a failed upload
      // wouldn't fire onChange at all (the input's value hasn't "changed").
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className="rounded-3xl p-10 flex flex-col items-center gap-4 text-center"
      style={{
        background: "linear-gradient(165deg, rgba(46,30,26,0.9), rgba(30,19,17,0.94))",
        border: "1px dashed rgba(243,233,226,0.18)",
      }}
    >
      {busy ? (
        <>
          <Loader2 size={26} className="animate-spin" style={{ color: "rgba(243,233,226,0.6)" }} />
          <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.6)" }}>
            Reading your CV and structuring it — this can take a few seconds…
          </p>
        </>
      ) : (
        <>
          <FileUp size={26} style={{ color: "rgba(243,233,226,0.5)" }} />
          <p className="text-[14px]" style={{ color: "#f7ece4" }}>
            Upload your CV to get started
          </p>
          <p className="text-[12.5px] max-w-[360px]" style={{ color: "rgba(243,233,226,0.5)" }}>
            Upload a PDF and Mirabel will read it and break it into editable sections you can tweak by hand or with AI.
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            className="px-5 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
            style={primaryButtonStyle}
          >
            Choose PDF
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      )}
      {error && (
        <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
