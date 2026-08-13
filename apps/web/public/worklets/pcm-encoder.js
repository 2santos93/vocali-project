const INT16_MAX = 32767;
const INT16_MIN = -32768;

class PcmEncoderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];

    if (channels === undefined) {
      return true;
    }

    const samples = channels[0];
    if (samples === undefined || samples.length === 0) {
      return true;
    }

    const frame = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];

      const clamped = Math.min(1, Math.max(-1, sample));
      frame[index] = Math.round(clamped < 0 ? clamped * -INT16_MIN : clamped * INT16_MAX);
    }

    this.port.postMessage(frame.buffer, [frame.buffer]);
    return true;
  }
}

registerProcessor('pcm-encoder', PcmEncoderProcessor);
