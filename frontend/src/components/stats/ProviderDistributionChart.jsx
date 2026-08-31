import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { text, cream, space } from "../homeTheme";
import { SectionCard, Skeleton, ChartEmptyState } from "./SectionCard";
import { TOOLTIP_STYLE, seriesColor } from "./chartTheme";
import { formatTokens, formatPct, providerLabel } from "./format";

export default function ProviderDistributionChart({ providers, loading }) {
  const rows = (providers ?? []).filter((r) => r.total_tokens > 0);
  const total = rows.reduce((sum, r) => sum + r.total_tokens, 0);

  return (
    <SectionCard title="Provider Usage Distribution" subtitle="Share of total tokens consumed, by provider.">
      {loading ? (
        <Skeleton height={220} />
      ) : rows.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="flex items-center" style={{ gap: space[6] }}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={rows}
                dataKey="total_tokens"
                nameKey="provider"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                stroke="none"
              >
                {rows.map((r) => (
                  <Cell key={r.provider} fill={seriesColor(r.provider)} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload;
                  return (
                    <div style={TOOLTIP_STYLE.contentStyle}>
                      <div style={{ fontWeight: 600, color: seriesColor(row.provider) }}>{providerLabel(row.provider)}</div>
                      <div>{formatTokens(row.total_tokens)} tokens ({formatPct(row.total_tokens / total)})</div>
                      <div style={{ color: cream(0.5) }}>{row.calls} calls</div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col" style={{ gap: space[2], minWidth: 140 }}>
            {rows
              .slice()
              .sort((a, b) => b.total_tokens - a.total_tokens)
              .map((r) => (
                <div key={r.provider} className="flex items-center justify-between" style={{ gap: space[3] }}>
                  <span className="flex items-center" style={{ gap: 6, fontSize: 13, color: text.base }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: seriesColor(r.provider), display: "inline-block" }} />
                    {providerLabel(r.provider)}
                  </span>
                  <span style={{ fontSize: 13, color: cream(0.55), fontVariantNumeric: "tabular-nums" }}>
                    {formatPct(r.total_tokens / total)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
