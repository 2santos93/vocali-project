import { SequentialIdGenerator } from '../sequential-id-generator.js';

describe('SequentialIdGenerator', () => {
  it('starts at 01ID001 and increments in order', () => {
    const generator = new SequentialIdGenerator();

    expect(generator.next()).toBe('01ID001');
    expect(generator.next()).toBe('01ID002');
  });

  it('stays lexicographically ordered past the ninth id', () => {
    const generator = new SequentialIdGenerator();
    const ids = Array.from({ length: 12 }, () => generator.next());

    const descending = [...ids].sort((left, right) => right.localeCompare(left));

    expect(descending).toEqual([...ids].reverse());
  });
});
