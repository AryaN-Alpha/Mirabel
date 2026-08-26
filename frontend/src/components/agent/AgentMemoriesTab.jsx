import { useEffect, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { getMemoryStats, listMemories } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../AgentPage";
import CustomSelect from "../common/CustomSelect";

const PAGE_SIZE = 20;
const KIND_OPTIONS = [
  { value: "all", label: "All kinds" },
  { value: "turn", label: "Turns" },
  { value: "summary", label: "Summaries" },
];
const SORT_OPTIONS = [
  { value: "created_at", label: "Newest first" },
  { value: "salience", label: "Most salient" },
];

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

function chipStyle(active) {
  return active
    ? {
        background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
        color: "#2c1c16",
      }
    : { background: "rgba(243,233,226,0.06)", color: "rgba(243,233,226,0.6)" };
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
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      {stats && (
        <div className="flex flex-wrap gap-4 rounded-2xl px-5 py-4" style={{ background: "rgba(243,233,226,0.04)" }}>
          <Stat label="Total memories" value={stats.total} />
          <Stat label="Oldest" value={stats.oldest ? formatDate(stats.oldest) : "—"} />
          <Stat label="Newest" value={stats.newest ? formatDate(stats.newest) : "—"} />
          <Stat
            label="Top mood"
            value={
              moodOptions.length
                ? Object.entries(stats.mood_breakdown).sort((a, b) => b[1] - a[1])[0][0]
                : "—"
            }
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {moodOptions.map((mood) => (
            <button
              key={mood}
              onClick={() => toggleMood(mood)}
              className="px-3 py-1.5 rounded-full text-[12px] border-none cursor-pointer transition-all duration-150"
              style={chipStyle(selectedMoods.includes(mood))}
            >
              {mood}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(243,233,226,0.4)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memory text…"
              className="w-full pl-9 pr-3.5 py-2 rounded-full text-[12.5px] outline-none"
              style={inputStyle}
            />
          </div>

          <CustomSelect
            options={KIND_OPTIONS}
            value={kind}
            onChange={(val) => setKind(val)}
            variant="pill"
            size="sm"
            className="min-w-[120px]"
          />

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-full text-[12.5px] outline-none"
            style={inputStyle}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-full text-[12.5px] outline-none"
            style={inputStyle}
          />

          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={minSalience}
            onChange={(e) => setMinSalience(e.target.value)}
            placeholder="Min salience"
            className="w-[110px] px-3.5 py-2 rounded-full text-[12.5px] outline-none"
            style={inputStyle}
          />

          <CustomSelect
            options={SORT_OPTIONS}
            value={sort}
            onChange={(val) => setSort(val)}
            variant="pill"
            size="sm"
            className="min-w-[130px]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[13px]" style={{ color: "rgba(224,140,140,0.9)" }}>
            {error}
          </p>
        </div>
      ) : !data || data.results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Brain size={22} strokeWidth={1.6} style={{ color: "rgba(243,233,226,0.3)" }} />
          <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.45)" }}>
            No memories match these filters.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {data.results.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} />
            ))}
          </div>

          <div className="flex items-center justify-between px-1">
            <p className="text-[12px]" style={{ color: "rgba(243,233,226,0.4)" }}>
              {data.total} memor{data.total === 1 ? "y" : "ies"} · page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="w-8 h-8 grid place-items-center rounded-full border-none cursor-pointer"
                style={{ background: "rgba(243,233,226,0.08)", color: "#f3e9e2", opacity: page <= 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="w-8 h-8 grid place-items-center rounded-full border-none cursor-pointer"
                style={{ background: "rgba(243,233,226,0.08)", color: "#f3e9e2", opacity: page >= totalPages ? 0.4 : 1 }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[100px]">
      <p className="text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "rgba(243,233,226,0.4)" }}>
        {label}
      </p>
      <p className="text-[14px]" style={{ color: "#f7ece4" }}>
        {value}
      </p>
    </div>
  );
}

function MemoryRow({ memory }) {
  const isSummary = memory.kind === "summary";
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: "rgba(243,233,226,0.03)" }}>
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        {isSummary && (
          <span
            className="text-[10px] uppercase tracking-[0.05em] px-2 py-[3px] rounded-full"
            style={{ background: "rgba(224,168,168,0.18)", color: "#f0b8b8" }}
          >
            Summary
          </span>
        )}
        {memory.mood && (
          <span
            className="text-[10px] uppercase tracking-[0.05em] px-2 py-[3px] rounded-full"
            style={{ background: "rgba(243,233,226,0.07)", color: "rgba(243,233,226,0.55)" }}
          >
            {memory.mood}
          </span>
        )}
        {typeof memory.salience === "number" && (
          <span className="text-[11px]" style={{ color: "rgba(243,233,226,0.4)" }}>
            salience {memory.salience.toFixed(2)}
          </span>
        )}
        <span className="text-[11px] ml-auto" style={{ color: "rgba(243,233,226,0.4)" }}>
          {formatDate(memory.created_at)}
        </span>
      </div>
      <p className="text-[13px]" style={{ color: "#f3e9e2" }}>
        {memory.text}
      </p>
    </div>
  );
}
