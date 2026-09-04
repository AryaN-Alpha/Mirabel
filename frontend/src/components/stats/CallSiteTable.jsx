import { SectionCard } from "./SectionCard";
import DataTable from "./DataTable";
import { formatTokens, formatCost, formatMs, formatPct } from "./format";

const COLUMNS = [
  { key: "call_site", label: "Call Site" },
  { key: "calls", label: "Calls", align: "right" },
  { key: "input_tokens", label: "Input Tokens", align: "right", render: (r) => formatTokens(r.input_tokens) },
  { key: "output_tokens", label: "Output Tokens", align: "right", render: (r) => formatTokens(r.output_tokens) },
  { key: "total_tokens", label: "Total Tokens", align: "right", render: (r) => formatTokens(r.total_tokens) },
  { key: "avg_latency_ms", label: "Avg Latency", align: "right", render: (r) => formatMs(r.avg_latency_ms) },
  { key: "error_rate", label: "Error Rate", align: "right", render: (r) => formatPct(r.error_rate) },
  { key: "cost", label: "Est. Cost", align: "right", render: (r) => formatCost(r.cost), sortValue: (r) => r.cost ?? -1 },
];

export default function CallSiteTable({ callSites, loading }) {
  return (
    <SectionCard title="Call-Site Analytics" subtitle="Which application feature is actually consuming the budget.">
      <DataTable
        columns={COLUMNS}
        rows={(callSites ?? []).map((r) => ({ ...r, __key: r.call_site }))}
        defaultSort={{ key: "total_tokens", dir: "desc" }}
        loading={loading}
      />
    </SectionCard>
  );
}
