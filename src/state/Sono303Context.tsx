import { useReducer } from "react";
import type { ReactNode } from "react";
import { createInitialState } from "../sequencer/defaults";
import { DispatchContext, StateContext } from "./contexts";
import { sono303Reducer } from "./sono303Reducer";

export function Sono303Provider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sono303Reducer, undefined, createInitialState);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}
