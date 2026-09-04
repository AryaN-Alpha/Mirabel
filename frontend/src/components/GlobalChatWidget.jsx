import { useEffect, useRef, useState } from "react";
import { Bot, Keyboard, Mic, MicOff, MessageCircle, SquarePen, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useVoiceSessionContext } from "../hooks/VoiceSessionProvider";
import CozyWave from "./CozyWave";
import AgentTaskPanel from "./agent/AgentTaskPanel";
import ChatInput from "./ChatInput";
import { getErrorMessage } from "../utils/errors";

const AGENT_PALETTE = {
  text: "rgba(250,242,236,0.92)",
  muted: "rgba(243,233,226,0.45)",
  border: "rgba(243,233,226,0.16)",
  accent: "#f0c9a2",
  danger: "rgba(224,140,140,0.95)",
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
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        className="fixed border-none cursor-pointer grid place-items-center"
        style={{
          right: 24,
          bottom: 100,
          zIndex: 50,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "radial-gradient(circle at 46% 34%, rgba(255,228,205,0.30), rgba(30,22,22,0.92) 72%)",
          border: "1px solid rgba(255,222,196,0.28)",
          boxShadow: "0 12px 34px rgba(0,0,0,0.4)",
          color: "#ffe7d5",
        }}
        aria-label={open ? "Close chat with Mirabel" : "Open chat with Mirabel"}
      >
        {open ? <X size={22} strokeWidth={1.6} /> : <MessageCircle size={22} strokeWidth={1.6} />}
        {!open && connected && (
          <span
            className="absolute rounded-full"
            style={{ top: 6, right: 6, width: 9, height: 9, background: "#8fd6a8", border: "2px solid rgba(30,22,22,0.92)" }}
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
              background: "rgba(21,16,14,0.97)",
              border: "1px solid rgba(243,233,226,0.14)",
              boxShadow: "0 26px 70px rgba(0,0,0,0.5)",
              backdropFilter: "blur(20px)",
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
                            background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
                            color: "#2c1c16",
                          }
                        : {
                            background: "rgba(243,233,226,0.06)",
                            border: "1px solid rgba(243,233,226,0.11)",
                            color: "rgba(243,233,226,0.58)",
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
                            background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
                            color: "#2c1c16",
                          }
                        : {
                            background: "rgba(243,233,226,0.06)",
                            border: "1px solid rgba(243,233,226,0.11)",
                            color: "rgba(243,233,226,0.58)",
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
                    border: "1px solid rgba(255,222,196,0.28)",
                    background: micOn
                      ? "radial-gradient(circle at 46% 34%, rgba(255,228,205,0.35), rgba(30,22,22,0.85) 72%)"
                      : "rgba(243,233,226,0.06)",
                    color: "#ffe7d5",
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
