import { useState, useRef, useEffect } from "react";
import { Bot, Mic, MicOff } from "lucide-react";
import { useVoiceSession } from "../hooks/useVoiceSession";
import CozyWave from "./CozyWave";
import { motion, AnimatePresence } from "framer-motion";
import { getGreeting } from "../utils/greeting";
import { micErrorMessage, getErrorMessage } from "../utils/errors";
import AgentTaskPanel from "./agent/AgentTaskPanel";

const AGENT_PALETTE = {
  text: "rgba(250,242,236,0.92)",
  muted: "rgba(243,233,226,0.45)",
  border: "rgba(243,233,226,0.16)",
  accent: "#f0c9a2",
  danger: "rgba(224,140,140,0.95)",
};

export default function VoiceChatScreen() {
  const {
    connected,
    transcript,
    streamingText,
    thinking,
    wsError,
    startMic,
    stopMic,
    setAgentMode,
    micAnalyserRef,
    playbackAnalyserRef,
    agentTask,
    approveCurrentAgentTask,
    rejectCurrentAgentTask,
    answerCurrentAgentTask,
  } = useVoiceSession();
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState("");
  const [agentModeOn, setAgentModeOn] = useState(false);
  const [agentTaskBusy, setAgentTaskBusy] = useState(false);
  const [agentTaskError, setAgentTaskError] = useState("");
  const scrollRef = useRef(null);

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

  const toggleAgentMode = () => {
    const next = !agentModeOn;
    setAgentModeOn(next);
    setAgentMode(next);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, streamingText, agentTask]);

  const toggleMic = async () => {
    if (micOn) {
      stopMic();
      setMicOn(false);
    } else {
      try {
        setMicError("");
        await startMic();
        setMicOn(true);
      } catch (err) {
        console.error(err);
        setMicError(micErrorMessage(err));
      }
    }
  };

  const subline = micError
    ? micError
    : wsError
    ? wsError
    : agentModeOn
    ? "Agent mode. Tell me what to do and I'll go actually do it."
    : micOn
    ? "I am listening. Say anything — there is no wrong way to start."
    : "Resting quietly. Tap the circle whenever you want me back.";

  return (
    <div className="w-full max-w-[880px] flex-1 min-h-0 flex flex-col items-center px-6 pt-8">
      <div className="text-center max-w-[600px]" style={{ animation: "cz-rise 700ms ease-out" }}>
        <div className="font-serif text-[34px] leading-[1.25] tracking-[0.005em]" style={{ color: "#fbf1ea" }}>
          {getGreeting()}
        </div>
        <div className="mt-3 text-[15.5px] font-light leading-[1.7]" style={{ color: "rgba(243,233,226,0.6)" }}>
          {subline}
        </div>
      </div>

      <CozyWave
        micAnalyser={micAnalyserRef}
        playbackAnalyser={playbackAnalyserRef}
        active={micOn}
      />

      <div className="w-full max-w-[720px] flex-1 min-h-0 flex flex-col gap-4">
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 px-1 py-1"
        >
          <AnimatePresence>
            {transcript && (
              <motion.div
                key="transcript"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-1.5 items-end"
              >
                <div className="px-1.5 text-[11.5px] tracking-[0.06em] uppercase" style={{ color: "rgba(243,233,226,0.35)" }}>
                  you
                </div>
                <div
                  className="max-w-[80%] px-5 py-[15px] text-[15.5px] font-light leading-[1.7]"
                  style={{
                    borderRadius: "22px 22px 6px 22px",
                    background: "rgba(255,214,180,0.10)",
                    border: "1px solid rgba(255,214,180,0.20)",
                    color: "rgba(250,242,236,0.92)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {transcript}
                </div>
              </motion.div>
            )}
            {streamingText && (
              <motion.div
                key="streaming"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-1.5 items-start"
              >
                <div className="px-1.5 text-[11.5px] tracking-[0.06em] uppercase" style={{ color: "rgba(243,233,226,0.35)" }}>
                  mirabel
                </div>
                <div
                  className="max-w-[80%] px-5 py-[15px] text-[15.5px] font-light leading-[1.7]"
                  style={{
                    borderRadius: "22px 22px 22px 6px",
                    background: "rgba(243,233,226,0.055)",
                    border: "1px solid rgba(243,233,226,0.10)",
                    color: "rgba(250,242,236,0.92)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {streamingText}
                </div>
              </motion.div>
            )}
            {agentTask && (
              <motion.div
                key="agent-task"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-1.5 items-start"
              >
                <div className="px-1.5 text-[11.5px] tracking-[0.06em] uppercase" style={{ color: "rgba(243,233,226,0.35)" }}>
                  mirabel — agent task
                </div>
                <div
                  className="max-w-[80%] px-5 py-[15px] text-[15.5px] font-light leading-[1.7]"
                  style={{
                    borderRadius: "22px 22px 22px 6px",
                    background: "rgba(243,233,226,0.055)",
                    border: "1px solid rgba(243,233,226,0.10)",
                    color: "rgba(250,242,236,0.92)",
                    backdropFilter: "blur(8px)",
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
                    <p style={{ fontSize: 12, marginTop: 8, color: AGENT_PALETTE.danger }}>{agentTaskError}</p>
                  )}
                </div>
              </motion.div>
            )}
            {thinking && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 px-1.5"
              >
                <div className="flex space-x-1.5 items-center h-5">
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: "rgba(247,207,174,0.7)" }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: "rgba(247,207,174,0.7)" }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "rgba(247,207,174,0.7)" }} />
                </div>
                <span className="text-[13px] font-light" style={{ color: "rgba(243,233,226,0.5)" }}>
                  mirabel is thinking
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col items-center gap-4 pb-8 flex-shrink-0">
          <button
            onClick={toggleAgentMode}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
            style={
              agentModeOn
                ? {
                    background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
                    color: "#2c1c16",
                    boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
                  }
                : {
                    background: "rgba(243,233,226,0.06)",
                    border: "1px solid rgba(243,233,226,0.11)",
                    color: "rgba(243,233,226,0.58)",
                  }
            }
            title="When on, what you say becomes a task Mirabel actually goes and does, instead of a reply."
          >
            <Bot size={13} strokeWidth={1.8} />
            {agentModeOn ? "Agent Mode: on" : "Agent Mode"}
          </button>
          <button
            onClick={toggleMic}
            disabled={!connected}
            className="relative w-[78px] h-[78px] rounded-full border-none cursor-pointer grid place-items-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              border: "1px solid rgba(255,222,196,0.28)",
              background: "radial-gradient(circle at 46% 34%, rgba(255,228,205,0.30), rgba(30,22,22,0.85) 72%)",
              color: "#ffe7d5",
              boxShadow: "0 0 44px rgba(240,168,120,0.22)",
            }}
            aria-label={micOn ? "stop listening" : "start listening"}
          >
            <div
              className="absolute rounded-full pointer-events-none"
              style={{ inset: -16, border: "1px solid rgba(255,222,196,0.14)", animation: "cz-breathe 4.6s ease-in-out infinite" }}
            />
            <div
              className="absolute rounded-full pointer-events-none"
              style={{ inset: -34, border: "1px solid rgba(255,222,196,0.07)", animation: "cz-breathe-slow 7s ease-in-out infinite" }}
            />
            {micOn ? <MicOff size={24} strokeWidth={1.5} /> : <Mic size={24} strokeWidth={1.5} />}
          </button>
          <div className="text-[13px] font-light tracking-[0.02em]" style={{ color: "rgba(243,233,226,0.5)" }}>
            {micOn ? "listening — tap to pause" : "paused — tap to listen"}
          </div>
        </div>
      </div>
    </div>
  );
}
