import type { z } from 'zod';
import type { ProviderCallbackQuerySchema } from '../handlers/handle-provider-callback.js';

export type CallbackQuery = z.infer<typeof ProviderCallbackQuerySchema>;
