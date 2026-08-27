import { Plus, Trash2 } from "lucide-react";
import { space, cream } from "../homeTheme";
import { GhostLink, IconButton, underlineInputStyle } from "../homeWidgets";

function emptyCertification() {
  return { id: crypto.randomUUID(), name: "", issuer: "", date: "" };
}

export default function CvCertificationsTab({ sections, updateSections }) {
  function setEntries(fn) {
    updateSections((s) => ({ ...s, certifications: fn(s.certifications) }));
  }

  function addEntry() {
    setEntries((entries) => [...entries, emptyCertification()]);
  }

  function removeEntry(id) {
    setEntries((entries) => entries.filter((e) => e.id !== id));
  }

  function updateEntry(id, patch) {
    setEntries((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  return (
    <div className="flex flex-col" style={{ gap: space[4] }}>
      {sections.certifications.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center"
          style={{ gap: space[3], paddingBottom: space[3], borderBottom: `1px solid ${cream(0.08)}` }}
        >
          <input
            value={entry.name}
            onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
            placeholder="Certification"
            style={{ ...underlineInputStyle, flex: 1 }}
          />
          <input
            value={entry.issuer}
            onChange={(e) => updateEntry(entry.id, { issuer: e.target.value })}
            placeholder="Issuer"
            style={{ ...underlineInputStyle, flex: 1 }}
          />
          <input
            value={entry.date}
            onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
            placeholder="Date"
            style={{ ...underlineInputStyle, width: 100, flex: "0 0 auto" }}
          />
          <IconButton onClick={() => removeEntry(entry.id)} title="Remove certification" danger>
            <Trash2 size={15} />
          </IconButton>
        </div>
      ))}
      <GhostLink onClick={addEntry} muted style={{ alignSelf: "flex-start" }}>
        <Plus size={13} /> Add certification
      </GhostLink>
    </div>
  );
}
