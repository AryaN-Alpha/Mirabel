import { Mic, Keyboard, House } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useNameHidden from "../hooks/useNameHidden";

function pillStyle(on) {
  return on
    ? {
        background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
        color: "#2c1c16",
        boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
      }
    : { background: "transparent", color: "rgba(243,233,226,0.58)", boxShadow: "none" };
}

export default function CozyHeader({ mode, onModeChange }) {
  const navigate = useNavigate();
  const [nameHidden] = useNameHidden();

  return (
    <header className="w-full max-w-[880px] mx-auto flex items-center justify-between gap-2 sm:gap-5 px-4 sm:px-6 pt-4 sm:pt-7">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <img src="/logo.png" alt="Mirabel Logo" className="w-9 h-9 sm:w-[50px] sm:h-[50px] object-contain shrink-0" />
        <div className="font-serif text-[17px] sm:text-[23px] tracking-[0.01em] truncate" style={{ color: "#f7ece4" }}>
          {nameHidden ? "•••••••" : "Mirabel"}
        </div>
      </div>

      <div
        className="flex items-center gap-1 sm:gap-1.5 p-[5px] rounded-full shrink-0"
        style={{ background: "rgba(243,233,226,0.06)", border: "1px solid rgba(243,233,226,0.09)", backdropFilter: "blur(10px)" }}
      >
        <button
          onClick={() => onModeChange("voice")}
          className="flex items-center gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
          style={pillStyle(mode === "voice")}
        >
          <Mic size={14} strokeWidth={1.7} />
          <span className="hidden sm:inline">Talk</span>
        </button>
        <button
          onClick={() => onModeChange("text")}
          className="flex items-center gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
          style={pillStyle(mode === "text")}
        >
          <Keyboard size={14} strokeWidth={1.7} />
          <span className="hidden sm:inline">Type</span>
        </button>
      </div>

      <button
        onClick={() => navigate("/home")}
        aria-label="Open home"
        className="grid place-items-center w-8 h-8 sm:w-[38px] sm:h-[38px] rounded-full border-none cursor-pointer transition-all duration-200 shrink-0"
        style={{ background: "rgba(243,233,226,0.06)", color: "rgba(243,233,226,0.58)" }}
      >
        <House size={16} strokeWidth={1.7} />
      </button>
    </header>
  );
}
