import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import HomeNavbar from "./HomeNavbar";
import { bg, accent, accent2700 } from "./homeTheme";

const PAGE_HEADERS = {
  "/home/ai-model": { title: "AI Model", subtitle: "Choose the provider and model Mirabel uses, and manage API keys." },
  "/home/outlook": { title: "Outlook", subtitle: "Read and reply to email from dgtdata.com, right from Mirabel." },
  "/home/linkedin": { title: "LinkedIn", subtitle: "Draft, generate, and publish LinkedIn posts, right from Mirabel." },
  "/home/classroom": {
    title: "Classroom",
    subtitle: "Fetch assignments, draft AI solutions, and turn them in — right from Mirabel.",
  },
  "/home/cv": { title: "CV", subtitle: "Upload, edit, and tailor your CV — with live preview and AI-assisted sections." },
  "/home/agent": { title: "Agent", subtitle: "Browse Mirabel's emotional memory — what she's remembered, and why." },
  "/home/tasks": { title: "Tasks", subtitle: "Organize your workflow and projects on a Kanban board." },
};

const EMBERS = [
  { left: "18%", bottom: "6%", size: 2, duration: 14, delay: 0 },
  { left: "29%", bottom: "12%", size: 3, duration: 19, delay: 3 },
  { left: "41%", bottom: "2%", size: 2, duration: 16, delay: 7 },
  { left: "55%", bottom: "18%", size: 2, duration: 21, delay: 1.5 },
  { left: "66%", bottom: "4%", size: 3, duration: 18, delay: 9 },
  { left: "74%", bottom: "22%", size: 2, duration: 24, delay: 5 },
  { left: "87%", bottom: "8%", size: 2, duration: 20, delay: 12 },
  { left: "94%", bottom: "30%", size: 2, duration: 27, delay: 2 },
];

export default function HomeLayout() {
  const { pathname } = useLocation();
  const header = PAGE_HEADERS[pathname];

  return (
    <div className="relative flex-1 min-h-0 w-full flex items-stretch overflow-hidden" style={{ background: bg }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(120% 90% at 12% 8%, ${accent[400]}29 0%, transparent 58%)`,
          animation: "home-hearth 17s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(90% 70% at 82% 96%, ${accent2700}66 0%, transparent 60%)`,
          animation: "home-drift 26s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(70% 60% at 62% 40%, ${accent[800]}56 0%, transparent 62%)`,
          animation: "home-drift 34s ease-in-out infinite reverse",
        }}
      />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {EMBERS.map((ember, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: ember.left,
              bottom: ember.bottom,
              width: ember.size,
              height: ember.size,
              background: i % 2 === 0 ? accent[300] : accent[200],
              animation: `home-ember ${ember.duration}s linear infinite ${ember.delay}s`,
            }}
          />
        ))}
      </div>

      <Sidebar />

      <div className="relative flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col">
        {header && <HomeNavbar title={header.title} subtitle={header.subtitle} />}
        <div className={header ? "px-6 md:px-8 pb-10 pt-4 flex-1 w-full" : "flex-1 w-full"}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
