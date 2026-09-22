import type { ComparisonResult, DecisionResult, Outcome } from "./types";

export interface RunOptions {
  query: string;
  criteria: Record<string, string>;
  enableSearch: boolean;
  computeAttribution: boolean;
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
  return post<DecisionResult>("/api/decide", {
    query: opts.query,
    criteria: opts.criteria,
    enable_search: opts.enableSearch,
    compute_attribution: opts.computeAttribution,
  });
}

export function runComparison(opts: RunOptions): Promise<ComparisonResult> {
  return post<ComparisonResult>("/api/compare", {
    query: opts.query,
    criteria: opts.criteria,
    enable_search: opts.enableSearch,
    compute_attribution: opts.computeAttribution,
  });
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
