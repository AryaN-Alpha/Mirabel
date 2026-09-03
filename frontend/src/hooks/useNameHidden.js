import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "mirabel:name-hidden";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Module-level store shared by every component that calls this hook, kept in
// sync via React's useSyncExternalStore — the correct primitive for state
// that lives outside React and has multiple subscribers. (An earlier version
// used a hand-rolled window CustomEvent dispatched from inside a setState
// updater; React re-invokes updaters to check purity, which fired the event
// mid-render and triggered "Cannot update a component while rendering a
// different component". useSyncExternalStore avoids that class of bug.)
let cached = readStored();
const listeners = new Set();

function setStored(next) {
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // localStorage unavailable — other mounted instances still sync via the listener set below
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return cached;
}

export default function useNameHidden() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot);
  const toggle = useCallback(() => setStored(!cached), []);
  return [hidden, toggle];
}
