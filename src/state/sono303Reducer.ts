import {
  MAX_OCTAVE,
  MAX_PITCH_OCTAVE,
  MIN_OCTAVE,
  STEP_COUNT,
  parameterRanges,
} from "../sequencer/defaults";
import type {
  Sono303Action,
  Sono303State,
  Step,
  SynthParameters,
  Waveform,
} from "../sequencer/types";
import { sonoDistReducer } from "./sonoDistReducer";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isWaveform(value: unknown): value is Waveform {
  return value === "sawtooth" || value === "square";
}

/**
 * Coerces one incoming parameter value into its legal range. Unknown or
 * malformed values leave the current parameters untouched.
 */
function applyParameter(
  parameters: SynthParameters,
  key: keyof SynthParameters,
  value: number | string,
): SynthParameters {
  if (key === "waveform") {
    if (!isWaveform(value) || value === parameters.waveform) return parameters;
    return { ...parameters, waveform: value };
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return parameters;

  const range = parameterRanges[key];
  let next = clamp(numeric, range.min, range.max);
  if (key === "transposeSemitones") next = Math.round(next);
  if (next === parameters[key]) return parameters;

  return { ...parameters, [key]: next };
}

/** Replaces the step at `index` with the result of `update`. */
function updateStep(
  state: Sono303State,
  index: number,
  update: (step: Step) => Step,
): Sono303State {
  const current = state.steps[index];
  const next = update(current);
  if (next === current) return state;

  const steps = state.steps.slice();
  steps[index] = next;
  return { ...state, steps };
}

/**
 * Leaves the keyboard window alone while the given pitch is one of the two
 * octaves on screen, and re-centres on that pitch otherwise. Only selecting a
 * different step moves the window this way — picking a key never does.
 */
function windowFor(octave: number, current: number): number {
  const onScreen = octave === current || octave === current + 1;
  return onScreen ? current : clamp(octave, MIN_OCTAVE, MAX_OCTAVE);
}

/**
 * Pure application reducer. It never performs audio work and never stores
 * anything non-serializable; it is the single owner of the state invariants
 * documented in docs/ARCHITECTURE.md.
 */
export function sono303Reducer(
  state: Sono303State,
  action: Sono303Action,
): Sono303State {
  switch (action.type) {
    case "transport/toggle": {
      const started = state.transport === "started";
      return {
        ...state,
        transport: started ? "stopped" : "started",
        currentStep: started ? null : state.currentStep,
      };
    }

    // Idempotent, like the engine's own `stop()`: an already-stopped transport
    // returns the identical object, so the effects watching it never re-fire.
    case "transport/stop":
      return state.transport === "stopped"
        ? state
        : { ...state, transport: "stopped", currentStep: null };

    case "transport/setCurrentStep": {
      const { stepIndex } = action;
      if (stepIndex === null) {
        return state.currentStep === null ? state : { ...state, currentStep: null };
      }
      if (!Number.isFinite(stepIndex)) return state;
      const currentStep = clamp(Math.trunc(stepIndex), 0, STEP_COUNT - 1);
      return currentStep === state.currentStep ? state : { ...state, currentStep };
    }

    case "mode/set": {
      if (action.mode === state.mode) return state;
      // PLAY turns the box into a live instrument, so the sequencer has no
      // business running: entering it stops the transport and clears the
      // playhead. Entering WRITE never touches the transport.
      if (action.mode === "play") {
        return { ...state, mode: "play", transport: "stopped", currentStep: null };
      }
      return { ...state, mode: action.mode };
    }

    case "parameter/set": {
      const parameters = applyParameter(state.parameters, action.key, action.value);
      return parameters === state.parameters ? state : { ...state, parameters };
    }

    case "step/select": {
      if (!Number.isFinite(action.stepIndex)) return state;
      const selectedStep = clamp(Math.trunc(action.stepIndex), 0, STEP_COUNT - 1);
      if (selectedStep === state.selectedStep) return state;
      return {
        ...state,
        selectedStep,
        keyboardOctave: windowFor(
          state.steps[selectedStep].octave,
          state.keyboardOctave,
        ),
      };
    }

    case "step/setPitch":
      // Deliberately leaves keyboardOctave alone: picking a key must never
      // slide the keyboard out from under the pointer.
      return updateStep(state, state.selectedStep, (step) => {
        const octave =
          typeof action.octave === "number"
            ? clamp(Math.trunc(action.octave), MIN_OCTAVE, MAX_PITCH_OCTAVE)
            : step.octave;
        // `accent` only ever forces the flag on (a hard MIDI hit). Leaving it
        // out preserves whatever the step already carried.
        const accent = action.accent === true ? true : step.accent;
        return { ...step, note: action.note, octave, accent, active: true };
      });

    case "step/setRest":
      return updateStep(state, state.selectedStep, (step) =>
        action.rest
          ? { ...step, active: false, accent: false, slide: false }
          : { ...step, active: true },
      );

    case "step/advance":
      // Deliberately leaves keyboardOctave alone, for the same reason
      // `step/setPitch` does: this fires between two key presses while the
      // user is filling the pattern, and the keyboard must not slide out from
      // under their finger. Only an explicit `step/select` re-centres it.
      return {
        ...state,
        selectedStep: (state.selectedStep + 1) % STEP_COUNT,
      };

    case "step/changeOctave": {
      // OCT −/+ moves the window and carries the selected step along, so the
      // note keeps its row. Window and pitch clamp separately, which lets the
      // pitch still reach octave 1 or 6 once the window has hit its end.
      const keyboardOctave = clamp(
        state.keyboardOctave + action.delta,
        MIN_OCTAVE,
        MAX_OCTAVE,
      );
      // In PLAY there is no step being edited — OCT only transposes the
      // playable range, and the pattern must come out untouched.
      if (state.mode === "play") {
        return keyboardOctave === state.keyboardOctave
          ? state
          : { ...state, keyboardOctave };
      }
      const next = updateStep(state, state.selectedStep, (step) => {
        const octave = clamp(
          step.octave + action.delta,
          MIN_OCTAVE,
          MAX_PITCH_OCTAVE,
        );
        return octave === step.octave ? step : { ...step, octave };
      });
      return keyboardOctave === state.keyboardOctave
        ? next
        : { ...next, keyboardOctave };
    }

    case "step/toggleAccent":
      return updateStep(state, state.selectedStep, (step) =>
        step.active ? { ...step, accent: !step.accent } : step,
      );

    case "step/toggleSlide":
      return updateStep(state, state.selectedStep, (step) =>
        step.active ? { ...step, slide: !step.slide } : step,
      );

    case "ui/toggleKeyHints":
      return { ...state, keyHintsVisible: !state.keyHintsVisible };

    case "notes/setHeld": {
      const isHeld = state.heldNotes.includes(action.midi);
      if (isHeld === action.held) return state;
      return {
        ...state,
        heldNotes: action.held
          ? [...state.heldNotes, action.midi]
          : state.heldNotes.filter((midi) => midi !== action.midi),
      };
    }

    case "notes/releaseAll":
      return state.heldNotes.length === 0 ? state : { ...state, heldNotes: [] };

    case "patch/set":
      return action.patched === state.patched
        ? state
        : { ...state, patched: action.patched };

    case "dist/setMode":
    case "dist/setDrive":
    case "dist/setTone":
    case "dist/setLevel": {
      const dist = sonoDistReducer(state.dist, action);
      return dist === state.dist ? state : { ...state, dist };
    }

    // One field and one action, so no sub-reducer: `sonoDistReducer` earns its
    // own file because SONO-DIST has four fields and mode logic to enforce.
    case "tape/setBars":
      return action.bars === state.tape.bars
        ? state
        : { ...state, tape: { bars: action.bars } };

    default:
      return state;
  }
}
