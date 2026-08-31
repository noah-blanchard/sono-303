import { useNoteInput } from "../hooks/useNoteInput";
import {
  MAX_OCTAVE,
  MAX_PITCH_OCTAVE,
  MIN_OCTAVE,
} from "../sequencer/defaults";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { MiniKeyboard } from "./MiniKeyboard";

/**
 * Zone 4: the keyboard, and the flags of the selected step.
 *
 * The keyboard is live in both modes — in WRITE a key writes the selected step
 * and advances, in PLAY it is free play — so only the step-editing controls
 * (REST, ACCENT, SLIDE) lock in PLAY. OCT −/+ never locks: it moves the
 * playable range, which is exactly what a live player needs.
 */
export function StepEditor() {
  const { steps, selectedStep, keyboardOctave, mode, keyHintsVisible, heldNotes } =
    useSono303State();
  const dispatch = useSono303Dispatch();
  const noteInput = useNoteInput();

  const step = steps[selectedStep];
  const playing = mode === "play";
  // Only the pattern is off limits in PLAY; the instrument itself is not.
  const editingLocked = playing;
  const flagsLocked = editingLocked || !step.active;
  // OCT −/+ moves the window and, in WRITE, the pitch with it — so it stays
  // useful until both have hit the same end. In PLAY only the window moves.
  const canLower =
    keyboardOctave > MIN_OCTAVE || (!playing && step.octave > MIN_OCTAVE);
  const canRaise =
    keyboardOctave < MAX_OCTAVE || (!playing && step.octave < MAX_PITCH_OCTAVE);

  return (
    <section
      className={`zone zone--editor${playing ? " is-live" : ""}`}
      aria-label={playing ? "Keyboard" : "Selected step editor"}
    >
      <MiniKeyboard
        note={step.note}
        octave={step.octave}
        baseOctave={keyboardOctave}
        showKeyHints={keyHintsVisible}
        heldNotes={heldNotes}
        onNoteOn={noteInput.start}
        onNoteOff={noteInput.stop}
        onNotePress={noteInput.press}
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
            disabled={editingLocked}
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
              aria-label={
                playing
                  ? "Lower the playable octave"
                  : "Lower the octave of the selected step"
              }
              disabled={!canLower}
              onClick={() => dispatch({ type: "step/changeOctave", delta: -1 })}
            >
              −
            </button>
            <button
              type="button"
              className="panel-button"
              aria-label={
                playing
                  ? "Raise the playable octave"
                  : "Raise the octave of the selected step"
              }
              disabled={!canRaise}
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
          <span className="control-label" id="keys-label">
            KEYS
          </span>
          <button
            type="button"
            className="panel-button panel-button--toggle"
            aria-labelledby="keys-label"
            aria-pressed={keyHintsVisible}
            onClick={() => dispatch({ type: "ui/toggleKeyHints" })}
          >
            <span
              className={`led led--small${keyHintsVisible ? " is-on" : ""}`}
              aria-hidden="true"
            />
          </button>
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
