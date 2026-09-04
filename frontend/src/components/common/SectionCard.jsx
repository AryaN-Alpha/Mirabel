import { fontHeading, text, cream, space, radius } from "../homeTheme";

export default function SectionCard({
  title,
  subtitle,
  icon: Icon,
  badge,
  action,
  children,
  className = "",
  style,
}) {
  return (
    <section
      className={`w-full rounded-2xl p-6 transition-all duration-200 ${className}`}
      style={{
        background: "linear-gradient(165deg, rgba(16,14,22,0.72) 0%, rgba(8,8,13,0.66) 100%)",
        border: `1px solid ${cream(0.09)}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 14px 36px -16px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.05)",
        ...style,
      }}
    >
      {(title || subtitle || action || badge) && (
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <div
                className="p-2 rounded-lg shrink-0 mt-0.5"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${cream(0.1)}`,
                  color: text.bright,
                }}
              >
                <Icon size={16} strokeWidth={1.8} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                {title && (
                  <h2
                    style={{
                      fontFamily: fontHeading,
                      fontSize: "clamp(18px, 2vw, 22px)",
                      fontWeight: 600,
                      color: text.bright,
                      margin: 0,
                      lineHeight: 1.25,
                    }}
                  >
                    {title}
                  </h2>
                )}
                {badge}
              </div>
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
          </div>

          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      {children}
    </section>
  );
}
