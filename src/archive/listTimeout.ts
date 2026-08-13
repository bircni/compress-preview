const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_LIST_TIMEOUT_MS = 300_000;

export function scaleListTimeoutMs(baseTimeoutMs: number, retryAttempt: number): number {
  const attempt = Number.isFinite(retryAttempt) ? Math.max(0, Math.round(retryAttempt)) : 0;
  const base = Number.isFinite(baseTimeoutMs) ? baseTimeoutMs : DEFAULT_TIMEOUT_MS;
  const scaled = base * (attempt + 1);
  if (!Number.isFinite(scaled)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_LIST_TIMEOUT_MS, Math.max(1000, Math.round(scaled)));
}

export function formatPartialListMessage(entryCount: number, timeoutMs: number): string {
  const count = Math.max(0, Math.round(entryCount));
  const seconds = Math.max(1, Math.round(timeoutMs / 1000));
  const entryWord = count === 1 ? "entry" : "entries";
  return `${count.toLocaleString("en-US")} ${entryWord} loaded in ${seconds}s. Retry to load more with a longer timeout.`;
}
