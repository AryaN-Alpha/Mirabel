import { text, cream, space } from "../homeTheme";
import { labelStyle } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import { formatInt, formatPct, formatTokens } from "./format";

function StatRow({ label, value, estimate }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-white/[0.05]">
      <span style={{ fontSize: 14, color: text.secondary }}>
        {label}{estimate && <span style={{ color: text.muted }}> (est.)</span>}
      </span>
      <span style={{ fontSize: 14, fontWeight: 500, color: text.bright, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

function SubCard({ title, children }) {
  return (
    <div
      className="p-5 rounded-xl flex-1 min-w-[250px] flex flex-col"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${cream(0.08)}`,
      }}
    >
      <div style={{ ...labelStyle, marginBottom: space[3] }}>{title}</div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export default function OptimizationSection({ optimization, loading }) {
  if (loading || !optimization) {
    return (
      <SectionCard title="Token Optimization Analytics">
        <SkeletonBlock rows={4} />
      </SectionCard>
    );
  }

  const { memory, tool_routing: routing, dedup, truncation, agent_trim: trim } = optimization;

  return (
    <SectionCard title="Token Optimization Analytics" subtitle="Effectiveness of the memory/tool/history optimization passes.">
      <div className="flex flex-wrap" style={{ gap: space[8] * 1.1, rowGap: space[6] }}>
        <SubCard title="Memory">
          <StatRow label="Retrievals skipped by gate" value={`${formatInt(memory.gate_skipped)} / ${formatInt(memory.gate_evaluations)}`} />
          <StatRow label="Gate skip rate" value={formatPct(memory.gate_skip_rate)} />
          <StatRow label="Retrieval cache hits" value={formatInt(memory.retrieval_cache_hits)} />
          <StatRow label="Retrieval cache misses" value={formatInt(memory.retrieval_cache_misses)} />
          <StatRow label="Cache hit rate" value={formatPct(memory.retrieval_cache_hit_rate)} />
          <StatRow label="Avg memories retrieved" value={memory.avg_memories_retrieved !== null ? memory.avg_memories_retrieved.toFixed(1) : "—"} />
          <StatRow label="Avg filtered by relevance threshold" value={memory.avg_memories_filtered_by_threshold !== null ? memory.avg_memories_filtered_by_threshold.toFixed(1) : "—"} />
        </SubCard>

        <SubCard title="Agent Tool Routing">
          <StatRow label="Full-toolset requests" value={formatInt(routing.full_toolset_requests)} />
          <StatRow label="Routed-tool requests" value={formatInt(routing.routed_requests)} />
          <StatRow label="Avg tools exposed / request" value={routing.avg_tools_exposed !== null ? routing.avg_tools_exposed.toFixed(1) : "—"} />
          <StatRow label="Est. tool-context reduction" value={formatPct(routing.estimated_context_reduction_pct)} estimate />
        </SubCard>

        <SubCard title="Memory Deduplication">
          <StatRow label="Memory write attempts" value={formatInt(dedup.write_attempts)} />
          <StatRow label="Duplicates prevented" value={formatInt(dedup.duplicates_prevented)} />
          <StatRow label="Duplicate prevention rate" value={formatPct(dedup.duplicate_prevention_rate)} />
        </SubCard>

        <SubCard title="Agent History Trimming">
          <StatRow label="LLM steps observed" value={formatInt(trim.llm_steps_observed)} />
          <StatRow label="Steps requiring trimming" value={formatInt(trim.llm_steps_trimmed)} />
          <StatRow label="Avg messages before" value={trim.avg_messages_before !== null ? trim.avg_messages_before.toFixed(1) : "—"} />
          <StatRow label="Avg messages sent to model" value={trim.avg_messages_sent_to_model !== null ? trim.avg_messages_sent_to_model.toFixed(1) : "—"} />
        </SubCard>

        {truncation.truncated_payloads > 0 && (
          <SubCard title="Content Truncation">
            <StatRow label="Truncated payloads" value={formatInt(truncation.truncated_payloads)} />
            <StatRow label="Original chars" value={formatTokens(truncation.original_chars)} />
            <StatRow label="Kept chars" value={formatTokens(truncation.kept_chars)} />
          </SubCard>
        )}
      </div>
    </SectionCard>
  );
}
