import { fontHeading, text, cream, space } from "../homeTheme";
import { labelStyle } from "../homeWidgets";
import { Skeleton } from "./SectionCard";
import { formatTokens, formatInt, formatPct, formatDelta } from "./format";

function Tile({ label, value, sub, delta, hint }) {
  const d = delta !== undefined ? formatDelta(delta) : null;
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150 }}>
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          fontFamily: fontHeading,
          fontSize: "clamp(24px,2.4vw,32px)",
          color: text.base,
          marginTop: space[1] ?? 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: cream(0.45), marginTop: 2 }}>{sub}</div>}
      {d && (
        <div
          style={{
            fontSize: 12,
            marginTop: 2,
            color: d.sign === "down" ? "#8fd6a8" : d.sign === "up" ? "rgba(224,140,140,0.9)" : cream(0.4),
          }}
        >
          {d.label} vs previous period
        </div>
      )}
      {hint && <div style={{ fontSize: 11, color: cream(0.32), marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export default function KpiCards({ overview, loading }) {
  if (loading || !overview) {
    return (
      <div className="flex flex-wrap" style={{ gap: space[6] }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ flex: "1 1 160px", minWidth: 150 }}>
            <Skeleton height={11} width="60%" />
            <div style={{ marginTop: 8 }}>
              <Skeleton height={28} width="80%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { tokens, calls, averages, comparison, cost } = overview;

  return (
    <div className="flex flex-wrap" style={{ gap: space[6], rowGap: space[6] }}>
      <Tile
        label="Total Tokens"
        value={formatTokens(tokens.total_tokens)}
        delta={comparison.total_tokens_delta_pct}
      />
      <Tile label="Input Tokens" value={formatTokens(tokens.input_tokens)} />
      <Tile label="Output Tokens" value={formatTokens(tokens.output_tokens)} />
      <Tile label="Total LLM Calls" value={formatInt(calls.total)} sub={`${formatInt(calls.errors)} error${calls.errors === 1 ? "" : "s"}`} />
      <Tile
        label="Avg Tokens / Request"
        value={averages.tokens_per_request !== null ? formatTokens(averages.tokens_per_request) : "—"}
        sub={`in ${formatTokens(averages.input_tokens_per_request)} · out ${formatTokens(averages.output_tokens_per_request)}`}
      />
      <Tile
        label="Estimated Usage"
        value={formatPct(tokens.estimated_share)}
        hint={tokens.estimated_total > 0 ? "voice.turn is character-estimated, not exact" : undefined}
      />
    </div>
  );
}
