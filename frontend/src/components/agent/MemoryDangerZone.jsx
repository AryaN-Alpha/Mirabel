import { useEffect, useState } from "react";
import { previewDeleteMemories, deleteMemories } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { cream, space } from "../homeTheme";
import { ErrorNote, GhostLink, OutlineButton, SuccessNote, underlineInputStyle, underlineSelectStyle } from "../homeWidgets";
import ConfirmDialog from "../ConfirmDialog";

const PRESETS = [
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "this_year", label: "This year" },
  { key: "last_week", label: "Last week" },
  { key: "last_month", label: "Last month" },
  { key: "last_year", label: "Last year" },
  { key: "older_30d", label: "Older than 30 days" },
  { key: "custom", label: "Custom range" },
  { key: "all", label: "Everything" },
];

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Calendar-based ranges, computed in the browser's local time — matches the
// existing From/To <input type="date"> filters above, which are also local.
function presetRange(preset) {
  const now = new Date();
  switch (preset) {
    case "this_week": {
      const start = new Date(now);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return { from: toDateInputValue(start), to: toDateInputValue(now) };
    }
    case "this_month":
      return { from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateInputValue(now) };
    case "this_year":
      return { from: toDateInputValue(new Date(now.getFullYear(), 0, 1)), to: toDateInputValue(now) };
    case "last_week": {
      const start = new Date(now);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: toDateInputValue(start), to: toDateInputValue(end) };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toDateInputValue(start), to: toDateInputValue(end) };
    }
    case "last_year":
      return {
        from: toDateInputValue(new Date(now.getFullYear() - 1, 0, 1)),
        to: toDateInputValue(new Date(now.getFullYear() - 1, 11, 31)),
      };
    case "older_30d": {
      const end = new Date(now);
      end.setDate(end.getDate() - 30);
      return { from: null, to: toDateInputValue(end) };
    }
    default:
      return { from: null, to: null };
  }
}

function formatCount(n) {
  return `${n} memor${n === 1 ? "y" : "ies"}`;
}

export default function MemoryDangerZone({ onDeleted }) {
  const [preset, setPreset] = useState("this_week");
  const [kind, setKind] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [count, setCount] = useState(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [countError, setCountError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState("");
  const [previewToken, setPreviewToken] = useState(0);

  const range = preset === "custom" ? { from: customFrom || null, to: customTo || null } : presetRange(preset);
  const rangeIncomplete = preset === "custom" && !range.from && !range.to;

  function buildParams() {
    if (preset === "all") return { scope: "all" };
    return {
      scope: "range",
      date_from: range.from ? `${range.from}T00:00:00.000000+00:00` : undefined,
      date_to: range.to ? `${range.to}T23:59:59.999999+00:00` : undefined,
      kind: kind === "all" ? undefined : kind,
    };
  }

  useEffect(() => {
    if (preset !== "all" && rangeIncomplete) {
      setCount(null);
      return;
    }
    let cancelled = false;
    setLoadingCount(true);
    setCountError("");
    previewDeleteMemories(buildParams())
      .then((data) => {
        if (!cancelled) setCount(data.count);
      })
      .catch((err) => {
        if (!cancelled) setCountError(getErrorMessage(err, "Couldn't count matching memories."));
      })
      .finally(() => {
        if (!cancelled) setLoadingCount(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, kind, range.from, range.to, previewToken]);

  // Selecting a new preset/kind/range clears the just-shown success note —
  // separate from the count-refetch effect above so a delete's own
  // previewToken bump (which re-triggers that effect to re-verify the
  // count) doesn't immediately wipe the message it's meant to follow.
  useEffect(() => {
    setSuccess("");
  }, [preset, kind, range.from, range.to]);

  async function handleDelete() {
    const result = await deleteMemories(buildParams());
    setSuccess(`Deleted ${formatCount(result.deleted)}.`);
    setConfirming(false);
    setPreviewToken((t) => t + 1);
    onDeleted?.();
  }

  return (
    <div style={{ marginTop: space[8] * 1.4, paddingTop: space[6], borderTop: "1px solid rgba(224,140,140,0.25)" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(224,140,140,0.75)" }}>
        Danger zone
      </div>
      <p style={{ fontSize: 13, marginTop: space[2], color: cream(0.5) }}>
        Permanently delete memories from both the database and vector store. This cannot be undone.
      </p>

      <div className="flex items-center flex-wrap" style={{ gap: space[3], marginTop: space[5] ?? 23 }}>
        {PRESETS.map((p) => (
          <GhostLink key={p.key} onClick={() => setPreset(p.key)} muted={preset !== p.key}>
            {p.label}
          </GhostLink>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex items-center flex-wrap" style={{ gap: space[5] ?? 23, marginTop: space[4] }}>
          <label className="flex items-center" style={{ gap: space[2] }}>
            <span style={{ fontSize: 12, color: cream(0.45) }}>From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ ...underlineInputStyle, width: "auto", colorScheme: "dark" }}
            />
          </label>
          <label className="flex items-center" style={{ gap: space[2] }}>
            <span style={{ fontSize: 12, color: cream(0.45) }}>To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ ...underlineInputStyle, width: "auto", colorScheme: "dark" }}
            />
          </label>
        </div>
      )}

      {preset !== "all" && (
        <div className="flex items-center" style={{ gap: space[3], marginTop: space[4] }}>
          <span style={{ fontSize: 12, color: cream(0.45) }}>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={underlineSelectStyle}>
            <option value="all">All kinds</option>
            <option value="turn">Turns</option>
            <option value="fact">Facts</option>
            <option value="summary">Summaries</option>
          </select>
        </div>
      )}

      <div className="flex items-center flex-wrap" style={{ gap: space[5] ?? 23, marginTop: space[5] ?? 23 }}>
        <OutlineButton danger disabled={rangeIncomplete || loadingCount || !count} onClick={() => setConfirming(true)}>
          Delete{count != null && !rangeIncomplete ? ` ${formatCount(count)}` : ""}
        </OutlineButton>
        {loadingCount && <span style={{ fontSize: 12, color: cream(0.4) }}>Counting…</span>}
      </div>

      <ErrorNote>{countError}</ErrorNote>
      <SuccessNote>{success}</SuccessNote>

      {confirming && (
        <ConfirmDialog
          title={preset === "all" ? "Delete every memory?" : `Delete ${formatCount(count ?? 0)}?`}
          message={
            preset === "all"
              ? "This permanently wipes the entire memory store — every turn, fact, and summary, from both Postgres and the vector store. This cannot be undone."
              : "This permanently removes the matching memories from both Postgres and the vector store. This cannot be undone."
          }
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
