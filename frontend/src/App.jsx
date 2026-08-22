import { useState } from "react";
import ChatScreen from "./components/ChatScreen";
import VoiceChatScreen from "./components/VoiceChatScreen";

export default function App() {
  const [mode, setMode] = useState("text"); // "text" | "voice"

  return (
    <div className="relative h-screen">
      {mode === "text" ? <ChatScreen /> : <VoiceChatScreen />}

      {/* Mode toggle — floating pill in top-right corner */}
      <button
        onClick={() => setMode((m) => (m === "text" ? "voice" : "text"))}
        className="fixed top-4 right-4 z-50 px-4 py-2 rounded-full text-xs font-medium
          bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition border border-zinc-700"
        id="mode-toggle"
      >
        {mode === "text" ? "🎙 voice mode" : "⌨ text mode"}
      </button>
    </div>
  );
}
