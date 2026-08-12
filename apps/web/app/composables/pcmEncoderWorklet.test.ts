import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInThisContext } from 'node:vm';

/**
 * Drives the real `public/worklets/pcm-encoder.js`, read from disk and
 * evaluated here.
 *
 * It cannot be imported: it is a worklet module, so it has no exports and its
 * top level calls `registerProcessor`, which exists only inside
 * `AudioWorkletGlobalScope`. Evaluating the shipped file against stand-ins for
 * that scope is what makes the conversion testable at all — and it pins the
 * artifact the browser actually fetches, rather than a copy of its arithmetic
 * that could drift away from it without any test noticing.
 */
const WORKLET_SOURCE_PATH = path.join(__dirname, '../../public/worklets/pcm-encoder.js');

interface AudioProcessor {
  process(inputs: Float32Array[][]): boolean;
}

interface LoadedWorklet {
  readonly registeredName: string;
  readonly processor: AudioProcessor;
  /** Every buffer the processor has posted, in the order it posted them. */
  readonly posted: ArrayBuffer[];
  /** The transfer list of the most recent post, or null if none was given. */
  lastTransferList: unknown[] | null;
}

function loadWorklet(): LoadedWorklet {
  const source = readFileSync(WORKLET_SOURCE_PATH, 'utf8');

  const posted: ArrayBuffer[] = [];
  const state: { lastTransferList: unknown[] | null } = { lastTransferList: null };

  class FakeAudioWorkletProcessor {
    public readonly port = {
      postMessage(message: ArrayBuffer, transfer?: unknown[]): void {
        posted.push(message);
        state.lastTransferList = transfer ?? null;
      },
    };
  }

  interface Registration {
    readonly name: string;
    readonly constructor: new () => AudioProcessor;
  }
  const registrations: Registration[] = [];

  /*
   * The worklet's top level calls `registerProcessor`, so the module has to be
   * compiled with that name in scope. Wrapping the source in a function
   * expression and compiling it in this context — rather than a fresh one —
   * keeps `Int16Array` and `ArrayBuffer` the same constructors the assertions
   * below use; across realms the frames would come back as objects this
   * process does not recognise as typed arrays.
   *
   * The only string compiled here is a file from this repository, read from a
   * path fixed at module load. Nothing a user supplies reaches it.
   */
  const evaluate = runInThisContext(
    `(function (AudioWorkletProcessor, registerProcessor) {\n${source}\n})`,
    { filename: WORKLET_SOURCE_PATH },
  ) as (base: unknown, register: unknown) => void;

  evaluate(FakeAudioWorkletProcessor, (name: string, constructor: new () => AudioProcessor) => {
    registrations.push({ name, constructor });
  });

  const registration = registrations[0];
  if (registration === undefined) {
    throw new Error('The worklet module registered no processor.');
  }

  return {
    registeredName: registration.name,
    processor: new registration.constructor(),
    posted,
    get lastTransferList(): unknown[] | null {
      return state.lastTransferList;
    },
  };
}

function processBlock(worklet: LoadedWorklet, samples: number[]): Int16Array {
  worklet.processor.process([[Float32Array.from(samples)]]);
  const buffer = worklet.posted[worklet.posted.length - 1];
  if (buffer === undefined) {
    throw new Error('The processor posted nothing for this block.');
  }
  return new Int16Array(buffer);
}

describe('pcm-encoder worklet', () => {
  it('registers under the name the recorder asks the browser for', () => {
    expect(loadWorklet().registeredName).toBe('pcm-encoder');
  });

  /*
   * The provider is configured for `pcm_s16le`. If this conversion is wrong
   * the socket still opens, audio still flows and the provider still answers —
   * with a transcript of noise. Nothing upstream of this arithmetic can detect
   * that, which is why it is pinned sample by sample.
   */
  it('converts float samples to signed 16-bit', () => {
    const worklet = loadWorklet();

    const frame = processBlock(worklet, [0, 0.5, -0.5, 0.25]);

    expect(Array.from(frame)).toEqual([0, 16384, -16384, 8192]);
  });

  /*
   * Two's complement has one more step below zero than above it. Scaling the
   * positive side by 32768 would wrap full-scale positive round to -32768 — a
   * click on the loudest moment of the dictation, which is exactly when the
   * clinician was speaking most clearly.
   */
  it('scales each polarity to its own full-scale value', () => {
    const worklet = loadWorklet();

    const frame = processBlock(worklet, [1, -1]);

    expect(frame[0]).toBe(32767);
    expect(frame[1]).toBe(-32768);
  });

  /*
   * The renderer's floats are only nominally bounded. An Int16Array wraps
   * rather than saturates, so an unclamped overshoot becomes a burst at the
   * opposite polarity instead of merely being too loud.
   */
  it('clamps a sample that overshoots the nominal range', () => {
    const worklet = loadWorklet();

    const frame = processBlock(worklet, [1.8, -2.4]);

    expect(frame[0]).toBe(32767);
    expect(frame[1]).toBe(-32768);
  });

  it('posts one frame per block, of the same length as the block', () => {
    const worklet = loadWorklet();

    worklet.processor.process([[new Float32Array(128)]]);
    worklet.processor.process([[new Float32Array(128)]]);

    expect(worklet.posted).toHaveLength(2);
    expect(new Int16Array(worklet.posted[0]!)).toHaveLength(128);
  });

  /*
   * Transferring rather than copying is what keeps the audio thread free of a
   * per-block allocation, and an allocation pause on that thread is a gap in
   * the recording.
   */
  it('transfers the buffer instead of copying it', () => {
    const worklet = loadWorklet();

    worklet.processor.process([[new Float32Array(4)]]);

    expect(worklet.lastTransferList).toEqual([worklet.posted[0]]);
  });

  it('reads only the first channel, whatever the device hands over', () => {
    const worklet = loadWorklet();

    worklet.processor.process([[Float32Array.from([0.5]), Float32Array.from([-1])]]);

    expect(Array.from(new Int16Array(worklet.posted[0]!))).toEqual([16384]);
  });

  /*
   * Returning false lets the browser collect the node. A momentarily starved
   * or not-yet-connected input produces an empty block, and ending the capture
   * there would leave the interface showing a recording that is sending
   * nothing at all.
   */
  it.each([
    ['no input at all', [] as Float32Array[][]],
    ['an input with no channels', [[]] as Float32Array[][]],
    ['a channel with no samples', [[new Float32Array(0)]] as Float32Array[][]],
  ])('stays alive and posts nothing given %s', (_description, inputs) => {
    const worklet = loadWorklet();

    expect(worklet.processor.process(inputs)).toBe(true);
    expect(worklet.posted).toHaveLength(0);
  });

  it('stays alive after a block it did encode', () => {
    const worklet = loadWorklet();

    expect(worklet.processor.process([[new Float32Array(128)]])).toBe(true);
  });
});
