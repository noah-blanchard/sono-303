import type { Ref } from "react";

export type JackSocketProps = {
  label: string;
  /** Accessible description of what toggling this socket does. */
  actionLabel: string;
  connected: boolean;
  onToggle: () => void;
  ref?: Ref<HTMLButtonElement>;
  /** Right-hand socket on the 303, left-hand socket on the module. */
  side: "out" | "in";
};

/**
 * A quarter-inch jack socket on a panel edge.
 *
 * It is a real button, not just a drag target: dragging the plug is the
 * tactile path, but click, Enter and Space have to work too, or the patch
 * cable would be unusable by keyboard and awkward on touch.
 */
export function JackSocket({
  label,
  actionLabel,
  connected,
  onToggle,
  ref,
  side,
}: JackSocketProps) {
  return (
    <div className={`jack jack--${side}`}>
      <span className="jack__label" aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        ref={ref}
        className={`jack__socket${connected ? " is-connected" : ""}`}
        aria-pressed={connected}
        aria-label={actionLabel}
        onClick={onToggle}
      >
        <span className="jack__ring" aria-hidden="true" />
        <span className="jack__hole" aria-hidden="true" />
      </button>
    </div>
  );
}
