import {
  ArrowSquareOut,
  CheckCircle,
  Lightning,
  Moon,
  Scales,
  Sun,
  Warning,
} from "@phosphor-icons/react";
import { Arc } from "loading-dev";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { BackendStatus } from "./components/BackendStatus";
import { EvidenceLedger } from "./components/EvidenceLedger";
import { Logo } from "./components/Logo";
import { OutcomeEditor } from "./components/OutcomeEditor";
import { ProbabilityTrack } from "./components/ProbabilityTrack";
import { outcomesAreValid, streamComparison, streamDecision, toCriteria } from "./lib/api";
import { useTheme } from "./lib/theme";
import type {
  ComparisonResult,
  DecisionResult,
  Outcome,
  Scenario,
  StreamEvent,
  StreamStage,
  StreamStatus,
  System1Decision,
} from "./lib/types";

const SCENARIOS: Scenario[] = [
  {
    label: "Umbrella in Tokyo",
    query: "Should I take an umbrella in Tokyo today?",
    outcomes: [
      { key: "yes", description: "Rain is likely" },
      { key: "no", description: "Dry weather" },
    ],
  },
  {
    label: "Starship booster catch",
    query: "Did SpaceX catch the Super Heavy booster on the launch tower arms?",
    outcomes: [
      { key: "yes", description: "Caught by Mechazilla" },
      { key: "no", description: "Splashdown or abort" },
    ],
  },
  {
    label: "iPhone 18 Pro shipping",
    query: "Has Apple officially released the iPhone 18 Pro to consumers?",
    outcomes: [
      { key: "yes", description: "On sale now" },
      { key: "no", description: "Unreleased or rumour" },
    ],
  },
  {
    label: "Fed rate cut",
    query: "Did the Federal Reserve cut interest rates at its most recent FOMC meeting?",
    outcomes: [
      { key: "yes", description: "Rate cut announced" },
      { key: "no", description: "Held or raised" },
    ],
  },
  {
    label: "Outage triage",
    query: "Database deadlock in the primary transaction cluster, 500s rising.",
    outcomes: [
      { key: "critical", description: "Page tier-1 now" },
      { key: "high", description: "Queue for the on-call" },
      { key: "low", description: "Standard backlog" },
    ],
  },
];

type Mode = "both" | "laya";

/** What the run has reported so far. Rebuilt from the event stream. */
interface Progress {
  status: Partial<Record<StreamStage, StreamStatus>>;
  /** Pure duration of each stage (web search time or single-pass model latency). */
  stageLatencyMs: Partial<Record<StreamStage, number>>;
  evidence: string[];
  laya: System1Decision | null;
  jev: System1Decision | null;
}

const NO_PROGRESS: Progress = {
  status: {},
  stageLatencyMs: {},
  evidence: [],
  laya: null,
  jev: null,
};

