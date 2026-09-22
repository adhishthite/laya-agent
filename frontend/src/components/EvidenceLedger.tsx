import { motion } from "motion/react";
import type { SourceContribution } from "../lib/types";

interface EvidenceLedgerProps {
  sources: SourceContribution[];
  evidence?: string[];
  searchEnabled?: boolean;
}

interface ParsedSource {
  title: string;
  host: string | null;
  href: string | null;
}

/** Grounding redirects all resolve to this host, so it carries no information. */
const OPAQUE_HOSTS = new Set(["vertexaisearch.cloud.google.com"]);

function parseSource(raw: string): ParsedSource {
  const split = raw.lastIndexOf(" — ");
  if (split < 0) return { title: raw, host: null, href: null };

  const title = raw.slice(0, split).trim();
  const tail = raw.slice(split + 3).trim();

  let host: string | null = null;
  let href: string | null = null;
  try {
    const url = new URL(tail);
    href = url.toString();
    host = url.hostname.replace(/^www\./, "");
  } catch {
    return { title, host: tail || null, href: null };
  }

  // Hide the host when it is a redirect shim or just repeats the title.
  if (OPAQUE_HOSTS.has(host) || host === title.replace(/^www\./, "")) host = null;

  return { title, host, href };
}

/**
 * Diverging bars around a zero baseline. Sources that push the verdict forward
 * extend right; sources that pull against it extend left. Reading the shape of
 * the column tells you how contested the answer was.
 */
export function EvidenceLedger({
  sources,
  evidence = [],
  searchEnabled = true,
}: EvidenceLedgerProps) {
  if (sources.length === 0) {
    let reason: string;
    if (!searchEnabled) {
      reason = "Web grounding was off, so the model answered from priors alone.";
    } else if (evidence.length === 0) {
      reason = "Web grounding returned no results for this question.";
    } else {
      reason = `${evidence.length} sources retrieved. Turn on attribution to weigh them.`;
    }

    return (
      <div className="px-7 py-14 text-center">
        <p className="mx-auto max-w-sm text-sm text-ink-faint">{reason}</p>
      </div>
    );
  }

  const peak = Math.max(...sources.map((s) => Math.abs(s.impact_points)), 1);
  // Half the width is reserved for opposing bars only when something opposes.
  const diverging = sources.some((s) => s.impact_points < 0);

  return (
    <div>
      <div className="relative">
        {diverging && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-rule-strong" />
        )}

        <ul className="divide-y divide-rule">
          {sources.map((source, i) => {
            const { title, host, href } = parseSource(source.source_text);
            const positive = source.impact_points >= 0;
            const ratio = Math.abs(source.impact_points) / peak;
            const magnitude = diverging ? ratio * 50 : ratio * 100;

            return (
              <motion.li
                key={source.source_text}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
                className="px-7 py-4"
              >
                <div className="flex items-baseline justify-between gap-4">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={title}
                      className="truncate text-sm text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                    >
                      {title}
                    </a>
                  ) : (
                    <p className="truncate text-sm text-ink" title={title}>
                      {title}
                    </p>
                  )}
                  <span
                    className={`tnum shrink-0 text-sm font-semibold ${
                      positive ? "text-fast" : "text-alert"
                    }`}
                  >
                    {positive ? "+" : "−"}
                    {Math.abs(source.impact_points).toFixed(2)}
                  </span>
                </div>

                {host && <p className="mt-0.5 truncate text-xs text-ink-faint">{host}</p>}

                <div className="relative mt-2.5 h-1.5 rounded-full bg-sunken">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${magnitude}%` }}
                    transition={{ duration: 0.5, delay: 0.15 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    className={`absolute top-0 h-1.5 rounded-full ${
                      !diverging
                        ? "left-0 bg-fast"
                        : positive
                          ? "left-1/2 bg-fast"
                          : "right-1/2 bg-alert"
                    }`}
                  />
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>

      {diverging && (
        <div className="flex justify-between border-t border-rule px-7 py-3">
          <span className="text-xs text-ink-faint">pulls against</span>
          <span className="text-xs text-ink-faint">supports verdict</span>
        </div>
      )}
    </div>
  );
}
