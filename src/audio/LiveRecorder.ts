import * as Tone from "tone";
import tapProcessorSource from "./tapProcessor.worklet.js?raw";
import {
  LIVE_MAX_SECONDS,
  nextBarSeconds,
} from "../sequencer/liveTake";

/**
 * Live capture of the master bus (SONO-TAPE, LIVE section).
 *
 * The offline bounce replays the pattern against one frozen snapshot of the
 * parameters, so a knob swept during playback cannot exist in it. This records
 * the real-time graph instead: whatever came out of the limiter, including
 * knob moves, live keys, MIDI and the cable going into SONO-DIST mid-phrase.
 *
 * Capture is lossless — the worklet hands over raw Float32 and the same 24-bit
 * encoder writes the file — unlike `MediaRecorder`, which would give lossy
 * webm-opus or mp4-aac depending on the browser.
 */

export type LiveRecordState = "idle" | "armed" | "recording";

export type LiveTake = {
  samples: Float32Array;
  sampleRate: number;
  /** Transport seconds the take opened and closed on, or null when unsnapped. */
  snappedBars: number | null;
};

/** How often the arrival of captured audio is re-checked while closing a take. */
const DRAIN_POLL_MS = 40;

/** Safety ceiling on draining: a stalled context must not hang the UI forever. */
const DRAIN_TIMEOUT_MS = 3000;

/**
 * Registers the tap processor and returns its name.
 *
 * The source is imported `?raw` and handed to `addModule` as a blob rather than
 * imported `?url`: the file is under Vite's 4 KB inline limit, so `?url` turns
 * it into a `data:` URL, and `audioWorklet.addModule` refuses those. A blob URL
 * works identically in dev and in a build, and is what Tone.js does with its
 * own worklets.
 */
async function loadTapModule(context: {
  addAudioWorkletModule(url: string): Promise<void>;
}): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([tapProcessorSource], { type: "text/javascript" }),
  );
  try {
    await context.addAudioWorkletModule(url);
  } finally {
    // The module is fetched and compiled by the time addModule resolves.
    URL.revokeObjectURL(url);
  }
}

export class LiveRecorder {
  #source: Tone.ToneAudioNode | null = null;
  #node: AudioWorkletNode | null = null;
  #modulePromise: Promise<void> | null = null;

  #state: LiveRecordState = "idle";
  #chunks: Float32Array[] = [];
  /** Absolute context frame the worklet began capturing at. */
  #startFrame = 0;
  /** Frames received so far, so `startFrame + captured` is the live edge. */
  #captured = 0;
  #sampleRate = 0;
  #channels = 1;

  /** Absolute frame the take opens on — the downbeat, or the start when free. */
  #beginFrame = 0;
  #maxFrames = Number.POSITIVE_INFINITY;
  #snappedBars: number | null = null;
  #tempoBpm = 125;

  #scheduledId: number | null = null;
  #autoStop: (() => void) | null = null;
  #disposed = false;

  get state(): LiveRecordState {
    return this.#state;
  }

  get sampleRate(): number {
    return this.#sampleRate;
  }

