import { useState } from "react";
import { Loader2, PenSquare } from "lucide-react";
import { generateOutlookCompose, scheduleOutlookMessage, sendOutlookMessage } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space } from "../homeTheme";
import { labelStyle, GhostLink, OutlineButton, GlassPanel, PanelEyebrow, TabLink, ErrorNote, underlineInputStyle } from "../homeWidgets";
import { fieldStyle } from "../OutlookPage";

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
    <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px`, maxWidth: 760 }}>
      <PanelEyebrow icon={PenSquare}>Compose</PanelEyebrow>

      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To — comma-separated addresses" style={underlineInputStyle} />
      <div style={{ marginTop: space[4] }}>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={underlineInputStyle} />
      </div>

      <div style={{ marginTop: space[6] }}>
        <div style={labelStyle}>Generate with AI</div>
        <div className="flex items-center flex-wrap" style={{ gap: space[4], marginTop: space[3] }}>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should this email say?"
            style={{ ...underlineInputStyle, flex: 1, minWidth: 220 }}
          />
          <GhostLink disabled={generating || !prompt.trim()} onClick={handleGenerate}>
            {generating && <Loader2 size={13} className="animate-spin" />}
            Generate →
          </GhostLink>
        </div>
        <ErrorNote>{genError}</ErrorNote>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your email…"
        rows={9}
        className="w-full resize-y"
        style={{ ...fieldStyle, marginTop: space[6], padding: `${space[5] ?? 23}px ${space[6]}px`, fontSize: 16, lineHeight: 1.85 }}
      />

      <div className="flex items-center flex-wrap" style={{ gap: space[6], marginTop: space[6] }}>
        <TabLink active={!scheduling} onClick={() => setScheduling(false)}>
          Send now
        </TabLink>
        <TabLink active={scheduling} onClick={() => setScheduling(true)}>
          Schedule for later
        </TabLink>
      </div>

      {scheduling && (
        <input
          type="datetime-local"
          value={sendAt}
          onChange={(e) => setSendAt(e.target.value)}
          style={{ ...underlineInputStyle, marginTop: space[4], colorScheme: "dark" }}
        />
      )}
      {scheduling && sendAt && !sendAtInFuture && <ErrorNote>Pick a time in the future.</ErrorNote>}
      <ErrorNote>{sendError}</ErrorNote>

      <div className="flex items-center" style={{ gap: space[4], marginTop: space[6] }}>
        <OutlineButton onClick={handleSend} disabled={!canSend}>
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
        </OutlineButton>
      </div>
    </GlassPanel>
  );
}
