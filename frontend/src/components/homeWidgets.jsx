// Shared interactive primitives for the /home "hearth" redesign — every
// redesigned page (AI Model, Outlook, LinkedIn, Classroom, CV, Tasks, Agent)
// composes its layout from these so hover/underline/link behavior stays
// pixel-identical across pages instead of being redefined per file.
import { useState } from "react";
import { fontHeading, fontMono, text, accent, space, radius, cream, surface, glassBorder, blur, elevation, motion } from "./homeTheme";

export const labelStyle = {
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: cream(0.65),
  fontWeight: 500,
};

export const underlineInputStyle = {
  width: "100%",
  padding: `${space[2]}px 0`,
  background: "transparent",
  border: 0,
  borderBottom: `1px solid ${cream(0.20)}`,
  color: text.bright,
  fontSize: 15,
  outline: "none",
};

export const underlineSelectStyle = {
  padding: `${space[2]}px 0`,
  background: "transparent",
  border: 0,
  borderBottom: `1px solid ${cream(0.20)}`,
  color: text.bright,
  fontSize: 15,
  outline: "none",
};

// Bordered block for a repeatable editable entry (a CV experience/education
// row, a project) — refined with modern glass backdrop and subtle rim lighting.
export const entryCardStyle = {
  padding: space[5] ?? 23,
  border: `1px solid ${cream(0.12)}`,
  borderRadius: radius.lg,
  background: "linear-gradient(180deg, rgba(18,16,24,0.65) 0%, rgba(10,9,14,0.55) 100%)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 10px 30px -15px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.05)",
};

// Small borderless icon button — remove/delete affordances next to a field.
export function IconButton({ children, onClick, disabled, danger, title }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center justify-center border-none bg-transparent p-1.5 rounded-md"
      style={{
        color: danger ? (hovered ? "#f87171" : "rgba(248,113,113,0.85)") : hovered ? text.bright : cream(0.68),
        background: hovered ? "rgba(255,255,255,0.07)" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "color 0.2s ease, background 0.2s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </button>
  );
}

// Thin bordered tag with a remove control — used for skill chips.
export function Tag({ children, onRemove }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{
        padding: "4px 12px",
        border: `1px solid ${cream(0.20)}`,
        borderRadius: radius.sm,
        background: "rgba(255,255,255,0.04)",
        fontSize: 14,
        color: text.base,
      }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center border-none bg-transparent p-0"
          style={{ color: cream(0.60), cursor: "pointer" }}
        >
          ✕
        </button>
      )}
    </span>
  );
}

