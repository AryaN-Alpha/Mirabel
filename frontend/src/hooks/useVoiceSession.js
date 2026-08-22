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

  const wsRef = useRef(null);
  const recorderRef = useRef(null);
  const vadRef = useRef(null);
  const audioQueueRef = useRef(new AudioQueue());

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
    ws.onerror = (e) => console.warn("ws error", e);
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data);
      switch (msg.type) {
        case "ready":
          break;
        case "transcript":
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
          audioQueueRef.current.enqueue(bytes.buffer);
          break;
        }
        case "audio_sentence_end":
          break;
        case "final":
          setMood(msg.mood || "neutral");
          setThinking(false);
          break;
        case "error":
          console.error("server error:", msg.message);
          setThinking(false);
          break;
      }
    };
    return () => ws.close();
  }, []);

  // ---- Mic + VAD ------------------------------------------------------
  const startMic = useCallback(async () => {
    if (recorderRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });

    // MediaRecorder streams chunks during recording; we forward them as binary frames.
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = async (ev) => {
      if (ev.data && ev.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(await ev.data.arrayBuffer());
      }
    };
    recorderRef.current = recorder;

    // VAD owns the start/stop logic so the user never holds a button.
    const vad = await MicVAD.new({
      stream,
      positiveSpeechThreshold: 0.6,
      negativeSpeechThreshold: 0.45,
      minSpeechFrames: 4,
      onSpeechStart: () => {
        // Barge-in: kill any audio currently playing
        audioQueueRef.current.stop();
        sendJSON({ type: "cancel" });
        if (recorder.state === "inactive") recorder.start(250); // 250ms timeslice
      },
      onSpeechEnd: () => {
        if (recorder.state === "recording") recorder.stop();
        sendJSON({ type: "utterance_end" });
      },
    });
    vad.start();
    vadRef.current = vad;
  }, [sendJSON]);

  const stopMic = useCallback(() => {
    vadRef.current?.pause();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    vadRef.current = null;
  }, []);

  return {
    connected,
    transcript,
    streamingText,
    mood,
    thinking,
    startMic,
    stopMic,
  };
}
