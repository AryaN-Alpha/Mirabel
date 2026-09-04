import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  SlidersHorizontal,
  Mail,
  Linkedin,
  GraduationCap,
  FileText,
  Brain,
  SquareKanban,
  Music,
  BarChart3,
  Inbox,
  PenSquare,
  Clock,
  FileSignature,
  Activity,
  User,
  Repeat2,
  Settings,
  ClipboardList,
  Search,
  Home,
  Library,
  ListMusic,
  Users,
  TrendingUp,
  Sparkles,
  Bot,
  Eye,
  EyeOff,
  Menu,
  X,
} from "lucide-react";
import { fontHeading, text, accent, cream } from "./homeTheme";
import useNameHidden from "../hooks/useNameHidden";

// Sidebar nav config. An item with `children` renders as an expandable tree
// node — its sub-items appear indented beneath it whenever the current route
// is inside that section (see isSectionActive), instead of the page itself
// rendering its own tab row.
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Me", to: "/home", end: true },
  {
    icon: SlidersHorizontal,
    label: "AI Model",
    to: "/home/ai-model",
    children: [
      { label: "Anthropic", to: "/home/ai-model/anthropic" },
      { label: "Gemini", to: "/home/ai-model/gemini" },
      { label: "OpenAI", to: "/home/ai-model/openai" },
      { label: "DeepSeek", to: "/home/ai-model/deepseek" },
      { label: "OpenCode", to: "/home/ai-model/opencode" },
    ],
  },
  {
    icon: Mail,
    label: "Outlook",
    to: "/home/outlook",
    children: [
      { icon: Inbox, label: "Inbox", to: "/home/outlook/inbox" },
      { icon: PenSquare, label: "Compose", to: "/home/outlook/compose" },
      { icon: Clock, label: "Scheduled", to: "/home/outlook/scheduled" },
      { icon: FileSignature, label: "Signature", to: "/home/outlook/signature" },
    ],
  },
  {
    icon: Linkedin,
    label: "LinkedIn",
    to: "/home/linkedin",
    children: [
      { icon: Activity, label: "Overview", to: "/home/linkedin/overview" },
      { icon: User, label: "Profile", to: "/home/linkedin/profile" },
      { icon: PenSquare, label: "Create post", to: "/home/linkedin/create" },
      { icon: FileText, label: "Drafts", to: "/home/linkedin/drafts" },
      { icon: Repeat2, label: "Automations", to: "/home/linkedin/automations" },
      { icon: Search, label: "AI Research", to: "/home/linkedin/research" },
      { icon: Settings, label: "Settings", to: "/home/linkedin/settings" },
    ],
  },
  {
    icon: GraduationCap,
    label: "Classroom",
    to: "/home/classroom",
    children: [
      { icon: ClipboardList, label: "Assignments", to: "/home/classroom/assignments" },
      { icon: FileText, label: "Drafts", to: "/home/classroom/drafts" },
      { icon: Settings, label: "Settings", to: "/home/classroom/settings" },
    ],
  },
  { icon: FileText, label: "CV", to: "/home/cv" },
  {
    icon: Music,
    label: "Spotify",
    to: "/home/spotify",
    children: [
      { icon: Home, label: "Home", to: "/home/spotify/home" },
      { icon: Search, label: "Search", to: "/home/spotify/search" },
      { icon: Library, label: "Library", to: "/home/spotify/library" },
      { icon: ListMusic, label: "Playlists", to: "/home/spotify/playlists" },
      { icon: Users, label: "Artists", to: "/home/spotify/artists" },
      { icon: TrendingUp, label: "Top Tracks", to: "/home/spotify/top-tracks" },
      { icon: ListMusic, label: "Queue", to: "/home/spotify/queue" },
      { icon: TrendingUp, label: "Statistics", to: "/home/spotify/stats" },
      { icon: Sparkles, label: "AI Playlist", to: "/home/spotify/ai-playlist" },
    ],
  },
  {
    icon: Brain,
    label: "Agent",
    to: "/home/agent",
    children: [
      { icon: Bot, label: "Tasks", to: "/home/agent/tasks" },
      { icon: Brain, label: "Memories", to: "/home/agent/memories" },
    ],
  },
  { icon: SquareKanban, label: "Tasks", to: "/home/tasks" },
  { icon: BarChart3, label: "Stats", to: "/home/stats" },
];

function isSectionActive(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavRow({ icon: Icon, label, to, end, onNavigate }) {
  const [hovered, setHovered] = useState(false);

  return (
    <NavLink
      to={to}
      end={end}
      className="no-underline"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onNavigate}
    >
      {({ isActive }) => (
        <span
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{
            fontFamily: fontHeading,
            fontSize: 15.5,
            color: isActive ? text.bright : hovered ? text.base : text.muted,
            background: isActive
              ? `linear-gradient(90deg, ${accent[600]}2e 0%, ${accent[600]}0d 100%)`
              : hovered
                ? cream(0.06)
                : "transparent",
            boxShadow: `inset 2px 0 0 0 ${isActive ? accent[400] : hovered ? accent[600] : "transparent"}`,
            transition: "color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease",
          }}
        >
          <Icon size={15} strokeWidth={1.6} color={isActive ? accent[400] : undefined} />
          {label}
        </span>
      )}
    </NavLink>
  );
}

