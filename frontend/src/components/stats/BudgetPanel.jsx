import { useState } from "react";
import { fontHeading, fontMono, text, accent, cyan, cream, space, radius } from "../homeTheme";
import { labelStyle, GhostLink, underlineInputStyle } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import { STATUS } from "./chartTheme";
import { formatCost, formatPct } from "./format";

function CostRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-white/[0.06]">
      <span style={{ fontSize: 14, color: text.secondary }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 14.5, fontWeight: 500, color: text.bright }}>{value}</span>
    </div>
  );
}

export default function BudgetPanel({ overview, budget, loading, onSaveBudget }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (loading || !overview || !budget) {
    return (
      <SectionCard title="Budget & Cost">
        <SkeletonBlock rows={4} />
      </SectionCard>
    );
  }

  const { cost } = overview;
  const usedPct = budget.used_pct;
  const pctClamped = usedPct !== null ? Math.min(usedPct * 100, 100) : 0;
  const barColor = usedPct === null ? cyan[400] : usedPct >= 1 ? "#f87171" : usedPct >= 0.9 ? "#fb923c" : usedPct >= 0.75 ? "#facc15" : "#4ade80";
  const barGlow = usedPct === null ? `${cyan[400]}33` : usedPct >= 1 ? "rgba(248,113,113,0.4)" : usedPct >= 0.9 ? "rgba(251,146,60,0.4)" : usedPct >= 0.75 ? "rgba(250,204,21,0.4)" : "rgba(74,222,128,0.4)";

  async function handleSave() {
    const num = Number(draft);
    if (draft.trim() !== "" && (Number.isNaN(num) || num < 0)) {
      setError("Enter a valid non-negative number, or leave blank to clear the budget.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSaveBudget(draft.trim() === "" ? null : num);
      setEditing(false);
    } catch {
      setError("Couldn't save that budget.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Budget & Cost" subtitle="Application-estimated spend from configured pricing — not a provider account balance.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="flex flex-col">
          <div style={labelStyle}>Estimated Cost (Selected Period)</div>
          {!cost.available ? (
            <p style={{ fontFamily: fontHeading, fontSize: 18, color: text.muted, marginTop: space[2] }}>
              Cost unavailable — no pricing configured
              {cost.unpriced_calls > 0 && ` (${cost.unpriced_calls} call${cost.unpriced_calls === 1 ? "" : "s"})`}
            </p>
          ) : (
            <>
              <div
                style={{
                  fontFamily: fontHeading,
                  fontSize: "clamp(28px, 2.5vw, 36px)",
                  fontWeight: 600,
                  color: text.bright,
                  marginTop: space[1] ?? 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatCost(cost.total)}
              </div>
              <div className="mt-4 flex flex-col">
                <CostRow label="Input Tokens" value={formatCost(cost.input)} />
                <CostRow label="Output Tokens" value={formatCost(cost.output)} />
                <CostRow label="Cache Read" value={formatCost(cost.cache_read)} />
                <CostRow label="Cache Write" value={formatCost(cost.cache_write)} />
              </div>
              {cost.unpriced_calls > 0 && (
                <p style={{ fontSize: 13, color: text.muted, marginTop: space[2] }}>
                  Excludes {cost.unpriced_calls} call{cost.unpriced_calls === 1 ? "" : "s"} with no pricing configured for that model.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <div style={labelStyle}>Monthly API Budget Target</div>
            {!editing && (
              <GhostLink onClick={() => { setDraft(budget.monthly_budget_usd?.toString() ?? ""); setEditing(true); }} muted>
                {budget.monthly_budget_usd != null ? "Edit" : "Set budget"}
              </GhostLink>
            )}
          </div>

          {editing ? (
            <div className="flex items-center gap-3 mt-4">
              <span style={{ color: text.bright, fontSize: 16 }}>$</span>
              <input
                type="number"
                min={0}
                step={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Monthly budget…"
                style={{
                  ...underlineInputStyle,
                  width: 140,
                  padding: "4px 8px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 4,
                  borderBottom: `1px solid ${cyan[400]}`,
                }}
              />
              <GhostLink onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</GhostLink>
              <GhostLink onClick={() => setEditing(false)} muted disabled={saving}>Cancel</GhostLink>
            </div>
          ) : budget.monthly_budget_usd == null ? (
            <p style={{ fontSize: 14, color: text.secondary, marginTop: space[3], lineHeight: 1.6 }}>
              No monthly budget configured. Set a limit to track team spend and avoid unexpected surges.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between mt-3">
                <span style={{ fontFamily: fontHeading, fontSize: 24, fontWeight: 600, color: text.bright }}>
                  {formatCost(budget.current_spend_usd)}{" "}
                  <span style={{ color: text.muted, fontSize: 17, fontWeight: 400 }}>
                    / {formatCost(budget.monthly_budget_usd)}
                  </span>
                </span>
                <span
                  className="px-2 py-0.5 rounded text-xs font-semibold"
                  style={{
                    color: barColor,
                    background: `${barColor}18`,
                    border: `1px solid ${barColor}33`,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatPct(usedPct)} used
                </span>
              </div>

              {/* Glowing progress bar */}
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.07)",
                  marginTop: space[3],
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    width: `${pctClamped}%`,
                    height: "100%",
                    background: barColor,
                    boxShadow: `0 0 14px ${barGlow}`,
                    borderRadius: 999,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>

              <div className="flex items-center justify-between mt-3 text-[13px]" style={{ color: text.secondary }}>
                <span>{formatCost(budget.remaining_usd)} remaining</span>
                {budget.projected_period_spend_usd !== null && (
                  <span>Projected: {formatCost(budget.projected_period_spend_usd)}</span>
                )}
              </div>

              {budget.thresholds_crossed?.length > 0 && (
                <p
                  className="text-[13px] mt-3 px-3 py-1.5 rounded-md"
                  style={{
                    color: "#fecaca",
                    background: "rgba(248,113,113,0.15)",
                    border: "1px solid rgba(248,113,113,0.30)",
                  }}
                >
                  ⚠ Budget threshold{budget.thresholds_crossed.length > 1 ? "s" : ""} crossed: {budget.thresholds_crossed.join("%, ")}%
                </p>
              )}

              {!budget.cost_available && (
                <p style={{ fontSize: 13, color: text.muted, marginTop: space[2] }}>
                  No calls this month have pricing configured yet — spend shown may be incomplete.
                </p>
              )}
            </>
          )}
          {error && <p style={{ fontSize: 13, color: "#f87171", marginTop: space[2] }}>{error}</p>}
        </div>
      </div>
    </SectionCard>
  );
}

