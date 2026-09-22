import { motion } from "motion/react";

interface ProbabilityTrackProps {
  probabilities: Record<string, number>;
  winner?: string;
  tone?: "fast" | "slow";
  height?: number;
}

const TONE = {
  fast: { lead: "bg-fast", rest: "bg-rule-strong" },
  slow: { lead: "bg-slow", rest: "bg-rule-strong" },
} as const;

/**
 * A single segmented track showing the full outcome distribution.
 * The winning slice carries the signal colour; remaining slices stay neutral
 * so the reader's eye lands on the decision, not the decoration.
 */
export function ProbabilityTrack({
  probabilities,
  winner,
  tone = "fast",
  height = 10,
}: ProbabilityTrackProps) {
  const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const lead = winner ?? entries[0]?.[0];
  const palette = TONE[tone];

  return (
    <div className="space-y-2.5">
      <div className="flex w-full overflow-hidden rounded-full bg-sunken" style={{ height }}>
        {entries.map(([key, value], i) => (
          <motion.div
            key={key}
            initial={{ width: 0 }}
            animate={{ width: `${value * 100}%` }}
            transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className={`${key === lead ? palette.lead : palette.rest} ${
              i > 0 ? "border-l-2 border-panel" : ""
            }`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${key === lead ? palette.lead : "bg-rule-strong"}`}
            />
            <span
              className={`text-[13px] ${key === lead ? "font-semibold text-ink" : "text-ink-soft"}`}
            >
              {key}
            </span>
            <span className="tnum text-[13px] text-ink-soft">{(value * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
