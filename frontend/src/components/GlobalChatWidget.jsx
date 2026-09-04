import { useEffect, useRef, useState } from "react";
import { Bot, Keyboard, Mic, MicOff, MessageCircle, SquarePen, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useVoiceSessionContext } from "../hooks/VoiceSessionProvider";
import CozyWave from "./CozyWave";
import AgentTaskPanel from "./agent/AgentTaskPanel";
import ChatInput from "./ChatInput";
import { getErrorMessage } from "../utils/errors";

const AGENT_PALETTE = {
  text: "rgba(250,248,255,0.95)",
  muted: "rgba(246,248,255,0.72)",
  border: "rgba(255,255,255,0.12)",
  accent: "#ff9783",
  danger: "#f87171",
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
        whileHover={{ scale: 1.08, boxShadow: "0 16px 42px -4px rgba(0, 0, 0, 0.85), 0 0 32px -2px rgba(56, 189, 248, 0.6)" }}
        whileTap={{ scale: 0.94 }}
        className="fixed border-none cursor-pointer grid place-items-center"
        style={{
          right: 24,
          bottom: 100,
          zIndex: 50,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(16, 24, 38, 0.95) 0%, rgba(8, 11, 20, 0.98) 100%)",
          border: "1px solid rgba(56, 189, 248, 0.48)",
          boxShadow: "0 12px 36px -4px rgba(0, 0, 0, 0.8), 0 0 24px -2px rgba(56, 189, 248, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.2)",
          color: "#38bdf8",
          backdropFilter: "blur(12px)",
        }}
        aria-label={open ? "Close chat with Mirabel" : "Open chat with Mirabel"}
      >
        {open ? <X size={22} strokeWidth={1.8} color="#ffffff" /> : <MessageCircle size={22} strokeWidth={1.8} color="#38bdf8" />}
        {!open && connected && (
          <span
            className="absolute rounded-full"
            style={{
              top: 6,
              right: 6,
              width: 10,
              height: 10,
              background: "#34d399",
              boxShadow: "0 0 8px #34d399",
              border: "2px solid #0e0d14",
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
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed flex flex-col"
            style={{
              right: 24,
              bottom: 168,
              zIndex: 50,
              width: 380,
              maxWidth: "calc(100vw - 32px)",
              height: 580,
              maxHeight: "calc(100vh - 200px)",
              borderRadius: 24,
              background: "linear-gradient(165deg, rgba(16, 14, 22, 0.96) 0%, rgba(8, 8, 14, 0.94) 100%)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow: "0 28px 75px -12px rgba(0, 0, 0, 0.8), 0 0 35px -10px rgba(255, 151, 131, 0.2)",
              backdropFilter: "blur(24px) saturate(120%)",
              WebkitBackdropFilter: "blur(24px) saturate(120%)",
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 flex-shrink-0"
              style={{ borderBottom: "1px solid rgba(243,233,226,0.10)" }}
            >
              <div className="min-w-0">
                <div className="font-serif text-[19px]" style={{ color: "#fbf1ea" }}>
                  Mirabel
                </div>
                <div className="mt-1 text-[12.5px] font-light leading-[1.5]" style={{ color: "rgba(243,233,226,0.55)" }}>
                  {subline}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={startNewChat}
                  className="w-8 h-8 grid place-items-center rounded-full border-none cursor-pointer"
                  style={{ background: "rgba(243,233,226,0.07)", color: "rgba(243,233,226,0.6)" }}
                  aria-label="Start a new chat"
                  title="Start a new chat"
                >
                  <SquarePen size={14} strokeWidth={1.8} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 grid place-items-center rounded-full border-none cursor-pointer"
                  style={{ background: "rgba(243,233,226,0.07)", color: "rgba(243,233,226,0.6)" }}
                  aria-label="Close chat"
                >
                  <X size={15} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <div className="flex justify-center py-3 flex-shrink-0">
              <CozyWave micAnalyser={micAnalyserRef} playbackAnalyser={playbackAnalyserRef} active={micOn} size={110} />
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-4 py-1">
              <AnimatePresence>
                {transcript && (
                  <motion.div
                    key="transcript"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-1 items-end"
                  >
                    <div
                      className="max-w-[85%] px-4 py-2.5 text-[13.5px] font-light leading-[1.6]"
                      style={{
                        borderRadius: "18px 18px 5px 18px",
                        background: "rgba(255,214,180,0.10)",
                        border: "1px solid rgba(255,214,180,0.20)",
                        color: "rgba(250,242,236,0.92)",
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
                      className="max-w-[85%] px-4 py-2.5 text-[13.5px] font-light leading-[1.6]"
                      style={{
                        borderRadius: "18px 18px 18px 5px",
                        background: "rgba(243,233,226,0.055)",
                        border: "1px solid rgba(243,233,226,0.10)",
                        color: "rgba(250,242,236,0.92)",
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
                      className="max-w-[92%] px-4 py-3 text-[13.5px] font-light leading-[1.6]"
                      style={{
                        borderRadius: "18px 18px 18px 5px",
                        background: "rgba(243,233,226,0.055)",
                        border: "1px solid rgba(243,233,226,0.10)",
                        color: "rgba(250,242,236,0.92)",
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
                    className="flex items-center gap-2 px-1"
                  >
                    <div className="flex space-x-1.5 items-center h-4">
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: "rgba(247,207,174,0.7)" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: "rgba(247,207,174,0.7)" }} />
                      <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "rgba(247,207,174,0.7)" }} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex-shrink-0 px-4 pt-3 pb-4 flex flex-col gap-3" style={{ borderTop: "1px solid rgba(243,233,226,0.08)" }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => setAgentMode(!agentModeOn)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
                    style={
                      agentModeOn
                        ? {
                            background: "linear-gradient(135deg, #ff9783 0%, #f0715d 100%)",
                            color: "#08070d",
                            fontWeight: 600,
                            boxShadow: "0 0 14px rgba(255, 151, 131, 0.4)",
                          }
                        : {
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "rgba(246,248,255,0.82)",
                          }
                    }
                    title="When on, what you send becomes a task Mirabel actually goes and does, instead of a reply."
                  >
                    <Bot size={12} strokeWidth={1.8} />
                    {agentModeOn ? "Agent Mode: on" : "Agent Mode"}
                  </button>
                  <button
                    onClick={recordingHotkey ? cancelRecordingHotkey : beginRecordingHotkey}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
                    style={
                      recordingHotkey
                        ? {
                            background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)",
                            color: "#08070d",
                            fontWeight: 600,
                            boxShadow: "0 0 14px rgba(56, 189, 248, 0.4)",
                          }
                        : {
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "rgba(246,248,255,0.82)",
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
                  className="flex-shrink-0 w-10 h-10 rounded-full border-none cursor-pointer grid place-items-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: micOn ? "1px solid rgba(255, 151, 131, 0.5)" : "1px solid rgba(255, 255, 255, 0.14)",
                    background: micOn
                      ? "radial-gradient(circle at 46% 34%, rgba(255, 151, 131, 0.35), rgba(18, 16, 26, 0.95) 72%)"
                      : "rgba(255, 255, 255, 0.06)",
                    color: micOn ? "#ff9783" : "rgba(246, 248, 255, 0.85)",
                    boxShadow: micOn ? "0 0 16px rgba(255, 151, 131, 0.35)" : "none",
                  }}
                  aria-label={micOn ? "stop listening" : "start listening"}
                >
                  {micOn ? <MicOff size={16} strokeWidth={1.6} /> : <Mic size={16} strokeWidth={1.6} />}
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
