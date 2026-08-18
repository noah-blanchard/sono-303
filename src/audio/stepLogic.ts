import { midiToFrequency, stepToMidi } from "../sequencer/pitch";
import type { Step, SynthParameters } from "../sequencer/types";

/**
 * Pure musical decision logic for the sound engine (spec §9.1).
 *
 * Everything here is framework-free and Web-Audio-free so it can be unit
 * tested without an AudioContext. The engine translates the returned events
 * into Tone.js calls; nothing else may.
 */

/** What the engine must do for one scheduled step. */
export type StepEvent =
  | {
      /** Current step is a rest: release any held note. */
      kind: "rest";
      frequency: null;
      velocity: 0;
      releaseAfter: null;
      portamento: 0;
    }
  | {
      /** Fresh note: triggerAttack with the computed accent velocity. */
      kind: "trigger";
      frequency: number;
      velocity: number;
      /** Seconds after the step start at which the note releases. */
      releaseAfter: number;
      portamento: 0;
    }
  | {
      /** Entered through a valid slide: setNote only, no retrigger. */
      kind: "slideIn";
      frequency: number;
      velocity: 0;
      /** Null while the slide chain continues; 80% of the step when it ends. */
      releaseAfter: number | null;
      /** Glide time in seconds: 60% of the step duration. */
      portamento: number;
    };

/** Duration of one sixteenth-note step in seconds. */
export function stepDurationSeconds(tempoBpm: number): number {
  return 60 / tempoBpm / 4;
}

/** Velocity for a triggered note: accent adds up to +0.35 (spec §4 ACCENT). */
export function stepVelocity(step: Step, accentAmount: number): number {
  const normalVelocity = 0.65;
  return step.accent ? normalVelocity + accentAmount * 0.35 : normalVelocity;
}

/**
 * True when `prev` legitimately slides into `cur`: the previous step is an
 * active note flagged for slide AND the current step is also active. A slide
 * before a rest is ignored (spec §8).
 */
export function isSlideInto(prev: Step, cur: Step): boolean {
  return prev.active && prev.slide && cur.active;
}

/**
 * Computes the engine action for one step from its musical context.
 *
 * @param prev         Step at (index - 1) mod 16.
 * @param cur          Step being scheduled.
 * @param next         Step at (index + 1) mod 16.
 * @param params       Current global parameters (accent, transpose, tempo).
 * @param stepDuration Seconds per step, from `stepDurationSeconds`.
 */
export function computeStepEvent(
  prev: Step,
  cur: Step,
  next: Step,
  params: Pick<
    SynthParameters,
    "accentAmount" | "transposeSemitones"
  >,
  stepDuration: number,
): StepEvent {
  // Rule 2: a rest releases any held note.
  if (!cur.active) {
    return {
      kind: "rest",
      frequency: null,
      velocity: 0,
      releaseAfter: null,
      portamento: 0,
    };
  }

  // Rule 3: final pitch = stored note + octave + global transpose.
  const frequency = midiToFrequency(
    stepToMidi(cur, params.transposeSemitones),
  );

  // Rules 7–9: hold the gate only while sliding into the next active step.
  const holdsIntoNext = isSlideInto(cur, next);
  const releaseAfter = holdsIntoNext ? null : stepDuration * 0.8;

  // Rules 4–5: entering through a valid slide glides without retriggering.
  if (isSlideInto(prev, cur)) {
    return {
      kind: "slideIn",
      frequency,
      velocity: 0,
      releaseAfter,
      portamento: stepDuration * 0.6,
    };
  }

  // Rule 6: otherwise trigger a fresh note with the accent velocity.
  return {
    kind: "trigger",
    frequency,
    velocity: stepVelocity(cur, params.accentAmount),
    releaseAfter: releaseAfter ?? stepDuration * 0.8,
    portamento: 0,
  };
}
