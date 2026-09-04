import { RefreshCw, Download, Filter } from "lucide-react";
import { fontHeading, fontMono, text, accent, cyan, cream, space, radius } from "../homeTheme";
import { labelStyle, GhostLink } from "../homeWidgets";
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

function FilterSelect({ label, value, onChange, disabled, children, minWidth = 150 }) {
  return (
    <div style={{ minWidth, flex: "1 1 auto" }}>
      <div style={labelStyle} className="mb-1.5">{label}</div>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${cream(0.12)}`,
            color: disabled ? cream(0.4) : text.bright,
            fontFamily: fontHeading,
            fontSize: 14,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {children}
        </select>
      </div>
    </div>
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
      className="flex flex-col gap-4 p-5 rounded-2xl"
      style={{
        background: "linear-gradient(165deg, rgba(16,14,22,0.72) 0%, rgba(8,8,13,0.66) 100%)",
        border: `1px solid ${cream(0.10)}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 10px 30px -15px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.05)",
      }}
    >
      <div className="flex items-end flex-wrap gap-4">
        <FilterSelect label="Time Period" value={filters.period} onChange={(v) => set({ period: v })} minWidth={160}>
          {PERIOD_OPTIONS.map((p) => (
            <option key={p.id} value={p.id} style={{ background: "#121016", color: "#fff" }}>{p.label}</option>
          ))}
        </FilterSelect>

        {filters.period === "custom" && (
          <>
            <div>
              <div style={labelStyle} className="mb-1.5">Start Date</div>
              <input
                type="date"
                value={filters.start_date ?? ""}
                onChange={(e) => set({ start_date: e.target.value })}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${cream(0.12)}`,
                  color: text.bright,
                  colorScheme: "dark",
                  fontFamily: fontMono,
                  fontSize: 13,
                }}
              />
            </div>
            <div>
              <div style={labelStyle} className="mb-1.5">End Date</div>
              <input
                type="date"
                value={filters.end_date ?? ""}
                onChange={(e) => set({ end_date: e.target.value })}
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${cream(0.12)}`,
                  color: text.bright,
                  colorScheme: "dark",
                  fontFamily: fontMono,
                  fontSize: 13,
                }}
              />
            </div>
          </>
        )}

        <FilterSelect label="Provider" value={filters.provider} onChange={(v) => set({ provider: v, model: "" })} minWidth={150}>
          <option value="" style={{ background: "#121016", color: "#fff" }}>All Providers</option>
          {providers.map((p) => (
            <option key={p} value={p} style={{ background: "#121016", color: "#fff" }}>{providerLabel(p)}</option>
          ))}
        </FilterSelect>

        <FilterSelect
          label="Model"
          value={filters.model}
          disabled={!filters.provider}
          onChange={(v) => set({ model: v })}
          minWidth={170}
        >
          <option value="" style={{ background: "#121016", color: "#fff" }}>All Models</option>
          {modelsForProvider.map((m) => (
            <option key={m} value={m} style={{ background: "#121016", color: "#fff" }}>{m}</option>
          ))}
        </FilterSelect>

        <FilterSelect label="Call Site" value={filters.call_site} onChange={(v) => set({ call_site: v })} minWidth={150}>
          <option value="" style={{ background: "#121016", color: "#fff" }}>All Sites</option>
          {callSites.map((c) => (
            <option key={c} value={c} style={{ background: "#121016", color: "#fff" }}>{c}</option>
          ))}
        </FilterSelect>

        <FilterSelect label="Usage Type" value={filters.estimated} onChange={(v) => set({ estimated: v })} minWidth={150}>
          <option value="" style={{ background: "#121016", color: "#fff" }}>Actual + Estimated</option>
          <option value="false" style={{ background: "#121016", color: "#fff" }}>Actual Only</option>
          <option value="true" style={{ background: "#121016", color: "#fff" }}>Estimated Only</option>
        </FilterSelect>

        <div className="flex items-center gap-4 ml-auto pt-2 sm:pt-0">
          {onExport && (
            <GhostLink onClick={onExport} muted>
              <Download size={14} /> Export CSV
            </GhostLink>
          )}
          <GhostLink onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
          </GhostLink>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs pt-2 border-t border-white/[0.04]">
        {filters.period === "custom" && (!filters.start_date || !filters.end_date) ? (
          <span style={{ color: "#facc15", fontFamily: fontMono }}>
            ⚠ Select both start and end dates to apply custom range.
          </span>
        ) : (
          <span style={{ color: text.secondary, fontFamily: fontMono }}>
            Active Filter Scope
          </span>
        )}

        {lastUpdated && (
          <span style={{ color: text.secondary, fontFamily: fontMono }}>
            Telemetry synced at {lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

