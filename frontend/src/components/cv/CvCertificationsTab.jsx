import { Plus, Trash2 } from "lucide-react";
import { space, cream, surface } from "../homeTheme";
import { GhostLink, IconButton, EmptyState } from "../homeWidgets";

const cellInputStyle = {
  width: "100%",
  background: "transparent",
  border: 0,
  outline: "none",
  color: cream(0.85),
  fontSize: 13,
  padding: `${space[2]}px 0`,
};

function emptyCertification() {
  return { id: crypto.randomUUID(), name: "", issuer: "", date: "" };
}

const HEAD_CELL = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  textAlign: "left",
  padding: `${space[2]}px ${space[3]}px`,
  borderBottom: `1px solid ${cream(0.14)}`,
  background: surface.overlay,
  color: cream(0.45),
  fontSize: 10.5,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

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
      {sections.certifications.length === 0 ? (
        <EmptyState>No certifications yet — add one below.</EmptyState>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 6, border: `1px solid ${cream(0.08)}` }}>
          <table className="ds-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={HEAD_CELL}>Certification</th>
                <th style={HEAD_CELL}>Issuer</th>
                <th style={{ ...HEAD_CELL, width: 110 }}>Date</th>
                <th style={{ ...HEAD_CELL, width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {sections.certifications.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ padding: `0 ${space[3]}px` }}>
                    <input
                      value={entry.name}
                      onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
                      placeholder="Certification"
                      style={cellInputStyle}
                    />
                  </td>
                  <td style={{ padding: `0 ${space[3]}px` }}>
                    <input
                      value={entry.issuer}
                      onChange={(e) => updateEntry(entry.id, { issuer: e.target.value })}
                      placeholder="Issuer"
                      style={cellInputStyle}
                    />
                  </td>
                  <td style={{ padding: `0 ${space[3]}px` }}>
                    <input
                      value={entry.date}
                      onChange={(e) => updateEntry(entry.id, { date: e.target.value })}
                      placeholder="Date"
                      style={cellInputStyle}
                    />
                  </td>
                  <td style={{ padding: `0 ${space[2]}px`, textAlign: "right" }}>
                    <IconButton onClick={() => removeEntry(entry.id)} title="Remove certification" danger>
                      <Trash2 size={14} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <GhostLink onClick={addEntry} muted style={{ alignSelf: "flex-start" }}>
        <Plus size={13} /> Add certification
      </GhostLink>
    </div>
  );
}
