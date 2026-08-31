import { RefreshCw, Download } from "lucide-react";
import { fontHeading, cream, space } from "../homeTheme";
import { labelStyle, underlineSelectStyle, GhostLink } from "../homeWidgets";
import { providerLabel } from "./format";

export const PERIOD_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_30_days", label: "Last 30 Days" },
  { id: "this_year", label: "This Year" },
  { id: "last_12_months", label: "Last 12 Months" },
  { id: "custom", label: "Custom Range" },
];

function Select({ value, onChange, children, style }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...underlineSelectStyle, ...style }}>
      {children}
    </select>
  );
}

export default function StatsFilterBar({ filters, onChange, meta, onRefresh, lastUpdated, refreshing, onExport }) {
  const providers = meta?.providers ?? [];
  const modelsForProvider = filters.provider ? meta?.models_by_provider?.[filters.provider] ?? [] : [];
  const callSites = meta?.call_sites ?? [];

  function set(patch) {
    onChange({ ...filters, ...patch });
  }

  return (
    <div
      className="flex flex-col"
      style={{ gap: space[3], padding: `${space[4]}px ${space[5] ?? 23}px`, border: `1px solid ${cream(0.1)}`, borderRadius: 6, background: "rgba(15,12,10,0.35)" }}
    >
      <div className="flex items-end flex-wrap" style={{ gap: space[5] ?? 23 }}>
        <div style={{ minWidth: 160 }}>
          <div style={labelStyle}>Time period</div>
          <Select value={filters.period} onChange={(v) => set({ period: v })}>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.id} value={p.id} style={{ color: "#000" }}>{p.label}</option>
            ))}
          </Select>
        </div>

        {filters.period === "custom" && (
          <>
            <div>
              <div style={labelStyle}>Start</div>
              <input
                type="date"
                value={filters.start_date ?? ""}
                onChange={(e) => set({ start_date: e.target.value })}
                style={{ ...underlineSelectStyle, colorScheme: "dark" }}
              />
            </div>
            <div>
              <div style={labelStyle}>End</div>
              <input
                type="date"
                value={filters.end_date ?? ""}
                onChange={(e) => set({ end_date: e.target.value })}
                style={{ ...underlineSelectStyle, colorScheme: "dark" }}
              />
            </div>
          </>
        )}

        <div style={{ minWidth: 150 }}>
          <div style={labelStyle}>Provider</div>
          <Select value={filters.provider} onChange={(v) => set({ provider: v, model: "" })}>
            <option value="" style={{ color: "#000" }}>All Providers</option>
            {providers.map((p) => (
              <option key={p} value={p} style={{ color: "#000" }}>{providerLabel(p)}</option>
            ))}
          </Select>
        </div>

        <div style={{ minWidth: 170 }}>
          <div style={labelStyle}>Model</div>
          <Select value={filters.model} onChange={(v) => set({ model: v })} style={{ opacity: filters.provider ? 1 : 0.4 }}>
            <option value="" style={{ color: "#000" }}>All Models</option>
            {modelsForProvider.map((m) => (
              <option key={m} value={m} style={{ color: "#000" }}>{m}</option>
            ))}
          </Select>
        </div>

        <div style={{ minWidth: 150 }}>
          <div style={labelStyle}>Call Site</div>
          <Select value={filters.call_site} onChange={(v) => set({ call_site: v })}>
            <option value="" style={{ color: "#000" }}>All</option>
            {callSites.map((c) => (
              <option key={c} value={c} style={{ color: "#000" }}>{c}</option>
            ))}
          </Select>
        </div>

        <div style={{ minWidth: 140 }}>
          <div style={labelStyle}>Usage type</div>
          <Select value={filters.estimated} onChange={(v) => set({ estimated: v })}>
            <option value="" style={{ color: "#000" }}>Actual + Estimated</option>
            <option value="false" style={{ color: "#000" }}>Actual only</option>
            <option value="true" style={{ color: "#000" }}>Estimated only</option>
          </Select>
        </div>

        <div className="flex items-center" style={{ gap: space[4], marginLeft: "auto" }}>
          {onExport && (
            <GhostLink onClick={onExport} muted>
              <Download size={13} /> Export CSV
            </GhostLink>
          )}
          <GhostLink onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
          </GhostLink>
        </div>
      </div>

      {filters.period === "custom" && (!filters.start_date || !filters.end_date) ? (
        <p style={{ fontSize: 11, color: cream(0.45), margin: 0, fontFamily: fontHeading }}>
          Pick both a start and end date to apply the custom range.
        </p>
      ) : lastUpdated ? (
        <p style={{ fontSize: 11, color: cream(0.35), margin: 0, fontFamily: fontHeading }}>
          Last updated: {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
        </p>
      ) : null}
    </div>
  );
}
