import {
  MAX_OCTAVE,
  MAX_PITCH_OCTAVE,
  MIN_OCTAVE,
} from "../sequencer/defaults";
import type { PitchClass } from "../sequencer/types";
import {
  useAuditionNote,
  useSono303Dispatch,
  useSono303State,
} from "../state/hooks";
import { MiniKeyboard } from "./MiniKeyboard";

/**
 * Zone 4: every edit applies to the selected step only. All controls are
 * disabled in PLAY mode; accent and slide are additionally disabled while the
 * step is a rest.
 */
export function StepEditor() {
  const { steps, selectedStep, keyboardOctave, mode } = useSono303State();
  const dispatch = useSono303Dispatch();
  const auditionNote = useAuditionNote();

  const step = steps[selectedStep];
  const locked = mode === "play";
  const flagsLocked = locked || !step.active;
  // OCT −/+ moves the window and the pitch together, so it stays useful until
  // both have hit the same end.
  const canLower = keyboardOctave > MIN_OCTAVE || step.octave > MIN_OCTAVE;
  const canRaise =
    keyboardOctave < MAX_OCTAVE || step.octave < MAX_PITCH_OCTAVE;

  /**
   * Writing a note is one gesture: hear it, store it, move to the next step.
   *
   * Advancing is what turns pattern entry into a run of key presses instead of
   * alternating between the keyboard and the step grid. The keyboard window
   * deliberately stays put while this happens.
   */
  function writeNote(note: PitchClass, octave: number): void {
    auditionNote(note, octave);
    dispatch({ type: "step/setPitch", note, octave });
    dispatch({ type: "step/advance" });
  }

  return (
    <section
      className={`zone zone--editor${locked ? " is-locked" : ""}`}
      aria-label="Selected step editor"
    >
      <MiniKeyboard
        note={step.note}
        octave={step.octave}
        baseOctave={keyboardOctave}
        disabled={locked}
        onSelect={writeNote}
      />

      <div className="editor-controls">
        <div className="editor-control">
          <span className="control-label" id="rest-label">
            REST
          </span>
          <button
            type="button"
            className="panel-button panel-button--toggle"
            aria-labelledby="rest-label"
            aria-pressed={!step.active}
            disabled={locked}
            onClick={() =>
              dispatch({ type: "step/setRest", rest: step.active })
            }
          >
            <span
              className={`led led--small${!step.active ? " is-on" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="editor-control">
          <span className="control-label">OCT</span>
          <div className="editor-control__octave">
            <button
              type="button"
              className="panel-button"
              aria-label="Lower the octave of the selected step"
              disabled={locked || !canLower}
              onClick={() => dispatch({ type: "step/changeOctave", delta: -1 })}
            >
              −
            </button>
            <button
              type="button"
              className="panel-button"
              aria-label="Raise the octave of the selected step"
              disabled={locked || !canRaise}
              onClick={() => dispatch({ type: "step/changeOctave", delta: 1 })}
            >
              +
            </button>
          </div>
          <div
            className="octave-meter"
            role="meter"
            aria-label={`Keyboard octave ${keyboardOctave} of ${MAX_OCTAVE}`}
            aria-valuemin={MIN_OCTAVE}
            aria-valuemax={MAX_OCTAVE}
            aria-valuenow={keyboardOctave}
          >
            {Array.from({ length: MAX_OCTAVE }, (_, i) => (
              <span
                key={i + 1}
                className={`led led--small${i + 1 === keyboardOctave ? " is-on" : ""}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        <div className="editor-control">
          <span className="control-label" id="accent-label">
            ACCENT
          </span>
          <button
            type="button"
            className="panel-button panel-button--toggle"
            aria-labelledby="accent-label"
            aria-pressed={step.accent}
            disabled={flagsLocked}
            onClick={() => dispatch({ type: "step/toggleAccent" })}
          >
            <span
              className={`led led--small${step.accent ? " is-on" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="editor-control">
          <span className="control-label" id="slide-label">
            SLIDE
          </span>
          <button
            type="button"
            className="panel-button panel-button--toggle"
            aria-labelledby="slide-label"
            aria-pressed={step.slide}
            disabled={flagsLocked}
            onClick={() => dispatch({ type: "step/toggleSlide" })}
          >
            <span
              className={`led led--small${step.slide ? " is-on" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </section>
  );
}
