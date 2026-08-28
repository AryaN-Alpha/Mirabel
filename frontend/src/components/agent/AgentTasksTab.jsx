import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  answerAgentTask,
  approveAgentTask,
  cancelAgentTask,
  listAgentTasks,
  rejectAgentTask,
  startAgentTask,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream, accent } from "../homeTheme";
import { EmptyState, ErrorNote, GhostLink } from "../homeWidgets";
import ChatInput from "../ChatInput";
import AgentTaskPanel from "./AgentTaskPanel";

const POLL_INTERVAL_MS = 1500;
const NON_TERMINAL = new Set(["queued", "running", "awaiting_confirmation", "awaiting_clarification"]);

const PANEL_PALETTE = {
  text: text.base,
  muted: cream(0.55),
  border: cream(0.16),
  accent: accent[400],
  danger: "rgba(224,140,140,0.95)",
};

const STATUS_COLOR = {
  queued: "#f0c9a2",
  running: "#f0c9a2",
  awaiting_confirmation: "#f0c9a2",
  awaiting_clarification: "#f0c9a2",
  done: "#8fd6a8",
  failed: "rgba(224,140,140,0.95)",
  cancelled: cream(0.5),
};

const STATUS_LABEL = {
  queued: "Queued",
  running: "Working…",
  awaiting_confirmation: "Needs your approval",
  awaiting_clarification: "Needs an answer",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AgentTasksTab() {
  const [tasks, setTasks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await listAgentTasks();
      setTasks(data.tasks);
      setError("");
    } catch (err) {
      if (!silent) setError(getErrorMessage(err, "Couldn't load agent tasks."));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const hasActive = (tasks || []).some((t) => NON_TERMINAL.has(t.status));
    if (!hasActive) return undefined;
    pollRef.current = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [tasks, load]);

  async function handleStart(instruction) {
    setStarting(true);
    setError("");
    try {
      const task = await startAgentTask(instruction);
      setTasks((prev) => [task, ...(prev || [])]);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't start that task."));
    } finally {
      setStarting(false);
    }
  }

  async function handleDecision(id, action, editedArgs) {
    setBusyId(id);
    try {
      const updated =
        action === "approve"
          ? await approveAgentTask(id, editedArgs)
          : action === "reject"
          ? await rejectAgentTask(id)
          : await cancelAgentTask(id);
      setTasks((prev) => (prev || []).map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't update that task."));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAnswer(id, answer) {
    setBusyId(id);
    try {
      const updated = await answerAgentTask(id, answer);
      setTasks((prev) => (prev || []).map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't send that answer."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      <ChatInput onSend={handleStart} disabled={starting} />
      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <p style={{ fontSize: 15, color: cream(0.5) }}>Loading…</p>
      ) : !tasks || tasks.length === 0 ? (
        <EmptyState dot>
          {"Tell me what to do and I'll actually go do it — this is where you'll watch it happen."}
        </EmptyState>
      ) : (
        <div className="flex flex-col">
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{ padding: `${space[5] ?? 23}px ${space[3]}px`, borderBottom: `1px solid ${cream(0.09)}` }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span style={{ fontFamily: fontHeading, fontSize: 18, color: text.base }}>{task.instruction}</span>
                <span
                  className="flex items-center gap-1.5"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: STATUS_COLOR[task.status] || cream(0.5),
                    whiteSpace: "nowrap",
                  }}
                >
                  {task.status === "running" && <Loader2 size={12} className="animate-spin" />}
                  {STATUS_LABEL[task.status] || task.status}
                </span>
              </div>
              <p style={{ fontSize: 13, marginTop: 4, color: cream(0.45), fontVariantNumeric: "tabular-nums" }}>
                {formatDate(task.created_at)}
              </p>

              {(task.status === "awaiting_confirmation" || task.status === "awaiting_clarification" || task.status === "running" || task.status === "done" || task.status === "failed") && (
                <div
                  style={{
                    marginTop: space[3],
                    padding: space[3],
                    border:
                      task.status === "awaiting_confirmation" || task.status === "awaiting_clarification"
                        ? `1px solid ${cream(0.14)}`
                        : "none",
                    borderRadius: 8,
                    background:
                      task.status === "awaiting_confirmation" || task.status === "awaiting_clarification"
                        ? "rgba(240,201,162,0.06)"
                        : "transparent",
                  }}
                >
                  <AgentTaskPanel
                    task={task}
                    busy={busyId === task.id}
                    palette={PANEL_PALETTE}
                    onApprove={(editedArgs) => handleDecision(task.id, "approve", editedArgs)}
                    onReject={() => handleDecision(task.id, "reject")}
                    onAnswer={(answer) => handleAnswer(task.id, answer)}
                  />
                </div>
              )}

              {task.steps?.length > 0 && (
                <p style={{ fontSize: 12, marginTop: space[2], color: cream(0.4) }}>
                  {task.steps.length} step{task.steps.length === 1 ? "" : "s"} so far
                </p>
              )}

              {task.status === "queued" && (
                <GhostLink
                  muted
                  disabled={busyId === task.id}
                  onClick={() => handleDecision(task.id, "cancel")}
                  style={{ marginTop: space[3], fontSize: 13 }}
                >
                  Cancel
                </GhostLink>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
