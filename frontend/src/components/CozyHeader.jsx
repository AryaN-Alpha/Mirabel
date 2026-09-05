import { useState, useEffect } from "react";
import { Mic, Keyboard, House } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useNameHidden from "../hooks/useNameHidden";

function pillStyle(on) {
  return on
    ? {
        background: "linear-gradient(150deg, rgba(236,48,19,0.80), rgba(180,30,10,0.70))",
        color: "rgba(246,248,255,0.95)",
        boxShadow: "0 4px 18px rgba(236,48,19,0.30)",
      }
    : { background: "transparent", color: "rgba(246,248,255,0.45)", boxShadow: "none" };
}

/* ── PWA install icon button (always visible) ────────────────────────────
   States:
   - no prompt yet  → dimmed, non-clickable (hover tooltip explains)
   - prompt ready   → purple glow, clickable
   - installing     → spinner
   - installed      → green checkmark
──────────────────────────────────────────────────────────────────────── */
function PWAInstallButton() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const canInstall = !!prompt && !installed;

  const tooltipText = installed
    ? "Mirabel is installed ✓"
    : canInstall
    ? "Install Mirabel as an app"
    : "Open via HTTPS in Chrome/Edge to install";

  const handleInstall = async () => {
    if (!prompt) return;
    setInstalling(true);
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null);
    setInstalling(false);
  };

  const bg = installed
    ? "rgba(34,197,94,0.12)"
    : canInstall
    ? "rgba(124,58,237,0.12)"
    : "rgba(255,255,255,0.04)";

  const color = installed
    ? "rgba(74,222,128,0.80)"
    : canInstall
    ? "rgba(167,139,250,0.90)"
    : "rgba(255,255,255,0.22)";

  const borderColor = installed
    ? "rgba(34,197,94,0.25)"
    : canInstall
    ? "rgba(124,58,237,0.30)"
    : "rgba(255,255,255,0.08)";

  const shadow = canInstall && !installing ? "0 0 10px rgba(124,58,237,0.18)" : "none";

  return (
    <button
      id="pwa-topbar-install-btn"
      onClick={handleInstall}
      disabled={installing || !canInstall}
      aria-label={tooltipText}
      title={tooltipText}
      className="grid place-items-center w-8 h-8 sm:w-[38px] sm:h-[38px] rounded-full shrink-0"
      style={{
        background: bg,
        color,
        border: `1px solid ${borderColor}`,
        boxShadow: shadow,
        cursor: canInstall ? "pointer" : "default",
        transition: "background 0.2s, color 0.2s, transform 0.15s, box-shadow 0.2s",
        outline: "none",
      }}
      onMouseEnter={(e) => {
        if (!canInstall || installing) return;
        e.currentTarget.style.background = "rgba(124,58,237,0.25)";
        e.currentTarget.style.boxShadow = "0 0 16px rgba(124,58,237,0.38)";
        e.currentTarget.style.transform = "scale(1.08)";
      }}
      onMouseLeave={(e) => {
        if (!canInstall || installing) return;
        e.currentTarget.style.background = bg;
        e.currentTarget.style.boxShadow = shadow;
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {installing ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path
            d="M21 12a9 9 0 1 1-6.219-8.56"
            style={{ animation: "pwa-spin 0.8s linear infinite", transformOrigin: "center" }}
          />
        </svg>
      ) : installed ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v13" />
          <path d="M7 11l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      )}
      <style>{`@keyframes pwa-spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

/* ── Header ──────────────────────────────────────────────────────────────── */
export default function CozyHeader({ mode, onModeChange }) {
  const navigate = useNavigate();
  const [nameHidden] = useNameHidden();

  return (
    <header className="w-full max-w-[880px] mx-auto flex items-center justify-between gap-2 sm:gap-5 px-4 sm:px-6 pt-4 sm:pt-7">
      {/* Left — logo + name */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <img
          src="/logo.png"
          alt="Mirabel Logo"
          className="w-9 h-9 sm:w-[50px] sm:h-[50px] object-contain shrink-0"
        />
        <div
          className="font-serif text-[17px] sm:text-[23px] tracking-[0.01em] truncate"
          style={{ color: "rgba(246,248,255,0.90)" }}
        >
          {nameHidden ? "•••••••" : "Mirabel"}
        </div>
      </div>

      {/* Centre — Talk / Type pill */}
      <div
        className="flex items-center gap-1 sm:gap-1.5 p-[5px] rounded-full shrink-0"
        style={{
          background: "rgba(10,9,13,0.80)",
          border: "1px solid rgba(246,248,255,0.10)",
          backdropFilter: "blur(10px)",
        }}
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

      {/* Right — install + home */}
      <div className="flex items-center gap-2 shrink-0">
        <PWAInstallButton />
        <button
          onClick={() => navigate("/home")}
          aria-label="Open home"
          className="grid place-items-center w-8 h-8 sm:w-[38px] sm:h-[38px] rounded-full border-none cursor-pointer transition-all duration-200 shrink-0"
          style={{
            background: "rgba(246,248,255,0.05)",
            color: "rgba(246,248,255,0.45)",
            border: "1px solid rgba(246,248,255,0.08)",
          }}
        >
          <House size={16} strokeWidth={1.7} />
        </button>
      </div>
    </header>
  );
}
