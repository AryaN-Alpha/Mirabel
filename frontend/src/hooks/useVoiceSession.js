import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { AudioQueue } from "../services/audioQueue";
import { answerAgentTask, approveAgentTask, rejectAgentTask } from "../services/api";
import { pollAgentTask } from "../services/agentTaskPolling";

const WS_URL =
  (import.meta.env.VITE_WS_URL || "ws://localhost:8000") + "/ws/chat/";

const TERMINAL_AGENT_STATUSES = new Set(["done", "failed", "cancelled"]);

export function useVoiceSession() {
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [mood, setMood] = useState("neutral");
  const [thinking, setThinking] = useState(false);
  const [wsError, setWsError] = useState("");
  const [agentTask, setAgentTask] = useState(null);
  const [agentTaskNudge, setAgentTaskNudge] = useState("");

  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const vadRef = useRef(null);
  const audioQueueRef = useRef(new AudioQueue());
  const micCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const playbackAnalyserRef = useRef(null);
  const stopAgentPollRef = useRef(null);
  const spokenApprovalRef = useRef(null);
  const spokenClarificationRef = useRef(null);

  // Voice mode can't rely on visual attention the way chat/Agent-tab UIs
  // can, so the moment a task needs a decision, speak it aloud once (via
  // the browser's own TTS — separate from Mirabel's edge-tts voice, which
  // only exists server-side for turn replies) instead of relying on the
  // on-screen card alone.
  const maybeSpeakApproval = useCallback((task) => {
    if (task.status !== "awaiting_confirmation" || !task.pending_action) return;
    const key = `${task.id}:${task.pending_action.summary}`;
    if (spokenApprovalRef.current === key) return;
    spokenApprovalRef.current = key;
    try {
      window.speechSynthesis?.speak(
        new SpeechSynthesisUtterance(`${task.pending_action.summary}. Approve or reject?`)
      );
    } catch {
      // speechSynthesis unavailable in this browser — the on-screen card still works.
    }
  }, []);

  // Same reasoning as maybeSpeakApproval, for a clarifying question instead
  // of an approval — the on-screen card still takes typed answers either way.
  const maybeSpeakClarification = useCallback((task) => {
    if (task.status !== "awaiting_clarification" || !task.pending_action) return;
    const key = `${task.id}:${task.pending_action.question}`;
    if (spokenClarificationRef.current === key) return;
    spokenClarificationRef.current = key;
    try {
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(task.pending_action.question));
    } catch {
      // speechSynthesis unavailable in this browser — the on-screen card still works.
    }
  }, []);

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
    (enabled) => sendJSON({ type: "set_agent_mode", enabled }),
    [sendJSON]
  );

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
          spokenApprovalRef.current = null;
          spokenClarificationRef.current = null;
          setAgentTask({ id: msg.task_id, status: "queued", current_step: "" });
          stopAgentPollRef.current = pollAgentTask(msg.task_id, {
            onUpdate: (task) => {
              setAgentTask(task);
              maybeSpeakApproval(task);
              maybeSpeakClarification(task);
            },
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
  }, [maybeSpeakApproval, maybeSpeakClarification]);

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
        if (recorder.state === "inactive") recorder.start(250); // 250ms timeslice
      },
      onSpeechEnd: () => {
        // Just stop the recorder — the onstop handler sends utterance_end
        // AFTER the final ondataavailable chunk, preventing the race condition.
        if (recorder.state === "recording") recorder.stop();
      },
    });

    // Restore console.warn now that model session creation is done.
    console.warn = _origWarn;

    vad.start();
    vadRef.current = vad;
  }, [sendJSON]);

  const stopMic = useCallback(() => {
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
  }, []);

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
    startMic,
    stopMic,
    setAgentMode,
    micAnalyserRef,
    playbackAnalyserRef,
    agentTask,
    approveCurrentAgentTask,
    rejectCurrentAgentTask,
    answerCurrentAgentTask,
  };
}

