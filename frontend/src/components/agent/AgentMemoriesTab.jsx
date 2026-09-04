import { useEffect, useState } from "react";
import { getMemoryStats, listMemories } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream, glassBorder } from "../homeTheme";
import { GhostLink, EmptyState, underlineInputStyle, underlineSelectStyle } from "../homeWidgets";

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

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: text.secondary }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: fontHeading,
          fontSize: 34,
          fontVariantNumeric: "tabular-nums",
          color: value === "—" ? text.muted : accent[300],
          marginTop: space[2],
        }}
      >
        {value}
      </div>
    </div>
  );
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
        padding: "4px 14px",
        border: `1px solid ${active ? accent[400] : glassBorder}`,
        background: active ? "rgba(255, 151, 131, 0.12)" : "rgba(255, 255, 255, 0.02)",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.04em",
        color: active ? accent[300] : text.secondary,
        transition: "color 0.25s ease, border-color 0.25s ease, background 0.25s ease",
      }}
    >
      {mood}
    </a>
  );
}

function MemoryRow({ memory }) {
  const isSummary = memory.kind === "summary";
  return (
    <div style={{ padding: `${space[5] ?? 23}px ${space[3]}px`, borderBottom: `1px solid ${glassBorder}` }}>
      <div className="flex items-center flex-wrap" style={{ gap: space[3], marginBottom: space[2] }}>
        {isSummary && (
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#f87171" }}>
            [Summary]
          </span>
        )}
        {memory.mood && (
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: accent[300] }}>
            {memory.mood}
          </span>
        )}
        {typeof memory.salience === "number" && (
          <span style={{ fontSize: 12, color: text.muted }}>salience {memory.salience.toFixed(2)}</span>
        )}
        <span style={{ fontSize: 12, color: text.muted, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
          {formatDate(memory.created_at)}
        </span>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.75, color: text.bright }}>{memory.text}</p>
    </div>
  );
}

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
    <div>
      {stats && (
        <div
          className="flex flex-wrap"
          style={{
            gap: space[8] * 1.4,
            marginTop: space[6],
            padding: `${space[5]}px 0`,
            borderTop: `1px solid ${accent[400]}40`,
            borderBottom: `1px solid ${glassBorder}`,
          }}
        >
          <Stat label="Total memories" value={stats.total} />
          <Stat label="Oldest" value={stats.oldest ? formatDate(stats.oldest) : "—"} />
          <Stat label="Newest" value={stats.newest ? formatDate(stats.newest) : "—"} />
          <Stat label="Top mood" value={topMood} />
        </div>
      )}

      {moodOptions.length > 0 && (
        <div className="flex items-center flex-wrap" style={{ gap: space[2], marginTop: space[6] }}>
          {moodOptions.map((mood) => (
            <MoodChip key={mood} mood={mood} active={selectedMoods.includes(mood)} onToggle={() => toggleMood(mood)} />
          ))}
        </div>
      )}

      <div className="flex items-center flex-wrap" style={{ gap: space[6], marginTop: space[6] }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memory text…"
          style={{ ...underlineInputStyle, flex: 1, minWidth: 220, fontFamily: fontHeading, fontSize: 20, color: text.bright }}
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
          <span style={{ fontSize: 13, color: text.secondary }}>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...underlineInputStyle, width: "auto", colorScheme: "dark" }} />
        </label>
        <label className="flex items-center" style={{ gap: space[2] }}>
          <span style={{ fontSize: 13, color: text.secondary }}>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...underlineInputStyle, width: "auto", colorScheme: "dark" }} />
        </label>
        <label className="flex items-center" style={{ gap: space[2] }}>
          <span style={{ fontSize: 13, color: text.secondary }}>Min salience</span>
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

      {loading ? (
        <p style={{ fontSize: 15, marginTop: space[8], color: cream(0.5) }}>Loading…</p>
      ) : error ? (
        <EmptyState>{error}</EmptyState>
      ) : !data || data.results.length === 0 ? (
        <EmptyState dot>Nothing remembered yet. Talk to her for a while and this page will fill in on its own.</EmptyState>
      ) : (
        <>
          <div className="flex flex-col" style={{ marginTop: space[6] }}>
            {data.results.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} />
            ))}
          </div>

          <div className="flex items-center justify-between" style={{ marginTop: space[6] }}>
            <GhostLink disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} muted={page <= 1}>
              ← Previous
            </GhostLink>
            <span style={{ fontSize: 12, color: cream(0.4) }}>
              {data.total} memor{data.total === 1 ? "y" : "ies"} · page {page} of {totalPages}
            </span>
            <GhostLink disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} muted={page >= totalPages}>
              Next →
            </GhostLink>
          </div>
        </>
      )}
    </div>
  );
}
