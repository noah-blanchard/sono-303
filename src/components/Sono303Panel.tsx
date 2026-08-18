import type { Ref } from "react";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { JackSocket } from "./JackSocket";
import { SoundControls } from "./SoundControls";
import { StepEditor } from "./StepEditor";
import { StepSequencer } from "./StepSequencer";
import { TransportControls } from "./TransportControls";

const SCREW_CORNERS = ["tl", "tr", "bl", "br"] as const;

export type Sono303PanelProps = {
  outputJackRef?: Ref<HTMLButtonElement>;
};

/** The instrument: four horizontal zones on one silver panel, in a metal shell. */
export function Sono303Panel({ outputJackRef }: Sono303PanelProps) {
  const { patched } = useSono303State();
  const dispatch = useSono303Dispatch();

  return (
    <div className="panel-shell">
      {SCREW_CORNERS.map((corner) => (
        <span
          key={corner}
          className={`panel-shell__screw panel-shell__screw--${corner}`}
          aria-hidden="true"
        />
      ))}

      <JackSocket
        side="out"
        label="OUT"
        connected={patched}
        actionLabel={
          patched
            ? "Unplug the cable from the SONO-303 output"
            : "Plug the cable into the SONO-303 output"
        }
        onToggle={() => dispatch({ type: "patch/set", patched: !patched })}
        ref={outputJackRef}
      />

      <div className="panel">
        <SoundControls />
        <TransportControls />
        <StepSequencer />
        <StepEditor />
      </div>
    </div>
  );
}
