import React, { useEffect, useState, useRef } from "react";
import DOMPurify from "dompurify";
import { Loader2 } from "lucide-react";
import { generateOutlookReply, getOutlookMessage, replyOutlookMessage } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream, glassBorder, surface } from "../homeTheme";
import { labelStyle, GhostLink, OutlineButton, ErrorNote, underlineInputStyle } from "../homeWidgets";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function ShadowEmail({ html }) {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    let shadow = containerRef.current.shadowRoot;
    if (!shadow) {
      shadow = containerRef.current.attachShadow({ mode: "open" });
    }
    const sanitized = DOMPurify.sanitize(html, { ADD_TAGS: ["style"], ADD_ATTR: ["target"] });
    shadow.innerHTML = sanitized;
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="text-[15px] leading-relaxed overflow-x-auto"
      style={{ color: text.bright, background: "transparent" }}
    />
  );
}

export default function OutlookMessageView({ messageId, onBack }) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [instructions, setInstructions] = useState("");
  const [replyText, setReplyText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getOutlookMessage(messageId)
      .then((data) => {
        if (!cancelled) setMessage(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load this email."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  async function handleGenerate() {
    setGenerating(true);
    setGenError("");
    try {
      const data = await generateOutlookReply(messageId, instructions);
      if (data.error) {
        setGenError("Couldn't generate a draft right now — try again in a bit.");
      } else {
        setReplyText(data.draft);
      }
    } catch (err) {
      setGenError(getErrorMessage(err, "Couldn't generate a draft."));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!replyText.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const textSent = replyText;
      const htmlSent = textSent.replace(/\n/g, "<br>");
      await replyOutlookMessage(messageId, htmlSent);
      setReplyText("");

      const prevThreadLength = message.thread?.length || 0;
      const refreshed = await getOutlookMessage(messageId);
      if ((refreshed.thread?.length || 0) <= prevThreadLength) {
        // Graph hasn't indexed the sent reply under this conversation yet —
        // show it immediately anyway so the send doesn't look like a no-op.
        refreshed.thread = [
          ...(refreshed.thread || []),
          {
            id: `pending-${Date.now()}`,
            is_from_me: true,
            receivedDateTime: new Date().toISOString(),
            body: { content: htmlSent },
          },
        ];
      }
      setMessage(refreshed);
      setJustSent(true);
    } catch (err) {
      setSendError(getErrorMessage(err, "Couldn't send that reply."));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <p style={{ fontSize: 15, color: text.muted }}>Loading message…</p>;
  }

  return (
    <div>
      <GhostLink onClick={onBack} muted>
        ← Back to inbox
      </GhostLink>

      {error ? (
        <ErrorNote>{error}</ErrorNote>
      ) : (
        <>
          <h3
            style={{
              margin: `${space[6]}px 0 0`,
              fontFamily: fontHeading,
              fontSize: "clamp(24px,2.6vw,32px)",
              color: text.bright,
            }}
          >
            {message.subject || "(no subject)"}
          </h3>

          {justSent && (
            <p style={{ marginTop: space[3], fontSize: 14, color: "#34d399", fontWeight: 600 }}>Reply sent successfully.</p>
          )}

          <div style={{ marginTop: space[6] }}>
            {(message.thread || [message]).map((item, i) => (
              <div
                key={item.id}
                style={{
                  paddingTop: i === 0 ? 0 : space[6],
                  marginTop: i === 0 ? 0 : space[6],
                  borderTop: i === 0 ? "none" : `1px solid ${glassBorder}`,
                }}
              >
                <p style={{ fontSize: 14, marginBottom: space[2], color: text.secondary, fontWeight: 500 }}>
                  {item.is_from_me ? "You" : item.from?.emailAddress?.name || item.from?.emailAddress?.address}
                  {" · "}
                  <span style={{ color: text.muted }}>{formatDate(item.receivedDateTime || item.sentDateTime)}</span>
                </p>
                <ShadowEmail html={item.body?.content || ""} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: space[8], paddingTop: space[6], borderTop: `1px solid ${glassBorder}` }}>
            <div style={labelStyle}>{justSent ? "Write another reply" : "Reply"}</div>

            <div className="flex items-center flex-wrap" style={{ gap: space[4], marginTop: space[3] }}>
              <input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional: what should the reply say? (leave blank for a general reply)"
                style={{ ...underlineInputStyle, flex: 1, minWidth: 240, color: text.bright }}
              />
              <GhostLink disabled={generating} onClick={handleGenerate}>
                {generating && <Loader2 size={13} className="animate-spin" />}
                Generate reply →
              </GhostLink>
            </div>
            <ErrorNote>{genError}</ErrorNote>

            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write your reply…"
              rows={7}
              className="w-full resize-y"
              style={{
                marginTop: space[5] ?? 23,
                padding: `${space[5]}px`,
                border: `1px solid ${glassBorder}`,
                borderRadius: 8,
                background: "rgba(255,255,255,0.02)",
                color: text.bright,
                fontSize: 15,
                lineHeight: 1.75,
                outline: "none",
              }}
            />

            <ErrorNote>{sendError}</ErrorNote>

            <div style={{ marginTop: space[5] ?? 23 }}>
              <OutlineButton onClick={handleSend} disabled={sending || !replyText.trim()}>
                {sending ? "Sending…" : "Send reply"}
              </OutlineButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
