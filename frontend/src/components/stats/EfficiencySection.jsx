import { fontHeading, text, cream, space } from "../homeTheme";
import { labelStyle } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import { formatTokens } from "./format";

function Metric({ label, value }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 130 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontFamily: fontHeading, fontSize: 24, color: text.base, marginTop: space[1] ?? 4 }}>{value}</div>
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
    <SectionCard title="Prompt & Token Efficiency" subtitle="Are prompts getting unnecessarily large?">
      <div className="flex flex-wrap" style={{ gap: space[6], rowGap: space[6] }}>
        <Metric label="Avg Input Tokens / Request" value={formatTokens(eff.avg_input_tokens)} />
        <Metric label="Avg Output Tokens / Request" value={formatTokens(eff.avg_output_tokens)} />
        <Metric label="Input : Output Ratio" value={ratio !== null ? `${ratio.toFixed(1)} : 1` : "—"} />
        <Metric label="P95 Input Tokens" value={formatTokens(eff.p95_input_tokens)} />
        <Metric label="P95 Output Tokens" value={formatTokens(eff.p95_output_tokens)} />
        <Metric label="Largest Prompt" value={formatTokens(eff.largest_prompt_tokens)} />
        <Metric label="Largest Response" value={formatTokens(eff.largest_response_tokens)} />
      </div>
      <p style={{ fontSize: 11, color: cream(0.32), marginTop: space[4] }}>
        P95 and largest values are computed over calls with reported token counts in the selected range.
      </p>
    </SectionCard>
  );
}
