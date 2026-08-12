/*
 * Turns captured microphone audio into the frames the transcription provider
 * accepts, on the audio thread.
 *
 * This runs inside `AudioWorkletGlobalScope`, which is why it is plain
 * JavaScript served from `public/` rather than a module compiled with the rest
 * of the front end: the browser fetches it by URL and evaluates it in a scope
 * that has no DOM, no bundler and no imports.
 *
 * Why a worklet at all: the obvious alternative, `ScriptProcessorNode`, is
 * deprecated and runs its callback on the main thread. Under render pressure —
 * a re-render of the growing transcript is exactly that — the main thread is
 * busy and the callback is late, so samples are dropped. A dropped buffer is
 * not a glitch the user hears; it is a hole in a clinician's dictation that
 * nothing downstream can detect or repair. This code runs on the audio thread
 * instead, where rendering cannot starve it.
 *
 * The conversion here is the whole job. The provider is configured for
 * `pcm_s16le`: little-endian signed 16-bit samples. The Web Audio API renders
 * 32-bit floats nominally in [-1, 1]. Nothing resamples: the `AudioContext` is
 * constructed at the provider's rate, so the samples arriving here are already
 * at 16 kHz and only their representation has to change.
 */

/*
 * The asymmetry is deliberate and is what the format specifies. Two's
 * complement gives one more step below zero than above it, so full-scale
 * negative is -32768 and full-scale positive is 32767. Scaling both by 32768
 * would wrap the loudest positive sample round to the most negative value —
 * audible as a click on precisely the loudest moment of the recording.
 */
const INT16_MAX = 32767;
const INT16_MIN = -32768;

class PcmEncoderProcessor extends AudioWorkletProcessor {
  /**
   * @param {Float32Array[][]} inputs one entry per connected input, each an
   *   array of channels, each channel a block of samples.
   * @returns {boolean} whether to keep this processor alive.
   */
  process(inputs) {
    const channels = inputs[0];

    /*
     * Every one of these returns `true`.
     *
     * `false` tells the browser this processor has finished and lets it
     * collect the node. A momentarily silent or not-yet-connected input
     * produces an empty block, and treating that as "finished" ends the
     * capture permanently the first time the stream hiccups — the recording
     * would appear to keep running while sending nothing at all.
     */
    if (channels === undefined) {
      return true;
    }

    // Channel 0 only. The capture asks for a mono stream, and the provider is
    // configured for one channel; if a device hands over more anyway, mixing
    // them here would change the sample count the format promises.
    const samples = channels[0];
    if (samples === undefined || samples.length === 0) {
      return true;
    }

    const frame = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];

      /*
       * Clamp first. The renderer's floats are only nominally bounded — gain,
       * a summed graph or a driver can push a sample past 1.0 — and scaling an
       * out-of-range value overflows the Int16Array, which wraps rather than
       * saturates. Wrapping turns a moment that was merely too loud into a
       * burst of noise at the opposite polarity.
       */
      const clamped = Math.min(1, Math.max(-1, sample));
      frame[index] = Math.round(clamped < 0 ? clamped * -INT16_MIN : clamped * INT16_MAX);
    }

    // Transferred, not copied: ownership of the buffer moves to the main
    // thread. Copying every block would allocate continuously on the audio
    // thread, where an allocation pause is a gap in the recording.
    this.port.postMessage(frame.buffer, [frame.buffer]);
    return true;
  }
}

registerProcessor('pcm-encoder', PcmEncoderProcessor);
