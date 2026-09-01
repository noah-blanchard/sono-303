import { describe, expect, it } from "vitest";
import { defaultConnections } from "./defaults";
import {
  canConnect,
  connect,
  connectionAt,
  disconnectPort,
  isConnected,
  isDistPatched,
  sourceOf,
} from "./patchbay";
import type { Connection } from "./types";

const CHAIN: Connection[] = [
  { from: "sono303.out", to: "dist.in" },
  { from: "dist.out", to: "tape.in" },
];

describe("canConnect", () => {
  it("only ever runs an output into an input", () => {
    expect(canConnect("sono303.out", "dist.in")).toBe(true);
    expect(canConnect("dist.out", "tape.in")).toBe(true);
    expect(canConnect("dist.in", "tape.in")).toBe(false);
    expect(canConnect("sono303.out", "dist.out")).toBe(false);
  });

  it("refuses to patch a module back into itself", () => {
    expect(canConnect("dist.out", "dist.in")).toBe(false);
  });
});

describe("connect", () => {
  it("plugs a lead in", () => {
    expect(connect([], "sono303.out", "tape.in")).toEqual([
      { from: "sono303.out", to: "tape.in" },
    ]);
  });

  // A jack holds one cable, like the real thing.
  it("pulls out whatever already occupied either jack", () => {
    const next = connect(CHAIN, "sono303.out", "tape.in");
    expect(next).toEqual([{ from: "sono303.out", to: "tape.in" }]);
    expect(isDistPatched(next)).toBe(false);
  });

  it("returns the same list for an impossible or redundant pairing", () => {
    expect(connect(CHAIN, "dist.in", "tape.in")).toBe(CHAIN);
    expect(connect(CHAIN, "sono303.out", "dist.in")).toBe(CHAIN);
  });
});

describe("disconnectPort", () => {
  it("pulls the lead from either end", () => {
    expect(disconnectPort(CHAIN, "dist.in")).toEqual([CHAIN[1]]);
    expect(disconnectPort(CHAIN, "sono303.out")).toEqual([CHAIN[1]]);
  });

  it("returns the same list when the jack was already empty", () => {
    expect(disconnectPort([], "tape.in")).toEqual([]);
    expect(disconnectPort(CHAIN, "tape.in")).toEqual([CHAIN[0]]);
  });
});

describe("queries", () => {
  it("reports what is plugged where", () => {
    expect(isConnected(CHAIN, "dist.out", "tape.in")).toBe(true);
    expect(sourceOf(CHAIN, "tape.in")).toBe("dist.out");
    expect(sourceOf([], "tape.in")).toBeNull();
    expect(connectionAt(CHAIN, "dist.out")).toEqual(CHAIN[1]);
    expect(connectionAt([], "dist.out")).toBeNull();
  });

  it("boots as the full chain", () => {
    expect(isDistPatched(defaultConnections)).toBe(true);
    expect(sourceOf(defaultConnections, "tape.in")).toBe("dist.out");
  });
});
