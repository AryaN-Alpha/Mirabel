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
import { fontHeading, text, space, cream, accent, glassBorder } from "../homeTheme";
import { EmptyState, ErrorNote, GhostLink } from "../homeWidgets";
import ChatInput from "../ChatInput";
import AgentTaskPanel from "./AgentTaskPanel";

const POLL_INTERVAL_MS = 1500;
const PAGE_SIZE = 20;
const NON_TERMINAL = new Set(["queued", "running", "awaiting_confirmation", "awaiting_clarification"]);

const PANEL_PALETTE = {
  text: text.bright,
  muted: text.secondary,
  border: glassBorder,
  accent: accent[400],
  danger: "#f87171",
};

const STATUS_COLOR = {
  queued: "#fbbf24",
  running: "#38bdf8",
  awaiting_confirmation: "#fbbf24",
  awaiting_clarification: "#fbbf24",
  done: "#34d399",
  failed: "#f87171",
  cancelled: text.muted,
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async (targetPage, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await listAgentTasks({ page: targetPage, page_size: PAGE_SIZE });
      setTasks(data.tasks);
      setTotal(data.total);
      setError("");
    } catch (err) {
      if (!silent) setError(getErrorMessage(err, "Couldn't load agent tasks."));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  useEffect(() => {
    const hasActive = (tasks || []).some((t) => NON_TERMINAL.has(t.status));
    if (!hasActive) return undefined;
    pollRef.current = setInterval(() => load(page, { silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [tasks, page, load]);

  async function handleStart(instruction) {
    setStarting(true);
    setError("");
    try {
      await startAgentTask(instruction);
      if (page === 1) {
        await load(1, { silent: true });
      } else {
        setPage(1);
      }
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
              style={{ padding: `${space[5] ?? 23}px ${space[3]}px`, borderBottom: `1px solid ${glassBorder}` }}
            >
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <span className="min-w-0" style={{ fontFamily: fontHeading, fontSize: 18, color: text.bright }}>{task.instruction}</span>
                <span
                  className="flex items-center gap-1.5"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: STATUS_COLOR[task.status] || text.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {task.status === "running" && <Loader2 size={12} className="animate-spin" />}
                  {STATUS_LABEL[task.status] || task.status}
                </span>
              </div>
              <p style={{ fontSize: 13, marginTop: 4, color: text.muted, fontVariantNumeric: "tabular-nums" }}>
                {formatDate(task.created_at)}
              </p>

              {(task.status === "awaiting_confirmation" || task.status === "awaiting_clarification" || task.status === "running" || task.status === "done" || task.status === "failed") && (
                <div
                  style={{
                    marginTop: space[3],
                    padding: space[3],
                    border:
                      task.status === "awaiting_confirmation" || task.status === "awaiting_clarification"
                        ? `1px solid ${glassBorder}`
                        : "none",
                    borderRadius: 8,
                    background:
                      task.status === "awaiting_confirmation" || task.status === "awaiting_clarification"
                        ? "rgba(251,191,36,0.06)"
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
                <p style={{ fontSize: 13, marginTop: space[2], color: text.muted }}>
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

      {tasks && tasks.length > 0 && (
        <div className="flex items-center justify-between" style={{ marginTop: space[6] }}>
          <GhostLink disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} muted={page <= 1}>
            ← Previous
          </GhostLink>
          <span style={{ fontSize: 13, color: text.muted }}>
            {total} task{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </span>
          <GhostLink disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} muted={page >= totalPages}>
            Next →
          </GhostLink>
        </div>
      )}
    </div>
  );
}
