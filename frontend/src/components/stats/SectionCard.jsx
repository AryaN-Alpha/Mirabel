import { fontHeading, text, cream, space, radius } from "../homeTheme";
import { labelStyle, GlassPanel } from "../homeWidgets";

export function SectionCard({ title, subtitle, action, children, style }) {
  return (
    <GlassPanel hoverLift={false} style={{ padding: `${space[6]}px`, ...style }}>
      {(title || action) && (
        <div className="flex items-start justify-between flex-wrap" style={{ gap: space[3], marginBottom: space[4] }}>
          <div>
            {title && (
              <h2 style={{ fontFamily: fontHeading, fontSize: 22, color: text.base, margin: 0 }}>{title}</h2>
            )}
            {subtitle && <p style={{ ...labelStyle, marginTop: space[1] ?? 4, textTransform: "none", letterSpacing: 0, fontSize: 12 }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </GlassPanel>
  );
}

export function Skeleton({ height = 16, width = "100%" }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius.sm,
        background: `linear-gradient(90deg, ${cream(0.05)} 25%, ${cream(0.12)} 37%, ${cream(0.05)} 63%)`,
        backgroundSize: "400% 100%",
        animation: "stats-shimmer 1.6s ease infinite",
      }}
    />
  );
}

export function SkeletonBlock({ rows = 3 }) {
  return (
    <div className="flex flex-col" style={{ gap: space[3] }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={i === rows - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

export function ChartEmptyState({ children = "No telemetry in this range yet." }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: 220, color: cream(0.4), fontFamily: fontHeading, fontSize: 16, fontStyle: "italic" }}
    >
      {children}
    </div>
  );
}
