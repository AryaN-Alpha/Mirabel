import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Repeat2 } from "lucide-react";
import {
  createThreadsAutomation,
  deleteThreadsAutomation,
  listThreadsAutomationRuns,
  listThreadsAutomations,
  runThreadsAutomationNow,
  updateThreadsAutomation,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, success, warning, danger, space, cream, surface, glassBorder, radius, motion } from "../homeTheme";
import { EmptyState, ErrorNote, GhostLink, GlassPanel, OutlineButton, PanelEyebrow, ToggleSwitch, labelStyle } from "../homeWidgets";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

const fieldStyle = {
  width: "100%",
  padding: `${space[3]}px ${space[4]}px`,
  background: surface.sunken,
  border: `1px solid ${glassBorder.soft}`,
  borderRadius: radius.md,
  color: text.cream,
  fontSize: 15,
  outline: "none",
  transition: `border-color ${motion.hover}, background ${motion.hover}`,
};

const TYPE_LABEL = {
  profile_sync: "Profile Sync",
  token_refresh: "Token Refresh (Daily)",
  rate_limit_sync: "Rate Limit Sync (Hourly)",
  daily_briefing: "Daily Threads Briefing",
  weekly_report: "Weekly Threads Report",
};

const STATUS_COLOR = {
  success: success[400],
  failed: danger[400],
  running: warning[400],
};

function formatDate(iso) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ThreadsAutomationsTab() {
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
      const data = await listThreadsAutomations();
      setAutomations(data);
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
      await createThreadsAutomation(payload);
      setName("");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create automation."));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(automation) {
    setBusyId(automation.id);
    try {
      const updated = await updateThreadsAutomation(automation.id, { enabled: !automation.enabled });
      setAutomations((prev) => prev.map((a) => (a.id === automation.id ? updated : a)));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't update automation."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRunNow(automationId) {
    setBusyId(automationId);
    try {
      await runThreadsAutomationNow(automationId);
      await load();
      if (expandedId === automationId) {
        await loadRuns(automationId);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't run that automation right now."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(automationId) {
    if (!window.confirm("Delete this automation?")) return;
    setBusyId(automationId);
    try {
      await deleteThreadsAutomation(automationId);
      setAutomations((prev) => prev.filter((a) => a.id !== automationId));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete automation."));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleExpand(automationId) {
    if (expandedId === automationId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(automationId);
    if (!runs[automationId]) {
      await loadRuns(automationId);
    }
  }

  async function loadRuns(automationId) {
    try {
      const history = await listThreadsAutomationRuns(automationId);
      setRuns((prev) => ({ ...prev, [automationId]: history }));
    } catch {
      // Non-fatal
    }
  }

  if (loading) {
    return (
      <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0` }}>
        <div className="w-full flex items-center justify-center" style={{ color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      {/* Create New Automation */}
      <div style={entrance(0)}>
        <GlassPanel style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={Plus}>Add Automation</PanelEyebrow>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 items-end">
            <div>
              <label style={labelStyle}>Automation Name</label>
              <input
                type="text"
                placeholder="e.g. Daily Sync"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={{ ...fieldStyle, fontFamily: fontHeading }}
              >
                {Object.entries(TYPE_LABEL).map(([val, lbl]) => (
                  <option key={val} value={val} style={{ background: "#18181b" }}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
            {type === "profile_sync" ? (
              <div>
                <label style={labelStyle}>Every (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(e.target.value)}
                  style={fieldStyle}
                />
              </div>
            ) : (
              <div />
            )}
            <div className="md:col-span-3 flex justify-end mt-2">
              <OutlineButton type="submit" busy={creating} disabled={!name.trim()} accent icon={Plus}>
                Create Automation
              </OutlineButton>
            </div>
          </form>
        </GlassPanel>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Configured Automations List */}
      <div style={entrance(0.08)}>
        <GlassPanel elevated style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={Repeat2}>Configured Automations ({automations?.length || 0})</PanelEyebrow>
          {!automations || automations.length === 0 ? (
            <EmptyState>No automations configured yet.</EmptyState>
          ) : (
            <div className="flex flex-col mt-4 divide-y divide-white/5">
              {automations.map((auto) => (
                <div key={auto.id} className="py-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <ToggleSwitch checked={auto.enabled} onChange={() => handleToggle(auto)} disabled={busyId === auto.id} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontFamily: fontHeading, fontWeight: 600, color: text.bright, fontSize: 15 }}>
                            {auto.name}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
                            {TYPE_LABEL[auto.type] || auto.type}
                          </span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: cream(0.4) }}>
                          Last run: {formatDate(auto.last_run_at)} · Next: {formatDate(auto.next_run_at)}
                          {auto.last_status && (
                            <span
                              className="ml-2 font-semibold capitalize"
                              style={{ color: STATUS_COLOR[auto.last_status] || cream(0.5) }}
                            >
                              ({auto.last_status})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <OutlineButton
                        onClick={() => handleRunNow(auto.id)}
                        disabled={busyId === auto.id || !auto.enabled}
                        busy={busyId === auto.id}
                      >
                        Run now
                      </OutlineButton>
                      <GhostLink onClick={() => toggleExpand(auto.id)} style={{ fontSize: 13 }}>
                        {expandedId === auto.id ? "Hide History" : "History"}
                      </GhostLink>
                      <GhostLink onClick={() => handleDelete(auto.id)} style={{ color: danger[300], fontSize: 13 }}>
                        Delete
                      </GhostLink>
                    </div>
                  </div>

                  {expandedId === auto.id && (
                    <div className="mt-2 p-3 rounded-lg bg-black/20 border border-white/5 flex flex-col gap-2">
                      <span className="text-xs font-semibold" style={{ color: cream(0.6) }}>
                        Recent Execution Runs
                      </span>
                      {!runs[auto.id] || runs[auto.id].length === 0 ? (
                        <span className="text-xs text-gray-500">No execution records for this automation.</span>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                          {runs[auto.id].map((run) => (
                            <div key={run.id} className="text-xs flex flex-col gap-0.5 border-b border-white/5 pb-2">
                              <div className="flex justify-between">
                                <span className="font-semibold capitalize" style={{ color: STATUS_COLOR[run.status] }}>
                                  {run.status}
                                </span>
                                <span style={{ color: cream(0.4) }}>{formatDate(run.started_at)}</span>
                              </div>
                              {run.detail && <p className="text-gray-300 m-0">{run.detail}</p>}
                              {run.error_message && <p className="text-red-400 m-0">{run.error_message}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
