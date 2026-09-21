import { useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

/** Vertical pointer travel, in pixels, for a full 0..1 sweep. */
const DRAG_RANGE_PX = 150;
const FINE_DRAG_RANGE_PX = 600;
const TICK_COUNT = 11;
const MIN_ANGLE = -135;
const ANGLE_SWEEP = 270;

const TICKS = Array.from({ length: TICK_COUNT }, (_, index) => {
  return MIN_ANGLE + (index * ANGLE_SWEEP) / (TICK_COUNT - 1);
});

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type RotaryKnobProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  /** Renders the value for the readout and `aria-valuetext`. */
  format: (value: number) => string;
  /** Keyboard increment as a fraction of the full sweep. */
  stepNormalized?: number;
  /** Keyboard increment with Shift or Page keys, as a fraction of the sweep. */
  coarseStepNormalized?: number;
  /** Value -> 0..1. Defaults to a linear mapping; pass a log mapping for Hz. */
  toNormalized?: (value: number) => number;
  /** 0..1 -> value. Must be the inverse of `toNormalized`. */
  fromNormalized?: (normalized: number) => number;
  /** Quantizes committed values, e.g. `Math.round` for whole BPM. */
  round?: (value: number) => number;
  size?: "md" | "sm";
  disabled?: boolean;
};

/**
 * Accessible rotary control drawn entirely with CSS. The knob is generic: any
 * non-linear feel (logarithmic frequency, tempo) is supplied by the caller
 * through `toNormalized` / `fromNormalized`.
 */
export function RotaryKnob({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  format,
  stepNormalized = 0.01,
  coarseStepNormalized = 0.1,
  toNormalized,
  fromNormalized,
  round,
  size = "md",
  disabled = false,
}: RotaryKnobProps) {
  const labelId = useId();
  const [interacting, setInteracting] = useState(false);
  const dragRef = useRef<{ pointerId: number; startY: number; startNormalized: number } | null>(
    null,
  );

  const normalize = toNormalized ?? ((raw: number) => (raw - min) / (max - min));
  const denormalize = fromNormalized ?? ((raw: number) => min + raw * (max - min));

  const normalized = clamp01(normalize(value));
  const angle = MIN_ANGLE + normalized * ANGLE_SWEEP;
  const readout = format(value);

  function commit(next: number): void {
    const rounded = round ? round(next) : next;
    const clamped = Math.min(max, Math.max(min, rounded));
    if (clamped !== value) onChange(clamped);
  }

  function commitNormalized(next: number): void {
    commit(denormalize(clamp01(next)));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startNormalized: normalized,
    };
    setInteracting(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const range = event.shiftKey ? FINE_DRAG_RANGE_PX : DRAG_RANGE_PX;
    const delta = (drag.startY - event.clientY) / range;
    commitNormalized(drag.startNormalized + delta);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setInteracting(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (disabled) return;
    const increment = event.shiftKey ? coarseStepNormalized : stepNormalized;

    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        commitNormalized(normalized + increment);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        commitNormalized(normalized - increment);
        break;
      case "PageUp":
        commitNormalized(normalized + coarseStepNormalized);
        break;
      case "PageDown":
        commitNormalized(normalized - coarseStepNormalized);
        break;
      case "Home":
        commit(min);
        break;
      case "End":
        commit(max);
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  return (
    <div className={`knob knob--${size}${disabled ? " is-disabled" : ""}`}>
      <span className="knob__label" id={labelId}>
        {label}
      </span>
      <div
        className={`knob__dial${interacting ? " is-active" : ""}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={readout}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => {
          if (!disabled) commit(defaultValue);
        }}
      >
        <span className="knob__ticks" aria-hidden="true">
          {TICKS.map((tickAngle) => (
            <span
              key={tickAngle}
              className="knob__tick"
              style={{ transform: `rotate(${tickAngle}deg)` }}
            />
          ))}
        </span>
        {/* Static recess the knob sits in. */}
        <span className="knob__well" aria-hidden="true" />
        {/* The physical knob: skirt, cap and pointer turn together. */}
        <span
          className="knob__body"
          aria-hidden="true"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <span className="knob__grip" />
          <span className="knob__cap" />
          <span className="knob__indicator" />
        </span>
        {/* Specular highlight: fixed light source, so it must not rotate. */}
        <span className="knob__gloss" aria-hidden="true" />
      </div>
      <output className="knob__readout">{readout}</output>
    </div>
  );
}
