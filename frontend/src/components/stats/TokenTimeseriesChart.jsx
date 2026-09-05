import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { fontHeading, text, cream } from "../homeTheme";
import { SectionCard, Skeleton, ChartEmptyState } from "./SectionCard";
import { INPUT_COLOR, OUTPUT_COLOR, GRID_COLOR, AXIS_COLOR, TOOLTIP_STYLE } from "./chartTheme";
import { formatBucketLabel, formatTokens, formatInt, formatDateTime } from "./format";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE.contentStyle}>
      <div style={{ ...TOOLTIP_STYLE.labelStyle, fontWeight: 600 }}>{formatDateTime(label)}</div>
      <div>Input: {formatTokens(row.input_tokens)}</div>
      <div>Output: {formatTokens(row.output_tokens)}</div>
      <div style={{ color: cream(0.55) }}>Total: {formatTokens(row.total_tokens)} · {formatInt(row.calls)} call{row.calls === 1 ? "" : "s"}</div>
      {row.avg_input_tokens_per_call !== null && (
        <div style={{ color: cream(0.4) }}>Avg prompt: {formatTokens(row.avg_input_tokens_per_call)}</div>
      )}
    </div>
  );
}

export default function TokenTimeseriesChart({ buckets, granularity, loading }) {
  const hasData = buckets?.some((b) => b.calls > 0);

  return (
    <SectionCard title="Token Consumption Over Time" subtitle="Input vs output tokens, stacked — granularity adapts to the selected range.">
      {loading ? (
        <Skeleton height={260} />
      ) : !hasData ? (
        <ChartEmptyState />
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={buckets} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="bucket"
              tickFormatter={(v) => formatBucketLabel(v, granularity)}
              stroke={AXIS_COLOR}
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
            />
            <YAxis tickFormatter={formatTokens} stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<CustomTooltip granularity={granularity} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: cream(0.6), fontFamily: fontHeading }}
              formatter={(value) => <span style={{ color: text.base }}>{value}</span>}
            />
            <Bar dataKey="input_tokens" name="Input tokens" stackId="tokens" fill={INPUT_COLOR} radius={[0, 0, 0, 0]} />
            <Bar dataKey="output_tokens" name="Output tokens" stackId="tokens" fill={OUTPUT_COLOR} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </SectionCard>
  );
}
