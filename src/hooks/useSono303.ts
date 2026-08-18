import { useEffect, useRef } from "react";
import { SonoAudioRig } from "../audio/SonoAudioRig";
import type { Sono303EngineFactory } from "../audio/engineApi";
import { useSono303Dispatch, useSono303State } from "../state/hooks";

/**
 * The single integration seam between React state and the audio rig.
 *
 * It creates exactly one `SonoAudioRig` — instrument, effect, master bus and
 * safety limiter — pushes serializable state into it, maps its step callback
 * back onto a reducer action, and disposes it on unmount. No other React
 * module may import from `src/audio/`.
 */
export function useSono303(createEngine?: Sono303EngineFactory): void {
  const state = useSono303State();
  const dispatch = useSono303Dispatch();

  const rigRef = useRef<SonoAudioRig | null>(null);

  // Lifecycle first: on (re)mount the rig exists before the effects below push
  // the current state into it. The factory is intentionally captured once here
  // — swapping factories requires a remount, which nothing needs.
  useEffect(() => {
    const rig = new SonoAudioRig({ createSynth: createEngine });
    rigRef.current = rig;
    rig.synth.setStepListener((stepIndex) => {
      dispatch({ type: "transport/setCurrentStep", stepIndex });
    });

    return () => {
      rigRef.current = null;
      rig.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    rigRef.current?.synth.setPattern(state.steps);
  }, [state.steps]);

  useEffect(() => {
    rigRef.current?.synth.setParameters(state.parameters);
  }, [state.parameters]);

  useEffect(() => {
    rigRef.current?.dist.setState(state.dist);
  }, [state.dist]);

  useEffect(() => {
    rigRef.current?.setPatched(state.patched);
  }, [state.patched]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    if (state.transport === "started") {
      void rig.synth.start();
    } else {
      rig.synth.stop();
    }
  }, [state.transport]);
}
