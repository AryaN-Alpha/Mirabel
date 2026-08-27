import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import HomeNavbar from "./HomeNavbar";
import { bg, accent, accent2700 } from "./homeTheme";

const PAGE_TITLES = {
  "/home/ai-model": "AI Model",
  "/home/outlook": "Outlook",
  "/home/linkedin": "LinkedIn",
  "/home/classroom": "Classroom",
  "/home/cv": "CV",
  "/home/agent": "Agent",
  "/home/tasks": "Tasks",
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
  const title = PAGE_TITLES[pathname];

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
        {title && <HomeNavbar title={title} />}
        <div className={title ? "px-6 md:px-8 pb-10 flex-1 w-full" : "flex-1 w-full"}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
