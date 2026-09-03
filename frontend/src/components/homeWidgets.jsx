// Shared interactive primitives for the /home "hearth" redesign — every
// redesigned page (AI Model, Outlook, LinkedIn, Classroom, CV, Tasks, Agent)
// composes its layout from these so hover/underline/link behavior stays
// pixel-identical across pages instead of being redefined per file.
import { useState } from "react";
import { fontHeading, text, accent, space, radius, cream } from "./homeTheme";

export const labelStyle = {
  fontSize: 11,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: cream(0.42),
};

export const underlineInputStyle = {
  width: "100%",
  padding: `${space[2]}px 0`,
  background: "transparent",
  border: 0,
  borderBottom: `1px solid ${cream(0.16)}`,
  color: text.cream,
  fontSize: 15,
  outline: "none",
};

export const underlineSelectStyle = {
  padding: `${space[2]}px 0`,
  background: "transparent",
  border: 0,
  borderBottom: `1px solid ${cream(0.16)}`,
  color: text.cream,
  fontSize: 15,
  outline: "none",
};

// Bordered block for a repeatable editable entry (a CV experience/education
// row, a project) — echoes the mockup's own bordered "Summary" box.
export const entryCardStyle = {
  padding: space[5] ?? 23,
  border: `1px solid ${cream(0.1)}`,
  borderRadius: radius.md,
  background: "rgba(15,12,10,0.25)",
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
      className="inline-flex items-center justify-center border-none bg-transparent p-1"
      style={{
        color: danger ? (hovered ? "rgba(224,140,140,1)" : "rgba(224,140,140,0.75)") : hovered ? text.base : cream(0.5),
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "color 0.3s ease",
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
        padding: "3px 11px",
        border: `1px solid ${cream(0.18)}`,
        borderRadius: radius.sm,
        fontSize: 13,
        color: text.cream,
      }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center border-none bg-transparent p-0"
          style={{ color: cream(0.45), cursor: "pointer" }}
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
        fontSize: 16,
        color: danger ? "rgba(224,140,140,0.9)" : muted ? cream(0.55) : hovered ? accent[200] : accent[300],
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "color 0.4s ease",
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
  const tint = danger ? "rgba(224,140,140,0.9)" : accent[400];
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
        border: `1px solid ${danger ? tint : `${tint}8c`}`,
        borderRadius: radius.md,
        fontFamily: fontHeading,
        fontSize: 16,
        color: danger ? "rgba(224,140,140,0.95)" : accent[200],
        background: hovered && !disabled ? (danger ? "rgba(224,140,140,0.14)" : `${accent[400]}1f`) : "transparent",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.5s ease",
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
