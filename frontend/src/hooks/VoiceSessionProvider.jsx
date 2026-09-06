import { createContext, useContext, useEffect } from "react";
import { useVoiceSession } from "./useVoiceSession";
import { PageRefreshProvider, usePageRefreshContext } from "./usePageRefresh";

// Wraps a single useVoiceSession() instance so the whole app shares one
// WebSocket/conversation, regardless of which screen (the full voice page
// or the portable GlobalChatWidget) is currently reading from it. Mounted
// once at the App root — see App.jsx.
const VoiceSessionContext = createContext(null);

// Inner provider: sits inside PageRefreshProvider so it can read emitRefresh.
function VoiceSessionInner({ children }) {
  const session = useVoiceSession();
  const { emitRefresh } = usePageRefreshContext();

  // Wire the settled callback so every finished agent task fires a refresh
  // event for each path in its result_links. This effect runs once — the
  // ref is stable, and emitRefresh is stable (defined on a ref-backed map
  // in PageRefreshProvider), so the dependency array is intentionally empty.
  useEffect(() => {
    session.onTaskSettledRef.current = (task) => {
      if (!Array.isArray(task?.result_links)) return;
      for (const link of task.result_links) {
        if (link?.path) emitRefresh(link.path);
      }
    };
    return () => {
      session.onTaskSettledRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <VoiceSessionContext.Provider value={session}>
      {children}
    </VoiceSessionContext.Provider>
  );
}

export function VoiceSessionProvider({ children }) {
  return (
    <PageRefreshProvider>
      <VoiceSessionInner>{children}</VoiceSessionInner>
    </PageRefreshProvider>
  );
}

export function useVoiceSessionContext() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error("useVoiceSessionContext must be used within a VoiceSessionProvider");
  }
  return ctx;
}
