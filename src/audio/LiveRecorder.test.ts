import { beforeEach, describe, expect, it, vi } from "vitest";
import { barsToSeconds } from "../sequencer/tape";

/**
 * The capture itself needs a real audio thread, so what is pinned here is the
 * bookkeeping around it — which is where every subtle bug lives: whether a take
 * opens on the downbeat or immediately, whether the trim maths lands on the
 * right frames, and whether stopping while still armed throws the take away.
 */

const RATE = 48000;
const BAR = barsToSeconds(1, 125); // 1.92 s
const BAR_FRAMES = BAR * RATE; // 92160

const toneMock = vi.hoisted(() => {
  type Scheduled = { id: number; time: number; callback: (time: number) => void };
  const scheduled: Scheduled[] = [];
  let nextId = 1;

  // Stands in for the AudioWorkletNode, handed back by the fake context's
  // `createAudioWorkletNode` exactly as Tone's real one does.
  const posted: { type: string }[] = [];
  let handler: ((event: { data: unknown }) => void) | null = null;
  const node = {
    port: {
      postMessage: vi.fn((message: { type: string }) => posted.push(message)),
      set onmessage(fn: ((event: { data: unknown }) => void) | null) {
        handler = fn;
      },
      get onmessage() {
        return handler;
      },
    },
    disconnect: vi.fn(),
  };

  const transport = {
    state: "stopped" as "stopped" | "started",
    seconds: 0,
    schedule: vi.fn((callback: (time: number) => void, time: number) => {
      const id = nextId++;
      scheduled.push({ id, time, callback });
      return id;
    }),
    clear: vi.fn((id: number) => {
      const index = scheduled.findIndex((entry) => entry.id === id);
      if (index >= 0) scheduled.splice(index, 1);
    }),
  };

  // Literal, not RATE: vi.hoisted lifts this factory above the module consts.
  const context = {
    sampleRate: 48000,
    rawContext: {},
    addAudioWorkletModule: vi.fn(async () => {}),
    createAudioWorkletNode: vi.fn(() => node),
  };

  return {
    scheduled,
    transport,
    context,
    node,
    posted,
    /** Fires the pending transport event, as the audio clock reaching it would. */
    fire(atSeconds: number) {
      const entry = scheduled.shift();
      entry?.callback(atSeconds);
    },
    /** Delivers a message from the worklet to the recorder. */
    emit(data: unknown) {
      handler?.({ data });
    },
    reset() {
      scheduled.length = 0;
      nextId = 1;
      transport.state = "stopped";
      transport.seconds = 0;
      transport.schedule.mockClear();
      transport.clear.mockClear();
      context.addAudioWorkletModule.mockClear();
      context.createAudioWorkletNode.mockClear();
      posted.length = 0;
      handler = null;
      node.port.postMessage.mockClear();
      node.disconnect.mockClear();
    },
  };
});

vi.mock("tone", () => ({
  start: vi.fn(async () => {}),
  getTransport: vi.fn(() => toneMock.transport),
  getContext: vi.fn(() => toneMock.context),
}));

// Node has Blob and URL.createObjectURL, so the blob-URL dance in the recorder
// runs for real here; the worklet node comes from the mocked Tone context.
const { LiveRecorder } = await import("./LiveRecorder");

/** A Tone-ish node that only has to record what was connected to it. */
function fakeSource() {
  return { connect: vi.fn() } as never;
}

/** Feeds `frames` of audio in, as the worklet would, starting at `startFrame`. */
function deliver(frames: number, value = 0.5): void {
  const chunk = new Float32Array(frames).fill(value);
  toneMock.emit({ type: "chunk", chunk });
}

beforeEach(() => {
  toneMock.reset();
});

