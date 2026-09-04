import { text, cream, space, radius, glassBorder, surface, fontMono } from "../homeTheme";
import { labelStyle } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import { formatInt, formatPct, formatTokens } from "./format";

function StatRow({ label, value, estimate }) {
  return (
    <div className="flex items-baseline justify-between" style={{ padding: `${space[2]}px 0`, borderBottom: `1px solid ${cream(0.07)}` }}>
      <span style={{ fontSize: 13, color: cream(0.6) }}>{label}{estimate && <span style={{ color: cream(0.35) }}> (estimate)</span>}</span>
      <span style={{ fontSize: 14, color: text.base, fontFamily: fontMono, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// Each optimization pass gets its own sunken card — grouping the rows makes
// it clear which figures belong to which pass at a glance, instead of five
// stacks of label/value rows all sharing one flat flex-wrap with no boundary.
function SubCard({ title, children }) {
  return (
    <div
      style={{
        flex: "1 1 260px",
        minWidth: 240,
        padding: space[4],
        borderRadius: radius.md,
        border: `1px solid ${glassBorder.soft}`,
        background: surface.sunken,
      }}
    >
      <div style={{ ...labelStyle, marginBottom: space[2] }}>{title}</div>
      {children}
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
