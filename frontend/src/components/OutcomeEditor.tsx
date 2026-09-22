import { Plus, X } from "@phosphor-icons/react";
import type { Outcome } from "../lib/types";

interface OutcomeEditorProps {
  outcomes: Outcome[];
  onChange: (next: Outcome[]) => void;
}

const MIN_OUTCOMES = 2;

/**
 * The outcomes are the ballot the model votes on. Each token pairs the answer
 * the model returns with the condition a reader understands, so the colon and
 * comma syntax the API wants never reaches the screen.
 */
export function OutcomeEditor({ outcomes, onChange }: OutcomeEditorProps) {
  const keys = outcomes.map((o) => o.key.trim());

  function update(index: number, patch: Partial<Outcome>) {
    onChange(outcomes.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function remove(index: number) {
    onChange(outcomes.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...outcomes, { key: "", description: "" }]);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {outcomes.map((outcome, i) => {
        const key = outcome.key.trim();
        const duplicate = key !== "" && keys.filter((k) => k === key).length > 1;
        const invalid = key === "" || duplicate;

        return (
          <div
            // Index is the identity here: keys are user-editable and may collide.
            // biome-ignore lint/suspicious/noArrayIndexKey: outcome keys are not stable
            key={i}
            className={`group flex items-stretch overflow-hidden rounded-lg border bg-panel transition-colors focus-within:border-ink ${
              invalid ? "border-alert" : "border-rule-strong"
            }`}
          >
            <input
              value={outcome.key}
              onChange={(e) => update(i, { key: e.target.value })}
              spellCheck={false}
              aria-label={`Outcome ${i + 1} answer`}
              placeholder="answer"
              size={Math.max(outcome.key.length || 6, 4)}
              className="field-sizing-content min-w-14 bg-transparent py-1.5 pl-3 pr-2 font-mono text-[13px] font-medium text-ink placeholder:text-ink-faint focus:outline-none"
            />

            <span className="my-1.5 w-px shrink-0 bg-rule" />

            <input
              value={outcome.description}
              onChange={(e) => update(i, { description: e.target.value })}
              aria-label={`Outcome ${i + 1} condition`}
              placeholder="when this is true"
              size={Math.max(outcome.description.length || 16, 12)}
              className="field-sizing-content min-w-32 bg-transparent py-1.5 pl-2.5 pr-1 text-[13px] text-ink-soft placeholder:text-ink-faint focus:text-ink focus:outline-none"
            />

            <button
              type="button"
              onClick={() => remove(i)}
              disabled={outcomes.length <= MIN_OUTCOMES}
              aria-label={`Remove outcome ${outcome.key || i + 1}`}
              className="flex w-7 items-center justify-center text-ink-faint opacity-0 transition-opacity hover:text-alert focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-rule-strong px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
      >
        <Plus size={13} weight="bold" />
        Add outcome
      </button>
    </div>
  );
}
