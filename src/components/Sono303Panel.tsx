import { Module } from "./Module";
import { SoundControls } from "./SoundControls";
import { StepEditor } from "./StepEditor";
import { StepSequencer } from "./StepSequencer";
import { TransportControls } from "./TransportControls";

/**
 * The instrument: four horizontal zones on one silver panel, in a metal shell.
 *
 * It carries no brand plate of its own — the zones are the face of the machine
 * — so it passes an empty header rather than the module default.
 */
export function Sono303Panel() {
  return (
    <Module
      name="SONO-303"
      className="sono303-shell"
      ports={["sono303.out"]}
      header={null}
    >
      <SoundControls />
      <TransportControls />
      <StepSequencer />
      <StepEditor />
    </Module>
  );
}
