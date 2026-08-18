import { useEffect, useRef } from "react";
import { MockSono303Engine } from "../audio/MockSono303Engine";
import type { Sono303EngineApi, Sono303EngineFactory } from "../audio/engineApi";
import { useSono303Dispatch, useSono303State } from "../state/hooks";

/** Milestone 1 default. Milestone 2 swaps this for the real Tone.js engine. */
const defaultEngineFactory: Sono303EngineFactory = () => new MockSono303Engine();

/**
 * The single integration seam between React state and the sound engine.
 *
 * It creates exactly one engine instance, pushes serializable state into it,
 * maps its step callback back onto a reducer action, and disposes it on
 * unmount. No other React module may import from `src/audio/`.
 */
export function useSono303(
  createEngine: Sono303EngineFactory = defaultEngineFactory,
): void {
  const state = useSono303State();
  const dispatch = useSono303Dispatch();

  const engineRef = useRef<Sono303EngineApi | null>(null);

  // Lifecycle first: on (re)mount the engine exists before the effects below
  // push the current state into it. The factory is intentionally captured once
  // here — swapping factories requires a remount, which M2 does not need.
  useEffect(() => {
    const engine = createEngine();
    engineRef.current = engine;
    engine.setStepListener((stepIndex) => {
      dispatch({ type: "transport/setCurrentStep", stepIndex });
    });

    return () => {
      engineRef.current = null;
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    engineRef.current?.setPattern(state.steps);
  }, [state.steps]);

  useEffect(() => {
    engineRef.current?.setParameters(state.parameters);
  }, [state.parameters]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (state.transport === "started") {
      void engine.start();
    } else {
      engine.stop();
    }
  }, [state.transport]);
}
