// Local (CV-scoped) field styling — mirrors AIModelPage.jsx's sunken glass
// field pattern (a recessed field nested inside whatever panel/entry card it
// lives on) so CV inputs read as part of the same redesigned system. Kept
// local to cv/ per the redesign brief rather than added to the shared
// homeWidgets.jsx, which other pages still depend on.
import { text, space, radius, surface, glassBorder, motion } from "../homeTheme";

export const fieldStyle = {
  width: "100%",
  padding: `${space[3]}px ${space[4]}px`,
  background: surface.sunken,
  border: `1px solid ${glassBorder.soft}`,
  borderRadius: radius.md,
  color: text.cream,
  fontSize: 15,
  outline: "none",
  transition: `border-color ${motion.hover}, background ${motion.hover}`,
};

export const selectFieldStyle = {
  ...fieldStyle,
  appearance: "none",
  WebkitAppearance: "none",
};

export const textareaFieldStyle = {
  ...fieldStyle,
  lineHeight: 1.6,
};
