// Shared number/date formatting for the Stats dashboard. Kept in one place
// so "1.82M" vs "1,820,000" vs "1820k" never drifts between sections.

export function formatTokens(n) {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${Math.round(n)}`;
}

export function formatInt(n) {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function formatCost(n, { unavailable = "Cost unavailable" } = {}) {
  if (n === null || n === undefined) return unavailable;
  const abs = Math.abs(n);
  if (abs > 0 && abs < 0.01) return "<$0.01";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPct(n, { digits = 1 } = {}) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatMs(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

export function formatRate(n, { digits = 2, suffix = "" } = {}) {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

export function formatDelta(pct) {
  if (pct === null || pct === undefined) return null;
  // No arrow glyph in the label — StatTile renders a lucide icon for
  // direction instead, so a unicode arrow here would just duplicate it.
  const sign = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { sign, label: `${Math.abs(pct * 100).toFixed(1)}%` };
}

export function formatBucketLabel(iso, granularity) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (granularity === "hour") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: "UTC" });
  }
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC",
  }) + " UTC";
}

export const PROVIDER_LABELS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  opencode: "OpenCode",
};

export function providerLabel(p) {
  return PROVIDER_LABELS[p] ?? p;
}
