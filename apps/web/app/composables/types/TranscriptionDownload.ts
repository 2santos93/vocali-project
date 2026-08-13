import type { Transcription, TranscriptFormat } from '@vocali/contracts';
import type { Ref } from 'vue';
import type { TranslatableMessage } from '../../i18n/types/TranslatableMessage';

export interface TranscriptionDownload {
  /** The transcription whose URL is being fetched, so its row can show it. */
  readonly downloadingId: Readonly<Ref<string | null>>;
  readonly errorMessage: Readonly<Ref<TranslatableMessage | null>>;
  download: (transcription: Transcription, format?: TranscriptFormat) => Promise<void>;
  dismissError: () => void;
}
