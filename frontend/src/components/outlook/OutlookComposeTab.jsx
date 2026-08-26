import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateOutlookCompose, scheduleOutlookMessage, sendOutlookMessage } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle, tabStyle } from "../OutlookPage";

export default function OutlookComposeTab() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const [scheduling, setScheduling] = useState(false);
  const [sendAt, setSendAt] = useState("");

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  const sendAtDate = sendAt ? new Date(sendAt) : null;
  const sendAtInFuture = sendAtDate && !Number.isNaN(sendAtDate.getTime()) && sendAtDate > new Date();

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenError("");
    try {
      const data = await generateOutlookCompose(prompt);
      if (data.error) {
        setGenError("Couldn't generate a draft right now — try again in a bit.");
      } else {
        setBody(data.draft);
      }
    } catch (err) {
      setGenError(getErrorMessage(err, "Couldn't generate a draft."));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    const recipients = to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0 || !subject.trim() || !body.trim()) return;
    if (scheduling && !sendAtInFuture) return;

    setSending(true);
    setSendError("");
    try {
      const payload = { to: recipients, subject: subject.trim(), body: body.replace(/\n/g, "<br>") };
      if (scheduling) {
        await scheduleOutlookMessage({ ...payload, send_at: sendAtDate.toISOString() });
      } else {
        await sendOutlookMessage(payload);
      }
      setSent(true);
    } catch (err) {
      setSendError(getErrorMessage(err, scheduling ? "Couldn't schedule that email." : "Couldn't send that email."));
    } finally {
      setSending(false);
    }
  }

  const canSend =
    to.trim() && subject.trim() && body.trim() && !sending && !sent && (!scheduling || sendAtInFuture);

  return (
    <div className="flex flex-col gap-3">
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="To — comma-separated addresses"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />

      <div className="rounded-2xl p-4" style={{ background: "rgba(243,233,226,0.03)" }}>
        <p className="text-[11px] uppercase tracking-[0.08em] mb-2.5" style={{ color: "rgba(243,233,226,0.4)" }}>
          Generate with AI
        </p>
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should this email say?"
            className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
            style={inputStyle}
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
            style={{
              background: "rgba(243,233,226,0.1)",
              color: "#f3e9e2",
              opacity: generating || !prompt.trim() ? 0.5 : 1,
            }}
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.8} />}
            Generate content via AI
          </button>
        </div>
        {genError && (
          <p className="text-[12px] mt-2.5" style={{ color: "rgba(224,140,140,0.9)" }}>
            {genError}
          </p>
        )}
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your email…"
        rows={10}
        className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
        style={inputStyle}
      />

      <div className="flex items-center gap-1.5 p-[5px] rounded-full w-fit" style={{ background: "rgba(243,233,226,0.06)", border: "1px solid rgba(243,233,226,0.09)" }}>
        <button
          onClick={() => setScheduling(false)}
          className="px-4 py-2 rounded-full text-[12.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
          style={tabStyle(!scheduling)}
        >
          Send now
        </button>
        <button
          onClick={() => setScheduling(true)}
          className="px-4 py-2 rounded-full text-[12.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
          style={tabStyle(scheduling)}
        >
          Schedule for later
        </button>
      </div>

      {scheduling && (
        <input
          type="datetime-local"
          value={sendAt}
          onChange={(e) => setSendAt(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
      )}
      {scheduling && sendAt && !sendAtInFuture && (
        <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          Pick a time in the future.
        </p>
      )}

      {sendError && (
        <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          {sendError}
        </p>
      )}

      <button
        onClick={handleSend}
        disabled={!canSend}
        className="w-full py-3 rounded-full text-[13px] tracking-[0.02em] border-none cursor-pointer transition-opacity duration-200"
        style={{
          background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
          color: "#2c1c16",
          opacity: canSend ? 1 : 0.4,
          cursor: canSend ? "pointer" : "not-allowed",
        }}
      >
        {sent
          ? scheduling
            ? "Scheduled"
            : "Sent"
          : sending
            ? scheduling
              ? "Scheduling…"
              : "Sending…"
            : scheduling
              ? "Schedule"
              : "Send"}
      </button>
    </div>
  );
}