// Text link that brightens/tints on hover — the mockup's "Save", "Signature",
// "Retry", "Cancel" style links.
export function GhostLink({ children, onClick, disabled, muted, danger, className = "", style, ...rest }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onClick?.();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`no-underline inline-flex items-center gap-1.5 ${className}`}
      style={{
        fontFamily: fontHeading,
        fontSize: 15,
        color: danger ? "#f87171" : muted ? cream(0.70) : hovered ? text.bright : accent[300],
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "color 0.25s ease, opacity 0.25s ease",
        ...style,
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

// Bordered pill-ish outline button — the mockup's "Save changes", "Connect",
// "Download PDF" primary actions.
export function OutlineButton({ children, onClick, disabled, danger, className = "", ...rest }) {
  const [hovered, setHovered] = useState(false);
  const tint = danger ? "#f87171" : accent[400];
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onClick?.();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`no-underline inline-flex items-center justify-center ${className}`}
      style={{
        padding: `${space[2]}px ${space[6] - 4.6}px`,
        border: `1px solid ${danger ? tint : `${tint}a6`}`,
        borderRadius: radius.md,
        fontFamily: fontHeading,
        fontSize: 15,
        fontWeight: 500,
        color: danger ? "#fecaca" : accent[200],
        background: hovered && !disabled ? (danger ? "rgba(248,113,113,0.18)" : `${accent[400]}26`) : "rgba(255,255,255,0.02)",
        boxShadow: hovered && !disabled ? `0 0 20px -5px ${danger ? "rgba(248,113,113,0.3)" : `${accent[400]}33`}` : "none",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.25s ease",
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

// Underlined nav tab — the mockup's Inbox/Compose/Scheduled and
// Profile/Create post/Drafts/Settings row.
export function TabLink({ children, active, onClick, icon: Icon }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      className="no-underline inline-flex items-center gap-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        paddingBottom: space[2],
        borderBottom: `1px solid ${active ? accent[400] : hovered ? accent[600] : "transparent"}`,
        fontFamily: fontHeading,
        fontSize: 19,
        color: active ? text.base : hovered ? text.base : cream(0.6),
        transition: "color 0.4s ease, border-color 0.4s ease",
      }}
    >
      {Icon && <Icon size={14} strokeWidth={1.8} />}
      {children}
    </a>
  );
}

// Backdrop + bordered panel shared by every modal dialog (Kanban's task,
// project, and confirm dialogs) — thin border and flat dark fill instead of
// the old rounded-3xl gradient card.
export function ModalShell({ children, onClose, maxWidth = 460, busy = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,8,7,0.6)", backdropFilter: "blur(6px)" }}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full flex flex-col overflow-y-auto"
        style={{
          maxWidth,
          maxHeight: "90vh",
          gap: space[4],
          padding: space[6],
          border: `1px solid ${cream(0.14)}`,
          borderRadius: radius.lg,
          background: "rgba(32,26,22,0.95)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
          animation: "home-rise 0.35s cubic-bezier(.2,.7,.2,1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Centered "nothing here yet" block — matches the Agent/Tasks empty states.
export function EmptyState({ children, dot = false }) {
  return (
    <div
      className="text-center"
      style={{
        marginTop: space[8] * 1.2,
        padding: `${space[8] * 0.9}px 0`,
        borderTop: `1px solid ${cream(0.09)}`,
      }}
    >
      {dot && (
        <span
          className="inline-block rounded-full"
          style={{ width: 9, height: 9, background: accent[400], animation: "home-breathe 6s ease-in-out infinite" }}
        />
      )}
      <p
        className="mx-auto"
        style={{
          margin: `${dot ? space[5] : 0}px auto 0`,
          maxWidth: "38ch",
          fontFamily: fontHeading,
          fontSize: 19,
          fontStyle: "italic",
          lineHeight: 1.5,
          color: cream(0.5),
        }}
      >
        {children}
      </p>
    </div>
  );
}

// Floating glass card — the base surface for every redesigned page's content
// blocks. Two nested elements on purpose: the outer div owns the ambient
// zero-gravity float (a CSS animation, which fully controls `transform` for
// its whole duration and would silently clobber an inline hover-lift style
// set on the same element), the inner div owns the glass fill/border/hover
// elevation. `float` (1|2|3) picks a home-float-N variant from index.css;
// `delay` is seconds (negative values start the loop already in progress,
// which is what keeps same-variant panels from ever bobbing in sync).
export function GlassPanel({
  children,
  elevated = false,
  glow = false,
  float,
  delay = 0,
  hoverLift = true,
  className = "",
  style,
  ...rest
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className={float ? `home-float-${float}` : undefined} style={{ animationDelay: `${delay}s` }}>
      <div
        className={className}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          borderRadius: radius.panel,
          border: `1px solid ${hovered ? glassBorder.medium : glassBorder.soft}`,
          background: elevated ? surface.raised : surface.panel,
          backdropFilter: `blur(${blur.lg})`,
          WebkitBackdropFilter: `blur(${blur.lg})`,
          boxShadow: hovered
            ? `${elevation.floating}${glow ? `, 0 0 60px -28px ${accent[400]}` : ""}`
            : elevation.raised,
          transform: hoverLift && hovered ? "translateY(-3px)" : "translateY(0)",
          transition: `transform ${motion.hover}, box-shadow ${motion.hover}, border-color ${motion.hover}`,
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}

// Uppercase HUD-style eyebrow used to head every glass panel — an icon chip
// plus a tracked-out label, echoing the canvas's own reticle labels ("SOL",
// "G2V / ANCHOR").
export function PanelEyebrow({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: space[4] }}>
      {Icon && (
        <span
          className="inline-flex items-center justify-center shrink-0"
          style={{ width: 22, height: 22, borderRadius: radius.sm, border: `1px solid ${accent[400]}55`, color: accent[300] }}
        >
          <Icon size={12} strokeWidth={1.8} />
        </span>
      )}
      <span style={labelStyle}>{children}</span>
    </div>
  );
}

// Small breathing dot — "this is live/active". Reuses the existing
// home-breathe keyframe (already used by EmptyState) instead of adding a
// near-duplicate animation.
export function StatusDot({ color = accent[400], size = 8 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: color, animation: "home-breathe 4.5s ease-in-out infinite" }}
    />
  );
}

// Labeled numeric field with a right-aligned, tabular-numeral, monospace
// value — the redesign's standard shape for a single-number setting (token
// limits, temperature, counts). Native <input type="number"> under the
// hood, so it keeps normal keyboard/stepper/validation semantics.
export function NumberField({ label, hint, value, onChange, min, max, step, suffix, error, valueColor }) {
  return (
    <div style={{ padding: `${space[4]}px 0`, borderBottom: `1px solid ${cream(0.1)}` }}>
      <label className="flex items-baseline justify-between gap-6">
        <span>
          <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.base }}>{label}</span>
          {hint && (
            <span style={{ fontSize: 12, color: cream(0.45), display: "block", marginTop: space[1] ?? 4, maxWidth: 440 }}>
              {hint}
            </span>
          )}
        </span>
        <span className="flex items-baseline gap-1.5 shrink-0">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 84,
              textAlign: "right",
              background: "transparent",
              border: 0,
              outline: "none",
              fontFamily: fontMono,
              fontVariantNumeric: "tabular-nums",
              fontSize: 19,
              color: valueColor ?? accent[300],
            }}
          />
          {suffix && <span style={{ fontSize: 12, color: cream(0.4) }}>{suffix}</span>}
        </span>
      </label>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

