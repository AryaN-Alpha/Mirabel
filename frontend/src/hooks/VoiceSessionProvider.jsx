import { createContext, useContext } from "react";
import { useVoiceSession } from "./useVoiceSession";

// Wraps a single useVoiceSession() instance so the whole app shares one
// WebSocket/conversation, regardless of which screen (the full voice page
// or the portable GlobalChatWidget) is currently reading from it. Mounted
// once at the App root — see App.jsx.
const VoiceSessionContext = createContext(null);

export function VoiceSessionProvider({ children }) {
  const session = useVoiceSession();
  return <VoiceSessionContext.Provider value={session}>{children}</VoiceSessionContext.Provider>;
}

export function useVoiceSessionContext() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error("useVoiceSessionContext must be used within a VoiceSessionProvider");
  }
  return ctx;
}
