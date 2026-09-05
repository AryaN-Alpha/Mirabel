import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import HomeNavbar from "./HomeNavbar";
import { fontHeading, text } from "./homeTheme";
import { ScrollContainerProvider, useScrollContainer } from "./ScrollContainerContext";
import SpotifyNowPlayingBar from "./spotify/SpotifyNowPlayingBar";
import GlobalChatWidget from "./GlobalChatWidget";

const PAGE_TITLES = {
  "/home/ai-model": "AI Model",
  "/home/outlook": "Outlook",
  "/home/linkedin": "LinkedIn",
  "/home/classroom": "Classroom",
  "/home/cv": "CV",
  "/home/agent": "Agent",
  "/home/tasks": "Tasks",
  "/home/spotify": "Spotify",
  "/home/stats": "Stats",
};


function resolveTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefix = Object.keys(PAGE_TITLES).find((path) => pathname.startsWith(`${path}/`));
  return prefix ? PAGE_TITLES[prefix] : undefined;
}

export default function HomeLayout() {
  const { pathname } = useLocation();
  const title = resolveTitle(pathname);

  return (
    <ScrollContainerProvider>
      <HomeLayoutInner title={title} />
    </ScrollContainerProvider>
  );
}

function HomeLayoutInner({ title }) {
  const scrollRef = useScrollContainer();

  return (
    <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden">
      <div className="relative flex-1 min-h-0 w-full flex items-stretch overflow-hidden">

        <Sidebar />

        <div ref={scrollRef} className={`relative flex-1 min-w-0 min-h-0 flex flex-col ${title ? "overflow-y-auto" : "overflow-hidden"}`}>
          <div
            className="md:hidden flex items-center justify-center h-14 shrink-0"
            style={{ borderBottom: `1px solid ${text.divider}` }}
          >
            <span style={{ fontFamily: fontHeading, fontSize: 18, fontStyle: "italic", color: text.bright }}>
              Mirabel
            </span>
          </div>
          {title && <HomeNavbar title={title} />}
          <div className={title ? "px-4 md:px-8 pb-10 flex-1 w-full min-w-0" : "flex-1 w-full min-h-0 min-w-0"}>
            <Outlet />
          </div>
        </div>
      </div>

      <SpotifyNowPlayingBar />
      <GlobalChatWidget />
    </div>
  );
}