// Toggle switch for a boolean setting — visually matches GalaxyBackdrop's
// own HUD toggle (GalaxyControls' hud switch) so page chrome and background
// controls read as the same instrument language. A real checkbox sits under
// the visual track (opacity 0, not display:none) so focus/keyboard/screen
// reader semantics stay native; the label wraps both for implicit
// association.
export function ToggleSwitch({ checked, onChange, label, description, disabled }) {
  return (
    <label
      className="flex items-center justify-between gap-6"
      style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
    >
      <span>
        {label && <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.base, display: "block" }}>{label}</span>}
        {description && (
          <span style={{ fontSize: 12, color: cream(0.45), display: "block", marginTop: space[1] ?? 4, maxWidth: 440 }}>
            {description}
          </span>
        )}
      </span>
      <span className="relative inline-flex items-center shrink-0" style={{ width: 40, height: 23 }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="absolute inset-0 m-0 cursor-pointer"
          style={{ opacity: 0, width: "100%", height: "100%" }}
        />
        <span
          aria-hidden="true"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 999,
            background: checked ? accent[600] : cream(0.14),
            border: `1px solid ${checked ? accent[400] : cream(0.2)}`,
            transition: "background 0.25s ease, border-color 0.25s ease",
          }}
        />
        <span
          aria-hidden="true"
          className="absolute"
          style={{
            top: 3,
            left: checked ? 20 : 3,
            width: 17,
            height: 17,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
            transition: "left 0.25s cubic-bezier(.2,.7,.2,1)",
          }}
        />
      </span>
    </label>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <p style={{ fontSize: 12, marginTop: space[2], color: "rgba(224,140,140,0.9)" }}>{children}</p>
  );
}

export function SuccessNote({ children }) {
  if (!children) return null;
  return <p style={{ fontSize: 12, marginTop: space[2], color: "#8fd6a8" }}>{children}</p>;
}
