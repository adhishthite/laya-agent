import {
  ArrowSquareOut,
  Brain,
  CircleNotch,
  Lightning,
  Scales,
  Warning,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { EvidenceLedger } from "./components/EvidenceLedger";
import { Logo } from "./components/Logo";
import { ProbabilityTrack } from "./components/ProbabilityTrack";
import { Prose } from "./components/Prose";
import { parseCriteria, runComparison, runDecision } from "./lib/api";
import type { ComparisonResult, DecisionResult, Scenario, System1Decision } from "./lib/types";

const SCENARIOS: Scenario[] = [
  {
    label: "Umbrella in Tokyo",
    query: "Should I take an umbrella in Tokyo today?",
    criteria: "yes:Rain is likely\nno:Dry weather",
  },
  {
    label: "Starship booster catch",
    query: "Did SpaceX catch the Super Heavy booster on the launch tower?",
    criteria: "yes:Caught by the tower\nno:Lost or ocean splashdown",
  },
  {
    label: "iPhone 18 Pro shipping",
    query: "Has Apple officially released the iPhone 18 Pro to consumers?",
    criteria: "yes:On sale now\nno:Unreleased or rumour",
  },
  {
    label: "Fed rate cut",
    query: "Did the Federal Reserve cut interest rates at its latest FOMC meeting?",
    criteria: "yes:Cut rates\nno:Held or raised",
  },
  {
    label: "Outage triage",
    query: "Database deadlock in the primary transaction cluster, 500s rising.",
    criteria: "critical:Page tier-1 now\nlow:Standard queue",
  },
];

type Mode = "decide" | "compare";

export function App() {
  const [mode, setMode] = useState<Mode>("decide");
  const [query, setQuery] = useState(SCENARIOS[0].query);
  const [criteria, setCriteria] = useState(SCENARIOS[0].criteria);
  const [grounding, setGrounding] = useState(true);
  const [attribution, setAttribution] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function run() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setDecision(null);
    setComparison(null);

    const opts = {
      query: query.trim(),
      criteria: parseCriteria(criteria),
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
                    setCriteria(s.criteria);
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "border-ink bg-ink text-paper"
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
            criteria={criteria}
            onCriteria={setCriteria}
            grounding={grounding}
            onGrounding={setGrounding}
            attribution={attribution}
            onAttribution={setAttribution}
            mode={mode}
            onMode={setMode}
            loading={loading}
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
  const columns = mode === "decide" ? "lg:grid-cols-[5fr_7fr]" : "lg:grid-cols-2";
  return (
    <div className={`mt-6 grid animate-pulse gap-5 ${columns}`}>
      <div className="h-64 rounded-2xl border border-rule-strong bg-panel" />
      <div className="h-64 rounded-2xl border border-rule-strong bg-panel" />
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
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Decision Bench
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="tnum hidden text-xs text-ink-faint sm:inline">
            laya + gemini-3.5-flash-lite
          </span>
          <a
            href="https://github.com/adhishthite/laya-agent"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-rule-strong bg-panel px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            Source
            <ArrowSquareOut size={14} />
          </a>
        </div>
      </div>
    </header>
  );
}

interface ConsoleProps {
  query: string;
  onQuery: (v: string) => void;
  criteria: string;
  onCriteria: (v: string) => void;
  grounding: boolean;
  onGrounding: (v: boolean) => void;
  attribution: boolean;
  onAttribution: (v: boolean) => void;
  mode: Mode;
  onMode: (v: Mode) => void;
  loading: boolean;
  onRun: () => void;
}

function Console(p: ConsoleProps) {
  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-rule-strong bg-panel shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-18px_rgba(16,24,40,0.28)]">
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

      <div className="flex flex-col gap-3 border-t border-rule px-6 py-3.5 sm:flex-row sm:items-center">
        <label htmlFor="outcomes" className="font-mono text-xs text-ink-faint">
          outcomes
        </label>
        <input
          id="outcomes"
          value={criteriaToLine(p.criteria)}
          onChange={(e) => p.onCriteria(lineToCriteria(e.target.value))}
          spellCheck={false}
          className="tnum w-full min-w-0 bg-transparent text-[13px] text-ink-soft focus:text-ink focus:outline-none"
        />
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
                  p.mode === m ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={p.onRun}
            disabled={p.loading || !p.query.trim()}
            className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity disabled:opacity-40"
          >
            {p.loading ? (
              <CircleNotch size={16} weight="bold" className="animate-spin" />
            ) : (
              <Lightning size={16} weight="fill" />
            )}
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
          on ? "bg-ink" : "bg-rule-strong"
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
                escalated ? "bg-slow-weak text-slow" : "bg-fast-weak text-fast"
              }`}
            >
              {escalated ? (
                <Brain size={13} weight="fill" />
              ) : (
                <Lightning size={13} weight="fill" />
              )}
              {escalated ? "System 2" : "System 1"}
            </span>
          }
        >
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

          <div className="grid grid-cols-3 gap-4 border-t border-rule bg-sunken px-7 py-4">
            <Stat label="confidence" value={result.confidence.toFixed(4)} />
            <Stat label="latency" value={`${Math.round(result.total_latency_ms)} ms`} />
            <Stat label="route" value={escalated ? "escalated" : "direct"} />
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
          <Scales
            size={22}
            weight="fill"
            className={result.agreement ? "text-fast" : "text-alert"}
          />
          <p className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
            {result.agreement ? "Both models agree" : "The models disagree"}
          </p>
        </div>
        <div className="flex gap-8">
          <Stat label="faster" value={faster} />
          <Stat label="speedup" value={`${result.speedup_factor.toFixed(2)}x`} />
          <Stat label="gap" value={`${Math.round(Math.abs(result.latency_diff_ms))} ms`} />
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

/** The criteria map is edited as one compact line: "yes:Rain likely, no:Dry". */
function criteriaToLine(raw: string): string {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ");
}

function lineToCriteria(line: string): string {
  return line
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}
