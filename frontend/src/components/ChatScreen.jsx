import { useState } from "react";
import Sprite from "./Sprite";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import ErrorBoundary from "./ErrorBoundary";
import { sendMessage } from "../services/api";

let _msgId = 0;
const nextId = () => ++_msgId;

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [currentMood, setCurrentMood] = useState("neutral");
  const [loading, setLoading] = useState(false);

  async function handleSend(text) {
    const userMsg = { id: nextId(), role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const data = await sendMessage(conversationId, text);
      setConversationId(data.conversation_id);
      setCurrentMood(data.mood);
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
      setCurrentMood("annoyed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-zinc-900 text-zinc-100">
        <div className="flex-none" style={{ height: "55%" }}>
          <Sprite mood={currentMood} />
        </div>
        <div className="flex flex-col" style={{ height: "45%" }}>
          <MessageList messages={messages} />
          <ChatInput onSend={handleSend} disabled={loading} />
        </div>
      </div>
    </ErrorBoundary>
  );
}
