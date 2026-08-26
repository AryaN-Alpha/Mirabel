import { useState } from "react";
import { Brain } from "lucide-react";
import AgentMemoriesTab from "./agent/AgentMemoriesTab";

export const cardStyle = {
  background: "linear-gradient(165deg, rgba(46,30,26,0.9), rgba(30,19,17,0.94))",
  border: "1px solid rgba(243,233,226,0.1)",
};

export const inputStyle = {
  background: "rgba(243,233,226,0.05)",
  border: "1px solid rgba(243,233,226,0.14)",
  color: "#f3e9e2",
};

export function tabStyle(active) {
  return active
    ? {
        background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
        color: "#2c1c16",
        boxShadow: "0 6px 22px rgba(240,168,120,0.28)",
      }
    : { background: "transparent", color: "rgba(243,233,226,0.58)", boxShadow: "none" };
}

const TABS = [{ id: "memories", label: "Memories", icon: Brain }];

export default function AgentPage() {
  const [activeTab, setActiveTab] = useState("memories");

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="rounded-3xl p-6 md:p-7" style={cardStyle}>
        <div
          className="flex items-center gap-1.5 p-[5px] rounded-full mb-6 w-fit flex-wrap"
          style={{ background: "rgba(243,233,226,0.06)", border: "1px solid rgba(243,233,226,0.09)" }}
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] tracking-[0.01em] transition-all duration-200 cursor-pointer border-none"
              style={tabStyle(activeTab === id)}
            >
              <Icon size={14} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "memories" && <AgentMemoriesTab />}
      </div>
    </div>
  );
}
