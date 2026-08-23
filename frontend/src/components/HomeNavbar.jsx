import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";

export default function HomeNavbar({ title, subtitle }) {
  return (
    <header className="w-full flex items-center justify-between gap-5 px-6 md:px-8 pt-7 pb-2">
      <div>
        <h1 className="font-serif text-[26px] leading-none" style={{ color: "#f7ece4" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-[13px] mt-1.5" style={{ color: "rgba(243,233,226,0.5)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <Link
        to="/"
        className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] no-underline transition-all duration-200"
        style={{
          background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
          color: "#2c1c16",
          boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
        }}
      >
        <MessageCircle size={14} strokeWidth={1.7} />
        Open chat
      </Link>
    </header>
  );
}
