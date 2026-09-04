import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { fontHeading, text, cream, space, success } from "../homeTheme";
import { labelStyle, StatTile } from "../homeWidgets";
import { SectionCard, SkeletonBlock, ChartEmptyState } from "./SectionCard";
import DataTable from "./DataTable";
import { CACHE_READ_COLOR, CACHE_WRITE_COLOR, GRID_COLOR, AXIS_COLOR, TOOLTIP_STYLE } from "./chartTheme";
import { formatTokens, formatPct, formatBucketLabel, providerLabel } from "./format";

const gridStyle = { display: "grid", gap: space[3], gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" };

const MODEL_COLUMNS = [
  { key: "provider", label: "Provider", render: (r) => providerLabel(r.provider) },
  { key: "model", label: "Model" },
  { key: "cache_read_tokens", label: "Cache Reads", align: "right", render: (r) => formatTokens(r.cache_read_tokens) },
  { key: "cache_write_tokens", label: "Cache Writes", align: "right", render: (r) => formatTokens(r.cache_write_tokens) },
  { key: "cache_hit_rate", label: "Hit Rate", align: "right", render: (r) => formatPct(r.cache_hit_rate) },
];

const CAPABILITY_COLUMNS = [
  { key: "provider", label: "Provider", render: (r) => providerLabel(r.provider) },
  {
    key: "prompt_caching", label: "Prompt Caching",
    render: (r) => (
      <span style={{ color: r.prompt_caching === "enabled" ? success[400] : cream(0.4) }}>
        {r.prompt_caching === "enabled" ? "Enabled" : "Unavailable"}
      </span>
    ),
  },
  { key: "read_tokens", label: "Read Tokens", align: "right", render: (r) => formatTokens(r.read_tokens) },
  { key: "write_tokens", label: "Write Tokens", align: "right", render: (r) => formatTokens(r.write_tokens) },
];

export default function CacheSection({ cache, buckets, granularity, loading }) {
  if (loading || !cache) {
    return (
      <SectionCard title="Prompt Cache Analytics">
        <SkeletonBlock rows={4} />
      </SectionCard>
    );
  }

  const hasCacheActivity = buckets?.some((b) => b.cache_read_tokens > 0 || b.cache_write_tokens > 0);

  return (
    <SectionCard title="Prompt Cache Analytics" subtitle="Actual provider-reported cache reads/writes — never inferred from configuration alone.">
      <div style={{ ...gridStyle, marginBottom: space[6] }}>
        <StatTile label="Cache Read Tokens" value={formatTokens(cache.cache_read_tokens)} />
        <StatTile label="Cache Write Tokens" value={formatTokens(cache.cache_write_tokens)} />
        <StatTile label="Cache Hit Rate" value={formatPct(cache.cache_hit_rate)} hint="reads ÷ (reads + uncached input)" />
        <StatTile label="Uncached Input Tokens" value={formatTokens(cache.uncached_input_tokens)} />
        <StatTile label="Est. Tokens Avoided" value={formatTokens(cache.estimated_tokens_avoided)} hint="= cache reads (provider-reported, not a separate estimate)" />
      </div>

      <div style={{ marginBottom: space[6] }}>
        <div style={labelStyle}>Cache Activity Over Time</div>
        {!hasCacheActivity ? (
          <ChartEmptyState>No cache reads/writes reported in this range.</ChartEmptyState>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={(v) => formatBucketLabel(v, granularity)} stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={{ stroke: GRID_COLOR }} />
              <YAxis tickFormatter={formatTokens} stroke={AXIS_COLOR} fontSize={11} tickLine={false} axisLine={false} width={48} />
              <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} labelStyle={TOOLTIP_STYLE.labelStyle} labelFormatter={(v) => formatBucketLabel(v, granularity)} formatter={(v) => formatTokens(v)} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: fontHeading }} formatter={(value) => <span style={{ color: text.base }}>{value}</span>} />
              <Bar dataKey="cache_read_tokens" name="Cache reads" fill={CACHE_READ_COLOR} radius={[3, 3, 0, 0]} />
              <Bar dataKey="cache_write_tokens" name="Cache writes" fill={CACHE_WRITE_COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex flex-col" style={{ gap: space[2], marginBottom: space[5] ?? 23 }}>
        <div style={labelStyle}>Cache Effectiveness by Model</div>
        <DataTable columns={MODEL_COLUMNS} rows={cache.by_model.map((r) => ({ ...r, __key: `${r.provider}/${r.model}` }))} defaultSort={{ key: "cache_read_tokens", dir: "desc" }} />
      </div>

      <div className="flex flex-col" style={{ gap: space[2] }}>
        <div style={labelStyle}>Provider Cache Capability</div>
        <DataTable columns={CAPABILITY_COLUMNS} rows={cache.provider_capability.map((r) => ({ ...r, __key: r.provider }))} defaultSort={{ key: "read_tokens", dir: "desc" }} />
      </div>
    </SectionCard>
  );
}
