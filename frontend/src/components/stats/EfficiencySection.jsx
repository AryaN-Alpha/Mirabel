import { fontHeading, text, cream, space } from "../homeTheme";
import { labelStyle } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import { formatTokens } from "./format";

function Metric({ label, value }) {
  return (
    <div
      className="p-4 rounded-xl flex-1 min-w-[150px]"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${cream(0.08)}`,
      }}
    >
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          fontFamily: fontHeading,
          fontSize: 24,
          fontWeight: 600,
          color: text.bright,
          marginTop: space[1] ?? 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function EfficiencySection({ overview, loading }) {
  if (loading || !overview) {
    return (
      <SectionCard title="Prompt & Token Efficiency">
        <SkeletonBlock rows={3} />
      </SectionCard>
    );
  }

  const eff = overview.prompt_efficiency;
  const ratio = eff.input_output_ratio;

  return (
    <SectionCard title="Prompt & Token Efficiency" subtitle="Monitor prompt expansion and output token ratios across all calls.">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Metric label="Avg Input / Request" value={formatTokens(eff.avg_input_tokens)} />
        <Metric label="Avg Output / Request" value={formatTokens(eff.avg_output_tokens)} />
        <Metric label="Input : Output Ratio" value={ratio !== null ? `${ratio.toFixed(1)} : 1` : "—"} />
        <Metric label="P95 Input Tokens" value={formatTokens(eff.p95_input_tokens)} />
        <Metric label="P95 Output Tokens" value={formatTokens(eff.p95_output_tokens)} />
        <Metric label="Largest Prompt" value={formatTokens(eff.largest_prompt_tokens)} />
        <Metric label="Largest Response" value={formatTokens(eff.largest_response_tokens)} />
      </div>
      <p style={{ fontSize: 13, color: text.muted, marginTop: space[4] }}>
        P95 and largest values are computed over calls with reported token counts in the selected range.
      </p>
    </SectionCard>
  );
}
