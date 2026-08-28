import { useEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import ErrorBoundary from "./ErrorBoundary";
import { sendMessage, startAgentTask, approveAgentTask, rejectAgentTask, answerAgentTask } from "../services/api";
import { pollAgentTask } from "../services/agentTaskPolling";
import { getGreeting } from "../utils/greeting";
import { getErrorMessage, chatDegradedMessage } from "../utils/errors";

let _msgId = 0;
const nextId = () => ++_msgId;

const PROMPTS = [
  "How was your day?",
  "Help me wind down",
  "Just want to talk",
];

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [busyAgentTaskId, setBusyAgentTaskId] = useState(null);
  const stopPollers = useRef(new Set());

  useEffect(() => () => stopPollers.current.forEach((stop) => stop()), []);

  function appendMessage(role, text, mood) {
    setMessages((prev) => [...prev, { id: nextId(), role, text, mood }]);
  }

  function updateAgentTaskMessage(msgId, task) {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, agentTask: task } : m)));
  }

  function trackAgentTask(task) {
    const msgId = nextId();
    setMessages((prev) => [...prev, { id: msgId, role: "assistant", agentTask: task }]);
    const stop = pollAgentTask(task.id, {
      onUpdate: (updated) => updateAgentTaskMessage(msgId, updated),
      onSettled: (updated) => updateAgentTaskMessage(msgId, updated),
    });
    stopPollers.current.add(stop);
  }

  async function handleAgentDecision(task, action, editedArgs) {
    setBusyAgentTaskId(task.id);
    try {
      const updated = action === "approve" ? await approveAgentTask(task.id, editedArgs) : await rejectAgentTask(task.id);
      setMessages((prev) => prev.map((m) => (m.agentTask?.id === task.id ? { ...m, agentTask: updated } : m)));
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.agentTask?.id === task.id
            ? { ...m, agentTask: { ...m.agentTask, error_message: getErrorMessage(err, "Couldn't update that.") } }
            : m
        )
      );
    } finally {
      setBusyAgentTaskId(null);
    }
  }

  async function handleAgentAnswer(task, answer) {
    setBusyAgentTaskId(task.id);
    try {
      const updated = await answerAgentTask(task.id, answer);
      setMessages((prev) => prev.map((m) => (m.agentTask?.id === task.id ? { ...m, agentTask: updated } : m)));
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.agentTask?.id === task.id
            ? { ...m, agentTask: { ...m.agentTask, error_message: getErrorMessage(err, "Couldn't send that answer.") } }
            : m
        )
      );
    } finally {
      setBusyAgentTaskId(null);
    }
  }

  async function handleSend(text) {
    const userMsg = { id: nextId(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    if (agentMode) {
      try {
        const task = await startAgentTask(text, conversationId);
        trackAgentTask(task);
      } catch (err) {
        appendMessage("assistant", getErrorMessage(err, "…couldn't start that. don't make it weird."), "annoyed");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const data = await sendMessage(conversationId, text);
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: data.error ? chatDegradedMessage(data.reason) : data.text,
          mood: data.error ? "annoyed" : data.mood,
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: getErrorMessage(err, "…something went wrong. don't make it weird."),
          mood: "annoyed",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ErrorBoundary>
      <div className="w-full max-w-[880px] flex-1 min-h-0 flex flex-col items-center px-6 pt-8">
        <div className="text-center max-w-[600px]" style={{ animation: "cz-rise 700ms ease-out" }}>
          <div className="font-serif text-[34px] leading-[1.25] tracking-[0.005em]" style={{ color: "#fbf1ea" }}>
            {getGreeting()}
          </div>
          <div className="mt-3 text-[15.5px] font-light leading-[1.7]" style={{ color: "rgba(243,233,226,0.6)" }}>
            Write as much or as little as you like. I read the quiet parts too.
          </div>
        </div>

        <div className="w-full max-w-[720px] flex-1 min-h-0 flex flex-col gap-4 mt-8 pb-8">
          <MessageList
            messages={messages}
            loading={loading}
            busyAgentTaskId={busyAgentTaskId}
            onApproveAgentTask={(task, editedArgs) => handleAgentDecision(task, "approve", editedArgs)}
            onRejectAgentTask={(task) => handleAgentDecision(task, "reject")}
            onAnswerAgentTask={(task, answer) => handleAgentAnswer(task, answer)}
          />

          <div className="flex flex-col gap-3.5 flex-shrink-0">
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setAgentMode((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-[12.5px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
                style={
                  agentMode
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
                title="When on, what you send becomes a task Mirabel actually goes and does, instead of a reply."
              >
                <Bot size={13} strokeWidth={1.8} />
                {agentMode ? "Agent Mode: on" : "Agent Mode"}
              </button>
            </div>
            <ChatInput onSend={handleSend} disabled={loading} />
            <div className="flex flex-wrap gap-2.5 justify-center">
              {PROMPTS.map((label) => (
                <button
                  key={label}
                  onClick={() => handleSend(label)}
                  disabled={loading}
                  className="px-4 py-2 rounded-full border-none text-[13px] font-light cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    border: "1px solid rgba(243,233,226,0.12)",
                    background: "rgba(243,233,226,0.04)",
                    color: "rgba(243,233,226,0.66)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
