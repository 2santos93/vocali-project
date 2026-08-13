import type { MessageKey } from './MessageKey';
import type { MessageValues } from './MessageValues';
import type { TranslatableMessage } from './TranslatableMessage';

export interface Translate {
  (key: MessageKey, values?: MessageValues): string;
  (message: TranslatableMessage): string;
}
