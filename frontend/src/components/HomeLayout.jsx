import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import HomeNavbar from "./HomeNavbar";
import ModelSettingsModal from "./ModelSettingsModal";

export default function HomeLayout() {
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);

  return (
    <div className="relative flex-1 min-h-0 w-full flex items-stretch">
      <Sidebar onOpenModelSettings={() => setModelSettingsOpen(true)} />
      <ModelSettingsModal open={modelSettingsOpen} onClose={() => setModelSettingsOpen(false)} />

      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col">
        <HomeNavbar title="Home" subtitle="Everything about your assistant, in one place." />
        <div className="px-6 md:px-8 pb-10 pt-4 flex-1">
          <Outlet context={{ onOpenModelSettings: () => setModelSettingsOpen(true) }} />
        </div>
      </div>
    </div>
  );
}
