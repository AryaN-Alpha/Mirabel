import { inputStyle } from "../CvPage";

function Field({ label, value, onChange }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] mb-1.5 px-1" style={{ color: "rgba(243,233,226,0.4)" }}>
        {label}
      </p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
        style={inputStyle}
      />
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
    <div className="flex flex-col gap-3">
      <Field label="Name" value={info.name} onChange={(v) => setField("name", v)} />
      <Field label="Title / Tagline" value={info.title} onChange={(v) => setField("title", v)} />
      <Field label="Email" value={info.email} onChange={(v) => setField("email", v)} />
      <Field label="Phone" value={info.phone} onChange={(v) => setField("phone", v)} />
      <Field label="Location" value={info.location} onChange={(v) => setField("location", v)} />

      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] mb-2 px-1" style={{ color: "rgba(243,233,226,0.4)" }}>
          Links
        </p>
        <div className="flex flex-col gap-2">
          {info.links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={link.label}
                onChange={(e) => setLink(i, "label", e.target.value)}
                placeholder="Label"
                className="w-24 px-3 py-2 rounded-full text-[12.5px] outline-none"
                style={inputStyle}
              />
              <input
                value={link.url}
                onChange={(e) => setLink(i, "url", e.target.value)}
                placeholder="URL"
                className="flex-1 px-3 py-2 rounded-full text-[12.5px] outline-none"
                style={inputStyle}
              />
              <button
                onClick={() => removeLink(i)}
                className="px-3 rounded-full text-[12px] border-none cursor-pointer"
                style={{ background: "transparent", color: "rgba(224,140,140,0.85)" }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addLink}
            className="self-start text-[12px] px-3 py-1.5 rounded-full border-none cursor-pointer"
            style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2" }}
          >
            + Add link
          </button>
        </div>
      </div>
    </div>
  );
}
