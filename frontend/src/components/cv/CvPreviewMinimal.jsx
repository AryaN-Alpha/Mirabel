import { normalizeUrl } from "../../utils/url";

const mutedStyle = { color: "#6b5d54" };

function Section({ title, accentColor, children }) {
  return (
    <div className="mb-5">
      <h2
        className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 pb-1"
        style={{ color: "#111111", borderBottom: `1.5px solid ${accentColor}` }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function projectBullets(description) {
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const DEFAULT_FONT_FAMILY = "Georgia, 'Times New Roman', Times, serif";
const DEFAULT_ACCENT = "#e0a878";
const DEFAULT_SECTION_ORDER = {
  main: ["summary", "experience", "projects", "certifications"],
  sidebar: ["skills", "education", "strengths"],
};

// Single-column, light, no dark sidebar — sibling to CvPreview.jsx rather
// than sharing a generic renderer (see the CV Style plan: at 2 templates, a
// shared section-registry buys no reuse since every section still needs
// template-specific markup, while adding indirection risk to CvPreview.jsx,
// which was already fixed once for a subtle flex/overflow bug). Sidebar
// section keys (skills/education/strengths) just render after the main
// column's, in the same relative order, since there's no second column here.
export default function CvPreviewMinimal({
  sections,
  fontFamily = DEFAULT_FONT_FAMILY,
  accentColor = DEFAULT_ACCENT,
  sectionOrder = DEFAULT_SECTION_ORDER,
}) {
  const info = sections.personal_info;
  const links = info.links.filter((link) => link.label || link.url);
  const experience = sections.experience.filter((exp) => exp.title || exp.company || exp.bullets.some(Boolean));
  const projects = sections.projects.filter((proj) => proj.title || proj.description);
  const education = sections.education.filter((edu) => edu.degree || edu.school || edu.details);
  const certifications = sections.certifications.filter((cert) => cert.name);
  const strengths = sections.strengths.filter((s) => s.title);
  const skillGroups = sections.skill_groups.filter((g) => g.skills.length > 0);

  const style = { background: "#faf6f1", color: "#1f1a17", fontFamily };
  const linkStyle = { color: accentColor };

  const mainSections = {
    summary: sections.summary && (
      <Section key="summary" title="Summary" accentColor={accentColor}>
        <p className="text-[13px] leading-relaxed">{sections.summary}</p>
      </Section>
    ),
    experience: experience.length > 0 && (
      <Section key="experience" title="Work Experience" accentColor={accentColor}>
        {experience.map((exp) => (
          <div key={exp.id} className="mb-4">
            <div className="flex justify-between gap-3 text-[13px] font-semibold">
              <span>
                {exp.title}
                {exp.company ? ` | ${exp.company}` : ""}
              </span>
              {(exp.start_date || exp.end_date) && (
                <span className="text-[12px] font-normal whitespace-nowrap" style={mutedStyle}>
                  {exp.start_date} – {exp.end_date}
                </span>
              )}
            </div>
            {exp.location && (
              <div className="text-[12px] italic" style={mutedStyle}>
                {exp.location}
              </div>
            )}
            {exp.bullets.filter(Boolean).length > 0 && (
              <ul className="list-disc ml-5 mt-1 text-[12.5px] leading-relaxed">
                {exp.bullets.filter(Boolean).map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </Section>
    ),
    projects: projects.length > 0 && (
      <Section key="projects" title="Projects" accentColor={accentColor}>
        {projects.map((proj) => (
          <div key={proj.id} className="mb-4">
            <div className="text-[13px] font-semibold">{proj.title}</div>
            {proj.link && (
              <div className="text-[11.5px]">
                <a
                  href={normalizeUrl(proj.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkStyle}
                  className="underline decoration-1 underline-offset-2 hover:opacity-80"
                >
                  {proj.link}
                </a>
              </div>
            )}
            {proj.tech && (
              <div className="text-[12px] italic" style={mutedStyle}>
                {proj.tech}
              </div>
            )}
            {projectBullets(proj.description).length > 0 && (
              <ul className="list-disc ml-5 mt-1 text-[12.5px] leading-relaxed">
                {projectBullets(proj.description).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </Section>
    ),
    certifications: certifications.length > 0 && (
      <Section key="certifications" title="Certifications" accentColor={accentColor}>
        {certifications.map((cert) => (
          <div key={cert.id} className="flex justify-between gap-3 text-[13px] mb-1.5">
            <span className="font-semibold">
              {cert.name}
              {cert.issuer ? ` — ${cert.issuer}` : ""}
            </span>
            <span className="text-[12px] whitespace-nowrap" style={mutedStyle}>
              {cert.date}
            </span>
          </div>
        ))}
      </Section>
    ),
  };

  const restSections = {
    skills: skillGroups.length > 0 && (
      <Section key="skills" title="Skills" accentColor={accentColor}>
        {skillGroups.map((group) => (
          <div key={group.id} className="mb-2.5">
            {group.category && <p className="text-[11px] font-semibold mb-1">{group.category}</p>}
            <div className="flex flex-col gap-0.5">
              {group.skills.map((skill, i) => (
                <span key={i} className="text-[11px]" style={mutedStyle}>
                  • {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </Section>
    ),
    education: education.length > 0 && (
      <Section key="education" title="Education" accentColor={accentColor}>
        {education.map((edu) => (
          <div key={edu.id} className="mb-3">
            <p className="text-[11.5px] font-semibold">{edu.school}</p>
            {edu.location && (
              <p className="text-[10.5px]" style={mutedStyle}>
                {edu.location}
              </p>
            )}
            {edu.degree && (
              <p className="text-[10.5px]" style={mutedStyle}>
                {edu.degree}
              </p>
            )}
            {(edu.start_date || edu.end_date) && (
              <p className="text-[10.5px]" style={mutedStyle}>
                {edu.start_date} – {edu.end_date}
              </p>
            )}
          </div>
        ))}
      </Section>
    ),
    strengths: strengths.length > 0 && (
      <Section key="strengths" title="Strengths" accentColor={accentColor}>
        {strengths.map((strength) => (
          <div key={strength.id} className="mb-3">
            <p className="text-[11.5px] font-semibold">{strength.title}</p>
            {strength.description && (
              <p className="text-[10.5px] leading-relaxed" style={mutedStyle}>
                {strength.description}
              </p>
            )}
          </div>
        ))}
      </Section>
    ),
  };

  return (
    <div className="rounded-2xl shadow-2xl overflow-hidden">
      <div style={{ minHeight: "70vh", maxHeight: "85vh", overflowY: "auto" }}>
        <div className="p-8 md:p-10" style={style}>
          <h1 className="text-[26px] font-semibold mb-1">{info.name || "Untitled CV"}</h1>
          {info.title && (
            <p className="text-[12px] uppercase tracking-[0.1em] mb-2" style={{ color: accentColor }}>
              {info.title}
            </p>
          )}
          <p className="text-[11.5px] mb-5" style={mutedStyle}>
            {[info.phone, info.email, info.location, ...links.map((l) => l.label || l.url)]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {sectionOrder.main.map((key) => mainSections[key] || null)}
          {sectionOrder.sidebar.map((key) => restSections[key] || null)}
        </div>
      </div>
    </div>
  );
}
