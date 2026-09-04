import { fontHeading, fontMono, text, accent, cyan, cream, space } from "../homeTheme";

export default function PageHeader({
  category,
  title,
  subtitle,
  badge,
  actions,
  className = "",
  style,
}) {
  return (
    <div
      className={`w-full flex flex-col gap-4 pb-6 mb-6 ${className}`}
      style={{
        borderBottom: `1px solid ${cream(0.12)}`,
        marginTop: space[6],
        ...style,
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          {category && (
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontFamily: fontMono,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: cyan[400],
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: `${cyan[400]}14`,
                  border: `1px solid ${cyan[400]}33`,
                  display: "inline-block",
                }}
              >
                {category}
              </span>
              {badge}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <h1
              style={{
                fontFamily: fontHeading,
                fontSize: "clamp(26px, 3.2vw, 38px)",
                lineHeight: 1.15,
                color: text.bright,
                margin: 0,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h1>
            {!category && badge}
          </div>

          {subtitle && (
            <div
              style={{
                fontSize: 14.5,
                lineHeight: 1.6,
                color: text.secondary,
                maxWidth: "68ch",
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
