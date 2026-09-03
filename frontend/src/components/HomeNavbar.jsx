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
        <div className="text-[10px] md:text-[11px] uppercase" style={{ letterSpacing: "0.2em", color: text.faint }}>
          {greetingLine()}
        </div>
        <div
          className="text-[21px] md:text-[26px]"
          style={{ fontFamily: fontHeading, fontStyle: "italic", color: text.base, marginTop: 9 }}
        >
          {title}
        </div>
      </div>
      <Link
        to="/"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="no-underline inline-flex items-center gap-2 shrink-0"
        style={{
          padding: "9px 18px",
          border: `1px solid ${accent[400]}8c`,
          borderRadius: 4,
          fontFamily: fontHeading,
          fontSize: 15,
          color: accent[200],
          background: hovered ? `${accent[400]}1f` : "transparent",
          borderColor: hovered ? accent[400] : `${accent[400]}8c`,
          transition: "background 0.5s ease, border-color 0.5s ease",
        }}
      >
        <MessageCircle size={15} strokeWidth={1.4} />
        Open chat
      </Link>
    </header>
  );
}
