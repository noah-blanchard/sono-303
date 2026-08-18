import { useRef } from "react";
import type { KeyboardEvent } from "react";
import type { DistortionMode } from "../sequencer/types";

const MODES: { value: DistortionMode; label: string }[] = [
  { value: "classic", label: "CLASSIC" },
  { value: "turbo", label: "TURBO" },
  { value: "overdrive", label: "O-DRIVE" },
  { value: "bypass", label: "BYPASS" },
];

export type DistortionModeSelectorProps = {
  mode: DistortionMode;
  onChange: (mode: DistortionMode) => void;
};

/**
 * The DISTORTION TYPE row: four mechanical buttons behaving as one exclusive
 * group, so two voicings can never be lit at once.
 *
 * Implemented as a radiogroup with a roving tabindex — one Tab stop for the
 * whole row, arrows to move between voicings — which is how a hardware
 * selector actually behaves.
 */
export function DistortionModeSelector({
  mode,
  onChange,
}: DistortionModeSelectorProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  function focusMode(next: DistortionMode): void {
    onChange(next);
    const button = rowRef.current?.querySelector<HTMLButtonElement>(
      `[data-mode="${next}"]`,
    );
    button?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = MODES.findIndex((option) => option.value === mode);
    let next: number;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % MODES.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + MODES.length) % MODES.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = MODES.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    focusMode(MODES[next].value);
  }

  return (
    <div
      className="dist-modes"
      role="radiogroup"
      aria-labelledby="dist-type-label"
      ref={rowRef}
      onKeyDown={handleKeyDown}
    >
      {MODES.map((option) => {
        const selected = option.value === mode;
        return (
          <div className="dist-mode" key={option.value}>
            <span className="dist-mode__label" id={`dist-mode-${option.value}`}>
              {option.label}
            </span>
            <span
              className={`led led--small${selected ? " is-on" : ""}`}
              aria-hidden="true"
            />
            <button
              type="button"
              className={`panel-button dist-mode__button${selected ? " is-selected" : ""}`}
              data-mode={option.value}
              role="radio"
              aria-checked={selected}
              aria-labelledby={`dist-mode-${option.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
