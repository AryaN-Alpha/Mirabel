// CV-scoped field & card styling — engineered for maximum visibility,
// contrast, and accessibility on dark galactic surfaces.
import { space, radius, motion } from "../homeTheme";

export const fieldStyle = {
  width: "100%",
  padding: `${space[3]}px ${space[4]}px`,
  background: "rgba(15, 14, 22, 0.82)",
  border: "1px solid rgba(246, 248, 255, 0.22)",
  borderRadius: radius.md || 6,
  color: "#f8faff",
  fontSize: 14.5,
  outline: "none",
  boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.4)",
  transition: `border-color ${motion.hover}, background ${motion.hover}, box-shadow ${motion.hover}`,
};

export const selectFieldStyle = {
  ...fieldStyle,
  appearance: "none",
  WebkitAppearance: "none",
  cursor: "pointer",
  background: "rgba(15, 14, 22, 0.95)",
};

export const textareaFieldStyle = {
  ...fieldStyle,
  lineHeight: 1.6,
};

// Distinct, high-contrast entry cards for repeatable CV items (Experience, Education, Projects)
export const cvEntryCardStyle = {
  padding: `${space[5] ?? 23}px`,
  border: "1px solid rgba(246, 248, 255, 0.16)",
  borderRadius: radius.lg || 10,
  background: "rgba(24, 21, 32, 0.72)",
  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
};

// High-contrast, legible label style for fields
export const cvLabelStyle = {
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(246, 248, 255, 0.8)",
  marginBottom: 6,
};

