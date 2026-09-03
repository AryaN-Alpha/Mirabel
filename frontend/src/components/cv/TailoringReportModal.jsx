import { ModalShell, GhostLink } from "../homeWidgets";
import { fontHeading, text, space, cream } from "../homeTheme";

const SECTION_LABELS = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  strengths: "Strengths",
};

function fieldLabel(label) {
  return (
    <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: cream(0.4) }}>{label}</span>
  );
}

function TextDiff({ before, after }) {
  return (
    <div className="flex flex-col" style={{ gap: space[2] }}>
      <div>
        {fieldLabel("Before")}
        <p style={{ fontSize: 13, color: cream(0.5), marginTop: space[1], textDecoration: "line-through", textDecorationColor: cream(0.25) }}>
          {before || "(empty)"}
        </p>
      </div>
      <div>
        {fieldLabel("After")}
        <p style={{ fontSize: 13, color: cream(0.92), marginTop: space[1] }}>{after || "(empty)"}</p>
      </div>
    </div>
  );
}

function SkillsDiff({ before, after }) {
  const render = (groups) =>
    groups.length > 0 ? (
      <div className="flex flex-col" style={{ gap: space[1] }}>
        {groups.map((g, i) => (
          <p key={i} style={{ fontSize: 13, color: cream(0.75) }}>
            <span style={{ color: cream(0.45) }}>{g.category || "Skills"}: </span>
            {(g.skills || []).join(", ")}
          </p>
        ))}
      </div>
    ) : (
      <p style={{ fontSize: 13, color: cream(0.5) }}>(empty)</p>
    );
  return (
    <div className="flex flex-col" style={{ gap: space[2] }}>
      <div>
        {fieldLabel("Before")}
        <div style={{ marginTop: space[1] }}>{render(before)}</div>
      </div>
      <div>
        {fieldLabel("After")}
        <div style={{ marginTop: space[1] }}>{render(after)}</div>
      </div>
    </div>
  );
}

// Shown right after "Auto-update & save as new CV" creates the tailored
// copy — this is the per-field detail behind the short banner notice
// (CvPage.jsx's uploadNotice), since "tailored summary, experience" alone
// doesn't tell the user what an AI call actually rewrote in their CV.
export default function TailoringReportModal({ report, onClose }) {
  const { name, changes = [], reason } = report;

  return (
    <ModalShell onClose={onClose} maxWidth={640}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.bright }}>What changed in "{name}"</span>
        <GhostLink onClick={onClose} muted style={{ fontSize: 14 }}>
          ✕
        </GhostLink>
      </div>

      {reason === "malformed" && (
        <p style={{ fontSize: 13, color: cream(0.6) }}>
          The AI's response couldn't be used this time, so this copy was created untailored. Try Auto-update again.
        </p>
      )}
      {changes.length === 0 && reason !== "malformed" && (
        <p style={{ fontSize: 13, color: cream(0.6) }}>None of the flagged sections needed a change.</p>
      )}

      {changes.length > 0 && (
        <div className="flex flex-col" style={{ gap: space[5] }}>
          {changes.map((c, i) => (
            <div key={i} className="flex flex-col" style={{ gap: space[2] }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: text.bright }}>
                {SECTION_LABELS[c.section] || c.section}
              </span>

              {c.entries ? (
                <div className="flex flex-col" style={{ gap: space[4] }}>
                  {c.entries.map((entry) => (
                    <div key={entry.id}>
                      <span style={{ fontSize: 12, color: cream(0.5) }}>{entry.label}</span>
                      <div style={{ marginTop: space[1] }}>
                        <TextDiff
                          before={Array.isArray(entry.before) ? entry.before.join(" ") : entry.before}
                          after={Array.isArray(entry.after) ? entry.after.join(" ") : entry.after}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : c.section === "skills" ? (
                <SkillsDiff before={c.before} after={c.after} />
              ) : (
                <TextDiff before={c.before} after={c.after} />
              )}
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
