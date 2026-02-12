export class HttpError extends Error {
  status: number;
  responseText?: string;

  constructor(message: string, status: number, responseText?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.responseText = responseText;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    const delta = parsed - Date.now();
    return delta > 0 ? delta : 0;
  }

  return null;
}

function isRetryableStatus(status: number): boolean {
  if (status === 408) return true;
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof HttpError) return isRetryableStatus(err.status);
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  if (err instanceof TypeError) return true; // `fetch` network failures

  const anyErr = err as { code?: unknown };
  const code = typeof anyErr.code === "string" ? anyErr.code : "";
  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
  ].includes(code);
}

function computeBackoffMs(args: {
  attempt: number;
  baseMs: number;
  maxMs: number;
}): number {
  const exp = Math.min(args.attempt - 1, 10);
  const raw = args.baseMs * 2 ** exp;
  const clamped = Math.min(raw, args.maxMs);
  const jitter = Math.floor(Math.random() * 250);
  return clamped + jitter;
}

export async function fetchJsonWithRetry<T>(args: {
  url: string;
  init: RequestInit;
  label: string;
  timeoutMs?: number;
  maxAttempts?: number;
}): Promise<T> {
  const timeoutMs = args.timeoutMs ?? 10_000;
  const maxAttempts = args.maxAttempts ?? 3;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(args.url, {
        ...args.init,
        signal: controller.signal,
      });
      const text = await resp.text();

      if (!resp.ok) {
        const err = new HttpError(
          `${args.label} failed (${resp.status}).`,
          resp.status,
          text,
        );
        lastErr = err;

        if (attempt < maxAttempts && isRetryableStatus(resp.status)) {
          const retryAfter = retryAfterMs(resp.headers.get("retry-after"));
          const delay =
            retryAfter ??
            computeBackoffMs({ attempt, baseMs: 250, maxMs: 5_000 });
          await sleep(delay);
          continue;
        }

        throw err;
      }

      try {
        return JSON.parse(text) as T;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${args.label} returned invalid JSON: ${msg}`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isRetryableError(err)) {
        const delay = computeBackoffMs({ attempt, baseMs: 250, maxMs: 5_000 });
        await sleep(delay);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(`${args.label} failed.`);
}
