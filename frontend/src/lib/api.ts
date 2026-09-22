import type { ComparisonResult, DecisionResult, LayaProbe, Outcome, StreamEvent } from "./types";

export interface RunOptions {
  query: string;
  criteria: Record<string, string>;
  enableSearch: boolean;
  computeAttribution: boolean;
}

function payload(opts: RunOptions) {
  return {
    query: opts.query,
    criteria: opts.criteria,
    enable_search: opts.enableSearch,
    compute_attribution: opts.computeAttribution,
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => (typeof d?.detail === "string" ? d.detail : null))
      .catch(() => null);
    throw new Error(detail ?? `Request failed with status ${res.status}`);
  }

  return (await res.json()) as T;
}

export function runDecision(opts: RunOptions): Promise<DecisionResult> {
  return post<DecisionResult>("/api/decide", payload(opts));
}

export function runComparison(opts: RunOptions): Promise<ComparisonResult> {
  return post<ComparisonResult>("/api/compare", payload(opts));
}

/**
 * Read an NDJSON run, handing each event to `onEvent` as it arrives.
 *
 * EventSource cannot send a request body, so this reads the response stream
 * directly instead of using SSE. Chunks split anywhere, including mid-object,
 * so the tail is buffered until a newline completes the line.
 */
async function stream(
  path: string,
  opts: RunOptions,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload(opts)),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as StreamEvent;
    if (event.stage === "result" && event.status === "error") {
      throw new Error(event.error ?? "The run failed after it had already started.");
    }
    onEvent(event);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // The last element is whatever came after the final newline. It is either
      // empty or a partial object, so it stays in the buffer either way.
      buffer = lines.pop() ?? "";
      for (const line of lines) emit(line);
    }
    emit(buffer);
  } finally {
    reader.releaseLock();
  }
}

export function streamDecision(
  opts: RunOptions,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return stream("/api/decide/stream", opts, onEvent, signal);
}

export function streamComparison(
  opts: RunOptions,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return stream("/api/compare/stream", opts, onEvent, signal);
}

/**
 * Ask the backend whether Laya can answer right now.
 *
 * The probe endpoint reports failures inside a 200 body, so a rejection from
 * here means our own backend is unreachable, not the GPU.
 */
export async function probeLaya(): Promise<LayaProbe> {
  const res = await fetch("/api/health/laya");
  if (!res.ok) throw new Error(`The bench backend answered ${res.status}.`);
  return (await res.json()) as LayaProbe;
}

/** Serialise outcomes into the criteria map the API expects. */
export function toCriteria(outcomes: Outcome[]): Record<string, string> {
  const criteria: Record<string, string> = {};
  for (const { key, description } of outcomes) {
    const trimmed = key.trim();
    if (trimmed) criteria[trimmed] = description.trim();
  }
  return criteria;
}

/** A decision needs at least two distinct, named outcomes to choose between. */
export function outcomesAreValid(outcomes: Outcome[]): boolean {
  const keys = outcomes.map((o) => o.key.trim()).filter(Boolean);
  return keys.length >= 2 && new Set(keys).size === keys.length;
}
