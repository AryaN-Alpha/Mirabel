import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, SlidersHorizontal, Mail, Linkedin, GraduationCap, FileText, Brain, SquareKanban, Music, BarChart3 } from "lucide-react";
import { fontHeading, text, accent } from "./homeTheme";

function NavRow({ icon: Icon, label, to, end }) {
  const [hovered, setHovered] = useState(false);

  return (
    <NavLink to={to} end={end} className="no-underline" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {({ isActive }) => (
        <span
          className="flex items-center gap-3 py-3 pl-3"
          style={{
            borderLeft: `1px solid ${isActive ? accent[400] : hovered ? accent[600] : text.divider}`,
            fontFamily: fontHeading,
            fontSize: 17,
            color: isActive || hovered ? text.base : text.muted,
            paddingLeft: hovered ? 16 : 12,
            transition: "color 0.4s ease, padding-left 0.4s ease, border-color 0.4s ease",
          }}
        >
          <Icon size={15} strokeWidth={1.6} />
          {label}
        </span>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside
      className="hidden md:flex relative flex-col shrink-0 w-[264px] px-6 py-8"
      style={{
        borderRight: `1px solid ${text.divider}`,
        background: "rgba(15,12,10,0.55)",
      }}
    >
      <NavLink to="/home" end className="flex items-center gap-3 no-underline mb-8">
        <img src="/logo.png" alt="Mirabel Logo" className="w-16 h-16 object-contain" />
        <span style={{ fontFamily: fontHeading, fontSize: 23, fontStyle: "italic", color: text.bright }}>
          Mirabel
        </span>
      </NavLink>

      <p className="text-[10px] uppercase mb-4" style={{ letterSpacing: "0.18em", color: text.faint }}>
        General
      </p>

      <nav className="flex flex-col">
        <NavRow icon={LayoutDashboard} label="Me" to="/home" end />
        <NavRow icon={SlidersHorizontal} label="AI Model" to="/home/ai-model" />
        <NavRow icon={Mail} label="Outlook" to="/home/outlook" />
        <NavRow icon={Linkedin} label="LinkedIn" to="/home/linkedin" />
        <NavRow icon={GraduationCap} label="Classroom" to="/home/classroom" />
        <NavRow icon={FileText} label="CV" to="/home/cv" />
        <NavRow icon={Music} label="Spotify" to="/home/spotify" />
        <NavRow icon={Brain} label="Agent" to="/home/agent" />
        <NavRow icon={SquareKanban} label="Tasks" to="/home/tasks" />
        <NavRow icon={BarChart3} label="Stats" to="/home/stats" />
      </nav>
    </aside>
  );
}
