import type { Connection, PortId } from "./types";

/**
 * The patchbay: which jack is wired to which, as pure data.
 *
 * Framework-free and Web-Audio-free, so the routing rules are unit-testable.
 * Both the drawn cables and the audio graph are derived from the same
 * connection list, which is what stops them from ever disagreeing.
 */

/** Every jack on the bench, and which way the signal goes through it. */
export const PORTS = {
  "sono303.out": { module: "sono303", direction: "out", label: "OUT" },
  "dist.in": { module: "dist", direction: "in", label: "IN" },
  "dist.out": { module: "dist", direction: "out", label: "OUT" },
  "tape.in": { module: "tape", direction: "in", label: "IN" },
} as const satisfies Record<
  PortId,
  { module: string; direction: "in" | "out"; label: string }
>;

/** True when a lead could physically go between these two jacks. */
export function canConnect(from: PortId, to: PortId): boolean {
  const source = PORTS[from];
  const target = PORTS[to];
  // Out into in, and never a module patched back into itself.
  return (
    source.direction === "out" &&
    target.direction === "in" &&
    source.module !== target.module
  );
}

/** The connection touching a jack, or null when it is empty. */
export function connectionAt(
  connections: readonly Connection[],
  port: PortId,
): Connection | null {
  return (
    connections.find((cable) => cable.from === port || cable.to === port) ?? null
  );
}

/** True when this exact lead is in place. */
export function isConnected(
  connections: readonly Connection[],
  from: PortId,
  to: PortId,
): boolean {
  return connections.some((cable) => cable.from === from && cable.to === to);
}

/** Whatever feeds an input jack, or null when nothing does. */
export function sourceOf(
  connections: readonly Connection[],
  to: PortId,
): PortId | null {
  return connections.find((cable) => cable.to === to)?.from ?? null;
}

/**
 * Plugs a lead in.
 *
 * A jack holds exactly one cable, like the real thing, so plugging into an
 * occupied socket pulls out whatever was already there rather than stacking.
 * An impossible pairing is ignored and the list is returned unchanged, so the
 * caller never has to pre-validate.
 */
export function connect(
  connections: readonly Connection[],
  from: PortId,
  to: PortId,
): Connection[] {
  if (!canConnect(from, to)) return connections as Connection[];
  if (isConnected(connections, from, to)) return connections as Connection[];
  const kept = connections.filter(
    (cable) =>
      cable.from !== from && cable.to !== from && cable.from !== to && cable.to !== to,
  );
  return [...kept, { from, to }];
}

/** Pulls the lead out of a jack, from either end. */
export function disconnectPort(
  connections: readonly Connection[],
  port: PortId,
): Connection[] {
  const kept = connections.filter(
    (cable) => cable.from !== port && cable.to !== port,
  );
  return kept.length === connections.length
    ? (connections as Connection[])
    : kept;
}

/**
 * Whether SONO-DIST is in the monitored path.
 *
 * Derived, never stored: the cable is the only truth, so the module's lights
 * and the audio graph cannot drift apart.
 */
export function isDistPatched(connections: readonly Connection[]): boolean {
  return isConnected(connections, "sono303.out", "dist.in");
}
