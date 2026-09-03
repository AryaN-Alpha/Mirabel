import { Outlet, useLocation } from "react-router-dom";
import { accent, fontHeading, space, cream } from "./homeTheme";

const COPY = {
  memories: {
    heading: (
      <>
        What Mirabel
        <br />
        <em style={{ fontStyle: "italic", color: accent[300] }}>remembers of you</em>
      </>
    ),
    body: "Every memory she keeps, with the mood it was formed in and the reason it stayed.",
  },
  tasks: {
    heading: (
      <>
        What Mirabel
        <br />
        <em style={{ fontStyle: "italic", color: accent[300] }}>can do for you</em>
      </>
    ),
    body: "Tell her what to handle — she'll queue it, work through it with tools of her own, and check in before anything irreversible.",
  },
};

export default function AgentPage() {
  const { pathname } = useLocation();
  const copy = pathname.endsWith("/memories") ? COPY.memories : COPY.tasks;

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
          {copy.heading}
        </h2>
        <p style={{ margin: `${space[5] ?? 23}px 0 0`, fontSize: 17, lineHeight: 1.85, textAlign: "justify", color: cream(0.7) }}>
          {copy.body}
        </p>
      </div>

      <div style={{ marginTop: space[6] * 1.4 }}>
        <Outlet />
      </div>
    </div>
  );
}
