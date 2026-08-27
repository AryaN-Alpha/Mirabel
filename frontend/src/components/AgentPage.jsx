import { fontHeading, accent, space, cream } from "./homeTheme";
import AgentMemoriesTab from "./agent/AgentMemoriesTab";

export default function AgentPage() {
  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      <div style={{ maxWidth: 620, marginTop: space[8] * 1.5 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: fontHeading,
            fontWeight: 400,
            fontSize: "clamp(34px,3.8vw,52px)",
            lineHeight: 1.12,
            color: "#fbf5ec",
          }}
        >
          What Mirabel
          <br />
          <em style={{ fontStyle: "italic", color: accent[300] }}>remembers of you</em>
        </h2>
        <p style={{ margin: `${space[5] ?? 23}px 0 0`, fontSize: 17, lineHeight: 1.85, textAlign: "justify", color: cream(0.7) }}>
          Every memory she keeps, with the mood it was formed in and the reason it stayed.
        </p>
      </div>

      <AgentMemoriesTab />
    </div>
  );
}
