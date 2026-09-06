import { useEffect, useRef, useState } from "react";
import { Bot, Keyboard, Mic, MicOff, MessageCircle, SquarePen, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useVoiceSessionContext } from "../hooks/VoiceSessionProvider";

import AgentTaskPanel from "./agent/AgentTaskPanel";
import ChatInput from "./ChatInput";
import { getErrorMessage } from "../utils/errors";
import { fontHeading } from "./homeTheme";

const AGENT_PALETTE = {
  text: "rgba(246,248,255,0.92)",
  muted: "rgba(246,248,255,0.48)",
  border: "rgba(236,48,19,0.22)",
  accent: "#ec3013",
  danger: "rgba(236,80,60,0.95)",
};

// Portable version of VoiceChatScreen — reads the same shared session (see
// VoiceSessionProvider) so it's the same conversation and mic/agent-mode
// state as the full voice page, just rendered as a floating bubble + panel.
// Mounted once in HomeLayout, same "always mounted, survives tab switches"
// pattern as SpotifyNowPlayingBar.
export default function GlobalChatWidget() {
  const {
    connected,
    transcript,
    streamingText,
    thinking,
    wsError,
    agentTaskNudge,
    micOn,
    micError,
    agentModeOn,
    stopMic,
    toggleMic,
    pushToTalkKeyLabel,
    recordingHotkey,
    beginRecordingHotkey,
    cancelRecordingHotkey,
    setAgentMode,
    sendText,
    startNewChat,
    micAnalyserRef,
    playbackAnalyserRef,
    agentTask,
    approveCurrentAgentTask,
    rejectCurrentAgentTask,
    answerCurrentAgentTask,
  } = useVoiceSessionContext();

  const [open, setOpen] = useState(false);
  const [agentTaskBusy, setAgentTaskBusy] = useState(false);
  const [agentTaskError, setAgentTaskError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, transcript, streamingText, agentTask]);

  // The mic/VAD instance lives in the shared session (VoiceSessionProvider),
  // not this component, so it keeps recording after the panel is closed
  // unless we explicitly stop it here — closing the widget must mean the
  // mic stops listening too, not just that the panel is hidden. Only fires
  // on the open->closed transition (not on every render where !open &&
  // micOn) — the push-to-talk hotkey can now start the mic while this panel
  // is closed, and a naive "!open && micOn" check would immediately stop
  // that mic again on the very next render, defeating the point of a
  // hands-free hotkey that doesn't require the panel to be open.
  const wasOpenRef = useRef(open);
  useEffect(() => {
    if (wasOpenRef.current && !open && micOn) {
      stopMic();
    }
    wasOpenRef.current = open;
  }, [open, micOn, stopMic]);

  async function handleAgentDecision(action, editedArgs) {
    setAgentTaskBusy(true);
    setAgentTaskError("");
    try {
      await (action === "approve" ? approveCurrentAgentTask(editedArgs) : rejectCurrentAgentTask());
    } catch (err) {
      setAgentTaskError(getErrorMessage(err, "Couldn't update that task."));
    } finally {
      setAgentTaskBusy(false);
    }
  }

  async function handleAgentAnswer(answer) {
    setAgentTaskBusy(true);
    setAgentTaskError("");
    try {
      await answerCurrentAgentTask(answer);
    } catch (err) {
      setAgentTaskError(getErrorMessage(err, "Couldn't send that answer."));
    } finally {
      setAgentTaskBusy(false);
    }
  }

  const subline = micError
    ? micError
    : wsError
    ? wsError
    : agentTaskNudge
    ? agentTaskNudge
    : agentModeOn
    ? "Agent mode. Tell me what to do and I'll go actually do it."
    : micOn
    ? "I am listening. Say anything — there is no wrong way to start."
    : "Type, or tap the mic — I'm right here.";

  return (
    <>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.94 }}
        className="fixed border-none cursor-pointer grid place-items-center transition-all duration-300"
        style={{
          right: 24,
          bottom: 100,
          zIndex: 50,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: open
            ? "radial-gradient(circle at 40% 35%, rgba(236,48,19,0.35), rgba(12,11,16,0.96) 75%)"
            : "radial-gradient(circle at 40% 35%, rgba(236,48,19,0.70), rgba(12,11,16,0.95) 75%)",
          border: open ? "1px solid rgba(236,48,19,0.50)" : "1px solid rgba(236,48,19,0.45)",
          boxShadow: open
            ? "0 12px 34px rgba(0,0,0,0.65), 0 0 22px rgba(236,48,19,0.25)"
            : "0 12px 34px rgba(0,0,0,0.65), 0 0 26px rgba(236,48,19,0.35)",
          color: "rgba(246,248,255,0.95)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
        aria-label={open ? "Close chat with Mirabel" : "Open chat with Mirabel"}
      >
        {open ? <X size={22} strokeWidth={1.8} /> : <MessageCircle size={22} strokeWidth={1.8} />}
        {!open && connected && (
          <span
            className="absolute rounded-full"
            style={{
              top: 7,
              right: 7,
              width: 9,
              height: 9,
              background: "#ec3013",
              border: "2px solid rgba(12,11,16,0.95)",
              boxShadow: "0 0 8px rgba(236,48,19,0.9)",
            }}
          />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
            className="fixed flex flex-col"
            style={{
              right: 24,
              bottom: 168,
              zIndex: 50,
              width: 384,
              maxWidth: "calc(100vw - 32px)",
              height: 580,
              maxHeight: "calc(100vh - 200px)",
              borderRadius: 24,
              background: "linear-gradient(170deg, rgba(14,13,18,0.92) 0%, rgba(8,7,12,0.97) 100%)",
              border: "1px solid rgba(246,248,255,0.10)",
              borderTop: "1px solid rgba(236,48,19,0.35)",
              boxShadow: "0 28px 80px rgba(0,0,0,0.75), 0 0 35px rgba(236,48,19,0.10), inset 0 1px 0 rgba(255,255,255,0.06)",
              backdropFilter: "blur(28px) saturate(120%)",
              WebkitBackdropFilter: "blur(28px) saturate(120%)",
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0"
              style={{
                borderBottom: "1px solid rgba(246,248,255,0.08)",
                background: "linear-gradient(180deg, rgba(236,48,19,0.08) 0%, transparent 100%)",
              }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[20px]"
                    style={{
                      fontFamily: fontHeading,
                      fontStyle: "italic",
                      color: "rgba(248,250,255,0.98)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Mirabel
                  </span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: connected ? "#ec3013" : "rgba(246,248,255,0.3)",
                      boxShadow: connected ? "0 0 8px rgba(236,48,19,0.8)" : "none",
                    }}
                  />
                </div>
                <div className="mt-1 text-[12px] font-light leading-[1.5]" style={{ color: "rgba(246,248,255,0.50)" }}>
                  {subline}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={startNewChat}
                  className="w-8 h-8 grid place-items-center rounded-full border-none cursor-pointer transition-all duration-200 hover:scale-105"
                  style={{
                    background: "rgba(246,248,255,0.06)",
                    border: "1px solid rgba(246,248,255,0.08)",
                    color: "rgba(246,248,255,0.70)",
                  }}
                  aria-label="Start a new chat"
                  title="Start a new chat"
                >
                  <SquarePen size={14} strokeWidth={1.8} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 grid place-items-center rounded-full border-none cursor-pointer transition-all duration-200 hover:scale-105"
                  style={{
                    background: "rgba(246,248,255,0.06)",
                    border: "1px solid rgba(246,248,255,0.08)",
                    color: "rgba(246,248,255,0.70)",
                  }}
                  aria-label="Close chat"
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-4 py-2">
              <AnimatePresence>
                {transcript && (
                  <motion.div
                    key="transcript"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1 items-end"
                  >
                    <div
                      className="max-w-[85%] px-4 py-2.5 text-[13.5px] font-normal leading-[1.6]"
                      style={{
                        borderRadius: "18px 18px 5px 18px",
                        background: "linear-gradient(135deg, rgba(236,48,19,0.22) 0%, rgba(180,30,10,0.16) 100%)",
                        border: "1px solid rgba(236,48,19,0.36)",
                        color: "rgba(248,250,255,0.95)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.25), 0 0 12px rgba(236,48,19,0.12)",
                      }}
                    >
                      {transcript}
                    </div>
                  </motion.div>
                )}
                {streamingText && (
                  <motion.div
                    key="streaming"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1 items-start"
                  >
                    <div
                      className="max-w-[85%] px-4 py-2.5 text-[13.5px] font-normal leading-[1.6]"
                      style={{
                        borderRadius: "18px 18px 18px 5px",
                        background: "rgba(246,248,255,0.05)",
                        border: "1px solid rgba(246,248,255,0.09)",
                        color: "rgba(242,244,251,0.92)",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      {streamingText}
                    </div>
                  </motion.div>
                )}
                {agentTask && (
                  <motion.div
                    key="agent-task"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1 items-start"
                  >
                    <div
                      className="max-w-[92%] px-4 py-3 text-[13.5px] font-normal leading-[1.6]"
                      style={{
                        borderRadius: "18px 18px 18px 5px",
                        background: "rgba(246,248,255,0.05)",
                        border: "1px solid rgba(236,48,19,0.22)",
                        color: "rgba(246,248,255,0.92)",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      <AgentTaskPanel
                        task={agentTask}
                        busy={agentTaskBusy}
                        palette={AGENT_PALETTE}
                        onApprove={(editedArgs) => handleAgentDecision("approve", editedArgs)}
                        onReject={() => handleAgentDecision("reject")}
                        onAnswer={(answer) => handleAgentAnswer(answer)}
                      />
                      {agentTaskError && (
                        <p style={{ fontSize: 11.5, marginTop: 6, color: AGENT_PALETTE.danger }}>{agentTaskError}</p>
                      )}
                    </div>
                  </motion.div>
                )}
                {thinking && (
                  <motion.div
                    key="thinking"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-2 py-1"
                  >
                    <div className="flex space-x-1.5 items-center h-4">
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: "#ec3013", boxShadow: "0 0 6px rgba(236,48,19,0.7)" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: "#ec3013", boxShadow: "0 0 6px rgba(236,48,19,0.7)" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#ec3013", boxShadow: "0 0 6px rgba(236,48,19,0.7)" }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div
              className="flex-shrink-0 px-4 pt-3 pb-4 flex flex-col gap-3"
              style={{
                borderTop: "1px solid rgba(246,248,255,0.08)",
                background: "linear-gradient(0deg, rgba(10,9,13,0.6) 0%, transparent 100%)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => setAgentMode(!agentModeOn)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
                    style={
                      agentModeOn
                        ? {
                            background: "linear-gradient(135deg, rgba(236,48,19,0.88), rgba(180,25,8,0.82))",
                            border: "1px solid rgba(255,130,100,0.50)",
                            color: "#ffffff",
                            boxShadow: "0 0 14px rgba(236,48,19,0.35)",
                          }
                        : {
                            background: "rgba(246,248,255,0.05)",
                            border: "1px solid rgba(246,248,255,0.10)",
                            color: "rgba(246,248,255,0.65)",
                          }
                    }
                    title="When on, what you send becomes a task Mirabel actually goes and does, instead of a reply."
                  >
                    <Bot size={12} strokeWidth={1.8} style={{ color: agentModeOn ? "#ffffff" : "#ec3013" }} />
                    {agentModeOn ? "Agent Mode: on" : "Agent Mode"}
                  </button>
                  <button
                    onClick={recordingHotkey ? cancelRecordingHotkey : beginRecordingHotkey}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
                    style={
                      recordingHotkey
                        ? {
                            background: "linear-gradient(135deg, rgba(236,48,19,0.88), rgba(180,25,8,0.82))",
                            border: "1px solid rgba(255,130,100,0.50)",
                            color: "#ffffff",
                            boxShadow: "0 0 14px rgba(236,48,19,0.35)",
                          }
                        : {
                            background: "rgba(246,248,255,0.05)",
                            border: "1px solid rgba(246,248,255,0.10)",
                            color: "rgba(246,248,255,0.65)",
                          }
                    }
                    title="Bind a keyboard key to toggle the mic on/off from anywhere in the app"
                  >
                    <Keyboard size={12} strokeWidth={1.8} />
                    {recordingHotkey ? "Press a key…" : pushToTalkKeyLabel || "Set PTT key"}
                  </button>
                </div>
                <button
                  onClick={toggleMic}
                  disabled={!connected}
                  className="flex-shrink-0 w-10 h-10 rounded-full border-none cursor-pointer grid place-items-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105"
                  style={{
                    border: micOn ? "1px solid rgba(255,130,100,0.60)" : "1px solid rgba(246,248,255,0.12)",
                    background: micOn
                      ? "radial-gradient(circle at 40% 35%, rgba(236,48,19,0.85), rgba(150,20,8,0.92) 80%)"
                      : "rgba(246,248,255,0.06)",
                    color: micOn ? "#ffffff" : "rgba(246,248,255,0.85)",
                    boxShadow: micOn ? "0 0 18px rgba(236,48,19,0.5), inset 0 0 8px rgba(255,255,255,0.2)" : "none",
                  }}
                  aria-label={micOn ? "stop listening" : "start listening"}
                >
                  {micOn ? <MicOff size={16} strokeWidth={1.8} /> : <Mic size={16} strokeWidth={1.8} />}
                </button>
              </div>
              <ChatInput onSend={sendText} disabled={!connected} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
