import { getMediaJob } from "./api";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 2000;

/**
 * Polls an asynchronous media generation job until it settles (completed, failed, or cancelled).
 *
 * @param {string} jobId - UUID of the MediaGenerationJob.
 * @param {object} callbacks - { onUpdate: (job) => void, onSettled: (job) => void }
 * @returns {function} stop - Call to abort polling.
 */
export function pollMediaJob(jobId, { onUpdate, onSettled } = {}) {
  let stopped = false;

  const timer = setInterval(async () => {
    if (stopped) return;
    let job;
    try {
      job = await getMediaJob(jobId);
    } catch {
      return; // transient — retry next tick
    }
    if (stopped) return;
    onUpdate?.(job);
    if (TERMINAL.has(job.status)) {
      stop();
      onSettled?.(job);
    }
  }, POLL_INTERVAL_MS);

  function stop() {
    stopped = true;
    clearInterval(timer);
  }

  return stop;
}