  /** Frames captured since the take opened; zero while merely armed. */
  get frames(): number {
    if (this.#state !== "recording") return 0;
    const live = this.#startFrame + this.#captured;
    return Math.max(0, live - this.#beginFrame);
  }

  /** True when the bus turned out to carry more than the one channel we keep. */
  get isMultiChannel(): boolean {
    return this.#channels > 1;
  }

  /** Remembers the tap point. Called by the rig while it builds the path. */
  setSource(source: Tone.ToneAudioNode): void {
    this.#source = source;
  }

  /** Fired when the length cap ends a take without the user pressing stop. */
  onAutoStop(callback: () => void): void {
    this.#autoStop = callback;
  }

  /**
   * Loads the worklet and hangs the tap off the source.
   *
   * Deferred until the first REC press rather than done in the constructor:
   * `addModule` needs a real context, and the button press is the user gesture
   * that unlocks one.
   */
  async prepare(): Promise<void> {
    if (this.#disposed || this.#node !== null) return;
    if (this.#source === null) throw new Error("LiveRecorder has no source");

    await Tone.start();
    const context = Tone.getContext();
    // One load per context, even if REC is hammered before it resolves.
    this.#modulePromise ??= loadTapModule(context);
    await this.#modulePromise;
    if (this.#disposed) return;

    // Tone's own factory, not `new AudioWorkletNode(context.rawContext, …)`:
    // `rawContext` is a wrapper, and the native constructor rejects it with
    // "parameter 1 is not of type 'BaseAudioContext'".
    const node = context.createAudioWorkletNode("sono-tap", {
      // No outputs: the tap listens, it never feeds anything, so the rig still
      // has exactly one route to the destination.
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    node.port.onmessage = (event) => this.#receive(event.data);
    this.#source.connect(node);
    this.#node = node;
    this.#sampleRate = context.sampleRate;
  }

  /**
   * Opens a take.
   *
   * Capture starts immediately either way; what the transport decides is where
   * the take is *trimmed* to. With the sequencer running the take opens on the
   * next downbeat, so it lands on the grid. With it stopped there is no grid to
   * snap to — that is the live-keyboard case — so the take opens at once.
   */
  async arm(tempoBpm: number, maxSeconds: number = LIVE_MAX_SECONDS): Promise<void> {
    if (this.#disposed || this.#state !== "idle") return;
    await this.prepare();
    const node = this.#node;
    if (node === null || this.#disposed) return;

    this.#tempoBpm = tempoBpm;
    this.#chunks = [];
    this.#captured = 0;
    this.#snappedBars = null;
    this.#maxFrames = Math.round(maxSeconds * this.#sampleRate);

    node.port.postMessage({ type: "start" });

    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      // Nothing to snap to. The take opens on the first frame captured, which
      // `#receive` fills in as soon as the worklet reports its start frame.
      this.#state = "recording";
      this.#beginFrame = Number.NaN;
      return;
    }

    this.#state = "armed";
    const boundary = nextBarSeconds(transport.seconds, tempoBpm);
    this.#scheduledId = transport.schedule((time) => {
      // `time` is the audio-context time of the downbeat, which is what makes
      // this sample-exact rather than a wall-clock approximation.
      this.#beginFrame = Math.round(time * this.#sampleRate);
      this.#state = "recording";
      this.#scheduledId = null;
    }, boundary);
  }

  /**
   * Closes the take and returns it.
   *
   * A running transport carries the take on to the next bar boundary, so the
   * result is a whole number of bars; otherwise it ends now.
   */
  async stop(): Promise<LiveTake | null> {
    if (this.#disposed || this.#state === "idle") return null;
    const node = this.#node;
    if (node === null) return null;

    const transport = Tone.getTransport();
    this.#clearScheduled(transport);

    let endFrame: number;
    if (this.#state === "armed") {
      // Stopped before the downbeat ever arrived: there is no take.
      node.port.postMessage({ type: "stop" });
      this.#reset();
      return null;
    }

    if (transport.state === "started" && Number.isFinite(this.#beginFrame)) {
      const boundary = nextBarSeconds(transport.seconds, this.#tempoBpm);
      const endSeconds = await this.#awaitTransport(boundary);
      endFrame = Math.round(endSeconds * this.#sampleRate);
      const bar = this.#sampleRate * (240 / this.#tempoBpm);
      this.#snappedBars = Math.max(1, Math.round((endFrame - this.#beginFrame) / bar));
    } else {
      endFrame = this.#startFrame + this.#captured;
    }

    // The boundary is in the future when it is scheduled, so wait until the
    // audio thread has actually delivered it before cutting.
    await this.#drainUntil(endFrame);
    node.port.postMessage({ type: "stop" });
    // One more drain pass so the worklet's final partial chunk lands.
    await this.#settle();

    const take = this.#slice(this.#beginFrame, endFrame);
    this.#reset();
    return take;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const transport = Tone.getTransport();
    this.#clearScheduled(transport);
    if (this.#node !== null) {
      this.#node.port.onmessage = null;
      this.#node.disconnect();
      this.#node = null;
    }
    this.#chunks = [];
    this.#state = "idle";
    this.#autoStop = null;
  }

  #receive(message: {
    type: string;
    chunk?: Float32Array;
    startFrame?: number;
    sampleRate?: number;
    channels?: number;
  }): void {
    if (message.type === "started") {
      this.#startFrame = message.startFrame ?? 0;
      if (message.sampleRate) this.#sampleRate = message.sampleRate;
      // Unsnapped takes open on the very first captured frame.
      if (Number.isNaN(this.#beginFrame)) this.#beginFrame = this.#startFrame;
      return;
    }
    if (message.type === "channels") {
      this.#channels = message.channels ?? 1;
      return;
    }
    if (message.type !== "chunk" || message.chunk === undefined) return;

    this.#chunks.push(message.chunk);
    this.#captured += message.chunk.length;

    if (this.#state === "recording" && this.frames >= this.#maxFrames) {
      // Cap reached. Hand it back to the host rather than growing forever.
      this.#autoStop?.();
    }
  }

  /** Resolves with the boundary's audio time once the transport reaches it. */
  #awaitTransport(boundarySeconds: number): Promise<number> {
    return new Promise((resolve) => {
      const transport = Tone.getTransport();
      this.#scheduledId = transport.schedule((time) => {
        this.#scheduledId = null;
        resolve(time);
      }, boundarySeconds);
    });
  }

  /** Waits until captured audio has reached an absolute frame. */
  async #drainUntil(frame: number): Promise<void> {
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (this.#startFrame + this.#captured < frame && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
    }
  }

  /** Gives the worklet's closing `stop` message a chance to land. */
  #settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS * 2));
  }

  /** Flattens the chunk list and cuts out the requested absolute frame range. */
  #slice(beginFrame: number, endFrame: number): LiveTake | null {
    const begin = Math.max(0, beginFrame - this.#startFrame);
    const end = Math.max(begin, endFrame - this.#startFrame);
    const length = Math.min(end - begin, this.#captured - begin);
    if (length <= 0) return null;

    const samples = new Float32Array(length);
    let written = 0;
    let cursor = 0;
    for (const chunk of this.#chunks) {
      const chunkEnd = cursor + chunk.length;
      if (chunkEnd > begin && cursor < begin + length) {
        const from = Math.max(0, begin - cursor);
        const to = Math.min(chunk.length, begin + length - cursor);
        samples.set(chunk.subarray(from, to), written);
        written += to - from;
      }
      cursor = chunkEnd;
      if (cursor >= begin + length) break;
    }

    return {
      samples,
      sampleRate: this.#sampleRate,
      snappedBars: this.#snappedBars,
    };
  }

  #clearScheduled(transport: ReturnType<typeof Tone.getTransport>): void {
    if (this.#scheduledId === null) return;
    transport.clear(this.#scheduledId);
    this.#scheduledId = null;
  }

  #reset(): void {
    this.#chunks = [];
    this.#captured = 0;
    this.#state = "idle";
    this.#snappedBars = null;
    this.#beginFrame = 0;
  }
}
