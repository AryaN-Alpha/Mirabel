import { createContext, useContext, useEffect, useRef } from "react";

// Lightweight pub/sub context that lets the voice agent's task-completion
// event trigger a targeted data re-fetch on whichever page is currently
// mounted, without a full page reload or prop-drilling.
//
// Usage — in a page component:
//   usePageRefresh("/home/tasks", () => loadTasks(selectedProjectId));
//
// Usage — in the emitter (VoiceSessionProvider):
//   const { emitRefresh } = usePageRefreshContext();
//   emitRefresh("/home/tasks");  // any subscriber whose path is a prefix match fires
//
// Path matching is prefix-based: a subscriber registered as "/home/tasks"
// will fire when "/home/tasks", "/home/tasks?project=1", or any path that
// starts with "/home/tasks" is emitted. This handles parameterised routes
// (e.g. Kanban's ?project= query param) without the backend needing to know
// the project id.

const PageRefreshContext = createContext(null);

// The map is stored in a ref (not state) so registering/unregistering
// callbacks never causes a re-render of the provider itself.
export function PageRefreshProvider({ children }) {
  const listenersRef = useRef(new Map()); // path-prefix → Set<() => void>

  function subscribe(pathPrefix, callback) {
    const map = listenersRef.current;
    if (!map.has(pathPrefix)) map.set(pathPrefix, new Set());
    map.get(pathPrefix).add(callback);
    return () => {
      const set = map.get(pathPrefix);
      if (set) {
        set.delete(callback);
        if (set.size === 0) map.delete(pathPrefix);
      }
    };
  }

  function emitRefresh(path) {
    for (const [prefix, callbacks] of listenersRef.current.entries()) {
      if (path.startsWith(prefix)) {
        for (const cb of callbacks) {
          try {
            cb();
          } catch (err) {
            console.error("[PageRefresh] subscriber threw:", err);
          }
        }
      }
    }
  }

  return (
    <PageRefreshContext.Provider value={{ subscribe, emitRefresh }}>
      {children}
    </PageRefreshContext.Provider>
  );
}

export function usePageRefreshContext() {
  const ctx = useContext(PageRefreshContext);
  if (!ctx) throw new Error("usePageRefreshContext must be used within PageRefreshProvider");
  return ctx;
}

// Convenience hook for page components — registers a callback that fires
// whenever the voice agent completes a task touching this path prefix.
// The callback is re-registered whenever it changes identity (stable
// useCallback refs are fine), so callers can pass an inline function if
// they like — the effect dependency array handles dedup.
export function usePageRefresh(pathPrefix, callback) {
  const ctx = useContext(PageRefreshContext);
  // Graceful no-op outside the provider tree (e.g. tests, Storybook).
  if (!ctx) return;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    return ctx.subscribe(pathPrefix, callback);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathPrefix, callback]);
}