export function App() {
  const [mode, setMode] = useState<Mode>("both");
  const [query, setQuery] = useState(SCENARIOS[0].query);
  const [outcomes, setOutcomes] = useState<Outcome[]>(SCENARIOS[0].outcomes);
  const [grounding, setGrounding] = useState(true);
  const [attribution, setAttribution] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  const [runMode, setRunMode] = useState<Mode>("both");
  const [runGrounding, setRunGrounding] = useState(true);

  const canRun = query.trim() !== "" && outcomesAreValid(outcomes);

  async function run() {
    if (!canRun || loading) return;
    setLoading(true);
    setError(null);
    setDecision(null);
    setComparison(null);
    setProgress(NO_PROGRESS);
    setRunMode(mode);
    setRunGrounding(grounding);

    const opts = {
      query: query.trim(),
      criteria: toCriteria(outcomes),
      enableSearch: grounding,
      computeAttribution: attribution,
    };

    const onEvent = (event: StreamEvent) => {
      setProgress((prev) => {
        const next: Progress = {
          ...prev,
          status: { ...prev.status, [event.stage]: event.status },
          stageLatencyMs: { ...prev.stageLatencyMs },
        };
        if (event.latency_ms !== undefined) {
          next.stageLatencyMs[event.stage] = event.latency_ms;
        } else if (event.decision) {
          next.stageLatencyMs[event.stage] = event.decision.latency_ms;
        }
        if (event.evidence) next.evidence = event.evidence;
        if (event.stage === "laya" && event.decision) next.laya = event.decision;
        if (event.stage === "jev" && event.decision) next.jev = event.decision;
        return next;
      });

      if (event.decision_result) setDecision(event.decision_result);
      if (event.comparison) setComparison(event.comparison);
    };

    try {
      if (mode === "laya") {
        await streamDecision(opts, onEvent);
      } else {
        await streamComparison(opts, onEvent);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The bench could not reach the backend.");
    } finally {
      setLoading(false);
    }
  }

  const hasWorkspace =
    loading ||
    decision !== null ||
    comparison !== null ||
    progress.laya !== null ||
    progress.jev !== null;

  return (
    <div className="min-h-[100dvh] bg-paper">
      <TopRail />

      <main className="bench-grid">
        <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-14 sm:pt-20">
          <h1 className="max-w-5xl font-display text-[2.4rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[3.15rem]">
            System 1 head-to-head.
            <br />
            <span className="text-ink-soft">Laya vs Jev, grounded or raw.</span>
          </h1>

          <div className="mt-10 flex flex-wrap gap-2">
            {SCENARIOS.map((s) => {
              const active = s.query === query;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setQuery(s.query);
                    setOutcomes(s.outcomes);
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "border-selected bg-selected text-selected-ink"
                      : "border-rule-strong bg-panel text-ink-soft hover:border-ink hover:text-ink"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <Console
            query={query}
            onQuery={setQuery}
            outcomes={outcomes}
            onOutcomes={setOutcomes}
            grounding={grounding}
            onGrounding={setGrounding}
            attribution={attribution}
            onAttribution={setAttribution}
            mode={mode}
            onMode={setMode}
            loading={loading}
            canRun={canRun}
            onRun={run}
          />

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert/30 bg-alert-weak px-4 py-3"
              >
                <Warning size={18} weight="fill" className="mt-px shrink-0 text-alert" />
                <p className="text-sm text-ink">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            {hasWorkspace ? (
              <BenchWorkspace
                mode={runMode}
                searchEnabled={runGrounding}
                loading={loading}
                progress={progress}
                decision={decision}
                comparison={comparison}
              />
            ) : (
              <IdleState mode={mode} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * One persistent workspace that stays mounted across the entire lifecycle of a
 * run (streaming -> complete).
 *
 * Keeping the exact same tree and React keys prevents the results section from
 * unmounting and re-animating when the stream finishes.
 */
function BenchWorkspace({
  mode,
  searchEnabled,
  loading,
  progress,
  decision,
  comparison,
}: {
  mode: Mode;
  searchEnabled: boolean;
  loading: boolean;
  progress: Progress;
  decision: DecisionResult | null;
  comparison: ComparisonResult | null;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!loading) return;
    setElapsedMs(0);
    const startedAt = performance.now();
    const id = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 100);
    return () => window.clearInterval(id);
  }, [loading]);

  const searchMs =
    comparison?.search_latency_ms ?? decision?.search_latency_ms ?? progress.stageLatencyMs.search;

  const layaData: System1Decision | null =
    comparison?.laya ??
    progress.laya ??
    (decision
      ? {
          choice: decision.decision,
          probabilities: decision.probabilities,
          confidence: decision.confidence,
          latency_ms: decision.laya_latency_ms,
          sources: decision.sources,
          error: decision.system1_error,
        }
      : null);

  const jevData: System1Decision | null = comparison?.jev ?? progress.jev;

  const evidence = comparison?.evidence ?? decision?.evidence ?? progress.evidence;

  const searchValue = !searchEnabled
    ? "off"
    : searchMs !== undefined
      ? `${Math.round(searchMs)} ms`
      : progress.status.search === "start"
        ? "..."
        : "—";

  const layaLatencyValue =
    layaData && !layaData.error
      ? `${Math.round(layaData.latency_ms)} ms`
      : progress.status.laya === "start"
        ? "..."
        : "—";

  const jevLatencyValue =
    jevData && !jevData.error
      ? `${Math.round(jevData.latency_ms)} ms`
      : progress.status.jev === "start"
        ? "..."
        : "—";

  if (mode === "laya") {
    const layaFailed = Boolean(layaData?.error);
    return (
      <div className="mt-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-rule-strong bg-panel px-7 py-5">
          <div className="flex items-center gap-3">
            {loading ? (
              <Arc size={20} cap="round" className="text-fast" />
            ) : layaFailed ? (
              <Warning size={22} weight="fill" className="text-alert" />
            ) : (
              <CheckCircle size={22} weight="fill" className="text-fast" />
            )}
            <p className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
              {loading
                ? progress.status.search === "start"
                  ? "Searching the web..."
                  : "Running Laya on GPU..."
                : layaFailed
                  ? "Laya did not answer"
                  : `Laya chose ${layaData?.choice ?? "n/a"}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-8">
            <Stat label="web search" value={searchValue} />
            <Stat label="laya (pure)" value={layaLatencyValue} tone="text-fast" />
            <Stat
              label="elapsed"
              value={
                decision
                  ? `${Math.round(decision.total_latency_ms)} ms`
                  : `${(elapsedMs / 1000).toFixed(1)} s`
              }
            />
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[5fr_7fr]">
          {layaData ? (
            <EngineCard
              key="laya-only"
              name="Laya"
              tone="fast"
              data={layaData}
              searchEnabled={searchEnabled}
              searchLatencyMs={searchMs}
              showEvidence={false}
            />
          ) : (
            <WaitingPanel
              title="laya"
              subtitle={
                progress.status.search === "start"
                  ? "Waiting for web grounding..."
                  : "Computing on L4 GPU..."
              }
            />
          )}

          <Panel
            title="evidence"
            right={
              layaData && layaData.sources.length > 0 ? (
                <span className="tnum text-[11px] text-ink-faint">
                  {layaData.sources.length} weighted
                </span>
              ) : evidence.length > 0 ? (
                <span className="tnum text-[11px] text-ink-faint">{evidence.length} found</span>
              ) : undefined
            }
          >
            {!searchEnabled || evidence.length > 0 || !loading ? (
              <EvidenceLedger
                sources={layaData?.sources ?? []}
                evidence={evidence}
                searchEnabled={searchEnabled}
              />
            ) : (
              <SkeletonRows />
            )}
          </Panel>
        </div>
      </div>
    );
  }

  // mode === "both" (head-to-head Laya vs Jev)
  const bothPresent = Boolean(layaData && jevData);
  const bothHealthy = Boolean(layaData && jevData && !layaData.error && !jevData.error);
  const agreement =
    comparison?.agreement ?? (bothHealthy ? layaData?.choice === jevData?.choice : null);
  const faster =
    bothHealthy && layaData && jevData
      ? layaData.latency_ms <= jevData.latency_ms
        ? "Laya"
        : "Jev"
      : "—";
  const speedup =
    comparison?.speedup_factor ??
    (bothHealthy && layaData && jevData
      ? Number((jevData.latency_ms / Math.max(layaData.latency_ms, 0.001)).toFixed(2))
      : null);
  const gapMs =
    comparison?.latency_diff_ms ??
    (bothHealthy && layaData && jevData ? jevData.latency_ms - layaData.latency_ms : null);
  const downEngines = [layaData?.error ? "Laya" : null, jevData?.error ? "Jev" : null].filter(
    Boolean,
  );

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-rule-strong bg-panel px-7 py-5">
        <div className="flex items-center gap-3">
          {!bothPresent && loading ? (
            <Arc size={20} cap="round" className="text-fast" />
          ) : agreement !== null ? (
            <Scales size={22} weight="fill" className={agreement ? "text-fast" : "text-alert"} />
          ) : (
            <Warning size={22} weight="fill" className="text-alert" />
          )}
          <p className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
            {!bothPresent && loading
              ? progress.status.search === "start"
                ? "Searching the web..."
                : layaData && !jevData
                  ? "Laya finished — waiting on Jev..."
                  : jevData && !layaData
                    ? "Jev finished — waiting on Laya..."
                    : "Running Laya & Jev in parallel..."
              : agreement !== null
                ? agreement
                  ? "Both models agree"
                  : "The models disagree"
                : `${downEngines.join(" and ") || "Engine"} did not answer`}
          </p>
        </div>

        <div className="flex flex-wrap gap-7">
          <Stat label="web search" value={searchValue} />
          <Stat label="laya (pure)" value={layaLatencyValue} tone="text-fast" />
          <Stat label="jev (pure)" value={jevLatencyValue} tone="text-slow" />
          <Stat label="faster" value={faster} />
          <Stat label="speedup" value={speedup === null ? "—" : `${speedup.toFixed(2)}x`} />
          <Stat label="gap" value={gapMs === null ? "—" : `${Math.round(Math.abs(gapMs))} ms`} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {layaData ? (
          <EngineCard
            key="laya"
            name="Laya"
            tone="fast"
            data={layaData}
            searchEnabled={searchEnabled}
            searchLatencyMs={searchMs}
          />
        ) : (
          <WaitingPanel
            title="laya"
            subtitle={
              progress.status.search === "start"
                ? "Waiting for web grounding..."
                : "Computing on L4 GPU..."
            }
          />
        )}

        {jevData ? (
          <EngineCard
            key="jev"
            name="Jev"
            tone="slow"
            data={jevData}
            searchEnabled={searchEnabled}
            searchLatencyMs={searchMs}
          />
        ) : (
          <WaitingPanel
            title="jev"
            subtitle={
              progress.status.search === "start"
                ? "Waiting for web grounding..."
                : "Querying TypeSafe API..."
            }
          />
        )}
      </div>
    </div>
  );
}

function WaitingPanel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Panel title={title}>
      <div className="flex h-[15.5rem] flex-col items-center justify-center gap-3.5">
        <Arc size={30} cap="round" className="text-fast" />
        {subtitle && <p className="font-mono text-xs text-ink-faint">{subtitle}</p>}
      </div>
    </Panel>
  );
}

function SkeletonRows() {
  return (
    <ul className="h-[15.5rem] divide-y divide-rule">
      {[0, 1, 2].map((row) => (
        <li
          key={row}
          className="animate-pulse px-7 py-4"
          style={{ animationDelay: `${row * 140}ms` }}
        >
          <div className="h-3.5 w-2/3 rounded bg-rule" />
          <div className="mt-3 h-1.5 w-full rounded-full bg-rule" />
        </li>
      ))}
    </ul>
  );
}

function IdleState({ mode }: { mode: Mode }) {
  const steps =
    mode === "both"
      ? [
          "Toggle Web grounding on to pull live citations first, or off to test raw priors.",
          "Laya (L4 GPU) and Jev (SaaS) evaluate the exact same evidence in parallel.",
          "Each card streams in the instant its model finishes, with pure engine vs search latency.",
        ]
      : [
          "Toggle Web grounding on to pull live citations first, or off to test raw priors.",
          "Laya evaluates the evidence on the private L4 GPU endpoint.",
          "Leave-one-out attribution measures how many points each source shifts the verdict.",
        ];

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-rule-strong px-7 py-8">
      <ol className="grid gap-6 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="tnum text-xs text-ink-faint">{i + 1}</span>
            <p className="text-[14px] leading-relaxed text-ink-soft">{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TopRail() {
  const [theme, toggleTheme] = useTheme();
  const dark = theme === "dark";

  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Decision Bench
          </span>
        </div>
        <div className="flex items-center gap-3">
          <BackendStatus />
          <a
            href="https://github.com/adhishthite/laya-agent"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-rule-strong bg-panel px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            Source
            <ArrowSquareOut size={14} />
          </a>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
            className="grid size-[34px] place-items-center rounded-lg border border-rule-strong bg-panel text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            {dark ? <Sun size={16} weight="fill" /> : <Moon size={16} weight="fill" />}
          </button>
        </div>
      </div>
    </header>
  );
}

interface ConsoleProps {
  query: string;
  onQuery: (v: string) => void;
  outcomes: Outcome[];
  onOutcomes: (v: Outcome[]) => void;
  grounding: boolean;
  onGrounding: (v: boolean) => void;
  attribution: boolean;
  onAttribution: (v: boolean) => void;
  mode: Mode;
  onMode: (v: Mode) => void;
  loading: boolean;
  canRun: boolean;
  onRun: () => void;
}

const MODE_LABELS: Record<Mode, string> = {
  both: "Both",
  laya: "Laya only",
};

function Console(p: ConsoleProps) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-rule-strong bg-panel shadow-panel">
      <textarea
        value={p.query}
        onChange={(e) => p.onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) p.onRun();
        }}
        rows={2}
        placeholder="Ask something the world already answered."
        className="w-full resize-none bg-transparent px-6 pb-4 pt-5 text-lg leading-snug text-ink placeholder:text-ink-faint focus:outline-none"
      />

      <div className="border-t border-rule px-6 py-3.5">
        <OutcomeEditor outcomes={p.outcomes} onChange={p.onOutcomes} />
      </div>

      <div className="flex flex-col gap-4 border-t border-rule bg-sunken px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Switch label="Web grounding" on={p.grounding} onChange={p.onGrounding} />
          <Switch label="Attribution" on={p.attribution} onChange={p.onAttribution} />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-rule-strong bg-panel p-0.5">
            {(["both", "laya"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => p.onMode(m)}
                className={`rounded-[6px] px-3 py-1.5 text-[13px] transition-colors ${
                  p.mode === m ? "bg-selected text-selected-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={p.onRun}
            disabled={p.loading || !p.canRun}
            className="flex items-center gap-2 rounded-lg bg-fast px-5 py-2 text-sm font-medium text-paper shadow-accent transition-opacity hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            {p.loading ? <Arc size={15} cap="round" /> : <Lightning size={16} weight="fill" />}

            {p.loading ? "Running" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="group flex items-center gap-2"
    >
      <span
        className={`relative h-[18px] w-8 rounded-full transition-colors ${
          on ? "bg-fast" : "bg-rule-strong"
        }`}
      >
        <span
          className={`absolute top-[3px] size-3 rounded-full bg-panel transition-[left] duration-200 ${
            on ? "left-[17px]" : "left-[3px]"
          }`}
        />
      </span>
      <span className={`text-[13px] ${on ? "text-ink" : "text-ink-soft"}`}>{label}</span>
    </button>
  );
}

function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-rule-strong bg-panel ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-7 py-3.5">
        <h2 className="font-mono text-xs tracking-wide text-ink-faint">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] text-ink-faint">{label}</p>
      <p className={`tnum mt-1 text-[15px] font-medium ${tone ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

function EngineCard({
  name,
  tone,
  data,
  searchEnabled,
  searchLatencyMs,
  showEvidence = true,
}: {
  name: string;
  tone: "fast" | "slow";
  data: System1Decision;
  searchEnabled: boolean;
  searchLatencyMs?: number;
  showEvidence?: boolean;
}) {
  const outcome = data.choice ?? (data.score !== undefined ? data.score.toFixed(3) : "n/a");
  const colour = tone === "fast" ? "text-fast" : "text-slow";

  if (data.error) {
    return (
      <Panel
        title={name.toLowerCase()}
        right={<span className="text-[11px] text-alert">unavailable</span>}
      >
        <div className="flex items-start gap-3 px-7 py-6">
          <Warning size={20} weight="fill" className="mt-0.5 shrink-0 text-alert" />
          <p className="text-sm leading-relaxed text-ink-soft">{data.error}</p>
        </div>
      </Panel>
    );
  }

  const searchText = !searchEnabled
    ? "off"
    : searchLatencyMs !== undefined
      ? `${Math.round(searchLatencyMs)} ms`
      : "—";

  return (
    <Panel
      title={name.toLowerCase()}
      right={
        <span className="tnum text-[11px] text-ink-faint">
          {Math.round(data.latency_ms)} ms pure
        </span>
      }
    >
      <div className="px-7 py-6">
        <p className={`font-display text-4xl font-semibold tracking-[-0.03em] ${colour}`}>
          {outcome}
        </p>
        <div className="mt-6">
          <ProbabilityTrack probabilities={data.probabilities} winner={data.choice} tone={tone} />
        </div>
      </div>

      <div
        className={`grid grid-cols-2 gap-4 bg-sunken px-7 py-4 sm:grid-cols-4 ${
          showEvidence ? "border-y border-rule" : "border-t border-rule"
        }`}
      >
        <Stat label="engine (pure)" value={`${Math.round(data.latency_ms)} ms`} tone={colour} />
        <Stat label="web search" value={searchText} />
        <Stat label="confidence" value={data.confidence.toFixed(4)} />
        <Stat label="sources" value={`${data.sources.length}`} />
      </div>

      {showEvidence && <EvidenceLedger sources={data.sources} searchEnabled={searchEnabled} />}
    </Panel>
  );
}
