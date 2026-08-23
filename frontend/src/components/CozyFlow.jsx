import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ChatScreen from "./ChatScreen";
import VoiceChatScreen from "./VoiceChatScreen";
import CozyHeader from "./CozyHeader";

export default function CozyFlow() {
  const [mode, setMode] = useState("text"); // "text" | "voice"

  return (
    <>
      <CozyHeader mode={mode} onModeChange={setMode} />

      <div className="relative flex-1 min-h-0 w-full flex flex-col items-center">
        <AnimatePresence mode="wait">
          {mode === "text" ? (
            <motion.div
              key="text"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full flex-1 min-h-0 flex flex-col items-center"
            >
              <ChatScreen />
            </motion.div>
          ) : (
            <motion.div
              key="voice"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full flex-1 min-h-0 flex flex-col items-center"
            >
              <VoiceChatScreen />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer
        className="text-center pb-8 pt-2 text-[12px] font-light tracking-[0.04em]"
        style={{ color: "rgba(243,233,226,0.26)" }}
      >
        {mode === "voice" ? "always here, never in a hurry" : "your words stay between us"}
      </footer>
    </>
  );
}
