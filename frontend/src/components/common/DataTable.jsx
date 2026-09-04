import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, Inbox } from "lucide-react";
import { fontHeading, fontMono, text, cyan, cream, space, radius } from "../homeTheme";

export default function DataTable({
  columns,
  rows = [],
  defaultSort,
  loading = false,
  emptyMessage = "No data recorded in this range.",
  emptyTitle = "No records found",
  zebra = true,
  maxHeight,
  className = "",
  style,
}) {
  const [sort, setSort] = useState(() => (defaultSort === undefined ? { key: columns[0]?.key, dir: "desc" } : defaultSort));
  const [hoveredRow, setHoveredRow] = useState(null);

  const sorted = useMemo(() => {
    if (!rows || !rows.length) return [];
    if (!sort?.key) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const getValue = col?.sortValue ?? ((row) => row[sort.key]);
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
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

  return (
    <div
      className={`w-full overflow-hidden rounded-xl border border-white/[0.08] ${className}`}
      style={{
        background: "linear-gradient(180deg, rgba(16,14,22,0.65) 0%, rgba(8,8,12,0.55) 100%)",
        boxShadow: "0 10px 30px -15px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.04)",
        ...style,
      }}
    >
      <div
        className="w-full overflow-x-auto"
        style={{
          maxHeight: maxHeight || undefined,
          scrollbarWidth: "thin",
        }}
      >
        <table className="w-full border-collapse" style={{ minWidth: 540 }}>
          <thead>
            <tr
              style={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                background: "rgba(14,12,18,0.96)",
                backdropFilter: "blur(12px)",
                borderBottom: `1px solid ${cream(0.14)}`,
              }}
            >
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                const isSortable = col.sortable !== false;

                return (
                  <th
                    key={col.key}
                    onClick={isSortable ? () => toggleSort(col.key) : undefined}
                    style={{
                      textAlign: col.align ?? "left",
                      padding: "13px 18px",
                      color: isSorted ? cyan[300] : cream(0.70),
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      cursor: isSortable ? "pointer" : "default",
                      userSelect: "none",
                      borderBottom: `1px solid ${cream(0.14)}`,
                      transition: "color 0.2s ease, background 0.2s ease",
                    }}
                    className={isSortable ? "hover:bg-white/[0.03]" : ""}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {col.label}
                      {isSortable && (
                        <span className="inline-flex items-center text-xs opacity-70">
                          {isSorted ? (
                            sort.dir === "desc" ? (
                              <ChevronDown size={13} strokeWidth={2.2} />
                            ) : (
                              <ChevronUp size={13} strokeWidth={2.2} />
                            )
                          ) : (
                            <span className="w-3" />
                          )}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              // Loading Skeleton State
              Array.from({ length: 5 }).map((_, rIndex) => (
                <tr
                  key={`skeleton-${rIndex}`}
                  style={{
                    borderBottom: `1px solid ${cream(0.06)}`,
                    background: zebra && rIndex % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent",
                  }}
                >
                  {columns.map((col, cIndex) => (
                    <td key={`skeleton-cell-${cIndex}`} style={{ padding: "16px 18px" }}>
                      <div
                        style={{
                          height: 14,
                          width: col.align === "right" ? "60%" : "85%",
                          marginLeft: col.align === "right" ? "auto" : 0,
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.07)",
                          animation: "stats-shimmer 1.6s ease infinite",
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              // Empty State
              <tr>
                <td colSpan={columns.length} style={{ padding: "48px 24px", textAlign: "center" }}>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div
                      className="p-3 rounded-full mb-1"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: `1px solid ${cream(0.1)}`,
                        color: cream(0.5),
                      }}
                    >
                      <Inbox size={22} strokeWidth={1.5} />
                    </div>
                    <div
                      style={{
                        fontFamily: fontHeading,
                        fontSize: 17,
                        fontWeight: 500,
                        color: text.bright,
                      }}
                    >
                      {emptyTitle}
                    </div>
                    <div style={{ fontSize: 14, color: text.secondary, maxWidth: "42ch" }}>
                      {emptyMessage}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              // Data Rows
              sorted.map((row, rIndex) => {
                const isHovered = hoveredRow === rIndex;
                const isOdd = rIndex % 2 === 1;

                return (
                  <tr
                    key={row.__key ?? rIndex}
                    onMouseEnter={() => setHoveredRow(rIndex)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      borderBottom: `1px solid ${cream(0.06)}`,
                      background: isHovered
                        ? "rgba(255,255,255,0.055)"
                        : zebra && isOdd
                        ? "rgba(255,255,255,0.018)"
                        : "transparent",
                      transition: "background 0.15s ease",
                    }}
                  >
                    {columns.map((col) => {
                      const isNumeric = col.align === "right" || typeof row[col.key] === "number";
                      return (
                        <td
                          key={col.key}
                          style={{
                            textAlign: col.align ?? "left",
                            padding: "14px 18px",
                            color: text.base,
                            fontSize: 14,
                            lineHeight: 1.45,
                            fontVariantNumeric: "tabular-nums",
                            fontFamily: col.isMono ? fontMono : undefined,
                            whiteSpace: col.wrap ? "normal" : "nowrap",
                          }}
                        >
                          {col.render ? col.render(row) : row[col.key] ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
