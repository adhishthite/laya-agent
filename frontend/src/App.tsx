import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  Brain,
  CheckCircle,
  Clock,
  Compass,
  Cpu,
  Faders,
  Globe,
  Lightning,
  Scales,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

interface SourceContribution {
  source_text: string;
  impact_points: number;
  is_supporting: boolean;
}

interface System2Synthesis {
  explanation: string;
  latency_ms: number;
}

interface DecisionResult {
  query: string;
  decision: string;
  confidence: number;
  probabilities: Record<string, number>;
  handled_by: string;
  sources: SourceContribution[];
  system2_synthesis?: System2Synthesis;
  total_latency_ms: number;
}

interface System1Decision {
  choice?: string;
  score?: number;
  probabilities: Record<string, number>;
  confidence: number;
  latency_ms: number;
  sources: SourceContribution[];
}

interface ComparisonResult {
  query: string;
  evidence: string[];
  laya: System1Decision;
  jev: System1Decision;
  agreement: boolean;
  latency_diff_ms: number;
  speedup_factor: number;
  total_latency_ms: number;
}

interface PresetScenario {
  label: string;
  query: string;
  criteria: string;
}

const PRESET_SCENARIOS: PresetScenario[] = [
  {
    label: "Umbrella in Tokyo?",
    query: "Should I take an umbrella in Tokyo today?",
    criteria: "yes:Rain is likely\nno:Dry weather",
  },
  {
    label: "Starship Booster Catch",
    query: "Did SpaceX Starship successfully catch the Super Heavy booster on the launch tower?",
    criteria: "yes:Caught by Mechazilla tower\nno:Lost or ocean splashdown",
  },
  {
    label: "iPhone 18 Pro Released?",
    query: "Has Apple officially released the iPhone 18 Pro to consumers?",
    criteria: "yes:Officially released in stores\nno:Unreleased or rumor",
  },
  {
    label: "Fed Interest Rate Cut",
    query: "Did the Federal Reserve cut interest rates at its latest FOMC meeting?",
    criteria: "yes:Cut rates\nno:Held or increased rates",
  },
  {
    label: "Production Outage Triage",
    query: "Database deadlock detected in primary transaction cluster with 500 errors.",
    criteria: "critical:Immediate tier-1 escalation\nlow:Standard queue",
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<"decide" | "compare">("decide");
  const [query, setQuery] = useState(PRESET_SCENARIOS[0].query);
  const [criteria, setCriteria] = useState(PRESET_SCENARIOS[0].criteria);
  const [search, setSearch] = useState(true);
  const [attribution, setAttribution] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [decisionResult, setDecisionResult] = useState<DecisionResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  const parseCriteria = (raw: string): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      if (line.includes(":")) {
        const [k, v] = line.split(":", 2);
        result[k.trim()] = v.trim();
      }
    }
    return Object.keys(result).length > 0 ? result : { yes: "Affirmative", no: "Negative" };
  };

  const handleSelectScenario = (scenario: PresetScenario) => {
    setQuery(scenario.query);
    setCriteria(scenario.criteria);
  };

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    const parsedCriteria = parseCriteria(criteria);

    try {
      if (activeTab === "decide") {
        const res = await fetch("/api/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            criteria: parsedCriteria,
            enable_search: search,
            compute_attribution: attribution,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: "Request failed" }));
          throw new Error(errData.detail || `HTTP ${res.status}`);
        }
        const data: DecisionResult = await res.json();
        setDecisionResult(data);
      } else {
        const res = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            criteria: parsedCriteria,
            enable_search: search,
            compute_attribution: attribution,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ detail: "Request failed" }));
          throw new Error(errData.detail || `HTTP ${res.status}`);
        }
        const data: ComparisonResult = await res.json();
        setComparisonResult(data);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[oklch(0.12_0.02_260)] text-[oklch(0.96_0.01_260)] font-sans antialiased">
      {/* Header */}
      <header className="border-b border-[oklch(0.22_0.02_260)] px-8 py-5 bg-[oklch(0.14_0.02_260)]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[oklch(0.75_0.18_160)] text-[oklch(0.12_0.02_260)] font-bold shadow-lg shadow-[oklch(0.75_0.18_160/0.2)]">
              <Lightning size={24} weight="fill" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[oklch(0.98_0.01_260)]">
              Dual-Process Cognitive Agent
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[oklch(0.18_0.02_260)] border border-[oklch(0.26_0.02_260)] text-xs">
              <Cpu size={14} className="text-[oklch(0.75_0.18_160)]" />
              <span>Laya L4 GPU</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[oklch(0.18_0.02_260)] border border-[oklch(0.26_0.02_260)] text-xs">
              <Sparkle size={14} className="text-[oklch(0.70_0.18_245)]" />
              <span>Gemini 3.5 Flash-Lite</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[oklch(0.18_0.02_260)] border border-[oklch(0.26_0.02_260)] text-xs">
              <Scales size={14} className="text-[oklch(0.80_0.15_80)]" />
              <span>TypeSafe Jev</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex gap-3 border-b border-[oklch(0.22_0.02_260)] pb-4">
          <button
            type="button"
            onClick={() => setActiveTab("decide")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === "decide"
                ? "bg-[oklch(0.75_0.18_160)] text-[oklch(0.12_0.02_260)] shadow-lg shadow-[oklch(0.75_0.18_160/0.2)]"
                : "bg-[oklch(0.18_0.02_260)] text-[oklch(0.80_0.02_260)] hover:bg-[oklch(0.22_0.02_260)]"
            }`}
          >
            <Compass size={18} weight="bold" />
            <span>Dual-Process Decision</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("compare")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === "compare"
                ? "bg-[oklch(0.70_0.18_245)] text-[oklch(0.98_0.01_260)] shadow-lg shadow-[oklch(0.70_0.18_245/0.2)]"
                : "bg-[oklch(0.18_0.02_260)] text-[oklch(0.80_0.02_260)] hover:bg-[oklch(0.22_0.02_260)]"
            }`}
          >
            <Scales size={18} weight="bold" />
            <span>Grounded Benchmark (Laya vs Jev)</span>
          </button>
        </div>

        {/* Preset Scenario Pills */}
        <div className="flex flex-wrap gap-2">
          {PRESET_SCENARIOS.map((s) => (
            <motion.button
              key={s.label}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => handleSelectScenario(s)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                query === s.query
                  ? "bg-[oklch(0.75_0.18_160/0.15)] border-[oklch(0.75_0.18_160)] text-[oklch(0.75_0.18_160)] font-bold"
                  : "bg-[oklch(0.16_0.02_260)] border-[oklch(0.24_0.02_260)] text-[oklch(0.75_0.02_260)] hover:border-[oklch(0.35_0.02_260)] hover:text-white"
              }`}
            >
              {s.label}
            </motion.button>
          ))}
        </div>

        {/* Input Card */}
        <motion.div
          layout
          className="bg-[oklch(0.16_0.02_260)] border border-[oklch(0.24_0.02_260)] rounded-xl p-6 shadow-xl space-y-5"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="query-input"
                className="block text-sm font-semibold text-[oklch(0.92_0.01_260)] mb-2"
              >
                Scenario / Question
              </label>
              <input
                id="query-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask any question requiring factual verification"
                className="w-full bg-[oklch(0.12_0.02_260)] border border-[oklch(0.26_0.02_260)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[oklch(0.75_0.18_160)] transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="criteria-input"
                className="block text-sm font-semibold text-[oklch(0.92_0.01_260)] mb-2"
              >
                Decision Criteria
              </label>
              <textarea
                id="criteria-input"
                rows={2}
                value={criteria}
                onChange={(e) => setCriteria(e.target.value)}
                className="w-full bg-[oklch(0.12_0.02_260)] border border-[oklch(0.26_0.02_260)] rounded-lg px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-[oklch(0.75_0.18_160)] transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[oklch(0.22_0.02_260)]">
            <div className="flex items-center gap-6 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={search}
                  onChange={(e) => setSearch(e.target.checked)}
                  className="rounded border-[oklch(0.30_0.02_260)] bg-[oklch(0.12_0.02_260)] text-[oklch(0.75_0.18_160)]"
                />
                <Globe size={16} className="text-[oklch(0.75_0.18_160)]" />
                <span>Web Grounding</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attribution}
                  onChange={(e) => setAttribution(e.target.checked)}
                  className="rounded border-[oklch(0.30_0.02_260)] bg-[oklch(0.12_0.02_260)] text-[oklch(0.75_0.18_160)]"
                />
                <Faders size={16} className="text-[oklch(0.70_0.18_245)]" />
                <span>Source Attribution</span>
              </label>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={handleExecute}
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[oklch(0.75_0.18_160)] hover:bg-[oklch(0.80_0.18_160)] text-[oklch(0.12_0.02_260)] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[oklch(0.75_0.18_160/0.25)]"
            >
              {loading ? (
                <>
                  <ArrowClockwise size={18} className="animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <span>Execute Decision</span>
                  <ArrowRight size={18} weight="bold" />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 rounded-lg bg-[oklch(0.20_0.08_25)] border border-[oklch(0.50_0.20_25)] text-[oklch(0.90_0.10_25)] flex items-center gap-3"
            >
              <WarningCircle size={20} weight="fill" />
              <span className="text-sm font-medium">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results: Decide Mode (Two-Column Split Layout Inspired by Jev Demo) */}
        {activeTab === "decide" && decisionResult && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            {/* Left Column (5/12): Decision & Probabilities */}
            <div className="lg:col-span-5 space-y-6">
              {/* Decision Hero Card */}
              <div className="bg-[oklch(0.16_0.02_260)] border border-[oklch(0.24_0.02_260)] rounded-xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs uppercase font-semibold tracking-wider text-[oklch(0.65_0.02_260)]">
                    Decision
                  </h2>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[oklch(0.70_0.18_245/0.15)] text-[oklch(0.70_0.18_245)] border border-[oklch(0.70_0.18_245/0.3)]">
                    {decisionResult.handled_by.includes("System 1") ? (
                      <Lightning size={14} weight="fill" />
                    ) : (
                      <Brain size={14} weight="fill" />
                    )}
                    <span>{decisionResult.handled_by}</span>
                  </div>
                </div>

                <div className="py-2">
                  <div className="text-5xl font-extrabold tracking-tight text-[oklch(0.75_0.18_160)]">
                    {decisionResult.decision.toUpperCase()}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[oklch(0.22_0.02_260)]">
                  <div className="bg-[oklch(0.13_0.02_260)] p-3 rounded-lg">
                    <span className="text-xs text-[oklch(0.60_0.02_260)]">Confidence</span>
                    <div className="text-lg font-bold text-[oklch(0.95_0.01_260)]">
                      {decisionResult.confidence.toFixed(4)}
                    </div>
                  </div>
                  <div className="bg-[oklch(0.13_0.02_260)] p-3 rounded-lg">
                    <span className="text-xs text-[oklch(0.60_0.02_260)]">Total Latency</span>
                    <div className="text-lg font-bold text-[oklch(0.95_0.01_260)] flex items-center gap-1">
                      <Clock size={16} className="text-[oklch(0.75_0.18_160)]" />
                      <span>{decisionResult.total_latency_ms.toFixed(0)} ms</span>
                    </div>
                  </div>
                </div>

                {/* Animated Calibrated Probabilities */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-semibold text-[oklch(0.70_0.02_260)]">
                    Calibrated Probabilities
                  </h3>
                  {Object.entries(decisionResult.probabilities).map(([key, prob]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="capitalize">{key}</span>
                        <span className="font-mono font-bold">{(prob * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-[oklch(0.12_0.02_260)] rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${prob * 100}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className="bg-[oklch(0.75_0.18_160)] h-2 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* System 2 Deliberative Synthesis if present */}
              {decisionResult.system2_synthesis && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[oklch(0.16_0.02_260)] border border-[oklch(0.70_0.18_245/0.4)] rounded-xl p-6 shadow-xl space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-[oklch(0.70_0.18_245)]">
                    <Brain size={20} weight="fill" />
                    <span>System 2 Deliberation</span>
                  </div>
                  <div className="text-xs text-[oklch(0.85_0.02_260)] whitespace-pre-wrap leading-relaxed">
                    {decisionResult.system2_synthesis.explanation}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Right Column (7/12): Live Grounded Evidence & Attribution */}
            <div className="lg:col-span-7 bg-[oklch(0.16_0.02_260)] border border-[oklch(0.24_0.02_260)] rounded-xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[oklch(0.22_0.02_260)]">
                <h2 className="text-xs uppercase font-semibold tracking-wider text-[oklch(0.65_0.02_260)]">
                  Live Grounded Evidence & Attribution
                </h2>
                <span className="text-xs text-[oklch(0.60_0.02_260)]">
                  {decisionResult.sources.length} sources analyzed
                </span>
              </div>

              {decisionResult.sources.length === 0 ? (
                <div className="py-12 text-center text-xs text-[oklch(0.60_0.02_260)]">
                  No external search sources requested.
                </div>
              ) : (
                <div className="divide-y divide-[oklch(0.22_0.02_260)]">
                  {decisionResult.sources.map((src, i) => {
                    const isPositive = src.impact_points >= 0;
                    return (
                      <motion.div
                        key={src.source_text}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="py-3.5 flex items-start justify-between gap-4 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="text-[oklch(0.90_0.01_260)] font-medium leading-snug flex items-center gap-1.5">
                            <span>{src.source_text}</span>
                            <ArrowSquareOut
                              size={13}
                              className="text-[oklch(0.60_0.02_260)] shrink-0"
                            />
                          </p>
                        </div>
                        <div className="shrink-0">
                          <span
                            className={`font-mono font-bold px-2.5 py-1 rounded text-xs inline-block ${
                              isPositive
                                ? "bg-[oklch(0.75_0.18_160/0.15)] text-[oklch(0.75_0.18_160)]"
                                : "bg-[oklch(0.65_0.22_25/0.15)] text-[oklch(0.65_0.22_25)]"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {src.impact_points.toFixed(2)} pts
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Results: Compare Mode */}
        {activeTab === "compare" && comparisonResult && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Laya Card */}
              <div className="bg-[oklch(0.16_0.02_260)] border border-[oklch(0.75_0.18_160/0.4)] rounded-xl p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lightning size={22} className="text-[oklch(0.75_0.18_160)]" weight="fill" />
                    <h2 className="text-base font-bold text-[oklch(0.98_0.01_260)]">ConvAI Laya</h2>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded bg-[oklch(0.75_0.18_160/0.15)] text-[oklch(0.75_0.18_160)] font-semibold">
                    GPU Spot (Private VPC)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-[oklch(0.12_0.02_260)] p-4 rounded-lg">
                    <span className="text-xs text-[oklch(0.65_0.02_260)]">Choice</span>
                    <div className="text-3xl font-extrabold text-[oklch(0.75_0.18_160)]">
                      {comparisonResult.laya.choice?.toUpperCase() || "-"}
                    </div>
                  </div>
                  <div className="bg-[oklch(0.12_0.02_260)] p-4 rounded-lg">
                    <span className="text-xs text-[oklch(0.65_0.02_260)]">Latency</span>
                    <div className="text-2xl font-bold text-[oklch(0.98_0.01_260)]">
                      {comparisonResult.laya.latency_ms.toFixed(1)} ms
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="text-xs font-semibold text-[oklch(0.65_0.02_260)]">
                    Calibrated Probabilities
                  </span>
                  {Object.entries(comparisonResult.laya.probabilities).map(([k, v]) => (
                    <div key={k} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize">{k}</span>
                        <span className="font-mono font-bold">{(v * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-[oklch(0.12_0.02_260)] rounded-full h-1.5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${v * 100}%` }}
                          transition={{ duration: 0.5 }}
                          className="bg-[oklch(0.75_0.18_160)] h-1.5 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Jev Card */}
              <div className="bg-[oklch(0.16_0.02_260)] border border-[oklch(0.70_0.18_245/0.4)] rounded-xl p-6 space-y-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scales size={22} className="text-[oklch(0.70_0.18_245)]" weight="fill" />
                    <h2 className="text-base font-bold text-[oklch(0.98_0.01_260)]">
                      TypeSafe Jev
                    </h2>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded bg-[oklch(0.70_0.18_245/0.15)] text-[oklch(0.70_0.18_245)] font-semibold">
                    Multi-Tenant SaaS
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-[oklch(0.12_0.02_260)] p-4 rounded-lg">
                    <span className="text-xs text-[oklch(0.65_0.02_260)]">Choice</span>
                    <div className="text-3xl font-extrabold text-[oklch(0.70_0.18_245)]">
                      {comparisonResult.jev.choice?.toUpperCase() || "-"}
                    </div>
                  </div>
                  <div className="bg-[oklch(0.12_0.02_260)] p-4 rounded-lg">
                    <span className="text-xs text-[oklch(0.65_0.02_260)]">Latency</span>
                    <div className="text-2xl font-bold text-[oklch(0.98_0.01_260)]">
                      {comparisonResult.jev.latency_ms.toFixed(1)} ms
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <span className="text-xs font-semibold text-[oklch(0.65_0.02_260)]">
                    Calibrated Probabilities
                  </span>
                  {Object.entries(comparisonResult.jev.probabilities).map(([k, v]) => (
                    <div key={k} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize">{k}</span>
                        <span className="font-mono font-bold">{(v * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-[oklch(0.12_0.02_260)] rounded-full h-1.5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${v * 100}%` }}
                          transition={{ duration: 0.5 }}
                          className="bg-[oklch(0.70_0.18_245)] h-1.5 rounded-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Benchmark Table */}
            <div className="bg-[oklch(0.16_0.02_260)] border border-[oklch(0.24_0.02_260)] rounded-xl p-6 shadow-xl">
              <h2 className="text-sm font-semibold mb-4 text-[oklch(0.92_0.01_260)]">
                Benchmark Comparison
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[oklch(0.22_0.02_260)] text-[oklch(0.65_0.02_260)]">
                      <th className="pb-3 font-semibold">Evaluation Metric</th>
                      <th className="pb-3 font-semibold">ConvAI Laya</th>
                      <th className="pb-3 font-semibold">TypeSafe Jev</th>
                      <th className="pb-3 font-semibold">Consensus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[oklch(0.20_0.02_260)]">
                    <tr>
                      <td className="py-3 font-medium">Consensus Decision</td>
                      <td className="py-3 font-bold text-[oklch(0.75_0.18_160)]">
                        {comparisonResult.laya.choice?.toUpperCase()}
                      </td>
                      <td className="py-3 font-bold text-[oklch(0.70_0.18_245)]">
                        {comparisonResult.jev.choice?.toUpperCase()}
                      </td>
                      <td className="py-3">
                        {comparisonResult.agreement ? (
                          <span className="inline-flex items-center gap-1 text-[oklch(0.75_0.18_160)] font-bold">
                            <CheckCircle size={14} weight="fill" />
                            <span>MATCH</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[oklch(0.65_0.22_25)] font-bold">
                            <WarningCircle size={14} weight="fill" />
                            <span>DIVERGENCE</span>
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium">Inference Latency</td>
                      <td className="py-3">{comparisonResult.laya.latency_ms.toFixed(1)} ms</td>
                      <td className="py-3">{comparisonResult.jev.latency_ms.toFixed(1)} ms</td>
                      <td className="py-3 font-mono">
                        {comparisonResult.speedup_factor.toFixed(1)}x speedup
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium">Confidence Score</td>
                      <td className="py-3">{comparisonResult.laya.confidence.toFixed(4)}</td>
                      <td className="py-3">{comparisonResult.jev.confidence.toFixed(4)}</td>
                      <td className="py-3">-</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-medium">Pricing Model</td>
                      <td className="py-3">$0.28 / hour (unlimited)</td>
                      <td className="py-3">$0.0005 / decision</td>
                      <td className="py-3 text-[oklch(0.75_0.18_160)]">95% savings at volume</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}

export default App;
