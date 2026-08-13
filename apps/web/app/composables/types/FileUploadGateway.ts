import type { CreateUploadIntentRequest, CreateUploadIntentResponse } from '@vocali/contracts';
import type { PresignedPostUpload } from './PresignedPostUpload';
import type { SettlementWatchGateway } from './SettlementWatchGateway';

/**
 * Extends what the settle watch needs rather than restating it, so the two
 * cannot drift: the page supplies one object and both halves read from it.
 */
export interface FileUploadGateway extends SettlementWatchGateway {
  createUploadIntent(request: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse>;
  uploadToStorage(upload: PresignedPostUpload): Promise<void>;
}
