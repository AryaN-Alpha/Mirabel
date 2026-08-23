import { NavLink } from "react-router-dom";
import { LayoutDashboard, SlidersHorizontal, Brain, Zap, Mic2 } from "lucide-react";

const overviewItemStyle = ({ isActive }) => ({
  background: isActive ? "rgba(243,233,226,0.09)" : "transparent",
  color: isActive ? "#f7ece4" : "rgba(243,233,226,0.62)",
});

function NavButton({ icon: Icon, label, active, disabled, onClick, badge }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13.5px] tracking-[0.01em] border-none transition-all duration-200"
      style={{
        background: active ? "rgba(243,233,226,0.09)" : "transparent",
        color: disabled ? "rgba(243,233,226,0.32)" : active ? "#f7ece4" : "rgba(243,233,226,0.62)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <Icon size={16} strokeWidth={1.7} />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span
          className="text-[9.5px] uppercase tracking-[0.06em] px-2 py-[3px] rounded-full"
          style={{ background: "rgba(243,233,226,0.07)", color: "rgba(243,233,226,0.4)" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function Sidebar({ onOpenModelSettings }) {
  return (
    <aside
      className="hidden md:flex flex-col shrink-0 w-[240px] px-4 py-6 gap-6"
      style={{
        background: "rgba(243,233,226,0.03)",
        borderRight: "1px solid rgba(243,233,226,0.08)",
      }}
    >
      <NavLink to="/home" className="flex items-center gap-3 px-2 no-underline">
        <div className="relative w-[26px] h-[26px] grid place-items-center">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle at 40% 35%, rgba(247,207,174,0.9), rgba(198,132,152,0.45) 60%, transparent 72%)",
            }}
          />
          <div
            className="w-[8px] h-[8px] rounded-full"
            style={{ background: "#ffe6d2", boxShadow: "0 0 12px rgba(255,214,180,0.9)" }}
          />
        </div>
        <span className="font-serif text-[20px]" style={{ color: "#f7ece4" }}>
          Mirabel
        </span>
      </NavLink>

      <nav className="flex flex-col gap-1">
        <p
          className="text-[10.5px] uppercase tracking-[0.08em] px-3.5 mb-1"
          style={{ color: "rgba(243,233,226,0.35)" }}
        >
          General
        </p>
        <NavLink to="/home" end className="no-underline">
          {({ isActive }) => (
            <span
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-[13.5px] tracking-[0.01em]"
              style={overviewItemStyle({ isActive })}
            >
              <LayoutDashboard size={16} strokeWidth={1.7} />
              Overview
            </span>
          )}
        </NavLink>
        <NavButton icon={SlidersHorizontal} label="AI Model" onClick={onOpenModelSettings} />

        <p
          className="text-[10.5px] uppercase tracking-[0.08em] px-3.5 mt-4 mb-1"
          style={{ color: "rgba(243,233,226,0.35)" }}
        >
          Coming soon
        </p>
        <NavButton icon={Brain} label="Memory" disabled badge="Soon" />
        <NavButton icon={Zap} label="Automations" disabled badge="Soon" />
        <NavButton icon={Mic2} label="Voice presets" disabled badge="Soon" />
      </nav>
    </aside>
  );
}
