import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { generateOutlookReply, getOutlookMessage, replyOutlookMessage } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../OutlookPage";

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
    return (
      <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] border-none bg-transparent cursor-pointer w-fit"
        style={{ color: "rgba(243,233,226,0.6)" }}
      >
        <ArrowLeft size={14} strokeWidth={1.8} />
        Back to inbox
      </button>

      {error ? (
        <p className="text-[13px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      ) : (
        <>
          <h3 className="text-[17px]" style={{ color: "#f7ece4" }}>
            {message.subject || "(no subject)"}
          </h3>

          {justSent && (
            <div
              className="rounded-2xl px-5 py-3 text-[13px]"
              style={{
                background: "rgba(120,200,150,0.12)",
                color: "#8fd6a8",
                border: "1px solid rgba(120,200,150,0.25)",
              }}
            >
              Reply sent.
            </div>
          )}

          {(message.thread || [message]).map((item) => (
            <div key={item.id}>
              <p className="text-[12.5px] mb-1.5" style={{ color: "rgba(243,233,226,0.5)" }}>
                {item.is_from_me ? "You" : item.from?.emailAddress?.name || item.from?.emailAddress?.address}
                {" · "}
                {formatDate(item.receivedDateTime || item.sentDateTime)}
              </p>
              <div
                className="rounded-2xl p-5 text-[13.5px] leading-relaxed overflow-x-auto"
                style={{
                  background: item.is_from_me ? "rgba(240,168,120,0.08)" : "rgba(243,233,226,0.04)",
                  color: "#e8dcd4",
                }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(item.body?.content || "", { ADD_ATTR: ["target"] }),
                }}
              />
            </div>
          ))}

          <div className="rounded-2xl p-5" style={{ background: "rgba(243,233,226,0.03)" }}>
            <p className="text-[11px] uppercase tracking-[0.08em] mb-2.5" style={{ color: "rgba(243,233,226,0.4)" }}>
              {justSent ? "Write another reply" : "Reply"}
            </p>

            <div className="flex gap-2 mb-3">
              <input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional: what should the reply say? (leave blank for a general reply)"
                className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
                style={inputStyle}
              />
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
                style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2", opacity: generating ? 0.5 : 1 }}
              >
                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.8} />}
                Generate reply
              </button>
            </div>
            {genError && (
              <p className="text-[12px] mb-3" style={{ color: "rgba(224,140,140,0.9)" }}>
                {genError}
              </p>
            )}

            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write your reply…"
              rows={7}
              className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y mb-3"
              style={inputStyle}
            />

            {sendError && (
              <p className="text-[12px] mb-3" style={{ color: "rgba(224,140,140,0.9)" }}>
                {sendError}
              </p>
            )}

            <button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              className="w-full py-3 rounded-full text-[13px] tracking-[0.02em] border-none cursor-pointer transition-opacity duration-200"
              style={{
                background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
                color: "#2c1c16",
                opacity: sending || !replyText.trim() ? 0.4 : 1,
                cursor: sending || !replyText.trim() ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
