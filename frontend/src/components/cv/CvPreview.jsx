import { normalizeUrl } from "../../utils/url";

const sidebarStyle = { background: "#262626", color: "#e8e8e8" };
const linkAccentStyle = { color: "#e0a878" };
// Explicit font stack, not Tailwind's font-serif utility — this app
// redefines that to "Caveat" (a cursive font) for its own branding
// (see index.css), which made resume text render in handwriting.
const mainStyle = { background: "#faf6f1", color: "#1f1a17", fontFamily: "Georgia, 'Times New Roman', Times, serif" };
const mutedSideStyle = { color: "#bbbbbb" };
const mutedMainStyle = { color: "#6b5d54" };

function SideSection({ title, children }) {
  return (
    <div className="mb-5">
      <h2
        className="text-[10.5px] uppercase tracking-[0.15em] font-semibold mb-2.5 pb-1.5"
        style={{ color: "#ffffff", borderBottom: "1px solid #4a4a4a" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function MainSection({ title, children }) {
  return (
    <div className="mb-5">
      <h2
        className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 pb-1"
        style={{ color: "#8a7a6d", borderBottom: "1px solid #e3d7c9" }}
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

export default function CvPreview({ sections }) {
  const info = sections.personal_info;
  // A row with every meaningful field blank (e.g. a freshly "+ Add"-ed entry
  // the user hasn't filled in yet) would otherwise render as a bare " – "
  // date range or an empty line — hide those from the live preview and the
  // exported PDF without touching the editable state itself.
  const links = info.links.filter((link) => link.label || link.url);
  const experience = sections.experience.filter((exp) => exp.title || exp.company || exp.bullets.some(Boolean));
  const projects = sections.projects.filter((proj) => proj.title || proj.description);
  const education = sections.education.filter((edu) => edu.degree || edu.school || edu.details);
  const certifications = sections.certifications.filter((cert) => cert.name);
  const strengths = sections.strengths.filter((s) => s.title);
  const skillGroups = sections.skill_groups.filter((g) => g.skills.length > 0);

  return (
    // Three levels, not two. The scrollable div must NOT itself be the flex
    // row: a flex container's default `align-items: stretch` sizes each
    // column to the container's own (post-clamp) height, not to its content.
    // With maxHeight capping that container at 85vh, a sidebar/main column
    // whose *content* is taller than 85vh got clamped to an 85vh-tall box
    // while its text kept flowing past that box's bottom edge — so the
    // column's background stopped at 85vh but its text didn't, spilling
    // uncontained onto the page behind it as soon as a CV was long enough to
    // scroll. Keeping the flex row unconstrained *inside* the scrolling div
    // lets both columns stretch to their real combined content height, and
    // the scroll div just clips/scrolls that whole (correctly backgrounded)
    // block.
    <div className="rounded-2xl shadow-2xl overflow-hidden">
      <div style={{ minHeight: "70vh", maxHeight: "85vh", overflowY: "auto" }}>
        <div className="flex" style={{ minHeight: "70vh" }}>
          <div className="w-[34%] shrink-0 p-6" style={sidebarStyle}>
            <SideSection title="Contact">
              <div className="flex flex-col gap-1.5 text-[11.5px]" style={mutedSideStyle}>
                {info.phone && <span>{info.phone}</span>}
                {info.email && <span>{info.email}</span>}
                {info.location && <span>{info.location}</span>}
                {links.map((link, i) =>
                  link.url ? (
                    <a
                      key={i}
                      href={normalizeUrl(link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={linkAccentStyle}
                      className="underline decoration-1 underline-offset-2 hover:opacity-80 truncate"
                    >
                      {link.label || link.url}
                    </a>
                  ) : (
                    <span key={i}>{link.label}</span>
                  )
                )}
              </div>
            </SideSection>

            {skillGroups.length > 0 && (
              <SideSection title="Skills">
                {skillGroups.map((group) => (
                  <div key={group.id} className="mb-2.5">
                    {group.category && (
                      <p className="text-[11px] font-semibold mb-1" style={{ color: "#ffffff" }}>
                        {group.category}
                      </p>
                    )}
                    <div className="flex flex-col gap-0.5">
                      {group.skills.map((skill, i) => (
                        <span key={i} className="text-[11px]" style={mutedSideStyle}>
                          • {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </SideSection>
            )}

            {education.length > 0 && (
              <SideSection title="Education">
                {education.map((edu) => (
                  <div key={edu.id} className="mb-3">
                    <p className="text-[11.5px] font-semibold" style={{ color: "#ffffff" }}>
                      {edu.school}
                    </p>
                    {edu.location && (
                      <p className="text-[10.5px]" style={mutedSideStyle}>
                        {edu.location}
                      </p>
                    )}
                    {edu.degree && (
                      <p className="text-[10.5px]" style={mutedSideStyle}>
                        {edu.degree}
                      </p>
                    )}
                    {(edu.start_date || edu.end_date) && (
                      <p className="text-[10.5px]" style={mutedSideStyle}>
                        {edu.start_date} – {edu.end_date}
                      </p>
                    )}
                  </div>
                ))}
              </SideSection>
            )}

            {strengths.length > 0 && (
              <SideSection title="Strengths">
                {strengths.map((strength) => (
                  <div key={strength.id} className="mb-3">
                    <p className="text-[11.5px] font-semibold" style={{ color: "#ffffff" }}>
                      {strength.title}
                    </p>
                    {strength.description && (
                      <p className="text-[10.5px] leading-relaxed" style={mutedSideStyle}>
                        {strength.description}
                      </p>
                    )}
                  </div>
                ))}
              </SideSection>
            )}
          </div>

          <div className="flex-1 min-w-0 p-8 md:p-10" style={mainStyle}>
            <h1 className="text-[24px] font-semibold mb-1">{info.name || "Untitled CV"}</h1>
            {info.title && (
              <p className="text-[12px] uppercase tracking-[0.1em] mb-5" style={mutedMainStyle}>
                {info.title}
              </p>
            )}

            {sections.summary && (
              <MainSection title="Summary">
                <p className="text-[13px] leading-relaxed">{sections.summary}</p>
              </MainSection>
            )}

            {experience.length > 0 && (
              <MainSection title="Work Experience">
                {experience.map((exp) => (
                  <div key={exp.id} className="mb-4">
                    <div className="flex justify-between gap-3 text-[13px] font-semibold">
                      <span>
                        {exp.title}
                        {exp.company ? ` | ${exp.company}` : ""}
                      </span>
                      {(exp.start_date || exp.end_date) && (
                        <span className="text-[12px] font-normal whitespace-nowrap" style={mutedMainStyle}>
                          {exp.start_date} – {exp.end_date}
                        </span>
                      )}
                    </div>
                    {exp.location && (
                      <div className="text-[12px] italic" style={mutedMainStyle}>
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
              </MainSection>
            )}

            {projects.length > 0 && (
              <MainSection title="Projects">
                {projects.map((proj) => (
                  <div key={proj.id} className="mb-4">
                    <div className="text-[13px] font-semibold">{proj.title}</div>
                    {proj.link && (
                      <div className="text-[11.5px]">
                        <a
                          href={normalizeUrl(proj.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#b8926a" }}
                          className="underline decoration-1 underline-offset-2 hover:opacity-80"
                        >
                          {proj.link}
                        </a>
                      </div>
                    )}
                    {proj.tech && (
                      <div className="text-[12px] italic" style={mutedMainStyle}>
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
              </MainSection>
            )}

            {certifications.length > 0 && (
              <MainSection title="Certifications">
                {certifications.map((cert) => (
                  <div key={cert.id} className="flex justify-between gap-3 text-[13px] mb-1.5">
                    <span className="font-semibold">
                      {cert.name}
                      {cert.issuer ? ` — ${cert.issuer}` : ""}
                    </span>
                    <span className="text-[12px] whitespace-nowrap" style={mutedMainStyle}>
                      {cert.date}
                    </span>
                  </div>
                ))}
              </MainSection>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