describe("LiveRecorder, transport stopped", () => {
  it("captures immediately, because there is no grid to snap to", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    toneMock.emit({ type: "started", startFrame: 1000, sampleRate: RATE });

    expect(recorder.state).toBe("recording");
    // No bar boundary was scheduled: there is no transport running to snap to.
    expect(toneMock.transport.schedule).not.toHaveBeenCalled();
    expect(toneMock.posted[0]).toEqual({ type: "start" });
  });

  it("keeps every captured frame and reports the running length", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    toneMock.emit({ type: "started", startFrame: 1000, sampleRate: RATE });

    deliver(4096);
    deliver(4096);
    expect(recorder.frames).toBe(8192);

    const take = await recorder.stop();
    expect(take).not.toBeNull();
    expect(take?.samples.length).toBe(8192);
    expect(take?.sampleRate).toBe(RATE);
    expect(take?.snappedBars).toBeNull();
  });
});

describe("LiveRecorder, transport running", () => {
  beforeEach(() => {
    toneMock.transport.state = "started";
    toneMock.transport.seconds = 0.5;
  });

  it("arms and waits for the downbeat instead of recording at once", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    toneMock.emit({ type: "started", startFrame: 0, sampleRate: RATE });

    expect(recorder.state).toBe("armed");
    expect(recorder.frames).toBe(0);
    // Scheduled on the next bar boundary, not on the press.
    expect(toneMock.transport.schedule).toHaveBeenCalledTimes(1);
    expect(toneMock.transport.schedule.mock.calls[0][1]).toBeCloseTo(BAR, 10);
  });

  it("opens the take on the downbeat and discards the run-up", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    toneMock.emit({ type: "started", startFrame: 0, sampleRate: RATE });

    // Half a bar of run-up arrives before the downbeat fires.
    deliver(BAR_FRAMES / 2);
    expect(recorder.frames).toBe(0);

    toneMock.fire(BAR); // downbeat at 1.92 s → frame 92160
    expect(recorder.state).toBe("recording");

    // A full bar of wanted audio, delivered after the downbeat.
    deliver(BAR_FRAMES / 2);
    deliver(BAR_FRAMES);
    expect(recorder.frames).toBe(BAR_FRAMES);
  });

  it("stopping while still armed cancels rather than saving an empty take", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    toneMock.emit({ type: "started", startFrame: 0, sampleRate: RATE });
    deliver(2048);

    const take = await recorder.stop();
    expect(take).toBeNull();
    expect(recorder.state).toBe("idle");
    expect(toneMock.posted.at(-1)).toEqual({ type: "stop" });
    // The pending downbeat must not be left on the transport.
    expect(toneMock.transport.clear).toHaveBeenCalled();
  });
});

describe("LiveRecorder housekeeping", () => {
  it("reports a stereo bus rather than silently dropping a side", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    expect(recorder.isMultiChannel).toBe(false);
    toneMock.emit({ type: "channels", channels: 2 });
    expect(recorder.isMultiChannel).toBe(true);
  });

  it("calls back when the length cap ends the take", async () => {
    const recorder = new LiveRecorder();
    const onAutoStop = vi.fn();
    recorder.setSource(fakeSource());
    recorder.onAutoStop(onAutoStop);
    // A one-second ceiling, so the cap is reachable in a test.
    await recorder.arm(125, 1);
    toneMock.emit({ type: "started", startFrame: 0, sampleRate: RATE });

    deliver(RATE / 2);
    expect(onAutoStop).not.toHaveBeenCalled();
    deliver(RATE / 2);
    expect(onAutoStop).toHaveBeenCalled();
  });

  it("loads the worklet once however often it is armed", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    toneMock.emit({ type: "started", startFrame: 0, sampleRate: RATE });
    await recorder.stop();
    await recorder.arm(125);
    expect(toneMock.context.addAudioWorkletModule).toHaveBeenCalledTimes(1);
  });

  it("disconnects the tap on dispose", async () => {
    const recorder = new LiveRecorder();
    recorder.setSource(fakeSource());
    await recorder.arm(125);
    recorder.dispose();
    expect(toneMock.node.disconnect).toHaveBeenCalled();
    expect(recorder.state).toBe("idle");
  });
});
