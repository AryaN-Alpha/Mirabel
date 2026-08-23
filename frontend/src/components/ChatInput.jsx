import { useRef, useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSend, disabled }) {
  const ref = useRef(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`;
    }
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue("");
    onSend(trimmed);
  }

  return (
    <div
      className="flex items-end gap-3 py-2 pl-[22px] pr-2 rounded-[28px]"
      style={{
        background: "rgba(243,233,226,0.06)",
        border: "1px solid rgba(243,233,226,0.11)",
        backdropFilter: "blur(14px)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        placeholder="Tell me what's on your mind…"
        className="flex-1 resize-none bg-transparent outline-none border-none py-3 text-[15.5px] font-light disabled:opacity-50"
        style={{ color: "#fbf1ea" }}
      />
      <motion.button
        whileHover={{ scale: disabled || !value.trim() ? 1 : 1.06 }}
        whileTap={{ scale: disabled || !value.trim() ? 1 : 0.95 }}
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="w-11 h-11 flex-shrink-0 grid place-items-center rounded-full border-none cursor-pointer disabled:cursor-not-allowed transition-opacity"
        style={{
          background: "linear-gradient(150deg, rgba(247,207,174,0.95), rgba(214,150,150,0.9))",
          color: "#2a1a14",
          opacity: disabled || !value.trim() ? 0.5 : 1,
        }}
        aria-label="Send"
      >
        <ArrowRight size={17} strokeWidth={1.8} />
      </motion.button>
    </div>
  );
}