// Smaller, indented tree-child row for a section's sub-items. Icon is
// optional — the AI Model provider list has none, matching its original
// plain-text-list look.
function NavSubRow({ icon: Icon, label, to, onNavigate }) {
  const [hovered, setHovered] = useState(false);

  return (
    <NavLink to={to} className="no-underline" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={onNavigate}>
      {({ isActive }) => (
        <span
          className="flex items-center gap-2.5 pl-3 pr-3 py-1.5 rounded-lg"
          style={{
            fontFamily: fontHeading,
            fontSize: 13.5,
            color: isActive ? text.base : hovered ? text.base : text.faint,
            background: isActive ? cream(0.07) : hovered ? cream(0.045) : "transparent",
            boxShadow: `inset 2px 0 0 0 ${isActive ? accent[300] : hovered ? accent[600] : "transparent"}`,
            transition: "color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease",
          }}
        >
          {Icon && <Icon size={12} strokeWidth={1.6} />}
          {label}
        </span>
      )}
    </NavLink>
  );
}

// Shared nav-list body used by both the persistent desktop sidebar and the
// mobile slide-over drawer, so the two never drift out of sync.
function SidebarNav({ pathname, onNavigate }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const expanded = item.children && isSectionActive(pathname, item.to);
        return (
          <div key={item.to}>
            <NavRow icon={item.icon} label={item.label} to={item.to} end={item.end} onNavigate={onNavigate} />
            {expanded && (
              <div className="flex flex-col ml-3" style={{ gap: 1, marginTop: 3, marginBottom: 6 }}>
                {item.children.map((child) => (
                  <NavSubRow key={child.to} icon={child.icon} label={child.label} to={child.to} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBrand({ nameHidden, toggleNameHidden, onNavigate }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <NavLink to="/home" end className="flex items-center gap-3 no-underline min-w-0" onClick={onNavigate}>
        <img src="/logo.png" alt="Mirabel Logo" className="w-16 h-16 object-contain shrink-0" />
        <span
          style={{
            fontFamily: fontHeading,
            fontSize: 23,
            fontStyle: "italic",
            color: text.bright,
            letterSpacing: nameHidden ? "0.14em" : undefined,
          }}
        >
          {nameHidden ? "•••••••" : "Mirabel"}
        </span>
      </NavLink>
      <button
        type="button"
        onClick={toggleNameHidden}
        aria-label={nameHidden ? "Show Mirabel name" : "Hide Mirabel name"}
        title={nameHidden ? "Show name" : "Hide name"}
        className="ml-auto shrink-0 p-1.5 rounded-md hover:bg-white/5 transition-colors"
        style={{ color: text.faint }}
      >
        {nameHidden ? <EyeOff size={14} strokeWidth={1.6} /> : <Eye size={14} strokeWidth={1.6} />}
      </button>
    </div>
  );
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const [nameHidden, toggleNameHidden] = useNameHidden();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer automatically on route change and never let it linger
  // open if the viewport grows past the mobile breakpoint.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation menu"
        className="md:hidden fixed top-4 left-4 z-40 grid place-items-center w-10 h-10 rounded-full"
        style={{
          background: "rgba(8,8,9,0.7)",
          border: `1px solid ${cream(0.12)}`,
          color: text.base,
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 28px -12px rgba(0,0,0,0.6)",
        }}
      >
        <Menu size={18} strokeWidth={1.8} />
      </button>

      <aside
        className="hidden md:flex relative flex-col shrink-0 w-[260px] m-4 px-5 py-7 overflow-y-auto rounded-[22px]"
        style={{
          background: "transparent",
          border: `1px solid ${cream(0.04)}`,
          boxShadow: "none",
        }}
      >
        <SidebarBrand nameHidden={nameHidden} toggleNameHidden={toggleNameHidden} />
        <p className="text-[10px] uppercase mb-4" style={{ letterSpacing: "0.18em", color: text.faint }}>
          General
        </p>
        <SidebarNav pathname={pathname} />
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(2,2,4,0.6)", backdropFilter: "blur(2px)" }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative flex flex-col w-[82vw] max-w-[300px] my-3 ml-3 px-5 py-7 overflow-y-auto rounded-[22px]"
            style={{
              background: "linear-gradient(165deg, rgba(11,10,10,0.95) 0%, rgba(5,5,5,0.92) 100%)",
              border: `1px solid ${cream(0.1)}`,
              boxShadow: "0 24px 60px -18px rgba(0,0,0,0.8), 0 0 46px -18px rgba(221,43,15,0.2)",
              backdropFilter: "blur(20px) saturate(108%)",
              WebkitBackdropFilter: "blur(20px) saturate(108%)",
              maxHeight: "calc(100% - 24px)",
            }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-6 right-4 p-1.5 rounded-md hover:bg-white/5"
              style={{ color: text.faint }}
            >
              <X size={18} strokeWidth={1.8} />
            </button>
            <SidebarBrand
              nameHidden={nameHidden}
              toggleNameHidden={toggleNameHidden}
              onNavigate={() => setMobileOpen(false)}
            />
            <p className="text-[10px] uppercase mb-4" style={{ letterSpacing: "0.18em", color: text.faint }}>
              General
            </p>
            <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
