/**
 * SONO-TAPE's capture tap, running on the audio rendering thread.
 *
 * Deliberately plain JavaScript, not TypeScript: it is loaded with Vite's
 * `?url` import, which emits the file as an asset without transpiling it, and
 * `AudioWorkletGlobalScope` is the one place in this app where the module
 * cannot go through the normal bundle.
 *
 * It has no outputs. It is a leaf on the graph — a listener, not a second path
 * to the destination — so the rig keeps its "exactly one route out" guarantee.
 */

/**
 * Frames buffered before a message is posted.
 *
 * The render quantum is 128 frames, so posting per quantum would be ~375
 * messages a second at 48 kHz. Batching to 4096 makes it about twelve.
 */
const CHUNK_FRAMES = 4096;

/** The render quantum, and the fallback length when the input is silent. */
const QUANTUM = 128;

class TapProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._capturing = false;
    this._buffer = new Float32Array(CHUNK_FRAMES);
    this._filled = 0;
    this._reportedChannels = -1;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (message.type === "start") {
        this._filled = 0;
        this._reportedChannels = -1;
        this._capturing = true;
        // `currentFrame` is the authoritative clock: the main thread's
        // `currentTime` lags it, and every trim is computed against this.
        this.port.postMessage({
          type: "started",
          startFrame: currentFrame,
          sampleRate,
        });
      } else if (message.type === "stop") {
        this._flush();
        this._capturing = false;
        this.port.postMessage({ type: "stopped" });
      }
    };
  }

  _flush() {
    if (this._filled === 0) return;
    const chunk = this._buffer.slice(0, this._filled);
    // Transferred rather than copied; the slice above already gave us our own
    // buffer, so handing it over costs nothing.
    this.port.postMessage({ type: "chunk", chunk }, [chunk.buffer]);
    this._filled = 0;
  }

  process(inputs) {
    if (!this._capturing) return true;

    const input = inputs[0];
    const channels = input ? input.length : 0;
    const channel = channels > 0 ? input[0] : null;

    // Reported so the host can fail loudly if the bus ever becomes stereo,
    // rather than silently dropping a side.
    if (channels !== this._reportedChannels) {
      this._reportedChannels = channels;
      this.port.postMessage({ type: "channels", channels });
    }

    // A disconnected or silent input arrives as zero channels. Those frames
    // still have to be written, or the buffer's frame count drifts away from
    // `currentFrame` and every subsequent trim is wrong.
    const frames = channel === null ? QUANTUM : channel.length;
    for (let i = 0; i < frames; i += 1) {
      this._buffer[this._filled] = channel === null ? 0 : channel[i];
      this._filled += 1;
      if (this._filled === CHUNK_FRAMES) this._flush();
    }

    return true;
  }
}

registerProcessor("sono-tap", TapProcessor);
