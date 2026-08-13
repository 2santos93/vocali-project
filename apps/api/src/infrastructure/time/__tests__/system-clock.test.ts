import { SystemClock } from '../system-clock.js';

describe('SystemClock', () => {
  it('reports the current instant', () => {
    const before = Date.now();
    const now = new SystemClock().now();
    const after = Date.now();

    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it('reads the clock on every call rather than freezing at construction', () => {
    const clock = new SystemClock();
    const first = clock.now();

    // A clock that captured its instant once would hand every record in a
    // container the same `createdAt`, which is invisible until a history page
    // comes back in an order nobody can explain.
    while (Date.now() === first.getTime()) {
      /* wait for the millisecond to turn over */
    }

    expect(clock.now().getTime()).toBeGreaterThan(first.getTime());
  });
});
