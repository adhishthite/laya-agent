import {
  ArrowSquareOut,
  Brain,
  Lightning,
  Moon,
  Scales,
  Sun,
  Warning,
} from "@phosphor-icons/react";
import { Arc } from "loading-dev";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { BackendStatus } from "./components/BackendStatus";
import { EvidenceLedger } from "./components/EvidenceLedger";

import { Logo } from "./components/Logo";
import { OutcomeEditor } from "./components/OutcomeEditor";
import { ProbabilityTrack } from "./components/ProbabilityTrack";
import { Prose } from "./components/Prose";
import { outcomesAreValid, runComparison, runDecision, toCriteria } from "./lib/api";
import { useTheme } from "./lib/theme";
import type {
  ComparisonResult,
  DecisionResult,
  Outcome,
  Scenario,
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
    query: "Did SpaceX catch the Super Heavy booster on the launch tower?",
    outcomes: [
      { key: "yes", description: "Caught by the tower" },
      { key: "no", description: "Lost or ocean splashdown" },
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
    query: "Did the Federal Reserve cut interest rates at its latest FOMC meeting?",
    outcomes: [
      { key: "yes", description: "Cut rates" },
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

type Mode = "decide" | "compare";

export function App() {
  const [mode, setMode] = useState<Mode>("decide");
  const [query, setQuery] = useState(SCENARIOS[0].query);
  const [outcomes, setOutcomes] = useState<Outcome[]>(SCENARIOS[0].outcomes);
  const [grounding, setGrounding] = useState(true);
  const [attribution, setAttribution] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const canRun = query.trim() !== "" && outcomesAreValid(outcomes);

  async function run() {
    if (!canRun || loading) return;
    setLoading(true);
    setError(null);
    setDecision(null);
    setComparison(null);

    const opts = {
      query: query.trim(),
      criteria: toCriteria(outcomes),
      enableSearch: grounding,
      computeAttribution: attribution,
    };

    try {
      if (mode === "decide") {
        setDecision(await runDecision(opts));
      } else {
        setComparison(await runComparison(opts));
      }
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The bench could not reach the backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-paper">
      <TopRail />

      <main className="bench-grid">
        <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-14 sm:pt-20">
          <h1 className="max-w-5xl font-display text-[2.4rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-[3.15rem]">
            Fast answers by default.
            <br />
            <span className="text-ink-soft">Slow reasoning only when it matters.</span>
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

          <div ref={resultsRef} className="scroll-mt-20">
            {loading && <PendingState mode={mode} />}
            {decision && <DecisionView result={decision} />}
            {comparison && <CompareView result={comparison} />}
            {!decision && !comparison && !loading && <IdleState mode={mode} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function PendingState({ mode }: { mode: Mode }) {
  // A run takes tens of seconds. Without a moving number the wait is
  // indistinguishable from a hang, which is exactly the failure this bench hit.
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const id = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 100);
    return () => window.clearInterval(id);
  }, []);

  const columns = mode === "decide" ? "lg:grid-cols-[5fr_7fr]" : "lg:grid-cols-2";

  return (
    <div className={`mt-6 grid items-start gap-5 ${columns}`}>
      <Panel title={mode === "decide" ? "verdict" : "laya"}>
        <div className="flex h-[15.5rem] flex-col items-center justify-center gap-5">
          <Arc size={34} cap="round" className="text-fast" />
          <p className="tnum text-sm text-ink-faint">{(elapsedMs / 1000).toFixed(1)} s</p>
        </div>
      </Panel>

      <Panel title={mode === "decide" ? "evidence" : "jev"}>
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
      </Panel>
    </div>
  );
}

function IdleState({ mode }: { mode: Mode }) {
  const steps =
    mode === "decide"
      ? [
          "Gemini grounds the question in live web results.",
          "Laya reads that evidence and returns a calibrated answer.",
          "Below the confidence floor, Gemini takes the question back and reasons it through.",
        ]
      : [
          "Gemini grounds the question in live web results.",
          "Laya and Jev read the same evidence at the same time.",
          "The bench reports where they agree and which one got there first.",
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
            {(["decide", "compare"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => p.onMode(m)}
                className={`rounded-[6px] px-3 py-1.5 text-[13px] capitalize transition-colors ${
                  p.mode === m ? "bg-selected text-selected-ink" : "text-ink-soft hover:text-ink"
                }`}
              >
                {m}
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

function DecisionView({ result }: { result: DecisionResult }) {
  const reduced = useReducedMotion();
  const escalated = result.handled_by.startsWith("System 2");
  const tone = escalated ? "slow" : "fast";
  // Laya runs on a preemptible GPU VM. When it is gone, Gemini answers alone
  // and the verdict panel reports that instead of a decision it never made.
  const fastLaneDown = Boolean(result.system1_error);

  return (
    <motion.div
      // The results block arrives after a wait; a short rise marks it as new.
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mt-6 flex flex-col gap-5"
    >
      <div className="grid items-start gap-5 lg:grid-cols-[5fr_7fr]">
        <Panel
          title="verdict"
          right={
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                fastLaneDown
                  ? "bg-alert-weak text-alert"
                  : escalated
                    ? "bg-slow-weak text-slow"
                    : "bg-fast-weak text-fast"
              }`}
            >
              {fastLaneDown ? (
                <Warning size={13} weight="fill" />
              ) : escalated ? (
                <Brain size={13} weight="fill" />
              ) : (
                <Lightning size={13} weight="fill" />
              )}
              {fastLaneDown ? "System 2 only" : escalated ? "System 2" : "System 1"}
            </span>
          }
        >
          {fastLaneDown ? (
            <div className="flex items-start gap-3 px-7 py-6">
              <Warning size={20} weight="fill" className="mt-0.5 shrink-0 text-alert" />
              <p className="text-sm leading-relaxed text-ink-soft">{result.system1_error}</p>
            </div>
          ) : (
            <div className="px-7 py-6">
              <p
                className={`font-display text-5xl font-semibold tracking-[-0.03em] ${
                  escalated ? "text-slow" : "text-fast"
                }`}
              >
                {result.decision}
              </p>
              <div className="mt-6">
                <ProbabilityTrack
                  probabilities={result.probabilities}
                  winner={result.decision}
                  tone={tone}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 border-t border-rule bg-sunken px-7 py-4">
            <Stat label="confidence" value={fastLaneDown ? "—" : result.confidence.toFixed(4)} />
            <Stat label="latency" value={`${Math.round(result.total_latency_ms)} ms`} />
            <Stat
              label="route"
              value={fastLaneDown ? "degraded" : escalated ? "escalated" : "direct"}
            />
          </div>
        </Panel>

        <Panel
          title="evidence"
          right={
            result.sources.length > 0 ? (
              <span className="tnum text-[11px] text-ink-faint">
                {result.sources.length} weighted
              </span>
            ) : undefined
          }
        >
          <EvidenceLedger
            sources={result.sources}
            evidence={result.evidence}
            searchEnabled={result.search_enabled}
          />
        </Panel>
      </div>

      {result.system2_synthesis && (
        <Panel
          title="deliberation"
          right={
            <span className="tnum text-[11px] text-ink-faint">
              {Math.round(result.system2_synthesis.latency_ms)} ms
            </span>
          }
        >
          <div className="px-7 py-6">
            <Prose>{result.system2_synthesis.explanation}</Prose>
          </div>
        </Panel>
      )}
    </motion.div>
  );
}
function CompareView({ result }: { result: ComparisonResult }) {
  const reduced = useReducedMotion();
  // Only one lane may have answered. Everything that needs both is withheld
  // rather than shown as a zero, which would read as a real measurement.
  const bothAnswered = result.agreement !== null;
  const downEngines = [result.laya.error ? "Laya" : null, result.jev.error ? "Jev" : null].filter(
    Boolean,
  );
  const faster = result.laya.latency_ms <= result.jev.latency_ms ? "Laya" : "Jev";

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="mt-6 flex flex-col gap-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-rule-strong bg-panel px-7 py-5">
        <div className="flex items-center gap-3">
          {bothAnswered ? (
            <Scales
              size={22}
              weight="fill"
              className={result.agreement ? "text-fast" : "text-alert"}
            />
          ) : (
            <Warning size={22} weight="fill" className="text-alert" />
          )}
          <p className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
            {bothAnswered
              ? result.agreement
                ? "Both models agree"
                : "The models disagree"
              : `${downEngines.join(" and ")} did not answer`}
          </p>
        </div>
        <div className="flex gap-8">
          <Stat label="faster" value={bothAnswered ? faster : "—"} />
          <Stat
            label="speedup"
            value={result.speedup_factor === null ? "—" : `${result.speedup_factor.toFixed(2)}x`}
          />
          <Stat
            label="gap"
            value={
              result.latency_diff_ms === null
                ? "—"
                : `${Math.round(Math.abs(result.latency_diff_ms))} ms`
            }
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <EngineCard name="Laya" tone="fast" data={result.laya} />
        <EngineCard name="Jev" tone="slow" data={result.jev} />
      </div>
    </motion.div>
  );
}

function EngineCard({
  name,
  tone,
  data,
}: {
  name: string;
  tone: "fast" | "slow";
  data: System1Decision;
}) {
  const outcome = data.choice ?? (data.score !== undefined ? data.score.toFixed(3) : "n/a");
  const colour = tone === "fast" ? "text-fast" : "text-slow";

  // The card keeps its slot in the grid so the surviving engine does not jump
  // across the page when its neighbour dies.
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

  return (
    <Panel
      title={name.toLowerCase()}
      right={
        <span className="tnum text-[11px] text-ink-faint">{Math.round(data.latency_ms)} ms</span>
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

      <div className="grid grid-cols-2 gap-4 border-y border-rule bg-sunken px-7 py-4">
        <Stat label="confidence" value={data.confidence.toFixed(4)} />
        <Stat label="sources" value={`${data.sources.length}`} />
      </div>

      <EvidenceLedger sources={data.sources} />
    </Panel>
  );
}
