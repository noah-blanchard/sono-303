import { defaultParameters, parameterRanges } from "../sequencer/defaults";
import type { SynthParameters, Waveform } from "../sequencer/types";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { RotaryKnob } from "./RotaryKnob";
import {
  formatDecibels,
  formatHz,
  formatPercent,
  formatQ,
  formatSeconds,
  logScale,
  roundTo,
} from "./knobScales";

const cutoffScale = logScale(parameterRanges.cutoffHz.min, parameterRanges.cutoffHz.max);

const WAVEFORMS: { value: Waveform; label: string }[] = [
  { value: "sawtooth", label: "SAW" },
  { value: "square", label: "SQUARE" },
];

/** Zone 1: brand block, waveform selector and the six rotary sound controls. */
export function SoundControls() {
  const { parameters } = useSono303State();
  const dispatch = useSono303Dispatch();

  function setParameter(key: keyof SynthParameters, value: number | string): void {
    dispatch({ type: "parameter/set", key, value });
  }

  return (
    <section className="zone zone--sound" aria-label="Sound controls">
      <div className="brand">
        <h1 className="brand__name">SONO-303</h1>
        <div className="waveform">
          <span className="control-label" id="waveform-label">
            WAVEFORM
          </span>
          <div className="segmented" role="group" aria-labelledby="waveform-label">
            {WAVEFORMS.map((waveform) => (
              <button
                key={waveform.value}
                type="button"
                className="segmented__option"
                aria-pressed={parameters.waveform === waveform.value}
                onClick={() => setParameter("waveform", waveform.value)}
              >
                {waveform.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="knob-row">
        <RotaryKnob
          label="CUTOFF FREQ"
          value={parameters.cutoffHz}
          min={parameterRanges.cutoffHz.min}
          max={parameterRanges.cutoffHz.max}
          defaultValue={defaultParameters.cutoffHz}
          onChange={(value) => setParameter("cutoffHz", value)}
          format={formatHz}
          toNormalized={cutoffScale.toNormalized}
          fromNormalized={cutoffScale.fromNormalized}
          round={Math.round}
        />
        <RotaryKnob
          label="RESONANCE"
          value={parameters.resonanceQ}
          min={parameterRanges.resonanceQ.min}
          max={parameterRanges.resonanceQ.max}
          defaultValue={defaultParameters.resonanceQ}
          onChange={(value) => setParameter("resonanceQ", value)}
          format={formatQ}
          round={roundTo(1)}
        />
        <RotaryKnob
          label="ENV MOD"
          value={parameters.envMod}
          min={parameterRanges.envMod.min}
          max={parameterRanges.envMod.max}
          defaultValue={defaultParameters.envMod}
          onChange={(value) => setParameter("envMod", value)}
          format={formatPercent}
          round={roundTo(2)}
        />
        <RotaryKnob
          label="DECAY"
          value={parameters.decaySeconds}
          min={parameterRanges.decaySeconds.min}
          max={parameterRanges.decaySeconds.max}
          defaultValue={defaultParameters.decaySeconds}
          onChange={(value) => setParameter("decaySeconds", value)}
          format={formatSeconds}
          round={roundTo(2)}
        />
        <RotaryKnob
          label="ACCENT"
          value={parameters.accentAmount}
          min={parameterRanges.accentAmount.min}
          max={parameterRanges.accentAmount.max}
          defaultValue={defaultParameters.accentAmount}
          onChange={(value) => setParameter("accentAmount", value)}
          format={formatPercent}
          round={roundTo(2)}
        />

        <span className="zone__divider" aria-hidden="true" />

        <RotaryKnob
          label="VOLUME"
          value={parameters.volumeDb}
          min={parameterRanges.volumeDb.min}
          max={parameterRanges.volumeDb.max}
          defaultValue={defaultParameters.volumeDb}
          onChange={(value) => setParameter("volumeDb", value)}
          format={formatDecibels}
          round={roundTo(1)}
        />
      </div>
    </section>
  );
}
