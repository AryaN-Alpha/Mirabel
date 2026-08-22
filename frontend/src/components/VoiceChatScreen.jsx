import { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useVoiceSession } from "../hooks/useVoiceSession";

const MOOD_TO_SPRITE = (mood) =>
  mood === "thinking" ? "/sprites/neutral.png" : `/sprites/${mood}.png`;

export default function VoiceChatScreen() {
  const { connected, transcript, streamingText, mood, thinking, startMic, stopMic } =
    useVoiceSession();
  const [micOn, setMicOn] = useState(false);

  const toggleMic = async () => {
    if (micOn) {
      stopMic();
      setMicOn(false);
    } else {
      await startMic();
      setMicOn(true);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Sprite */}
      <div className="flex-[0_0_55%] flex items-center justify-center relative">
        <AnimatePresence mode="wait">
          <motion.img
            key={mood}
            src={MOOD_TO_SPRITE(mood)}
            alt={mood}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="max-h-full object-contain"
          />
        </AnimatePresence>
        {thinking && (
          <div className="absolute bottom-4 right-6 text-xs text-zinc-400 animate-pulse">
            mirabel is thinking…
          </div>
        )}
      </div>

      {/* Caption strip */}
      <div className="flex-1 px-6 py-4 overflow-y-auto space-y-3">
        {transcript && (
          <p className="text-zinc-400 text-sm">
            <span className="text-zinc-500">you:</span> {transcript}
          </p>
        )}
        {streamingText && (
          <p className="text-zinc-100 text-base leading-relaxed">{streamingText}</p>
        )}
      </div>

      {/* Mic */}
      <div className="flex items-center justify-center pb-8">
        <button
          onClick={toggleMic}
          disabled={!connected}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition
            ${micOn ? "bg-rose-500" : "bg-zinc-700"} disabled:opacity-40`}
          aria-label={micOn ? "stop listening" : "start listening"}
          id="voice-mic-toggle"
        >
          {micOn ? <MicOff size={28} /> : <Mic size={28} />}
        </button>
      </div>
    </div>
  );
}
