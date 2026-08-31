import { stepToNoteName } from "../sequencer/pitch";
import type { Step } from "../sequencer/types";

export type StepButtonProps = {
  index: number;
  step: Step;
  selected: boolean;
  playing: boolean;
  /** True in PLAY mode, where the pattern is not being edited. */
  disabled: boolean;
  onSelect: (index: number) => void;
};

function describe(step: Step, number: number): string {
  const parts = [`Step ${number}`, step.active ? stepToNoteName(step) : "rest"];
  if (step.accent) parts.push("accent");
  if (step.slide) parts.push("slide");
  return parts.join(", ");
}

/**
 * One sequencer step. The button is always the same neutral silver control:
 * selection is a dark outline, the playhead is a separate red illumination,
 * and `A` / `S` below it are read-only status letters.
 */
export function StepButton({
  index,
  step,
  selected,
  playing,
  disabled,
  onSelect,
}: StepButtonProps) {
  const number = index + 1;
  const classes = [
    "step__button",
    selected ? "is-selected" : "",
    playing ? "is-playing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="step">
      <span className="step__number" aria-hidden="true">
        {number}
      </span>
      <button
        type="button"
        className={classes}
        aria-pressed={selected}
        aria-label={describe(step, number)}
        disabled={disabled}
        onClick={() => onSelect(index)}
      >
        <span className="step__playhead" aria-hidden="true" />
      </button>
      <span
        className={`step__dot${step.active ? " is-on" : ""}`}
        aria-hidden="true"
      />
      <span className="step__flags" aria-hidden="true">
        {step.accent ? "A" : ""}
        {step.accent && step.slide ? " " : ""}
        {step.slide ? "S" : ""}
      </span>
    </div>
  );
}
