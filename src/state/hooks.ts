import { useContext } from "react";
import type { Dispatch } from "react";
import type { Sono303Action, Sono303State } from "../sequencer/types";
import { DispatchContext, StateContext } from "./contexts";

export type Sono303Dispatch = Dispatch<Sono303Action>;

export function useSono303State(): Sono303State {
  const state = useContext(StateContext);
  if (state === null) {
    throw new Error("useSono303State must be used inside <Sono303Provider>");
  }
  return state;
}

export function useSono303Dispatch(): Sono303Dispatch {
  const dispatch = useContext(DispatchContext);
  if (dispatch === null) {
    throw new Error("useSono303Dispatch must be used inside <Sono303Provider>");
  }
  return dispatch;
}
