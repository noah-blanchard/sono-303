import type { Ref } from "react";
import { defaultSonoDistState } from "../sequencer/defaults";
import {
  mapLevelToDb,
  mapToneToFrequency,
} from "../sequencer/distortionMapping";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { DistortionModeSelector } from "./DistortionModeSelector";
import { JackSocket } from "./JackSocket";
import { RotaryKnob } from "./RotaryKnob";
import { formatDecibels, formatHz, formatPercent } from "./knobScales";

const SCREW_CORNERS = ["tl", "tr", "bl", "br"] as const;

/** Knob readouts translate the normalized value into what the ear will hear. */
function formatTone(value: number): string {
  return formatHz(mapToneToFrequency(value));
}

function formatLevel(value: number): string {
  return formatDecibels(mapLevelToDb(value));
}

export type SonoDistPanelProps = {
  inputJackRef?: Ref<HTMLButtonElement>;
};

/**
 * SONO-DIST: the distortion module, a separate device standing beside the
 * instrument.
 *
 * The controls stay live while unplugged so a sound can be dialled in before
 * the cable goes in; only the lights go out. `ACTIVE` is derived — never
 * stored — from the cable and the mode together, so it cannot drift out of
 * step with either.
 */
export function SonoDistPanel({ inputJackRef }: SonoDistPanelProps) {
  const { dist, patched } = useSono303State();
  const dispatch = useSono303Dispatch();
  const active = patched && dist.mode !== "bypass";

  return (
    <div className={`panel-shell dist-shell${patched ? "" : " is-unplugged"}`}>
      {SCREW_CORNERS.map((corner) => (
        <span
          key={corner}
          className={`panel-shell__screw panel-shell__screw--${corner}`}
          aria-hidden="true"
        />
      ))}

      <JackSocket
        side="in"
        label="IN"
        connected={patched}
        actionLabel={
          patched
            ? "Unplug the cable from SONO-DIST"
            : "Plug the cable into SONO-DIST"
        }
        onToggle={() => dispatch({ type: "patch/set", patched: !patched })}
        ref={inputJackRef}
      />

      <section className="panel dist-panel" aria-label="SONO-DIST distortion module">
        <header className="dist-header">
          <h2 className="dist-brand">SONO-DIST</h2>
          <p className="dist-subtitle">DISTORTION MODULE</p>
          <div className="dist-active">
            <span className="control-label">ACTIVE</span>
            <span
              className={`led led--small${active ? " is-on" : ""}`}
              aria-hidden="true"
            />
            <span className="visually-hidden">
              {active ? "Distortion active" : "Distortion inactive"}
            </span>
          </div>
        </header>

        <div className="dist-knobs">
          <RotaryKnob
            label="DRIVE"
            value={dist.drive}
            min={0}
            max={1}
            defaultValue={defaultSonoDistState.drive}
            onChange={(value) => dispatch({ type: "dist/setDrive", value })}
            format={formatPercent}
            size="sm"
          />
          <RotaryKnob
            label="TONE"
            value={dist.tone}
            min={0}
            max={1}
            defaultValue={defaultSonoDistState.tone}
            onChange={(value) => dispatch({ type: "dist/setTone", value })}
            format={formatTone}
            size="sm"
          />
          <RotaryKnob
            label="LEVEL"
            value={dist.level}
            min={0}
            max={1}
            defaultValue={defaultSonoDistState.level}
            onChange={(value) => dispatch({ type: "dist/setLevel", value })}
            format={formatLevel}
            size="sm"
          />
        </div>

        <div className="dist-type">
          <span className="control-label" id="dist-type-label">
            DISTORTION TYPE
          </span>
          <DistortionModeSelector
            mode={dist.mode}
            onChange={(mode) => dispatch({ type: "dist/setMode", mode })}
          />
        </div>
      </section>
    </div>
  );
}
