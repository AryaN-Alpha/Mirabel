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
      className="w-full flex flex-wrap items-start justify-between gap-4 md:gap-6 px-4 md:px-8 pt-6 md:pt-8"
      style={{ animation: "home-rise 1.1s cubic-bezier(.2,.7,.2,1) both" }}
    >
      <div>
        <div className="text-[11px] md:text-[12px] uppercase font-semibold" style={{ letterSpacing: "0.18em", color: text.secondary }}>
          {greetingLine()}
        </div>
        <div
          className="text-[22px] md:text-[28px]"
          style={{ fontFamily: fontHeading, fontStyle: "italic", color: text.bright, marginTop: 6 }}
        >
          {title}
        </div>
      </div>
      <Link
        to="/"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="no-underline inline-flex items-center gap-2 shrink-0 mr-12 md:mr-14"
        style={{
          padding: "9px 20px",
          border: `1px solid ${hovered ? "#38bdf8" : "rgba(56, 189, 248, 0.38)"}`,
          borderRadius: 6,
          fontFamily: fontHeading,
          fontSize: 15,
          fontWeight: 600,
          color: text.bright,
          background: hovered ? "rgba(56, 189, 248, 0.12)" : "rgba(255, 255, 255, 0.03)",
          boxShadow: hovered ? "0 0 16px rgba(56, 189, 248, 0.25)" : "none",
          transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
        }}
      >
        <MessageCircle size={15} strokeWidth={1.6} color="#38bdf8" />
        Open chat
      </Link>
    </header>
  );
}
