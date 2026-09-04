import { useCallback, useEffect, useRef, useState } from "react";
import { ListTodo, Loader2, Trash2 } from "lucide-react";
import {
  answerAgentTask,
  approveAgentTask,
  cancelAgentTask,
  deleteAgentTask,
  listAgentTasks,
  rejectAgentTask,
  startAgentTask,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream, accent } from "../homeTheme";
import { EmptyState, ErrorNote, GhostLink, GlassPanel, PanelEyebrow } from "../homeWidgets";
import ChatInput from "../ChatInput";
import AgentTaskPanel from "./AgentTaskPanel";
import ConfirmDialog from "../ConfirmDialog";

const POLL_INTERVAL_MS = 1500;
const PAGE_SIZE = 20;
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

const TERMINAL = new Set(["done", "failed", "cancelled"]);

// Card-row treatment for a task record — mirrors AgentMemoriesTab's
// MemoryRow (zebra + local hover highlight standing in for `.ds-table`'s
// striping, which needs an actual <table> to apply to).
function TaskRow({ task, zebra, busy, onDecision, onAnswer, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isTerminal = TERMINAL.has(task.status);
  const needsAttention =
    task.status === "awaiting_confirmation" || task.status === "awaiting_clarification" || task.status === "running" || task.status === "done" || task.status === "failed";

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          padding: `${space[5] ?? 23}px ${space[4]}px`,
          borderBottom: `1px solid ${cream(0.09)}`,
          background: hovered ? cream(0.045) : zebra ? cream(0.018) : "transparent",
          transition: "background 0.2s ease",
        }}
      >
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <span className="min-w-0" style={{ fontFamily: fontHeading, fontSize: 18, color: text.base }}>{task.instruction}</span>
          <div className="flex items-center gap-3">
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
            {isTerminal && (
              <button
                type="button"
                title="Delete task"
                onClick={() => setConfirmDelete(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  borderRadius: 6,
                  color: hovered ? "rgba(224,140,140,0.7)" : cream(0.25),
                  transition: "color 0.2s ease",
                  lineHeight: 0,
                }}
              >
                <Trash2 size={13} strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 13, marginTop: 4, color: cream(0.45), fontVariantNumeric: "tabular-nums" }}>
          {formatDate(task.created_at)}
        </p>

        {needsAttention && (
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
              busy={busy}
              palette={PANEL_PALETTE}
              onApprove={(editedArgs) => onDecision(task.id, "approve", editedArgs)}
              onReject={() => onDecision(task.id, "reject")}
              onAnswer={(answer) => onAnswer(task.id, answer)}
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
            disabled={busy}
            onClick={() => onDecision(task.id, "cancel")}
            style={{ marginTop: space[3], fontSize: 13 }}
          >
            Cancel
          </GhostLink>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this task?"
          message="This permanently removes the task record. It cannot be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete(task.id);
          }}
        />
      )}
    </>
  );
}

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

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

  async function handleDelete(id) {
    try {
      await deleteAgentTask(id);
      setTasks((prev) => (prev || []).filter((t) => t.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete that task."));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      <div style={entrance(0.05)}>
        <ChatInput onSend={handleStart} disabled={starting} />
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div style={entrance(0.1)}>
        <GlassPanel float={1} delay={0} hoverLift={false} style={{ padding: `${space[6]}px ${space[3]}px` }}>
          <div style={{ padding: `0 ${space[3]}px`, marginBottom: space[2] }}>
            <PanelEyebrow icon={ListTodo}>Tasks</PanelEyebrow>
          </div>
          {loading ? (
            <div className="w-full flex items-center justify-center" style={{ padding: `${space[8]}px 0`, color: cream(0.4) }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <EmptyState dot>
              {"Tell me what to do and I'll actually go do it — this is where you'll watch it happen."}
            </EmptyState>
          ) : (
            <div className="flex flex-col">
              {tasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  zebra={i % 2 === 1}
                  busy={busyId === task.id}
                  onDecision={handleDecision}
                  onAnswer={handleAnswer}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          {tasks && tasks.length > 0 && (
            <div className="flex items-center justify-between" style={{ marginTop: space[6], padding: `0 ${space[3]}px` }}>
              <GhostLink disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} muted={page <= 1}>
                ← Previous
              </GhostLink>
              <span style={{ fontSize: 12, color: cream(0.4), fontVariantNumeric: "tabular-nums" }}>
                {total} task{total === 1 ? "" : "s"} · page {page} of {totalPages}
              </span>
              <GhostLink disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} muted={page >= totalPages}>
                Next →
              </GhostLink>
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
