// Shared tokens for the /home dashboard — kept in one place because Sidebar,
// HomeLayout, and HomePage all need to match exactly. This is the "Modernist"
// galaxy palette (see GalaxyBackdrop.jsx / the source .dc.html design export):
// near-black ground, a single red accent ramp, Archivo throughout.
export const fontHeading = '"Archivo", system-ui, sans-serif';
export const fontBody = '"Archivo", system-ui, sans-serif';

export const bg = "#040407";
export const text = {
  bright: "#f8faff",
  base: "#f2f4fb",
  cream: "#eef1fb",
  muted: "rgba(246,248,255,0.62)",
  faint: "rgba(246,248,255,0.45)",
  divider: "rgba(246,248,255,0.12)",
};
export const accent = {
  100: "#fff2ef",
  200: "#ffe0d9",
  300: "#ffc4b8",
  400: "#ff9783",
  600: "#dd2b0f",
  800: "#7c1405",
};
export const accent2700 = "#9e3526";

// Design-system spacing/radius scale (matches _ds styles.css exactly).
export const space = { 1: 4.6, 2: 9.2, 3: 13.8, 4: 18.4, 6: 27.6, 8: 36.8 };
export const radius = { sm: 2, md: 4, lg: 7 };

// `#eef1fb` (the body text color) at an arbitrary alpha — mirrors the design's
// `color-mix(in srgb, #eef1fb N%, transparent)` used at many different
// percentages depending on context.
export function cream(alpha) {
  return `rgba(246,248,255,${alpha})`;
}
