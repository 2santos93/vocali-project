import type { TranscriptionUpdateStream } from './TranscriptionUpdateStream';
import type { UpdateStreamHandlers } from './UpdateStreamHandlers';

export type UpdateStreamOpener = (
  handlers: UpdateStreamHandlers,
) => Promise<TranscriptionUpdateStream>;
