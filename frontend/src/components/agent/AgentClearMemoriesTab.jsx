import { ShieldAlert } from "lucide-react";
import { space, cream } from "../homeTheme";
import { GlassPanel, PanelEyebrow } from "../homeWidgets";
import MemoryDangerZone from "./MemoryDangerZone";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

export default function AgentClearMemoriesTab() {
  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      <div style={entrance(0.05)}>
        <GlassPanel float={1} delay={0} style={{ padding: `${space[6]}px ${space[6]}px` }}>
          <PanelEyebrow icon={ShieldAlert}>Manage memory</PanelEyebrow>
          <p style={{ fontSize: 13, marginTop: space[3], color: cream(0.5), lineHeight: 1.7 }}>
            Permanently remove memories from Mirabel's recall — both from the database and the
            vector store. She won't reference anything you delete here in future conversations.
            This action is irreversible.
          </p>

          <MemoryDangerZone />
        </GlassPanel>
      </div>
    </div>
  );
}
