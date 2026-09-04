import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { space, cream, text, fontMono } from "../homeTheme";
import { TabLink, GhostLink } from "../homeWidgets";
import { SectionCard, SkeletonBlock } from "./SectionCard";
import DataTable from "./DataTable";
import { getStatsTopUsage } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { formatTokens, formatCost, formatMs, formatDateTime, providerLabel } from "./format";

const PAGE_SIZE = 10;

const COLUMNS = [
  { key: "created_at", label: "When", render: (r) => formatDateTime(r.created_at), sortable: false },
  { key: "provider", label: "Provider", render: (r) => providerLabel(r.provider), sortable: false },
  { key: "model", label: "Model", sortable: false },
  { key: "call_site", label: "Call Site", sortable: false },
  { key: "input_tokens", label: "Input", align: "right", render: (r) => formatTokens(r.input_tokens), sortable: false },
  { key: "output_tokens", label: "Output", align: "right", render: (r) => formatTokens(r.output_tokens), sortable: false },
  { key: "cache_read_tokens", label: "Cache", align: "right", render: (r) => formatTokens(r.cache_read_tokens), sortable: false },
  { key: "estimated", label: "Est.", render: (r) => (r.estimated ? "yes" : ""), sortable: false },
  { key: "latency_ms", label: "Latency", align: "right", render: (r) => formatMs(r.latency_ms), sortable: false },
  { key: "cost", label: "Cost", align: "right", render: (r) => formatCost(r.cost), sortable: false },
];

const KIND_LABELS = { cost: "Most Expensive", input_tokens: "Largest Prompts", output_tokens: "Largest Responses" };

export default function TopUsageTable({ filters }) {
  const [kind, setKind] = useState("cost");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Resetting offset and fetching used to be two separate effects both
  // keyed on [kind, filters]: on a kind/filter change, the fetch effect ran
  // once with the STALE (pre-reset) offset before the reset effect's
  // setOffset(0) landed and triggered a second run — a real double-fetch
  // (visible as duplicate identical requests when switching tabs while on
  // page 2+) that also briefly rendered the wrong page for the new kind.
  // Track the previous (kind, filters) key and skip straight to a reset
  // when it changes, instead of fetching with an offset that's about to be
  // thrown away.
  const prevKeyRef = useRef(`${kind}|${JSON.stringify(filters)}`);

  useEffect(() => {
    const key = `${kind}|${JSON.stringify(filters)}`;
    const changed = key !== prevKeyRef.current;
    prevKeyRef.current = key;
    if (changed && offset !== 0) {
      setOffset(0);
      return; // the offset change re-triggers this effect at offset=0
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    getStatsTopUsage(filters, kind, PAGE_SIZE, offset)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, "Couldn't load top usage.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, kind, offset]);

  const count = data?.count ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <SectionCard
      title="Top Usage"
      subtitle="Metadata only — never raw prompt content."
      action={
        <div className="flex items-center" style={{ gap: space[5] ?? 23 }}>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <TabLink key={k} active={kind === k} onClick={() => setKind(k)}>{label}</TabLink>
          ))}
        </div>
      }
    >
      {error && <p style={{ fontSize: 12, color: "rgba(224,140,140,0.9)", marginBottom: space[3] }}>{error}</p>}
      {loading ? (
        <SkeletonBlock rows={4} />
      ) : (
        <>
          {/* null: preserve the backend's own sort for the active kind tab —
              every column here is non-sortable, so an explicit defaultSort
              would silently re-sort rows by that fixed column regardless of
              which kind ("Most Expensive"/"Largest Prompts"/"Largest
              Responses") is actually selected. */}
          <DataTable columns={COLUMNS} rows={(data?.results ?? []).map((r, i) => ({ ...r, __key: i }))} defaultSort={null} />
          {count > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.06]">
              <span style={{ fontSize: 13, color: text.secondary, fontFamily: fontMono }}>
                Page {page} of {pageCount} · {count} total calls
              </span>
              <div className="flex items-center gap-3">
                <GhostLink onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} disabled={offset === 0} muted>
                  <ChevronLeft size={14} /> Previous
                </GhostLink>
                <GhostLink onClick={() => setOffset((o) => o + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= count} muted>
                  Next <ChevronRight size={14} />
                </GhostLink>
              </div>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
