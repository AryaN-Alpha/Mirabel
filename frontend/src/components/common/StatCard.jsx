import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { fontHeading, fontMono, text, accent, cyan, cream, space, radius } from "../homeTheme";

export default function StatCard({
  label,
  value,
  sub,
  delta,
  deltaLabel = "vs prev period",
  hint,
  icon: Icon,
  invertTrend = false, // if true, up is negative (red) e.g. for costs/errors
  loading = false,
  className = "",
  style,
}) {
  const [hovered, setHovered] = useState(false);

  // Parse delta if provided
  let deltaInfo = null;
  if (delta !== undefined && delta !== null) {
    if (typeof delta === "object" && delta.label) {
      deltaInfo = delta;
    } else if (typeof delta === "number") {
      const isZero = Math.abs(delta) < 0.001;
      const isUp = delta > 0;
      deltaInfo = {
        sign: isZero ? "flat" : isUp ? "up" : "down",
        label: `${isUp ? "+" : ""}${delta.toFixed(1)}%`,
        isGood: invertTrend ? !isUp : isUp,
      };
    }
  }

  if (loading) {
    return (
      <div
        className={`flex-1 min-w-[160px] p-5 rounded-xl ${className}`}
        style={{
          background: "linear-gradient(180deg, rgba(18,16,24,0.65) 0%, rgba(10,9,14,0.55) 100%)",
          border: `1px solid ${cream(0.08)}`,
          backdropFilter: "blur(16px)",
          ...style,
        }}
      >
        <div
          style={{
            width: "50%",
            height: 12,
            borderRadius: 3,
            background: "rgba(255,255,255,0.08)",
            animation: "stats-shimmer 1.6s ease infinite",
          }}
        />
        <div
          style={{
            width: "80%",
            height: 32,
            borderRadius: 4,
            marginTop: 12,
            background: "rgba(255,255,255,0.08)",
            animation: "stats-shimmer 1.6s ease infinite",
          }}
        />
      </div>
    );
  }

  const isGood = deltaInfo?.isGood ?? (invertTrend ? deltaInfo?.sign === "down" : deltaInfo?.sign === "up");
  const isFlat = deltaInfo?.sign === "flat";
  const trendColor = isFlat ? cyan[400] : isGood ? "#4ade80" : "#f87171";
  const trendBg = isFlat ? `${cyan[400]}18` : isGood ? "rgba(74,222,128,0.14)" : "rgba(248,113,113,0.14)";
  const trendBorder = isFlat ? `${cyan[400]}33` : isGood ? "rgba(74,222,128,0.30)" : "rgba(248,113,113,0.30)";

  return (
    <div
      className={`flex-1 min-w-[170px] p-5 rounded-2xl flex flex-col justify-between transition-all duration-200 ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "linear-gradient(165deg, rgba(22,19,30,0.85) 0%, rgba(12,11,18,0.80) 100%)"
          : "linear-gradient(165deg, rgba(16,14,22,0.72) 0%, rgba(8,8,13,0.66) 100%)",
        border: `1px solid ${hovered ? cream(0.18) : cream(0.09)}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: hovered
          ? "0 14px 36px -12px rgba(0,0,0,0.7), inset 0 1px 0 0 rgba(255,255,255,0.08)"
          : "0 6px 20px -8px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.04)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        ...style,
      }}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span
            style={{
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: cream(0.68),
              fontWeight: 500,
            }}
          >
            {label}
          </span>
          {Icon && (
            <span
              className="p-1 rounded-md shrink-0"
              style={{
                color: cyan[400],
                background: `${cyan[400]}12`,
                border: `1px solid ${cyan[400]}26`,
              }}
            >
              <Icon size={14} strokeWidth={1.8} />
            </span>
          )}
        </div>

        <div
          className="truncate"
          style={{
            fontFamily: fontHeading,
            fontSize: "clamp(26px, 2.5vw, 34px)",
            fontWeight: 600,
            lineHeight: 1.15,
            color: text.bright,
            marginTop: space[2],
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
      </div>

      {(sub || deltaInfo || hint) && (
        <div className="flex flex-col gap-1 mt-3">
          {deltaInfo && (
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium"
                style={{
                  fontFamily: fontMono,
                  color: trendColor,
                  background: trendBg,
                  border: `1px solid ${trendBorder}`,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {isFlat ? (
                  <Minus size={11} strokeWidth={2.2} />
                ) : deltaInfo.sign === "up" ? (
                  <TrendingUp size={11} strokeWidth={2.2} />
                ) : (
                  <TrendingDown size={11} strokeWidth={2.2} />
                )}
                <span>{deltaInfo.label}</span>
              </span>
              <span style={{ fontSize: 12, color: text.secondary }}>
                {deltaLabel}
              </span>
            </div>
          )}

          {sub && (
            <div style={{ fontSize: 13, color: text.secondary, lineHeight: 1.4 }}>
              {sub}
            </div>
          )}

          {hint && (
            <div style={{ fontSize: 12, color: cream(0.55), fontStyle: "italic", marginTop: 2 }}>
              {hint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
