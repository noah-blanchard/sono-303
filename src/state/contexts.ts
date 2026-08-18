import { createContext } from "react";
import type { Dispatch } from "react";
import type { Sono303Action, Sono303State } from "../sequencer/types";

export const StateContext = createContext<Sono303State | null>(null);
export const DispatchContext = createContext<Dispatch<Sono303Action> | null>(null);
