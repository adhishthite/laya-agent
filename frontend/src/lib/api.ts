import type { ComparisonResult, DecisionResult } from "./types";

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

/** Parse "key:description" lines into a criteria map. */
export function parseCriteria(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const description = line.slice(idx + 1).trim();
      if (key) parsed[key] = description;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : { yes: "Affirmative", no: "Negative" };
}
