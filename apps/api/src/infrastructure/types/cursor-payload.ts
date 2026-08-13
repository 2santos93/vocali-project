/**
 * A client sends this back unmodified, which makes it attacker-controlled
 * input and is why every field is checked rather than parsed and trusted. It
 * must also agree byte for byte with what the in-memory double emits, and the
 * double keeps its own implementation on purpose: two implementations that
 * agree is evidence, one shared implementation is only a definition.
 */
export interface CursorPayload {
  readonly userId: string;
  readonly id: string;
}
