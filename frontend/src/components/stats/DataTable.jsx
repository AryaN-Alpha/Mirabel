import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { text, cream, space } from "../homeTheme";

// Minimal sortable table shared by the Provider/Model/Call-Site/Performance/
// Top-Usage sections — columns declare {key, label, align, render, sortValue}.
// `defaultSort`: omit it to sort by the first column by default; pass an
// explicit {key, dir} to start sorted by that column; pass `null` when the
// caller has ALREADY sorted `rows` server-side and every column is
// `sortable: false` (Top Usage) — that preserves the incoming order instead
// of silently re-sorting by whatever the first/most-recent sort state was
// (a real bug: TopUsageTable used to pass a fixed {key:"cost"} defaultSort,
// so switching to the "Largest Prompts"/"Largest Responses" tabs displayed
// rows in cost order, contradicting both the tab label and the backend's
// actual sort).
export default function DataTable({ columns, rows, defaultSort, emptyMessage = "No data in this range." }) {
  const [sort, setSort] = useState(() => (defaultSort === undefined ? { key: columns[0]?.key, dir: "desc" } : defaultSort));

  const sorted = useMemo(() => {
    if (!sort?.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const getValue = col?.sortValue ?? ((row) => row[sort.key]);
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      // Missing values always sort to the bottom regardless of asc/desc —
      // a deliberate choice (matches the common spreadsheet convention of
      // blanks-last) rather than an asc/desc-aware comparison.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sort, columns]);

  function toggleSort(key) {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  if (!rows.length) {
    return <p style={{ fontSize: 13, color: cream(0.4), padding: `${space[4]}px 0` }}>{emptyMessage}</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={col.sortable === false ? undefined : () => toggleSort(col.key)}
                style={{
                  textAlign: col.align ?? "left",
                  padding: `${space[2]}px ${space[3]}px`,
                  borderBottom: `1px solid ${cream(0.14)}`,
                  color: cream(0.45),
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  cursor: col.sortable === false ? "default" : "pointer",
                  userSelect: "none",
                }}
              >
                <span className="inline-flex items-center" style={{ gap: 3 }}>
                  {col.label}
                  {col.sortable !== false && sort.key === col.key && (sort.dir === "desc" ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.__key ?? i} style={{ borderBottom: `1px solid ${cream(0.06)}` }}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    textAlign: col.align ?? "left",
                    padding: `${space[2]}px ${space[3]}px`,
                    color: text.base,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
