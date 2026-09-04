import { useState } from "react";
import { fontHeading, fontMono, text, cream, space, radius, danger } from "../homeTheme";
import { labelStyle, GhostLink, underlineInputStyle } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import { STATUS } from "./chartTheme";
import { formatCost, formatPct } from "./format";

function CostRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between" style={{ padding: `${space[2]}px 0`, borderBottom: `1px solid ${cream(0.08)}` }}>
      <span style={{ fontSize: 14, color: cream(0.65) }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontFamily: fontMono, fontSize: 14, color: text.base }}>{value}</span>
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
  const barColor = usedPct === null ? cream(0.2) : usedPct >= 1 ? STATUS.critical : usedPct >= 0.9 ? STATUS.serious : usedPct >= 0.75 ? STATUS.warning : STATUS.good;

  async function handleSave() {
    // Number(), not parseFloat(): parseFloat("12abc") silently returns 12
    // (it parses a leading numeric prefix and ignores trailing garbage),
    // which would accept obviously-malformed input as if it were valid.
    // Number("12abc") is NaN, so it's rejected below instead.
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
      <div className="flex flex-wrap" style={{ gap: space[8] * 1.2 }}>
        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <div style={labelStyle}>Estimated Cost (selected period)</div>
          {!cost.available ? (
            <p style={{ fontFamily: fontHeading, fontSize: 22, color: cream(0.4), marginTop: space[2] }}>
              Cost unavailable — no pricing configured
              {cost.unpriced_calls > 0 && ` (${cost.unpriced_calls} call${cost.unpriced_calls === 1 ? "" : "s"})`}
            </p>
          ) : (
            <>
              <div style={{ fontFamily: fontMono, fontSize: 32, color: text.bright, marginTop: space[1] ?? 4 }}>
                {formatCost(cost.total)}
              </div>
              <div style={{ marginTop: space[3] }}>
                <CostRow label="Input" value={formatCost(cost.input)} />
                <CostRow label="Output" value={formatCost(cost.output)} />
                <CostRow label="Cache read" value={formatCost(cost.cache_read)} />
                <CostRow label="Cache write" value={formatCost(cost.cache_write)} />
              </div>
              {cost.unpriced_calls > 0 && (
                <p style={{ fontSize: 11, color: cream(0.35), marginTop: space[2] }}>
                  Excludes {cost.unpriced_calls} call{cost.unpriced_calls === 1 ? "" : "s"} with no pricing configured for that model.
                </p>
              )}
            </>
          )}
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 260 }}>
          <div className="flex items-center justify-between">
            <div style={labelStyle}>API Budget — this calendar month</div>
            {!editing && (
              <GhostLink onClick={() => { setDraft(budget.monthly_budget_usd?.toString() ?? ""); setEditing(true); }} muted>
                {/* != null (not truthy): a $0 budget is a real, configured
                    value ("alert on any spend"), not the same as unset. */}
                {budget.monthly_budget_usd != null ? "Edit" : "Set budget"}
              </GhostLink>
            )}
          </div>

          {editing ? (
            <div className="flex items-center" style={{ gap: space[3], marginTop: space[3] }}>
              <span style={{ color: cream(0.5) }}>$</span>
              <input
                type="number"
                min={0}
                step={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Monthly budget…"
                style={{ ...underlineInputStyle, width: 120 }}
              />
              <GhostLink onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</GhostLink>
              <GhostLink onClick={() => setEditing(false)} muted disabled={saving}>Cancel</GhostLink>
            </div>
          ) : budget.monthly_budget_usd == null ? (
            <p style={{ fontSize: 14, color: cream(0.5), marginTop: space[3] }}>
              No budget configured. Set one to track spend against a monthly target.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between" style={{ marginTop: space[3] }}>
                <span style={{ fontFamily: fontMono, fontSize: 22, color: text.bright }}>
                  {formatCost(budget.current_spend_usd)} <span style={{ color: cream(0.4), fontSize: 16 }}>/ {formatCost(budget.monthly_budget_usd)}</span>
                </span>
                <span style={{ fontSize: 13, color: barColor }}>{formatPct(usedPct)} used</span>
              </div>
              <div style={{ height: 8, borderRadius: radius.sm, background: cream(0.07), marginTop: space[2], overflow: "hidden" }}>
                <div style={{ width: `${pctClamped}%`, height: "100%", background: barColor, transition: "width 0.4s ease" }} />
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: space[2], fontSize: 12, color: cream(0.45) }}>
                <span>{formatCost(budget.remaining_usd)} remaining</span>
                {budget.projected_period_spend_usd !== null && (
                  <span>Projected: {formatCost(budget.projected_period_spend_usd)}</span>
                )}
              </div>
              {budget.thresholds_crossed?.length > 0 && (
                <p style={{ fontSize: 12, marginTop: space[3], color: barColor }}>
                  ⚠ Budget threshold{budget.thresholds_crossed.length > 1 ? "s" : ""} crossed: {budget.thresholds_crossed.join("%, ")}%
                </p>
              )}
              {!budget.cost_available && (
                <p style={{ fontSize: 11, color: cream(0.32), marginTop: space[2] }}>
                  No calls this month have pricing configured yet — spend shown may be incomplete.
                </p>
              )}
            </>
          )}
          {error && <p style={{ fontSize: 12, color: danger[400], marginTop: space[2] }}>{error}</p>}
        </div>
      </div>
    </SectionCard>
  );
}
