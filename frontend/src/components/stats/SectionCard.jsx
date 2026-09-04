import { fontHeading, text, cream, space, radius } from "../homeTheme";

export function SectionCard({ title, subtitle, action, children, style, className = "" }) {
  return (
    <section
      className={`rounded-2xl p-6 transition-all duration-200 ${className}`}
      style={{
        background: "linear-gradient(165deg, rgba(16,14,22,0.72) 0%, rgba(8,8,13,0.66) 100%)",
        border: `1px solid ${cream(0.09)}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 14px 36px -16px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.05)",
        ...style,
      }}
    >
      {(title || action || subtitle) && (
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6 pb-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            {title && (
              <h2
                style={{
                  fontFamily: fontHeading,
                  fontSize: "clamp(19px, 2vw, 22px)",
                  fontWeight: 600,
                  color: text.bright,
                  margin: 0,
                  lineHeight: 1.25,
                }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: text.secondary,
                  margin: "4px 0 0 0",
                  maxWidth: "70ch",
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ height = 16, width = "100%" }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius.sm,
        background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.04) 63%)",
        backgroundSize: "400% 100%",
        animation: "stats-shimmer 1.6s ease infinite",
      }}
    />
  );
}

export function SkeletonBlock({ rows = 3 }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={16} width={i === rows - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

export function ChartEmptyState({ children = "No telemetry in this range yet." }) {
  return (
    <div
      className="flex items-center justify-center text-center p-6"
      style={{ height: 220, color: text.secondary, fontFamily: fontHeading, fontSize: 16, fontStyle: "italic" }}
    >
      {children}
    </div>
  );
}
