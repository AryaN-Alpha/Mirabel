// Client-side-only download: the content already lives in component state
// (assignment text / AI answer text fetched over JSON), so there's nothing
// for a backend endpoint to generate — a Blob + object URL is enough.
export function downloadTextFile(filename, content) {
  const blob = new Blob([content ?? ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
