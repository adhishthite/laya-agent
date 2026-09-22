/** Which link in the decision chain the reachability probe reached. */
export type ProbeState = "ready" | "backend_down" | "auth" | "error";

export interface LayaProbe {
  state: ProbeState;
  endpoint: string;
  http_status: number | null;
  latency_ms: number;
  detail: string;
}

/** Which step of the pipeline a streamed event describes. */
export type StreamStage = "search" | "laya" | "jev" | "deliberation" | "result";

export type StreamStatus = "start" | "done" | "error";

export interface SourceContribution {
  source_text: string;
  impact_points: number;
  is_supporting: boolean;
}

export interface System2Synthesis {
  explanation: string;
  latency_ms: number;
}

export interface DecisionResult {
  query: string;
  decision: string;
  confidence: number;
  probabilities: Record<string, number>;
  handled_by: string;
  search_enabled: boolean;
  evidence: string[];
  sources: SourceContribution[];
  system2_synthesis?: System2Synthesis;
  total_latency_ms: number;
  /** Set when Laya could not answer. Gemini answered alone. */
  system1_error?: string | null;
}

export interface System1Decision {
  choice?: string;
  score?: number;
  probabilities: Record<string, number>;
  confidence: number;
  latency_ms: number;
  sources: SourceContribution[];
  /** Set when this engine failed. Every other field is then empty. */
  error?: string | null;
}

export interface ComparisonResult {
  query: string;
  evidence: string[];
  laya: System1Decision;
  jev: System1Decision;
  /** Null when either engine failed: there is nothing to compare. */
  agreement: boolean | null;
  latency_diff_ms: number | null;
  speedup_factor: number | null;
  total_latency_ms: number;
}

/**
 * One line of a streamed run.
 *
 * Only the payload belonging to `stage` is present; the backend drops the rest
 * before sending, so every payload field is optional here.
 */
export interface StreamEvent {
  stage: StreamStage;
  status: StreamStatus;
  /** Measured from the start of the run, not of the stage. */
  elapsed_ms: number;
  evidence?: string[];
  decision?: System1Decision;
  synthesis?: System2Synthesis;
  decision_result?: DecisionResult;
  comparison?: ComparisonResult;
  error?: string;
}

/** One answer the model may return, paired with the condition it stands for. */
export interface Outcome {
  key: string;
  description: string;
}

export interface Scenario {
  label: string;
  query: string;
  outcomes: Outcome[];
}
