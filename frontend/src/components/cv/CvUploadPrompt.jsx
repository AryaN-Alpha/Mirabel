import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { createCv, uploadCv } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, radius, cream } from "../homeTheme";
import { OutlineButton, ErrorNote } from "../homeWidgets";

export default function CvUploadPrompt({ cvId, onUploaded }) {
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
      // No cvId means there isn't a CV version to upload into yet (the
      // very-first-upload empty state) — create one first, named "Main" to
      // match what a pre-existing single CV was auto-named as during the
      // multi-version migration, then upload into it.
      const targetId = cvId ?? (await createCv("Main")).id;
      const data = await uploadCv(targetId, file);
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
      className="flex flex-col items-center text-center"
      style={{
        padding: space[8] * 1.1,
        border: `1px dashed ${cream(0.18)}`,
        borderRadius: radius.md,
      }}
    >
      {busy ? (
        <>
          <Loader2 size={24} className="animate-spin" style={{ color: cream(0.55) }} />
          <p style={{ fontSize: 14, marginTop: space[4], color: cream(0.6) }}>
            Reading your CV and structuring it — this can take a few seconds…
          </p>
        </>
      ) : (
        <>
          <FileUp size={24} strokeWidth={1.6} style={{ color: cream(0.45) }} />
          <p style={{ fontSize: 17, marginTop: space[4], fontFamily: "inherit", color: cream(0.9) }}>
            Upload your CV to get started
          </p>
          <p style={{ fontSize: 13, marginTop: space[2], maxWidth: 360, lineHeight: 1.7, color: cream(0.5) }}>
            Upload a PDF and Mirabel will read it and break it into editable sections you can tweak by hand or with
            AI.
          </p>
          <div style={{ marginTop: space[5] ?? 23 }}>
            <OutlineButton onClick={() => inputRef.current?.click()}>Choose PDF</OutlineButton>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
