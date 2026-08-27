import { useCallback, useEffect, useRef, useState } from "react";
import { MicVAD } from "@ricky0123/vad-web";
import { AudioQueue } from "../services/audioQueue";

const WS_URL =
  (import.meta.env.VITE_WS_URL || "ws://localhost:8000") + "/ws/chat/";

export function useVoiceSession() {
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [mood, setMood] = useState("neutral");
  const [thinking, setThinking] = useState(false);
  const [wsError, setWsError] = useState("");

  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const vadRef = useRef(null);
  const audioQueueRef = useRef(new AudioQueue());
  const micCtxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const playbackAnalyserRef = useRef(null);

  const sendJSON = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

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
          setTranscript(msg.text || "");
          if (msg.text) {
            setThinking(true);
            setStreamingText("");
            setMood("thinking"); // sprite handles "thinking" as a special transitional state
          }
          break;
        case "text_delta":
          setStreamingText((prev) => prev + msg.text);
          break;
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
    recorder.ondataavailable = async (ev) => {
      if (ev.data && ev.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(await ev.data.arrayBuffer());
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

  return {
    connected,
    transcript,
    streamingText,
    mood,
    thinking,
    wsError,
    startMic,
    stopMic,
    micAnalyserRef,
    playbackAnalyserRef,
  };
}

