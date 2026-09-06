import { useRef, useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatInput({ onSend, disabled }) {
  const ref = useRef(null);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

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
      className="flex items-end gap-3 py-2 pl-[20px] pr-2 rounded-[28px] transition-all duration-200"
      style={{
        background: focused ? "rgba(246,248,255,0.06)" : "rgba(246,248,255,0.035)",
        border: focused ? "1px solid rgba(236,48,19,0.45)" : "1px solid rgba(246,248,255,0.10)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: focused
          ? "0 0 16px rgba(236,48,19,0.18), 0 8px 30px rgba(0,0,0,0.35)"
          : "0 8px 30px rgba(0,0,0,0.28)",
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        placeholder="Tell me what's on your mind…"
        className="flex-1 resize-none bg-transparent outline-none border-none py-2.5 text-[14.5px] font-normal disabled:opacity-50"
        style={{ color: "rgba(248,250,255,0.95)" }}
      />
      <motion.button
        whileHover={{ scale: disabled || !value.trim() ? 1 : 1.06 }}
        whileTap={{ scale: disabled || !value.trim() ? 1 : 0.94 }}
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="w-10 h-10 flex-shrink-0 grid place-items-center rounded-full border-none cursor-pointer disabled:cursor-not-allowed transition-all duration-200"
        style={{
          background: value.trim()
            ? "linear-gradient(135deg, rgba(236,48,19,0.92), rgba(180,25,8,0.88))"
            : "rgba(246,248,255,0.08)",
          border: value.trim() ? "1px solid rgba(255,130,100,0.45)" : "1px solid rgba(246,248,255,0.08)",
          color: value.trim() ? "#ffffff" : "rgba(246,248,255,0.35)",
          boxShadow: value.trim()
            ? "0 0 16px rgba(236,48,19,0.35), 0 4px 12px rgba(0,0,0,0.4)"
            : "none",
        }}
        aria-label="Send"
      >
        <ArrowRight size={16} strokeWidth={2} />
      </motion.button>
    </div>
  );
}

