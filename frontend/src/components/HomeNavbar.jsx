import { useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { fontHeading, text, accent } from "./homeTheme";

function greetingLine() {
  const h = new Date().getHours();
  const part = h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part} — welcome back`;
}

export default function HomeNavbar({ title }) {
  const [hovered, setHovered] = useState(false);

  return (
    <header
      className="w-full flex flex-wrap items-start justify-between gap-4 md:gap-6 px-4 md:px-8 pt-6 md:pt-8 relative z-20"
      style={{ animation: "home-rise 1.1s cubic-bezier(.2,.7,.2,1) both" }}
    >
      <div>
        <div className="text-[10px] md:text-[11px] uppercase tracking-[0.2em]" style={{ color: text.faint }}>
          {greetingLine()}
        </div>
        <div
          className="text-[21px] md:text-[26px]"
          style={{ fontFamily: fontHeading, fontStyle: "italic", color: text.base, marginTop: 9 }}
        >
          {title}
        </div>
      </div>

      {/* Right actions container — offset by mr-12/14 on desktop to leave room for GalaxyControls */}
      <div className="flex items-center shrink-0 md:mr-14">
        <Link
          to="/"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="no-underline inline-flex items-center gap-2.5 px-4 py-2 rounded-full cursor-pointer transition-all duration-300"
          style={{
            background: hovered
              ? "radial-gradient(circle at 40% 35%, rgba(236,48,19,0.24), rgba(14,13,18,0.92) 80%)"
              : "rgba(14,13,18,0.72)",
            border: hovered
              ? "1px solid rgba(236,48,19,0.48)"
              : "1px solid rgba(246,248,255,0.12)",
            color: hovered ? "rgba(255,255,255,0.98)" : "rgba(246,248,255,0.88)",
            boxShadow: hovered
              ? "0 6px 24px rgba(0,0,0,0.5), 0 0 18px rgba(236,48,19,0.28)"
              : "0 4px 18px rgba(0,0,0,0.35)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            transform: hovered ? "translateY(-1px) scale(1.02)" : "translateY(0) scale(1)",
            fontSize: 13.5,
            fontFamily: fontHeading,
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
          aria-label="Open chat with Mirabel"
        >
          <span
            className="w-2 h-2 rounded-full shrink-0 transition-all duration-300"
            style={{
              background: "#ec3013",
              boxShadow: hovered ? "0 0 8px rgba(236,48,19,0.9)" : "0 0 4px rgba(236,48,19,0.6)",
            }}
          />
          <MessageCircle
            size={14}
            strokeWidth={1.7}
            className="transition-colors duration-200 shrink-0"
            style={{ color: hovered ? "#ff9783" : "rgba(246,248,255,0.75)" }}
          />
          <span>Open chat</span>
        </Link>
      </div>
    </header>
  );
}
