// Shared tokens for the /home dashboard's "hearth" redesign — kept in one
// place because Sidebar, HomeLayout, and HomePage all need to match exactly.
export const fontHeading = '"Cormorant Garamond", system-ui, serif';
export const fontBody = '"Lora", system-ui, serif';

export const bg = "#171310";
export const text = {
  bright: "#fbf5ec",
  base: "#f6efe4",
  cream: "#efe6da",
  muted: "rgba(239,230,218,0.62)",
  faint: "rgba(239,230,218,0.45)",
  divider: "rgba(239,230,218,0.1)",
};
export const accent = {
  100: "#fff3e4",
  200: "#ffe3bf",
  300: "#facb8d",
  400: "#e1ad66",
  600: "#a06f24",
  800: "#5a3b0a",
};
export const accent2700 = "#79561f";

// Design-system spacing/radius scale (matches _ds styles.css exactly).
export const space = { 1: 4.6, 2: 9.2, 3: 13.8, 4: 18.4, 6: 27.6, 8: 36.8 };
export const radius = { sm: 2, md: 4, lg: 7 };

// `#efe6da` (the body text color) at an arbitrary alpha — mirrors the design's
// `color-mix(in srgb, #efe6da N%, transparent)` used at many different
// percentages depending on context.
export function cream(alpha) {
  return `rgba(239,230,218,${alpha})`;
}
