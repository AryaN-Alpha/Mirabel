// Shared tokens for the /home dashboard — kept in one place because Sidebar,
// HomeLayout, and HomePage all need to match exactly. This is the "Modernist"
// galaxy palette (see GalaxyBackdrop.jsx / the source .dc.html design export):
// near-black ground, a single red accent ramp, Archivo throughout.
export const fontHeading = '"Archivo", system-ui, sans-serif';
// Reserved for numeric/telemetry readouts (masked keys, token counts, model
// ids) — echoes the HUD reticle labels baked into GalaxyBackdrop's canvas.
// Used sparingly: never for body copy or headings, only tabular data.
export const fontMono = '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

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

// Secondary/tertiary accents pulled directly from the background canvas'
// own palette (nebulae + near-star tints), so panel chrome reads as part of
// the same universe rather than a foreign UI color system laid on top.
export const info = { 200: "#e4ebff", 300: "#c3d2ff", 400: "#96acf5", 600: "#5a72c9" }; // near-star / warp-mote blue
export const success = { 300: "#b7ecc7", 400: "#8fd6a8", 600: "#4f9c6b" };
export const warning = { 300: "#ffe4ad", 400: "#f3c77a", 600: "#c99a3f" }; // sun-corona gold
export const danger = { 300: "#f3c2c2", 400: "#e08c8c", 600: "#c05a5a" };

// Design-system spacing/radius scale (matches _ds styles.css exactly).
export const space = { 1: 4.6, 2: 9.2, 3: 13.8, 4: 18.4, 5: 23, 6: 27.6, 7: 32.2, 8: 36.8 };
// sm/md/lg are the original crisp scale for controls (buttons, inputs, tags).
// xl/panel are for the floating card shells — matches the 22px already used
// by Sidebar's floating aside and the mobile nav drawer.
export const radius = { sm: 2, md: 4, lg: 7, xl: 16, panel: 22 };

// Glass surface hierarchy. `panel`/`raised` reuse the exact translucent
// gradient + blur recipe already proven on the mobile Sidebar drawer
// (the one place in the current codebase that needed real glass-over-canvas
// readability); `sunken` is for nested/secondary regions inside a panel.
export const surface = {
  sunken: "rgba(7,6,8,0.4)",
  panel: "linear-gradient(165deg, rgba(14,13,13,0.66) 0%, rgba(6,6,7,0.6) 100%)",
  raised: "linear-gradient(165deg, rgba(17,15,15,0.82) 0%, rgba(7,6,7,0.78) 100%)",
  overlay: "rgba(9,8,9,0.9)",
};
export const glassBorder = { soft: cream(0.07), medium: cream(0.14), strong: cream(0.22) };
export const blur = { sm: "8px", md: "16px", lg: "26px" };
export const elevation = {
  raised: "0 20px 48px -26px rgba(0,0,0,0.7)",
  floating: "0 28px 68px -26px rgba(0,0,0,0.78)",
};
export const motion = {
  hover: "0.28s cubic-bezier(.2,.7,.2,1)",
  entrance: "0.9s cubic-bezier(.2,.7,.2,1)",
};

// `#eef1fb` (the body text color) at an arbitrary alpha — mirrors the design's
// `color-mix(in srgb, #eef1fb N%, transparent)` used at many different
// percentages depending on context.
export function cream(alpha) {
  return `rgba(246,248,255,${alpha})`;
}
