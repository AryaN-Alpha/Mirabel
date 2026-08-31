import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { fontHeading, text, cream } from "../homeTheme";
import { SectionCard, Skeleton, ChartEmptyState } from "./SectionCard";
import { GRID_COLOR, AXIS_COLOR, TOOLTIP_STYLE, seriesColor } from "./chartTheme";
import { formatBucketLabel, formatCost, formatDateTime, providerLabel } from "./format";

function FlatTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE.contentStyle}>
      <div style={{ ...TOOLTIP_STYLE.labelStyle, fontWeight: 600 }}>{formatDateTime(label)}</div>
      <div>{formatCost(payload[0].value)}</div>
    </div>
  );
}

function ByProviderTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE.contentStyle}>
      <div style={{ ...TOOLTIP_STYLE.labelStyle, fontWeight: 600 }}>{formatDateTime(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {providerLabel(p.dataKey)}: {formatCost(p.value)}
        </div>
      ))}
    </div>
  );
}

export default function CostTimeseriesChart({ buckets, byProvider, granularity, loading, showByProvider }) {
  const anyCostAvailable = buckets?.some((b) => b.cost_available);

  let providerKeys = [];
  let byProviderData = null;
  if (showByProvider && byProvider?.buckets?.length) {
    providerKeys = Object.keys(byProvider.providers).filter((p) => byProvider.providers[p].some((v) => v > 0));
    if (providerKeys.length > 1) {
      byProviderData = byProvider.buckets.map((bucket, i) => {
        const row = { bucket };
        for (const p of providerKeys) row[p] = byProvider.providers[p][i];
        return row;
      });
    }
  }
  // Multi-provider view uses the reshaped per-provider rows; every other
  // case (a provider filter applied, or only one provider active in this
  // range) plots the flat per-bucket `cost` field from `buckets` — these
  // two shapes are never mixed (a bug earlier tried to read `cost` off the
  // provider-keyed rows, which don't have that field, and silently drew an
  // empty line).
  const chartData = byProviderData ?? buckets;
  const isMultiProvider = providerKeys.length > 1;

  // Recharts' composed-chart internals discover Axis/Line/Legend children by
  // walking `props.children` directly — a `{cond ? (<>...</>) : (<>...</>)}`
  // conditional wrapped in fragments was silently invisible to that walk in
  // this recharts version (confirmed live: 0 rendered line curves, 0 legend
  // items, in EITHER branch). A flat array of elements is the pattern
  // Recharts' own docs use for dynamic children, so build one instead.
  const seriesLines = isMultiProvider
    ? providerKeys.map((p) => (
        <Line key={p} type="monotone" dataKey={p} name={p} stroke={seriesColor(p)} strokeWidth={2} dot={{ r: 3 }} />
      ))
    : [<Line key="cost" type="monotone" dataKey="cost" name="Cost" stroke={seriesColor("anthropic")} strokeWidth={2} dot={{ r: 3 }} />];

  return (
    <SectionCard title="LLM Cost Over Time" subtitle={showByProvider ? "Split by provider — select a single provider to see one line." : "Estimated cost from configured pricing."}>
      {loading ? (
        <Skeleton height={260} />
      ) : !anyCostAvailable ? (
        <ChartEmptyState>No pricing configured for the models used in this range — cost unavailable.</ChartEmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="bucket"
              tickFormatter={(v) => formatBucketLabel(v, granularity)}
              stroke={AXIS_COLOR}
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR }}
            />
            <YAxis tickFormatter={(v) => formatCost(v)} stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={isMultiProvider ? <ByProviderTooltip /> : <FlatTooltip />} cursor={{ stroke: GRID_COLOR }} />
            {isMultiProvider && (
              <Legend
                wrapperStyle={{ fontSize: 12, fontFamily: fontHeading }}
                formatter={(value) => <span style={{ color: text.base }}>{providerLabel(value)}</span>}
              />
            )}
            {seriesLines}
          </LineChart>
        </ResponsiveContainer>
      )}
      {!showByProvider && <p style={{ fontSize: 11, color: cream(0.32), marginTop: 8 }}>Filtered to the selected provider/model — clear the provider filter to compare across providers.</p>}
    </SectionCard>
  );
}
