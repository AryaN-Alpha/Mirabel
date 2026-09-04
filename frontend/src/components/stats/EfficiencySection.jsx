import { cream, space } from "../homeTheme";
import { StatTile } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import { formatTokens } from "./format";

const gridStyle = { display: "grid", gap: space[3], gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" };

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
      <div style={gridStyle}>
        <StatTile label="Avg Input Tokens / Request" value={formatTokens(eff.avg_input_tokens)} />
        <StatTile label="Avg Output Tokens / Request" value={formatTokens(eff.avg_output_tokens)} />
        <StatTile label="Input : Output Ratio" value={ratio !== null ? `${ratio.toFixed(1)} : 1` : "—"} />
        <StatTile label="P95 Input Tokens" value={formatTokens(eff.p95_input_tokens)} />
        <StatTile label="P95 Output Tokens" value={formatTokens(eff.p95_output_tokens)} />
        <StatTile label="Largest Prompt" value={formatTokens(eff.largest_prompt_tokens)} />
        <StatTile label="Largest Response" value={formatTokens(eff.largest_response_tokens)} />
      </div>
      <p style={{ fontSize: 11, color: cream(0.32), marginTop: space[4] }}>
        P95 and largest values are computed over calls with reported token counts in the selected range.
      </p>
    </SectionCard>
  );
}
