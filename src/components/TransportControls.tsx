import { defaultParameters, parameterRanges } from "../sequencer/defaults";
import type { Mode } from "../sequencer/types";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { RotaryKnob } from "./RotaryKnob";
import { formatBpm, logScale } from "./knobScales";

const tempoScale = logScale(parameterRanges.tempoBpm.min, parameterRanges.tempoBpm.max);

const MODES: { value: Mode; label: string }[] = [
  { value: "play", label: "PLAY" },
  { value: "write", label: "WRITE" },
];

function formatTranspose(semitones: number): string {
  return semitones > 0 ? `+${semitones}` : String(semitones);
}

/** Zone 2: transport, mode, tempo display/knob and global transposition. */
export function TransportControls() {
  const { transport, mode, parameters } = useSono303State();
  const dispatch = useSono303Dispatch();
  const running = transport === "started";
  const { transposeSemitones } = parameters;

  function changeTranspose(delta: number): void {
    dispatch({
      type: "parameter/set",
      key: "transposeSemitones",
      value: transposeSemitones + delta,
    });
  }

  return (
    <section className="zone zone--transport" aria-label="Transport controls">
      <div className="control-group">
        <span className="control-label" id="transport-label">
          START / STOP
        </span>
        <span
          className={`led led--transport${running ? " is-on" : ""}`}
          aria-hidden="true"
        />
        <button
          type="button"
          className="transport-button"
          aria-labelledby="transport-label"
          aria-pressed={running}
          onClick={() => dispatch({ type: "transport/toggle" })}
        >
          <span className="visually-hidden">{running ? "Stop" : "Start"}</span>
        </button>
      </div>

      <div className="control-group">
        <span className="control-label" id="mode-label">
          MODE
        </span>
        <div className="segmented" role="group" aria-labelledby="mode-label">
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented__option"
              aria-pressed={mode === option.value}
              onClick={() => dispatch({ type: "mode/set", mode: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tempo-display" aria-hidden="true">
        <span className="tempo-display__value">
          {Math.round(parameters.tempoBpm)}
        </span>
        <span className="tempo-display__unit">BPM</span>
      </div>

      <RotaryKnob
        label="TEMPO"
        value={parameters.tempoBpm}
        min={parameterRanges.tempoBpm.min}
        max={parameterRanges.tempoBpm.max}
        defaultValue={defaultParameters.tempoBpm}
        onChange={(value) =>
          dispatch({ type: "parameter/set", key: "tempoBpm", value })
        }
        format={formatBpm}
        toNormalized={tempoScale.toNormalized}
        fromNormalized={tempoScale.fromNormalized}
        round={Math.round}
        size="sm"
      />

      <span className="zone__divider" aria-hidden="true" />

      <div className="control-group">
        <span className="control-label" id="transpose-label">
          TRANSPOSE
        </span>
        <div className="transpose" role="group" aria-labelledby="transpose-label">
          <button
            type="button"
            className="panel-button"
            aria-label="Transpose down one semitone"
            disabled={transposeSemitones <= parameterRanges.transposeSemitones.min}
            onClick={() => changeTranspose(-1)}
          >
            −
          </button>
          <button
            type="button"
            className="panel-button panel-button--value"
            aria-label={`Transposition ${formatTranspose(transposeSemitones)} semitones. Reset to 0`}
            onClick={() =>
              dispatch({ type: "parameter/set", key: "transposeSemitones", value: 0 })
            }
          >
            {formatTranspose(transposeSemitones)}
          </button>
          <button
            type="button"
            className="panel-button"
            aria-label="Transpose up one semitone"
            disabled={transposeSemitones >= parameterRanges.transposeSemitones.max}
            onClick={() => changeTranspose(1)}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}
