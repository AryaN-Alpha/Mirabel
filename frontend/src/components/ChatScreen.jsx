import { useState } from "react";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import ErrorBoundary from "./ErrorBoundary";
import { sendMessage } from "../services/api";
import { getGreeting } from "../utils/greeting";

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

  async function handleSend(text) {
    const userMsg = { id: nextId(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const data = await sendMessage(conversationId, text);
      setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: data.text, mood: data.mood },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: "…something went wrong. don't make it weird.",
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
          <MessageList messages={messages} loading={loading} />

          <div className="flex flex-col gap-3.5 flex-shrink-0">
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
