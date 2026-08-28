import { getAgentTask } from "./api";

const TERMINAL = new Set(["done", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 1500;

// Shared by AgentTasksTab, ChatScreen, and useVoiceSession so all three
// surfaces see the same live current_step/steps/pending_action updates
// instead of each reimplementing their own poll loop.
export function pollAgentTask(taskId, { onUpdate, onSettled } = {}) {
  let stopped = false;

  const timer = setInterval(async () => {
    if (stopped) return;
    let task;
    try {
      task = await getAgentTask(taskId);
    } catch {
      return; // transient — try again next tick
    }
    if (stopped) return;
    onUpdate?.(task);
    if (TERMINAL.has(task.status)) {
      stop();
      onSettled?.(task);
    }
  }, POLL_INTERVAL_MS);

  function stop() {
    stopped = true;
    clearInterval(timer);
  }

  return stop;
}
