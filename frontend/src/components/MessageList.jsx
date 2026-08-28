import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AgentTaskPanel from "./agent/AgentTaskPanel";

const AGENT_PALETTE = {
  text: "rgba(250,242,236,0.92)",
  muted: "rgba(243,233,226,0.5)",
  border: "rgba(243,233,226,0.16)",
  accent: "#f0c9a2",
  danger: "rgba(224,140,140,0.95)",
};

const BUBBLE = {
  user: {
    who: "you",
    align: "items-end",
    radius: "22px 22px 6px 22px",
    bg: "rgba(255,214,180,0.10)",
    border: "rgba(255,214,180,0.20)",
  },
  assistant: {
    who: "mirabel",
    align: "items-start",
    radius: "22px 22px 22px 6px",
    bg: "rgba(243,233,226,0.055)",
    border: "rgba(243,233,226,0.10)",
  },
};

export default function MessageList({
  messages,
  loading,
  busyAgentTaskId,
  onApproveAgentTask,
  onRejectAgentTask,
  onAnswerAgentTask,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 px-1 py-1">
      <AnimatePresence initial={false}>
        {messages.map((msg) => {
          const b = BUBBLE[msg.role] || BUBBLE.assistant;
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={`flex flex-col gap-1.5 ${b.align}`}
            >
              <div
                className="px-1.5 text-[11.5px] tracking-[0.06em] uppercase"
                style={{ color: "rgba(243,233,226,0.35)" }}
              >
                {b.who}
              </div>
              <div
                className="max-w-[80%] px-5 py-[15px] text-[15.5px] font-light leading-[1.7]"
                style={{
                  borderRadius: b.radius,
                  background: b.bg,
                  border: `1px solid ${b.border}`,
                  color: "rgba(250,242,236,0.92)",
                  backdropFilter: "blur(8px)",
                }}
              >
                {msg.agentTask ? (
                  <AgentTaskPanel
                    task={msg.agentTask}
                    busy={busyAgentTaskId === msg.agentTask.id}
                    palette={AGENT_PALETTE}
                    onApprove={(editedArgs) => onApproveAgentTask?.(msg.agentTask, editedArgs)}
                    onReject={() => onRejectAgentTask?.(msg.agentTask)}
                    onAnswer={(answer) => onAnswerAgentTask?.(msg.agentTask, answer)}
                  />
                ) : (
                  msg.text
                )}
              </div>
            </motion.div>
          );
        })}
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-1.5 items-start"
          >
            <div
              className="px-1.5 text-[11.5px] tracking-[0.06em] uppercase"
              style={{ color: "rgba(243,233,226,0.35)" }}
            >
              mirabel
            </div>
            <div
              className="px-5 py-[15px]"
              style={{
                borderRadius: "22px 22px 22px 6px",
                background: "rgba(243,233,226,0.055)",
                border: "1px solid rgba(243,233,226,0.10)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div className="flex space-x-1.5 items-center h-5">
                <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: "rgba(247,207,174,0.7)" }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: "rgba(247,207,174,0.7)" }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "rgba(247,207,174,0.7)" }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
