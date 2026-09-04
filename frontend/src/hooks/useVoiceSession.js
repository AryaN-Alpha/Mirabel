import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { AudioQueue } from "../services/audioQueue";
import { answerAgentTask, approveAgentTask, rejectAgentTask } from "../services/api";
import { pollAgentTask } from "../services/agentTaskPolling";
import { micErrorMessage } from "../utils/errors";

const WS_URL =
  (import.meta.env.VITE_WS_URL || "ws://localhost:8000") + "/ws/chat/";

const TERMINAL_AGENT_STATUSES = new Set(["done", "failed", "cancelled"]);

// Push-to-talk hotkey preference — same try/catch-guarded localStorage
// convention as useNameHidden.js. Stored as a KeyboardEvent.code (e.g.
// "F9", "Space") rather than .key, since .code is layout-independent and
// works uniformly for non-character keys.
const PTT_STORAGE_KEY = "mirabel:push-to-talk-key";

function readStoredPushToTalkKey() {
  try {
    return localStorage.getItem(PTT_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function describeKeyCode(code) {
  if (!code) return "";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  if (code.startsWith("Arrow")) return `${code.slice(5)} Arrow`;
  return code;
}

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

// Safety-net cap on a single open recording — see onSpeechStart/onVADMisfire
// below for why this exists: sustained ambient/echo noise can keep the VAD's
// internal "speaking" state pinned true indefinitely, so neither onSpeechEnd
// nor onVADMisfire ever fires and the recorder is never told to stop.
const MAX_UTTERANCE_MS = 20000;

export function useVoiceSession() {
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [mood, setMood] = useState("neutral");
  const [thinking, setThinking] = useState(false);
  const [wsError, setWsError] = useState("");
  const [agentTask, setAgentTask] = useState(null);
  const [agentTaskNudge, setAgentTaskNudge] = useState("");
  // Owned here (not by each screen) since the session — and the mic/VAD
  // instance underneath it — is now shared across screens (see
  // VoiceSessionProvider). A screen-local boolean would desync from the
  // real recorder state whenever the screen that started the mic unmounts
  // and a different screen reading this hook mounts in its place.
  const [micOn, setMicOn] = useState(false);
  // Same reasoning as micOn: the server tracks agent-mode per WS connection
  // (voice/consumers.py's self._agent_mode) with no ack message, so this is
  // an optimistic client-side echo of the last value sent — owned here so
  // every screen reading the shared session sees the same value instead of
  // resetting to false on mount.
  const [agentModeOn, setAgentModeOn] = useState(false);
  // Surfaced here (not screen-local) so the hotkey handler below — which
  // lives in this hook, not in either screen — can report the same mic
  // errors a manual button click would.
  const [micError, setMicError] = useState("");
  // Push-to-talk: a single hotkey preference shared across every screen,
  // since the mic/session it toggles is already shared (see module doc
  // above). "" means no key bound yet — the hotkey listener below no-ops
  // until the user records one via beginRecordingHotkey.
  const [pushToTalkKey, setPushToTalkKeyState] = useState(readStoredPushToTalkKey);
  const [recordingHotkey, setRecordingHotkey] = useState(false);

  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const vadRef = useRef(null);
  const audioQueueRef = useRef(new AudioQueue());
  const micCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const playbackAnalyserRef = useRef(null);
  const stopAgentPollRef = useRef(null);
  const utteranceTimeoutRef = useRef(null);

  // Voice mode can't rely on visual attention the way chat/Agent-tab UIs
  // can, so the moment a task needs a decision, the backend speaks it aloud
  // once through the exact same edge-tts audio_chunk pipeline a normal
  // reply uses (see agent_speak in backend/voice/consumers.py) — a plain
  // WS message this hook already handles below, nothing special to do here.
  // This used to be done client-side with window.speechSynthesis, which (a)
  // used whatever default OS/browser voice instead of Mirabel's, and (b)
  // played outside the tab's WebAudio graph, so the mic's echoCancellation
  // (which only cancels audio it can see as a render reference) couldn't
  // suppress it — the spoken question got picked back up by the VAD and
  // transcribed as a new user utterance.

  const sendJSON = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  // Toggled from the UI — while on, a finished utterance is queued as a
  // background agent task (see backend voice/consumers.py::_handle_agent_task)
  // instead of driving a normal streaming reply. No live result push over
  // this socket; results show up in the chat history / Agent tab once the
  // task finishes.
  const setAgentMode = useCallback(
    (enabled) => {
      sendJSON({ type: "set_agent_mode", enabled });
      setAgentModeOn(enabled);
    },
    [sendJSON]
  );

  // Typed input over the same socket as voice — skips STT, otherwise drives
  // the identical turn pipeline (see backend voice/consumers.py's
  // text_message handling). Lets any UI (voice screen, portable widget)
  // mix speaking and typing in the same conversation.
  const sendText = useCallback(
    (text) => sendJSON({ type: "text_message", text }),
    [sendJSON]
  );

  // "New chat" — drops the server-side conversation thread (voice/consumers.py's
  // _start_new_chat) so the next utterance starts a fresh Conversation, and
  // resets this session's transient turn state. Shared across every screen
  // reading this session (VoiceChatScreen + GlobalChatWidget), so triggering
  // it from either resets the same one conversation. Nothing is deleted —
  // past turns stay in the database, this just starts a new thread. Fires
  // optimistically (same fire-and-forget precedent as onSpeechStart's
  // barge-in "cancel") rather than waiting for the "chat_cleared" ack: this
  // is user-initiated with no concurrent inbound message that could race it.
  const startNewChat = useCallback(() => {
    audioQueueRef.current.stop();
    stopAgentPollRef.current?.();
    stopAgentPollRef.current = null;
    sendJSON({ type: "new_chat" });
    setTranscript("");
    setStreamingText("");
    setMood("neutral");
    setThinking(false);
    setWsError("");
    setAgentTaskNudge("");
    setAgentTask(null);
  }, [sendJSON]);

  // ---- WebSocket ------------------------------------------------------
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = (e) => {
      console.warn("ws error", e);
      setWsError("Voice connection trouble. Reconnecting or reload might help.");
    };
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case "ready":
          break;
        case "chat_cleared":
          // Ack for startNewChat — state is already reset optimistically
          // client-side, nothing further to do here.
          break;
        case "transcript":
          setWsError("");
          setAgentTaskNudge("");
          setTranscript(msg.text || "");
          if (msg.text) {
            setThinking(true);
            setStreamingText("");
            setMood("thinking"); // sprite handles "thinking" as a special transitional state
            // Clear a finished agent task's card once a new utterance starts;
            // leave a still-active one visible — that's the whole point.
            setAgentTask((prev) => (prev && TERMINAL_AGENT_STATUSES.has(prev.status) ? null : prev));
          }
          break;
        case "text_delta":
          setStreamingText((prev) => prev + msg.text);
          break;
        case "agent_task_started": {
          stopAgentPollRef.current?.();
          setAgentTask({ id: msg.task_id, status: "queued", current_step: "" });
          stopAgentPollRef.current = pollAgentTask(msg.task_id, {
            onUpdate: (task) => setAgentTask(task),
            onSettled: (task) => setAgentTask(task),
          });
          break;
        }
        case "audio_chunk": {
          const bin = atob(msg.data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          audioQueueRef.current.addChunk(bytes.buffer);
          break;
        }
        case "audio_sentence_end":
          audioQueueRef.current.endSentence();
          playbackAnalyserRef.current = audioQueueRef.current.analyser;
          break;
        case "final":
          // Sync the displayed text with the authoritative full response
          // from the backend — if any characters were lost during streaming
          // (parser holdback, dropped delta), this corrects the chat bubble.
          if (msg.text) {
            setStreamingText(msg.text);
          }
          setMood(msg.mood || "neutral");
          setThinking(false);
          break;
        case "agent_task_nudge":
          // Server suppressed/redirected this utterance instead of starting
          // new work (a task is already pending) — surface it so the user
          // isn't left wondering why nothing happened. Not an error: no
          // wsError, just a transient status line.
          setThinking(false);
          setAgentTaskNudge(msg.message || "");
          break;
        case "error":
          console.error("server error:", msg.message);
          setThinking(false);
          setWsError(
            msg.message === "voice pipeline error"
              ? "had trouble hearing that — try again?"
              : "had trouble replying — try again?"
          );
          break;
      }
    };
    return () => {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener('open', () => ws.close());
      } else {
        ws.close();
      }
      stopAgentPollRef.current?.();
    };
  }, []);

  // ---- Mic + VAD ------------------------------------------------------
  const startMic = useCallback(async () => {
    if (recorderRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });

    // Dedicated analysis-only graph — never connected to a destination,
    // just lets the visualizer read live mic levels while the mic is on.
    const micCtx = new (window.AudioContext || window.webkitAudioContext)();
    const micAnalyser = micCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.6;
    micCtx.createMediaStreamSource(stream).connect(micAnalyser);
    micCtxRef.current = micCtx;
    micAnalyserRef.current = micAnalyser;

    // MediaRecorder streams chunks during recording; we forward them as binary frames.
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = (ev) => {
      // Send the Blob directly (no arrayBuffer() await) so a barge-in's cancel+restart can't race a trailing chunk past the new session's WebM header.
      if (ev.data && ev.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(ev.data);
      }
    };
    // Critical: send utterance_end from onstop, NOT from onSpeechEnd.
    // MediaRecorder.stop() queues a final ondataavailable THEN onstop.
    // This guarantees the last audio chunk reaches the backend BEFORE
    // utterance_end, preventing the backend from treating it as barge-in.
    recorder.onstop = () => {
      sendJSON({ type: "utterance_end" });
    };
    recorderRef.current = recorder;

    // Suppress noisy ONNX runtime warnings emitted from the WASM binary
    // during model session creation. These are harmless "Removing initializer"
    // messages that cannot be silenced via ort.env — they come from C++ code
    // compiled to WASM and are routed through console.warn.
    const _origWarn = console.warn;
    console.warn = function (...args) {
      if (typeof args[0] === "string" && args[0].includes("Removing initializer")) return;
      _origWarn.apply(console, args);
    };

    // VAD owns the start/stop logic so the user never holds a button.
    const vad = await MicVAD.new({
      stream,
      model: "v5",
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      minSpeechFrames: 4,
      redemptionFrames: 16,
      // When the user manually pauses the mic, flush any in-progress speech
      // segment as a proper onSpeechEnd event instead of silently discarding.
      submitUserSpeechOnPause: true,
      onSpeechStart: () => {
        // Barge-in: kill any audio currently playing
        audioQueueRef.current.stop();
        sendJSON({ type: "cancel" });
        if (recorder.state === "inactive") {
          recorder.start(250); // 250ms timeslice
          // Safety net: onSpeechStart fires on the first frame that merely
          // *crosses* the threshold, well before a segment is confirmed as
          // real speech — the matching close is either onSpeechEnd (real
          // speech) or onVADMisfire (too short), and both depend on 16
          // consecutive below-threshold frames to resolve "speaking" back
          // to false. Sustained ambient/echo noise (e.g. room reverb right
          // as Mirabel's own reply finishes over the speakers, which
          // getUserMedia's echoCancellation doesn't fully catch) can keep
          // resetting that counter forever, so neither event ever fires and
          // the recorder — and therefore utterance_end — never closes. This
          // timeout force-flushes it so the mic self-heals instead of
          // silently going deaf until the user manually toggles it off/on.
          clearTimeout(utteranceTimeoutRef.current);
          utteranceTimeoutRef.current = setTimeout(() => {
            if (recorder.state === "recording") recorder.stop();
          }, MAX_UTTERANCE_MS);
        }
      },
      onSpeechEnd: () => {
        // Just stop the recorder — the onstop handler sends utterance_end
        // AFTER the final ondataavailable chunk, preventing the race condition.
        clearTimeout(utteranceTimeoutRef.current);
        if (recorder.state === "recording") recorder.stop();
      },
      onVADMisfire: () => {
        // A segment too short to count as real speech (often a trailing
        // echo blip) — the library resolves "speaking" back to false via
        // this event instead of onSpeechEnd, so without handling it here
        // the recorder onSpeechStart already opened is never told to close.
        // Flushing it anyway is safe and cheap: the backend transcribes an
        // empty/noise clip to "" and no-ops (see _handle_utterance) rather
        // than driving a real turn.
        clearTimeout(utteranceTimeoutRef.current);
        if (recorder.state === "recording") recorder.stop();
      },
    });

    // Restore console.warn now that model session creation is done.
    console.warn = _origWarn;

    vad.start();
    vadRef.current = vad;
    setMicOn(true);
  }, [sendJSON]);

  const stopMic = useCallback(() => {
    clearTimeout(utteranceTimeoutRef.current);
    utteranceTimeoutRef.current = null;

    // Pause VAD first — with submitUserSpeechOnPause=true, this fires
    // onSpeechEnd (which stops the recorder) if the user was mid-speech.
    // The recorder's onstop handler then sends utterance_end.
    vadRef.current?.pause();

    // Safety net: if the recorder is *still* recording after the VAD pause
    // (e.g. speech was too short to meet minSpeechFrames → VAD misfire),
    // stop it manually. The onstop handler will send utterance_end.
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    vadRef.current = null;
    micAnalyserRef.current = null;
    micCtxRef.current?.close();
    micCtxRef.current = null;
    setMicOn(false);
  }, []);

  // Shared by the mic button in both screens AND the push-to-talk hotkey
  // below, so a keypress does exactly what a click does — same error
  // handling, same state. Reads recorderRef directly (rather than depending
  // on the micOn state) so this callback's identity stays stable.
  const toggleMic = useCallback(async () => {
    if (recorderRef.current) {
      stopMic();
      return;
    }
    try {
      setMicError("");
      await startMic();
    } catch (err) {
      console.error(err);
      setMicError(micErrorMessage(err));
    }
  }, [startMic, stopMic]);

  const setPushToTalkKey = useCallback((code) => {
    setPushToTalkKeyState(code);
    try {
      if (code) localStorage.setItem(PTT_STORAGE_KEY, code);
      else localStorage.removeItem(PTT_STORAGE_KEY);
    } catch {
      // localStorage unavailable — hotkey still works for the rest of this session
    }
  }, []);

  const beginRecordingHotkey = useCallback(() => setRecordingHotkey(true), []);
  const cancelRecordingHotkey = useCallback(() => setRecordingHotkey(false), []);

  // ---- Push-to-talk keydown listener -----------------------------------
  // Lives here (not in either screen) so the hotkey works regardless of
  // which UI is currently mounted/visible — it drives the same shared mic
  // state VoiceChatScreen and GlobalChatWidget both read.
  useEffect(() => {
    function handleKeyDown(e) {
      if (recordingHotkey) {
        // Don't let a bare modifier press bind as the hotkey — Shift/Ctrl/etc.
        // are used constantly for normal typing elsewhere in the app.
        if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
        e.preventDefault();
        if (e.code === "Escape") {
          setRecordingHotkey(false);
          return;
        }
        setPushToTalkKey(e.code);
        setRecordingHotkey(false);
        return;
      }
      if (!pushToTalkKey || e.repeat) return;
      // Same gate as the mic buttons (disabled={!connected}) — without a
      // live socket, opening the mic would record into the void, since the
      // recorder only ever sends chunks while the WS is OPEN.
      if (!connected) return;
      // Ignore modified combos (Ctrl+key, etc.) so the hotkey never fights a
      // browser/OS shortcut that happens to share the same base key.
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.code !== pushToTalkKey) return;
      // Never hijack typing — this fires on every keydown in the whole app.
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      toggleMic();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connected, pushToTalkKey, recordingHotkey, setPushToTalkKey, toggleMic]);

  const approveCurrentAgentTask = useCallback(async (editedArgs) => {
    if (!agentTask) return;
    const updated = await approveAgentTask(agentTask.id, editedArgs);
    setAgentTask(updated);
  }, [agentTask]);

  const rejectCurrentAgentTask = useCallback(async () => {
    if (!agentTask) return;
    const updated = await rejectAgentTask(agentTask.id);
    setAgentTask(updated);
  }, [agentTask]);

  const answerCurrentAgentTask = useCallback(async (answer) => {
    if (!agentTask) return;
    const updated = await answerAgentTask(agentTask.id, answer);
    setAgentTask(updated);
  }, [agentTask]);

  return {
    connected,
    transcript,
    streamingText,
    mood,
    thinking,
    wsError,
    agentTaskNudge,
    micOn,
    micError,
    agentModeOn,
    startMic,
    stopMic,
    toggleMic,
    pushToTalkKey,
    pushToTalkKeyLabel: describeKeyCode(pushToTalkKey),
    recordingHotkey,
    beginRecordingHotkey,
    cancelRecordingHotkey,
    setAgentMode,
    sendText,
    startNewChat,
    micAnalyserRef,
    playbackAnalyserRef,
    agentTask,
    approveCurrentAgentTask,
    rejectCurrentAgentTask,
    answerCurrentAgentTask,
  };
}

