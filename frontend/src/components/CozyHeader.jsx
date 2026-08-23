import { Mic, Keyboard, Settings } from "lucide-react";

function pillStyle(on) {
  return on
    ? {
        background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
        color: "#2c1c16",
        boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
      }
    : { background: "transparent", color: "rgba(243,233,226,0.58)", boxShadow: "none" };
}

export default function CozyHeader({ mode, onModeChange, onOpenSettings }) {
  return (
    <header className="w-full max-w-[880px] mx-auto flex items-center justify-between gap-5 px-6 pt-7">
      <div className="flex items-center gap-3">
        <div className="relative w-[30px] h-[30px] grid place-items-center">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle at 40% 35%, rgba(247,207,174,0.9), rgba(198,132,152,0.45) 60%, transparent 72%)",
              animation: "cz-breathe 5.5s ease-in-out infinite",
            }}
          />
          <div
            className="w-[9px] h-[9px] rounded-full"
            style={{ background: "#ffe6d2", boxShadow: "0 0 14px rgba(255,214,180,0.9)" }}
          />
        </div>
        <div className="font-serif text-[23px] tracking-[0.01em]" style={{ color: "#f7ece4" }}>
          Mirabel
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 p-[5px] rounded-full"
        style={{ background: "rgba(243,233,226,0.06)", border: "1px solid rgba(243,233,226,0.09)", backdropFilter: "blur(10px)" }}
      >
        <button
          onClick={() => onModeChange("voice")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
          style={pillStyle(mode === "voice")}
        >
          <Mic size={14} strokeWidth={1.7} />
          Talk
        </button>
        <button
          onClick={() => onModeChange("text")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
          style={pillStyle(mode === "text")}
        >
          <Keyboard size={14} strokeWidth={1.7} />
          Type
        </button>
      </div>

      <button
        onClick={onOpenSettings}
        aria-label="Model settings"
        className="grid place-items-center w-[38px] h-[38px] rounded-full border-none cursor-pointer transition-all duration-200"
        style={{ background: "rgba(243,233,226,0.06)", color: "rgba(243,233,226,0.58)" }}
      >
        <Settings size={16} strokeWidth={1.7} />
      </button>
    </header>
  );
}
