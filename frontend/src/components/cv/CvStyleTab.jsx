import { useState } from "react";
import { Reorder } from "framer-motion";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { space, cream, radius } from "../homeTheme";
import { labelStyle, ErrorNote, underlineSelectStyle } from "../homeWidgets";

const SECTION_LABELS = {
  summary: "Summary",
  experience: "Work Experience",
  projects: "Projects",
  certifications: "Certifications",
  skills: "Skills",
  education: "Education",
  strengths: "Strengths",
};

function ThemeSwatch({ theme, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={theme.label}
      className="border-none cursor-pointer inline-flex items-center justify-center"
      style={{
        width: 34,
        height: 34,
        borderRadius: radius.md,
        background: theme.sidebar_bg,
        border: active ? `2px solid ${theme.accent}` : `1px solid ${cream(0.14)}`,
        boxShadow: active ? `0 0 0 2px ${theme.accent}55` : "none",
      }}
    >
      <span className="rounded-full" style={{ width: 10, height: 10, background: theme.accent }} />
    </button>
  );
}

function ReorderColumn({ label, keys, onReorder }) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: space[2] }}>{label}</div>
      <Reorder.Group
        axis="y"
        values={keys}
        onReorder={onReorder}
        className="flex flex-col"
        style={{ gap: space[1], listStyle: "none", padding: 0, margin: 0 }}
      >
        {keys.map((key) => (
          <Reorder.Item
            key={key}
            value={key}
            className="cursor-grab active:cursor-grabbing"
            style={{
              padding: `${space[2]}px ${space[3]}px`,
              border: `1px solid ${cream(0.12)}`,
              borderRadius: radius.sm,
              background: "rgba(15,12,10,0.3)",
              fontSize: 13,
              color: cream(0.8),
              userSelect: "none",
            }}
          >
            {SECTION_LABELS[key] || key}
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}

// Controlled by CvPage.jsx (fetches once, shared with whichever CvPreview*
// is rendered so a change here updates the live preview immediately) —
// mirrors every other Cv*Tab's `sections`/`updateSections` prop shape, just
// for the CvStylePreference resource instead of CVProfile.sections.
export default function CvStyleTab({ stylePref: pref, onSaveStylePref }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(patch) {
    setSaving(true);
    setError("");
    try {
      await onSaveStylePref(patch);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that change."));
    } finally {
      setSaving(false);
    }
  }

  if (!pref) {
    return (
      <div className="flex items-center" style={{ color: cream(0.4) }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  const { fonts, themes, templates } = pref.available;

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      <div>
        <div style={labelStyle}>Font</div>
        <select
          value={pref.font_choice}
          onChange={(e) => save({ font_choice: e.target.value })}
          style={{ ...underlineSelectStyle, marginTop: space[2] }}
        >
          {Object.entries(fonts).map(([key, font]) => (
            <option key={key} value={key} style={{ background: "#1c1712" }}>
              {font.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div style={labelStyle}>Theme</div>
        <div className="flex items-center" style={{ gap: space[2], marginTop: space[2] }}>
          {Object.entries(themes).map(([key, theme]) => (
            <ThemeSwatch key={key} theme={theme} active={pref.theme_choice === key} onClick={() => save({ theme_choice: key })} />
          ))}
        </div>
      </div>

      {Object.keys(templates).length > 1 && (
        <div>
          <div style={labelStyle}>Layout</div>
          <select
            value={pref.template_choice}
            onChange={(e) => save({ template_choice: e.target.value })}
            style={{ ...underlineSelectStyle, marginTop: space[2] }}
          >
            {Object.entries(templates).map(([key, template]) => (
              <option key={key} value={key} style={{ background: "#1c1712" }}>
                {template.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <div style={labelStyle}>Section order</div>
        <p style={{ fontSize: 12, marginTop: space[1], marginBottom: space[3], color: cream(0.45) }}>
          Drag to reorder each column.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: space[5] ?? 23 }}>
          <ReorderColumn
            label="Main"
            keys={pref.section_order.main}
            onReorder={(next) => save({ section_order: { ...pref.section_order, main: next } })}
          />
          <ReorderColumn
            label="Sidebar"
            keys={pref.section_order.sidebar}
            onReorder={(next) => save({ section_order: { ...pref.section_order, sidebar: next } })}
          />
        </div>
      </div>

      {saving && (
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: cream(0.4) }}>
          <Loader2 size={11} className="animate-spin" />
          Saving…
        </span>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
