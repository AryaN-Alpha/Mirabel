import { useEffect, useState } from "react";
import { Brain, Loader2, SlidersHorizontal } from "lucide-react";
import { getMemoryStats, listMemories } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream } from "../homeTheme";
import { GhostLink, EmptyState, GlassPanel, PanelEyebrow, StatTile, ErrorNote, underlineInputStyle, underlineSelectStyle } from "../homeWidgets";

const PAGE_SIZE = 20;

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MoodChip({ mood, active, onToggle }) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      className="no-underline inline-flex items-center"
      style={{
        padding: "3px 13px",
        border: `1px solid ${active ? accent[400] : cream(0.16)}`,
        borderRadius: 4,
        fontSize: 12,
        letterSpacing: "0.04em",
        color: active ? accent[200] : cream(0.55),
        transition: "color 0.3s ease, border-color 0.3s ease",
      }}
    >
      {mood}
    </a>
  );
}

// Card-row treatment for a tabular-ish record — a lightweight stand-in for
// `.ds-table`'s zebra/hover striping (index.css) since these rows carry
// variable-height body text rather than fixed table cells. Hover state is
// local per row so the highlight never bleeds across rows.
function MemoryRow({ memory, zebra }) {
  const [hovered, setHovered] = useState(false);
  const isSummary = memory.kind === "summary";
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: `${space[5] ?? 23}px ${space[4]}px`,
        borderBottom: `1px solid ${cream(0.09)}`,
        background: hovered ? cream(0.045) : zebra ? cream(0.018) : "transparent",
        transition: "background 0.2s ease",
      }}
    >
      <div className="flex items-center flex-wrap" style={{ gap: space[3], marginBottom: space[2] }}>
        {isSummary && (
          <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f0b8b8" }}>
            Summary
          </span>
        )}
        {memory.mood && (
          <span style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: accent[300] }}>
            {memory.mood}
          </span>
        )}
        {typeof memory.salience === "number" && (
          <span style={{ fontSize: 11, color: cream(0.4), fontVariantNumeric: "tabular-nums" }}>
            salience {memory.salience.toFixed(2)}
          </span>
        )}
        <span style={{ fontSize: 11, color: cream(0.4), marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {formatDate(memory.created_at)}
        </span>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.75, color: text.cream, margin: 0 }}>{memory.text}</p>
    </div>
  );
}

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

export default function AgentMemoriesTab() {
  const [stats, setStats] = useState(null);

  const [selectedMoods, setSelectedMoods] = useState([]);
  const [kind, setKind] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minSalience, setMinSalience] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState("created_at");
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMemoryStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [selectedMoods, kind, dateFrom, dateTo, minSalience, debouncedSearch, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    listMemories({
      mood: selectedMoods.length ? selectedMoods : undefined,
      kind: kind === "all" ? undefined : kind,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      min_salience: minSalience || undefined,
      q: debouncedSearch || undefined,
      sort,
      page,
      page_size: PAGE_SIZE,
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load memories."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMoods, kind, dateFrom, dateTo, minSalience, debouncedSearch, sort, page]);

  function toggleMood(mood) {
    setSelectedMoods((prev) => (prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]));
  }

  const moodOptions = stats ? Object.keys(stats.mood_breakdown).sort() : [];
  const topMood = moodOptions.length ? Object.entries(stats.mood_breakdown).sort((a, b) => b[1] - a[1])[0][0] : "—";
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      {stats && (
        <div style={entrance(0.05)}>
          <GlassPanel float={1} delay={0} style={{ padding: `${space[6]}px ${space[6]}px` }}>
            <PanelEyebrow icon={Brain}>At a glance</PanelEyebrow>
            <div className="flex flex-wrap" style={{ gap: space[4] }}>
              <StatTile label="Total memories" value={stats.total} />
              <StatTile label="Oldest" value={stats.oldest ? formatDate(stats.oldest) : "—"} />
              <StatTile label="Newest" value={stats.newest ? formatDate(stats.newest) : "—"} />
              <StatTile label="Top mood" value={topMood} />
            </div>
          </GlassPanel>
        </div>
      )}

      <div style={entrance(0.1)}>
        <GlassPanel float={2} delay={-2.4} style={{ padding: `${space[6]}px ${space[6]}px` }}>
          <PanelEyebrow icon={SlidersHorizontal}>Filter memories</PanelEyebrow>

          {moodOptions.length > 0 && (
            <div className="flex items-center flex-wrap" style={{ gap: space[2], marginBottom: space[5] ?? 23 }}>
              {moodOptions.map((mood) => (
                <MoodChip key={mood} mood={mood} active={selectedMoods.includes(mood)} onToggle={() => toggleMood(mood)} />
              ))}
            </div>
          )}

          <div className="flex items-center flex-wrap" style={{ gap: space[6] }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memory text…"
              style={{ ...underlineInputStyle, flex: 1, minWidth: 220, fontFamily: fontHeading, fontSize: 20, color: text.base }}
            />
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={underlineSelectStyle}>
              <option value="all">All kinds</option>
              <option value="turn">Turns</option>
              <option value="summary">Summaries</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={underlineSelectStyle}>
              <option value="created_at">Newest first</option>
              <option value="salience">Most salient</option>
            </select>
          </div>

          <div className="flex items-center flex-wrap" style={{ gap: space[5] ?? 23, marginTop: space[4] }}>
            <label className="flex items-center" style={{ gap: space[2] }}>
              <span style={{ fontSize: 12, color: cream(0.45) }}>From</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...underlineInputStyle, width: "auto", colorScheme: "dark" }} />
            </label>
            <label className="flex items-center" style={{ gap: space[2] }}>
              <span style={{ fontSize: 12, color: cream(0.45) }}>To</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...underlineInputStyle, width: "auto", colorScheme: "dark" }} />
            </label>
            <label className="flex items-center" style={{ gap: space[2] }}>
              <span style={{ fontSize: 12, color: cream(0.45) }}>Min salience</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={minSalience}
                onChange={(e) => setMinSalience(e.target.value)}
                style={{ ...underlineInputStyle, width: 70 }}
              />
            </label>
          </div>
        </GlassPanel>
      </div>

      <div style={entrance(0.16)}>
        <GlassPanel float={3} delay={-4.2} hoverLift={false} style={{ padding: `${space[6]}px ${space[3]}px` }}>
          {loading ? (
            <div className="w-full flex items-center justify-center" style={{ padding: `${space[8]}px 0`, color: cream(0.4) }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : error ? (
            <ErrorNote>{error}</ErrorNote>
          ) : !data || data.results.length === 0 ? (
            <EmptyState dot>Nothing remembered yet. Talk to her for a while and this page will fill in on its own.</EmptyState>
          ) : (
            <>
              <div className="flex flex-col">
                {data.results.map((memory, i) => (
                  <MemoryRow key={memory.id} memory={memory} zebra={i % 2 === 1} />
                ))}
              </div>

              <div className="flex items-center justify-between" style={{ marginTop: space[6], padding: `0 ${space[1]}px` }}>
                <GhostLink disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} muted={page <= 1}>
                  ← Previous
                </GhostLink>
                <span style={{ fontSize: 12, color: cream(0.4), fontVariantNumeric: "tabular-nums" }}>
                  {data.total} memor{data.total === 1 ? "y" : "ies"} · page {page} of {totalPages}
                </span>
                <GhostLink disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} muted={page >= totalPages}>
                  Next →
                </GhostLink>
              </div>
            </>
          )}
        </GlassPanel>
      </div>

    </div>
  );
}
