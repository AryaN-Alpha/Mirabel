// Chart color system for the Stats dashboard — separate from homeTheme's
// warm gold "hearth" chrome tokens (buttons, borders, headings, which stay
// exactly as-is) because chart series need several *mutually distinguishable*
// hues, not one accent family. This 5-slot categorical palette is the
// dataviz skill's validated dark-mode reference order — verified with
// scripts/validate_palette.js against this app's actual dark card surface
// (all 5 checks pass: lightness band, chroma floor, CVD adjacent-pair
// separation, normal-vision floor, contrast). Slot order is fixed and never
// cycled — a provider always maps to the same hue everywhere it appears.
export const SERIES = {
  anthropic: "#3987e5", // blue
  openai: "#d95926", // orange
  gemini: "#199e70", // aqua
  deepseek: "#c98500", // yellow
  opencode: "#d55181", // magenta
};
export const OTHER_SERIES_COLOR = "#8a8578";

export function seriesColor(key, index = 0) {
  return SERIES[key] ?? [SERIES.anthropic, SERIES.openai, SERIES.gemini, SERIES.deepseek, SERIES.opencode][index % 5] ?? OTHER_SERIES_COLOR;
}

// Fixed status colors (never reused for a series) — dataviz skill's status
// palette, dark-mode steps.
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

// Two-series (input vs output token) contexts use the first two categorical
// slots — validated as a pair, not just individually.
export const INPUT_COLOR = SERIES.anthropic;
export const OUTPUT_COLOR = SERIES.openai;
export const CACHE_READ_COLOR = SERIES.gemini;
export const CACHE_WRITE_COLOR = SERIES.deepseek;

export const GRID_COLOR = "rgba(246,248,255,0.08)";
export const AXIS_COLOR = "rgba(246,248,255,0.4)";
export const TOOLTIP_STYLE = {
  contentStyle: {
    background: "rgba(9,8,9,0.94)",
    border: "1px solid rgba(246,248,255,0.14)",
    borderRadius: 8,
    fontSize: 12,
    color: "#f2f4fb",
    boxShadow: "0 20px 48px -26px rgba(0,0,0,0.7)",
  },
  labelStyle: { color: "rgba(246,248,255,0.6)", marginBottom: 4 },
  itemStyle: { padding: 0 },
};
