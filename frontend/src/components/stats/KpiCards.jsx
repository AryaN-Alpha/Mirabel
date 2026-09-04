import { Cpu, ArrowDownRight, ArrowUpRight, Sparkles, Layers, Gauge } from "lucide-react";
import StatCard from "../common/StatCard";
import { formatTokens, formatInt, formatPct, formatDelta } from "./format";

export default function KpiCards({ overview, loading }) {
  if (loading || !overview) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCard key={i} loading={true} />
        ))}
      </div>
    );
  }

  const { tokens, calls, averages, comparison } = overview;
  const tokenDelta = comparison?.total_tokens_delta_pct !== undefined
    ? formatDelta(comparison.total_tokens_delta_pct)
    : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      <StatCard
        label="Total Tokens"
        value={formatTokens(tokens.total_tokens)}
        delta={tokenDelta}
        deltaLabel="vs previous period"
        icon={Cpu}
      />
      <StatCard
        label="Input Tokens"
        value={formatTokens(tokens.input_tokens)}
        sub={tokens.total_tokens > 0 ? `${formatPct(tokens.input_tokens / tokens.total_tokens)} of total volume` : undefined}
        icon={ArrowDownRight}
      />
      <StatCard
        label="Output Tokens"
        value={formatTokens(tokens.output_tokens)}
        sub={tokens.total_tokens > 0 ? `${formatPct(tokens.output_tokens / tokens.total_tokens)} of total volume` : undefined}
        icon={ArrowUpRight}
      />
      <StatCard
        label="Total LLM Calls"
        value={formatInt(calls.total)}
        sub={calls.errors > 0 ? `${formatInt(calls.errors)} error${calls.errors === 1 ? "" : "s"} (${formatPct(calls.errors / calls.total)})` : "0 errors recorded (100% success)"}
        icon={Sparkles}
      />
      <StatCard
        label="Avg Tokens / Request"
        value={averages.tokens_per_request !== null ? formatTokens(averages.tokens_per_request) : "—"}
        sub={`in ${formatTokens(averages.input_tokens_per_request)} · out ${formatTokens(averages.output_tokens_per_request)}`}
        icon={Layers}
      />
      <StatCard
        label="Estimated Usage"
        value={formatPct(tokens.estimated_share)}
        sub={tokens.estimated_total > 0 ? `${formatTokens(tokens.estimated_total)} char-estimated tokens` : "100% exact API token counts"}
        hint={tokens.estimated_total > 0 ? "voice.turn uses character-based token approximation" : undefined}
        icon={Gauge}
      />
    </div>
  );
}

