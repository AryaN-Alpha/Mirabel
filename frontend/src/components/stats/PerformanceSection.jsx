import { useState } from "react";
import { fontHeading, text, cream, space } from "../homeTheme";
import { labelStyle, TabLink } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import DataTable from "./DataTable";
import { formatMs, formatInt, formatPct, formatRate, providerLabel } from "./format";

function Metric({ label, value }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 120 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontFamily: fontHeading, fontSize: 22, color: text.base, marginTop: space[1] ?? 4 }}>{value}</div>
    </div>
  );
}

function columnsFor(dimension) {
  return [
    { key: dimension, label: dimension === "call_site" ? "Call Site" : dimension === "provider" ? "Provider" : "Model", render: (r) => (dimension === "provider" ? providerLabel(r[dimension]) : r[dimension]) },
    { key: "calls", label: "Calls", align: "right" },
    { key: "avg_latency_ms", label: "Avg Latency", align: "right", render: (r) => formatMs(r.avg_latency_ms) },
    { key: "p50_latency_ms", label: "P50", align: "right", render: (r) => formatMs(r.p50_latency_ms) },
    { key: "p95_latency_ms", label: "P95", align: "right", render: (r) => formatMs(r.p95_latency_ms) },
    { key: "error_rate", label: "Error Rate", align: "right", render: (r) => formatPct(r.error_rate) },
  ];
}

export default function PerformanceSection({ performance, loading }) {
  const [dimension, setDimension] = useState("provider");

  if (loading || !performance) {
    return (
      <SectionCard title="LLM Performance Analytics">
        <SkeletonBlock rows={4} />
      </SectionCard>
    );
  }

  const rows = { provider: performance.by_provider, model: performance.by_model, call_site: performance.by_call_site }[dimension];

  return (
    <SectionCard
      title="LLM Performance Analytics"
      subtitle="Cheap but slow, expensive but fast, or high-error — broken down by provider/model/call site."
    >
      <div className="flex flex-wrap" style={{ gap: space[6], rowGap: space[6], marginBottom: space[5] ?? 23 }}>
        <Metric label="Avg Latency" value={formatMs(performance.avg_latency_ms)} />
        <Metric label="P50 Latency" value={formatMs(performance.p50_latency_ms)} />
        <Metric label="P95 Latency" value={formatMs(performance.p95_latency_ms)} />
        <Metric label="Requests / Minute" value={formatRate(performance.requests_per_minute)} />
        <Metric label="Error Rate" value={formatPct(performance.error_rate)} />
      </div>

      {performance.slowest_request && (
        <p style={{ fontSize: 12, color: cream(0.45), marginBottom: space[5] ?? 23 }}>
          Slowest request: {providerLabel(performance.slowest_request.provider)} / {performance.slowest_request.model} on{" "}
          {performance.slowest_request.call_site} — {formatMs(performance.slowest_request.latency_ms)}
        </p>
      )}

      <div className="flex items-center" style={{ gap: space[5] ?? 23, marginBottom: space[3] }}>
        <TabLink active={dimension === "provider"} onClick={() => setDimension("provider")}>By Provider</TabLink>
        <TabLink active={dimension === "model"} onClick={() => setDimension("model")}>By Model</TabLink>
        <TabLink active={dimension === "call_site"} onClick={() => setDimension("call_site")}>By Call Site</TabLink>
      </div>
      <DataTable
        columns={columnsFor(dimension)}
        rows={rows.map((r) => ({ ...r, __key: r[dimension] }))}
        defaultSort={{ key: "calls", dir: "desc" }}
      />
    </SectionCard>
  );
}
