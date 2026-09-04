import { Outlet, useLocation } from "react-router-dom";
import { accent, space } from "./homeTheme";
import PageHeader from "./common/PageHeader";

const HEADER_CONFIG = {
  memories: {
    category: "SYNAPSE & EPISODIC MEMORY",
    subsystem: "LONG-TERM RECALL",
    title: "Memories",
    subtitle: "Every episodic memory Mirabel retains, indexed with emotional mood and salience scores.",
  },
  tasks: {
    category: "AUTONOMOUS OPERATIONS",
    subsystem: "AGENT EXECUTION",
    title: "Tasks",
    subtitle: "Asynchronous agent workflows, multi-tool actions, and supervised confirmations.",
  },
};

export default function AgentPage() {
  const { pathname } = useLocation();
  const isMemories = pathname.endsWith("/memories");
  const config = isMemories ? HEADER_CONFIG.memories : HEADER_CONFIG.tasks;

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      <PageHeader
        category={config.category}
        subsystem={config.subsystem}
        title={config.title}
        subtitle={config.subtitle}
      />

      <div style={{ marginTop: space[6] }}>
        <Outlet />
      </div>
    </div>
  );
}
