import { MAX_OCTAVE, MIN_OCTAVE } from "../sequencer/defaults";
import { stepToNoteName } from "../sequencer/pitch";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { MiniKeyboard } from "./MiniKeyboard";

/**
 * Zone 4: every edit applies to the selected step only. All controls are
 * disabled in PLAY mode; accent and slide are additionally disabled while the
 * step is a rest.
 */
export function StepEditor() {
  const { steps, selectedStep, mode } = useSono303State();
  const dispatch = useSono303Dispatch();

  const step = steps[selectedStep];
  const locked = mode === "play";
  const flagsLocked = locked || !step.active;

  return (
    <section
      className={`zone zone--editor${locked ? " is-locked" : ""}`}
      aria-label="Selected step editor"
    >
      <p className="readout">
        SELECTED STEP {selectedStep + 1} · {step.active ? stepToNoteName(step) : "REST"}
      </p>

      <MiniKeyboard
        value={step.note}
        disabled={locked}
        onSelect={(note) => dispatch({ type: "step/setPitch", note })}
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
            <span className="dot" aria-hidden="true" />
          </button>
        </div>

        <div className="editor-control">
          <span className="control-label">OCT −</span>
          <button
            type="button"
            className="panel-button"
            aria-label="Lower the octave of the selected step"
            disabled={locked || step.octave <= MIN_OCTAVE}
            onClick={() => dispatch({ type: "step/changeOctave", delta: -1 })}
          >
            −
          </button>
        </div>

        <div className="editor-control">
          <span className="control-label">OCT +</span>
          <button
            type="button"
            className="panel-button"
            aria-label="Raise the octave of the selected step"
            disabled={locked || step.octave >= MAX_OCTAVE}
            onClick={() => dispatch({ type: "step/changeOctave", delta: 1 })}
          >
            +
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
