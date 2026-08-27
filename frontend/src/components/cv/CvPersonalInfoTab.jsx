import { Link2, ExternalLink } from "lucide-react";
import { normalizeUrl, isLikelyValidUrl } from "../../utils/url";
import { space, cream } from "../homeTheme";
import { labelStyle, GhostLink, IconButton, underlineInputStyle } from "../homeWidgets";

function Field({ label, value, onChange }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ ...underlineInputStyle, marginTop: space[2] }} />
    </div>
  );
}

export default function CvPersonalInfoTab({ sections, updateSections }) {
  const info = sections.personal_info;

  function setField(key, value) {
    updateSections((s) => ({ ...s, personal_info: { ...s.personal_info, [key]: value } }));
  }

  function setLink(index, key, value) {
    updateSections((s) => {
      const links = [...s.personal_info.links];
      links[index] = { ...links[index], [key]: value };
      return { ...s, personal_info: { ...s.personal_info, links } };
    });
  }

  function addLink() {
    updateSections((s) => ({
      ...s,
      personal_info: { ...s.personal_info, links: [...s.personal_info.links, { label: "", url: "" }] },
    }));
  }

  function removeLink(index) {
    updateSections((s) => ({
      ...s,
      personal_info: { ...s.personal_info, links: s.personal_info.links.filter((_, i) => i !== index) },
    }));
  }

  return (
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      <Field label="Name" value={info.name} onChange={(v) => setField("name", v)} />
      <Field label="Title / Tagline" value={info.title} onChange={(v) => setField("title", v)} />
      <Field label="Email" value={info.email} onChange={(v) => setField("email", v)} />
      <Field label="Phone" value={info.phone} onChange={(v) => setField("phone", v)} />
      <Field label="Location" value={info.location} onChange={(v) => setField("location", v)} />

      <div>
        <div style={labelStyle}>Links</div>
        <div className="flex flex-col" style={{ marginTop: space[3], gap: space[3] }}>
          {info.links.map((link, i) => {
            const url = link.url.trim();
            const valid = isLikelyValidUrl(url);
            // Mirrors the backend's dedupe key (cv/schema.py _link_dedupe_key)
            // so this warning matches what actually gets saved: only the
            // first occurrence of a URL survives the PUT.
            const dedupeKey = url.toLowerCase().replace(/\/+$/, "");
            const isDuplicate =
              !!dedupeKey &&
              info.links.slice(0, i).some((other) => other.url.trim().toLowerCase().replace(/\/+$/, "") === dedupeKey);
            return (
              <div key={i} style={{ paddingBottom: space[3], borderBottom: `1px solid ${cream(0.08)}` }}>
                <div className="flex items-center" style={{ gap: space[3] }}>
                  <input
                    value={link.label}
                    onChange={(e) => setLink(i, "label", e.target.value)}
                    placeholder="Label"
                    style={{ ...underlineInputStyle, width: 110, flex: "0 0 auto" }}
                  />
                  <div className="flex-1 min-w-0 flex items-center" style={{ gap: space[2] }}>
                    <Link2 size={13} style={{ color: url ? "rgba(224,168,120,0.85)" : cream(0.3), flexShrink: 0 }} />
                    <input
                      value={link.url}
                      onChange={(e) => setLink(i, "url", e.target.value)}
                      placeholder="https://…"
                      style={{
                        ...underlineInputStyle,
                        color: url ? "rgba(224,168,120,0.95)" : underlineInputStyle.color,
                        textDecoration: url && valid ? "underline" : "none",
                        textDecorationColor: "rgba(224,168,120,0.4)",
                        borderBottomColor: url && !valid ? "rgba(224,140,140,0.6)" : undefined,
                      }}
                    />
                  </div>
                  <IconButton
                    onClick={() => window.open(normalizeUrl(url), "_blank", "noopener,noreferrer")}
                    disabled={!url || !valid}
                    title="Open link"
                  >
                    <ExternalLink size={14} />
                  </IconButton>
                  <IconButton onClick={() => removeLink(i)} title="Remove link" danger>
                    ✕
                  </IconButton>
                </div>
                {url && !valid && (
                  <p style={{ fontSize: 11, marginTop: space[2], color: "rgba(224,140,140,0.85)" }}>
                    Doesn't look like a valid URL — it'll still be saved as plain text.
                  </p>
                )}
                {isDuplicate && (
                  <p style={{ fontSize: 11, marginTop: space[2], color: "rgba(224,140,140,0.85)" }}>
                    Same URL as another link above — only the first will be saved.
                  </p>
                )}
              </div>
            );
          })}
          <GhostLink onClick={addLink} muted style={{ alignSelf: "flex-start", fontSize: 14 }}>
            + Add link
          </GhostLink>
        </div>
      </div>
    </div>
  );
}
