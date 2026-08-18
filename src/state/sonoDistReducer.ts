import { clamp01 } from "../sequencer/distortionMapping";
import type {
  DistortionMode,
  Sono303Action,
  SonoDistState,
} from "../sequencer/types";

const MODES: DistortionMode[] = ["classic", "turbo", "overdrive", "bypass"];

function isDistortionMode(value: unknown): value is DistortionMode {
  return MODES.includes(value as DistortionMode);
}

/** Coerces one knob value, leaving the state untouched if nothing changes. */
function setKnob(
  state: SonoDistState,
  key: "drive" | "tone" | "level",
  value: number,
): SonoDistState {
  if (!Number.isFinite(value)) return state;
  const next = clamp01(value);
  if (next === state[key]) return state;
  return { ...state, [key]: next };
}

/**
 * Pure sub-reducer for SONO-DIST, composed into `sono303Reducer`.
 *
 * Like the rest of the state it is fully serializable and holds no derived
 * flags: whether the module is "active" is computed from `mode` and the patch
 * cable at render time, so the two can never disagree. Knob values survive a
 * trip through BYPASS untouched — that is what makes re-engaging a mode
 * instant.
 */
export function sonoDistReducer(
  state: SonoDistState,
  action: Sono303Action,
): SonoDistState {
  switch (action.type) {
    case "dist/setMode":
      if (!isDistortionMode(action.mode) || action.mode === state.mode) {
        return state;
      }
      return { ...state, mode: action.mode };

    case "dist/setDrive":
      return setKnob(state, "drive", action.value);

    case "dist/setTone":
      return setKnob(state, "tone", action.value);

    case "dist/setLevel":
      return setKnob(state, "level", action.value);

    default:
      return state;
  }
}
