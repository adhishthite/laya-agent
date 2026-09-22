import { ArrowClockwise } from "@phosphor-icons/react";
import { Arc } from "loading-dev";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { probeLaya } from "../lib/api";
import type { LayaProbe, ProbeState } from "../lib/types";

/** Each label names the link that broke, not a generic health word. */
const LABEL: Record<ProbeState, string> = {
  ready: "Ready",
  backend_down: "GPU offline",
  auth: "Auth failed",
  error: "Unreachable",
};

const DOT: Record<ProbeState, string> = {
  ready: "bg-fast",
  backend_down: "bg-alert",
  auth: "bg-alert",
  error: "bg-alert",
};

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint || "not configured";
  }
}

/**
 * Live reachability for the decision chain: token, proxy, VPC egress, GPU VM.
 *
 * A stopped Spot VM drops packets instead of refusing them, so nothing upstream
 * fails fast. Without this control the first sign of trouble is a Run that hangs
 * and then reports a socket error.
 */
export function BackendStatus() {
  const [probe, setProbe] = useState<LayaProbe | null>(null);
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setProbe(await probeLaya());
    } catch (e) {
      setProbe({
        state: "error",
        endpoint: "",
        http_status: null,
        latency_ms: 0,
        detail: e instanceof Error ? e.message : "The bench backend did not answer.",
      });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Opening is itself a request for fresh information, so it re-probes.
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void check();
  }

  const label = checking ? "Checking" : probe ? LABEL[probe.state] : "Backend";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-rule-strong bg-panel px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
      >
        {checking ? (
          <Arc size={12} cap="round" className="text-ink-faint" />
        ) : (
          <span className={`size-2 rounded-full ${probe ? DOT[probe.state] : "bg-ink-faint"}`} />
        )}

        {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-[calc(100%+10px)] z-30 w-[23rem] rounded-xl border border-rule-strong bg-panel p-4 shadow-panel"
          >
            {probe && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
                <Row label="proxy" value={hostOf(probe.endpoint)} title={probe.endpoint} />
                <Row label="http" value={probe.http_status?.toString() ?? "no response"} />
                <Row label="latency" value={`${Math.round(probe.latency_ms)} ms`} />
              </dl>
            )}

            {probe?.detail && (
              <p className="mt-3 border-t border-rule pt-3 text-[13px] leading-relaxed text-ink-soft">
                {probe.detail}
              </p>
            )}

            <button
              type="button"
              onClick={() => void check()}
              disabled={checking}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-rule-strong px-2.5 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
            >
              <ArrowClockwise size={13} weight="bold" className={checking ? "animate-spin" : ""} />
              Check again
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <>
      <dt className="font-mono text-[11px] leading-5 text-ink-faint">{label}</dt>
      <dd className="tnum truncate text-[13px] leading-5 text-ink" title={title ?? value}>
        {value}
      </dd>
    </>
  );
}
