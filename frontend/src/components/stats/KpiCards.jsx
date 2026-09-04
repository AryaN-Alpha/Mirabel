import { space, radius, glassBorder, surface } from "../homeTheme";
import { StatTile } from "../homeWidgets";
import { Skeleton } from "./SectionCard";
import { formatTokens, formatInt, formatPct, formatDelta } from "./format";

const gridStyle = { display: "grid", gap: space[4], gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" };

export default function KpiCards({ overview, loading }) {
  if (loading || !overview) {
    return (
      <div style={gridStyle}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: space[4], borderRadius: radius.md, border: `1px solid ${glassBorder.soft}`, background: surface.sunken }}>
            <Skeleton height={11} width="60%" />
            <div style={{ marginTop: 10 }}>
              <Skeleton height={26} width="80%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const { tokens, calls, averages, comparison } = overview;

  return (
    <div style={gridStyle}>
      <StatTile
        size="lg"
        label="Total Tokens"
        value={formatTokens(tokens.total_tokens)}
        delta={formatDelta(comparison.total_tokens_delta_pct)}
      />
      <StatTile size="lg" label="Input Tokens" value={formatTokens(tokens.input_tokens)} />
      <StatTile size="lg" label="Output Tokens" value={formatTokens(tokens.output_tokens)} />
      <StatTile
        size="lg"
        label="Total LLM Calls"
        value={formatInt(calls.total)}
        sub={`${formatInt(calls.errors)} error${calls.errors === 1 ? "" : "s"}`}
      />
      <StatTile
        size="lg"
        label="Avg Tokens / Request"
        value={averages.tokens_per_request !== null ? formatTokens(averages.tokens_per_request) : "—"}
        sub={`in ${formatTokens(averages.input_tokens_per_request)} · out ${formatTokens(averages.output_tokens_per_request)}`}
      />
      <StatTile
        size="lg"
        label="Estimated Usage"
        value={formatPct(tokens.estimated_share)}
        hint={tokens.estimated_total > 0 ? "voice.turn is character-estimated, not exact" : undefined}
      />
    </div>
  );
}
