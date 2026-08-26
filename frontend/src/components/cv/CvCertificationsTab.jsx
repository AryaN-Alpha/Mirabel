import { Plus, Trash2 } from "lucide-react";
import { inputStyle, buttonStyle } from "../CvPage";

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
    <div className="flex flex-col gap-3">
      {sections.certifications.map((entry) => (
        <div key={entry.id} className="flex gap-2 items-center">
          <input
            value={entry.name}
            onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
            placeholder="Certification"
            className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
            style={inputStyle}
          />
          <input
            value={entry.issuer}
            onChange={(e) => updateEntry(entry.id, { issuer: e.target.value })}
            placeholder="Issuer"
            className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
            style={inputStyle}
          />
          <input
            value={entry.date}
            onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
            placeholder="Date"
            className="w-28 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
            style={inputStyle}
          />
          <button
            onClick={() => removeEntry(entry.id)}
            className="p-2 rounded-full border-none cursor-pointer"
            style={{ background: "transparent", color: "rgba(224,140,140,0.85)" }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        onClick={addEntry}
        className="self-start flex items-center gap-1.5 text-[12.5px] px-4 py-2 rounded-full border-none cursor-pointer"
        style={buttonStyle}
      >
        <Plus size={13} /> Add certification
      </button>
    </div>
  );
}
