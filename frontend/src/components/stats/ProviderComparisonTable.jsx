import { useState } from "react";
import { space, cream } from "../homeTheme";
import { TabLink } from "../homeWidgets";
import { SectionCard } from "./SectionCard";
import DataTable from "./DataTable";
import { formatTokens, formatInt, formatCost, formatMs, formatPct, providerLabel } from "./format";

const PROVIDER_COLUMNS = [
  { key: "provider", label: "Provider", render: (r) => providerLabel(r.provider) },
  { key: "calls", label: "Calls", align: "right" },
  { key: "input_tokens", label: "Input Tokens", align: "right", render: (r) => formatTokens(r.input_tokens) },
  { key: "output_tokens", label: "Output Tokens", align: "right", render: (r) => formatTokens(r.output_tokens) },
  { key: "total_tokens", label: "Total Tokens", align: "right", render: (r) => formatTokens(r.total_tokens) },
  { key: "avg_tokens_per_call", label: "Avg Tokens/Call", align: "right", render: (r) => formatTokens(r.avg_tokens_per_call) },
  { key: "cache_read_tokens", label: "Cache Reads", align: "right", render: (r) => formatTokens(r.cache_read_tokens) },
  { key: "avg_latency_ms", label: "Avg Latency", align: "right", render: (r) => formatMs(r.avg_latency_ms) },
  { key: "error_rate", label: "Error Rate", align: "right", render: (r) => formatPct(r.error_rate) },
  { key: "cost", label: "Est. Cost", align: "right", render: (r) => formatCost(r.cost), sortValue: (r) => r.cost ?? -1 },
];

const MODEL_COLUMNS = [
  { key: "provider", label: "Provider", render: (r) => providerLabel(r.provider) },
  { key: "model", label: "Model" },
  { key: "calls", label: "Calls", align: "right" },
  { key: "total_tokens", label: "Total Tokens", align: "right", render: (r) => formatTokens(r.total_tokens) },
  { key: "avg_tokens_per_call", label: "Avg Tokens/Call", align: "right", render: (r) => formatTokens(r.avg_tokens_per_call) },
  { key: "avg_latency_ms", label: "Avg Latency", align: "right", render: (r) => formatMs(r.avg_latency_ms) },
  { key: "error_rate", label: "Error Rate", align: "right", render: (r) => formatPct(r.error_rate) },
  { key: "cost", label: "Est. Cost", align: "right", render: (r) => formatCost(r.cost), sortValue: (r) => r.cost ?? -1 },
];

export default function ProviderComparisonTable({ providers, models, loading }) {
  const [tab, setTab] = useState("provider");

  return (
    <SectionCard
      title="Provider Comparison"
      subtitle="Which LLM is consuming the most resources — sort any column."
      action={
        <div className="flex items-center" style={{ gap: space[5] ?? 23 }}>
          <TabLink active={tab === "provider"} onClick={() => setTab("provider")}>By Provider</TabLink>
          <TabLink active={tab === "model"} onClick={() => setTab("model")}>By Model</TabLink>
        </div>
      }
    >
      {tab === "provider" ? (
        <DataTable columns={PROVIDER_COLUMNS} rows={(providers ?? []).map((r) => ({ ...r, __key: r.provider }))} defaultSort={{ key: "total_tokens", dir: "desc" }} loading={loading} />
      ) : (
        <DataTable columns={MODEL_COLUMNS} rows={(models ?? []).map((r) => ({ ...r, __key: `${r.provider}/${r.model}` }))} defaultSort={{ key: "total_tokens", dir: "desc" }} loading={loading} />
      )}
      {!loading && (providers?.some((r) => r.cost === null) || models?.some((r) => r.cost === null)) && (
        <p style={{ fontSize: 11, color: cream(0.32), marginTop: space[2] }}>
          "Cost unavailable" rows have no PricingConfig entry — configure pricing in /admin/ to populate them.
        </p>
      )}
    </SectionCard>
  );
}
