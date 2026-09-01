import { createContext, useContext } from "react";
import type { PortId } from "../sequencer/types";

/**
 * How a jack talks to the patchbay.
 *
 * Modules declare their jacks and nothing else — they never learn that cables
 * exist, which is what lets a fourth module be added without touching any of
 * the routing code.
 */
export type PatchBayApi = {
  /** Called on mount/unmount so the bay can measure the socket to draw to. */
  registerPort: (id: PortId, element: HTMLButtonElement | null) => void;
  /** The jack holding the loose end, or null when no lead is in hand. */
  armed: PortId | null;
  /** Picks a jack up, lands the lead on it, or pulls it out. */
  selectPort: (id: PortId) => void;
  /** True when a lead is already in this jack. */
  isPatched: (id: PortId) => boolean;
  /** True when the armed lead could land here. */
  canLandOn: (id: PortId) => boolean;
};

export const PatchBayContext = createContext<PatchBayApi>({
  registerPort: () => {},
  armed: null,
  selectPort: () => {},
  isPatched: () => false,
  canLandOn: () => false,
});

export function usePatchBay(): PatchBayApi {
  return useContext(PatchBayContext);
}
