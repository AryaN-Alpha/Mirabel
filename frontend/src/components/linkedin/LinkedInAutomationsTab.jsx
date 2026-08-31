import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  createLinkedInAutomation,
  deleteLinkedInAutomation,
  listLinkedInAutomationRuns,
  listLinkedInAutomations,
  runLinkedInAutomationNow,
  updateLinkedInAutomation,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream } from "../homeTheme";
import { labelStyle, underlineInputStyle, underlineSelectStyle, EmptyState, ErrorNote, GhostLink, OutlineButton } from "../homeWidgets";

const TYPE_LABEL = {
  profile_sync: "Profile Sync",
  daily_briefing: "Daily LinkedIn Briefing",
  weekly_report: "Weekly LinkedIn Report",
};

const STATUS_COLOR = {
  success: "#8fd6a8",
  failed: "rgba(224,140,140,0.95)",
  running: "#f0c9a2",
};

function formatDate(iso) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function LinkedInAutomationsTab() {
  const [automations, setAutomations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [runs, setRuns] = useState({});

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("profile_sync");
  const [intervalHours, setIntervalHours] = useState(6);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listLinkedInAutomations();
      setAutomations(data.automations);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load automations."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      const payload = { name: name.trim(), type };
      if (type === "profile_sync") payload.interval_hours = Number(intervalHours) || 6;
      await createLinkedInAutomation(payload);
      setName("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create that automation."));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(automation) {
    setBusyId(automation.id);
    try {
      const updated = await updateLinkedInAutomation(automation.id, { enabled: !automation.enabled });
      setAutomations((prev) => prev.map((a) => (a.id === automation.id ? updated : a)));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't update that automation."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    setBusyId(id);
    try {
      await deleteLinkedInAutomation(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete that automation."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRunNow(automation) {
    setBusyId(automation.id);
    setError("");
    try {
      const updated = await runLinkedInAutomationNow(automation.id);
      setAutomations((prev) => prev.map((a) => (a.id === automation.id ? updated : a)));
      if (expandedId === automation.id) {
        const data = await listLinkedInAutomationRuns(automation.id);
        setRuns((prev) => ({ ...prev, [automation.id]: data.runs }));
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't run that automation right now."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!runs[id]) {
      try {
        const data = await listLinkedInAutomationRuns(id);
        setRuns((prev) => ({ ...prev, [id]: data.runs }));
      } catch (err) {
        setError(getErrorMessage(err, "Couldn't load run history."));
      }
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <form onSubmit={handleCreate} className="flex items-end flex-wrap" style={{ gap: space[5] ?? 23 }}>
        <div style={{ flex: "1 1 200px" }}>
          <div style={labelStyle}>Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sync my profile"
            style={underlineInputStyle}
          />
        </div>
        <div>
          <div style={labelStyle}>Type</div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={underlineSelectStyle}>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {type === "profile_sync" && (
          <div style={{ width: 100 }}>
            <div style={labelStyle}>Every (hrs)</div>
            <input
              type="number"
              min={1}
              max={168}
              value={intervalHours}
              onChange={(e) => setIntervalHours(e.target.value)}
              style={underlineInputStyle}
            />
          </div>
        )}
        <OutlineButton disabled={creating || !name.trim()}>{creating ? "Adding…" : "Add automation"}</OutlineButton>
      </form>

      <ErrorNote>{error}</ErrorNote>

      <div style={{ marginTop: space[8] * 0.9 }}>
        {loading ? (
          <div className="flex items-center" style={{ gap: space[2], color: cream(0.4) }}>
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : !automations || automations.length === 0 ? (
          <EmptyState>No automations configured yet — add one above.</EmptyState>
        ) : (
          <div className="flex flex-col">
            {automations.map((a) => (
              <div key={a.id} style={{ padding: `${space[4]}px 0`, borderBottom: `1px solid ${cream(0.09)}` }}>
                <div className="flex items-center justify-between flex-wrap" style={{ gap: space[3] }}>
                  <div>
                    <span style={{ fontFamily: fontHeading, fontSize: 18, color: text.base }}>{a.name}</span>
                    <span style={{ fontSize: 12, marginLeft: space[3], color: cream(0.45) }}>
                      {TYPE_LABEL[a.type] || a.type}
                    </span>
                  </div>
                  <div className="flex items-center" style={{ gap: space[4] }}>
                    <span
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: STATUS_COLOR[a.last_status] || cream(0.4),
                      }}
                    >
                      {a.last_status || "not run yet"}
                    </span>
                    <GhostLink muted onClick={() => handleExpand(a.id)} style={{ fontSize: 13 }}>
                      History
                    </GhostLink>
                    <GhostLink
                      muted
                      disabled={busyId === a.id || !a.enabled}
                      onClick={() => handleRunNow(a)}
                      style={{ fontSize: 13 }}
                      title={a.enabled ? "" : "Enable this automation first"}
                    >
                      {busyId === a.id ? "Running…" : "Run now"}
                    </GhostLink>
                    <GhostLink disabled={busyId === a.id} onClick={() => handleToggle(a)} style={{ fontSize: 13 }}>
                      {a.enabled ? "Disable" : "Enable"}
                    </GhostLink>
                    <GhostLink danger disabled={busyId === a.id} onClick={() => handleDelete(a.id)} style={{ fontSize: 13 }}>
                      Delete
                    </GhostLink>
                  </div>
                </div>
                <p style={{ fontSize: 12, marginTop: 4, color: cream(0.4) }}>
                  Last run {formatDate(a.last_run_at)} · Next run {formatDate(a.next_run_at)}
                  {a.failure_count > 0 ? ` · ${a.failure_count} recent failure(s)` : ""}
                </p>

                {expandedId === a.id && (
                  <div style={{ marginTop: space[3], paddingLeft: space[3], borderLeft: `1px solid ${cream(0.12)}` }}>
                    {!runs[a.id] ? (
                      <Loader2 size={14} className="animate-spin" style={{ color: cream(0.4) }} />
                    ) : runs[a.id].length === 0 ? (
                      <p style={{ fontSize: 12.5, color: cream(0.4) }}>No runs yet.</p>
                    ) : (
                      runs[a.id].map((run) => (
                        <div key={run.id} style={{ padding: `${space[2]}px 0` }}>
                          <div className="flex items-center gap-3">
                            <span style={{ fontSize: 12, color: STATUS_COLOR[run.status] || cream(0.5) }}>
                              {run.status}
                            </span>
                            <span style={{ fontSize: 12, color: cream(0.4) }}>{formatDate(run.started_at)}</span>
                          </div>
                          {(run.detail || run.error_message) && (
                            <p style={{ fontSize: 12.5, marginTop: 2, color: cream(0.55) }}>
                              {run.error_message || run.detail}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
