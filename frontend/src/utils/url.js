const SAFE_SCHEMES = /^(https?|mailto|tel):/i;

// CV links are frequently entered without a scheme (e.g. "linkedin.com/in/x"
// pasted straight from a browser bar, or a bare domain the AI structuring
// step extracted from a PDF). Rendering that raw string as an <a href> makes
// the browser treat it as a relative link off the current page instead of an
// external URL — this normalizes it before it's ever used as an href.
//
// Any scheme outside the safe allowlist (javascript:, data:, vbscript:, ...)
// is treated as if it were a bare domain rather than passed through — this
// is a single-user app with no server-side sanitization on this field, so a
// value like "javascript:fetch(...)" saved here would otherwise execute in
// the viewer's session the moment the rendered link is clicked.
export function normalizeUrl(raw) {
  const url = (raw || "").trim();
  if (!url) return "";
  if (SAFE_SCHEMES.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return `https://${url.replace(/^[a-z][a-z0-9+.-]*:\/*/i, "")}`;
  if (url.includes("@") && !url.includes("/")) return `mailto:${url}`;
  return `https://${url}`;
}

export function isLikelyValidUrl(raw) {
  const url = (raw || "").trim();
  if (!url) return true;
  const normalized = normalizeUrl(url);
  if (/^mailto:|^tel:/i.test(normalized)) return normalized.length > "mailto:".length;
  try {
    const parsed = new URL(normalized);
    return Boolean(parsed.hostname) && parsed.hostname.includes(".");
  } catch {
    return false;
  }
}
