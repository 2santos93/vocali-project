/**
 * The records the API hands back, written out here rather than imported from
 * `@vocali/contracts`.
 *
 * The application parses every one of these responses against the contract
 * before it renders them, so a stub assembled from the contract's own schema
 * would be checked against itself: the two would agree by construction, and a
 * field renamed on both sides at once would still pass. Written as literals,
 * a shape the front end no longer accepts stops the journey at the screen,
 * which is where it would stop for a user.
 */

export type TranscriptionStatus = 'PENDING_UPLOAD' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface TranscriptionRecord {
  readonly id: string;
  readonly fileName: string;
  readonly source: 'FILE' | 'MICROPHONE';
  readonly status: TranscriptionStatus;
  readonly language: string;
  readonly durationSeconds: number | null;
  readonly sizeBytes: number | null;
  readonly textPreview: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TranscriptionPage {
  readonly items: readonly TranscriptionRecord[];
  /** Opaque to the client, which is the property the pagination test rests on. */
  readonly nextCursor: string | null;
}

const COMPLETED_RECORD: TranscriptionRecord = {
  id: 'tr-consulta-01',
  fileName: 'consulta-cardiologia.wav',
  source: 'FILE',
  status: 'COMPLETED',
  language: 'es',
  durationSeconds: 184,
  sizeBytes: 3_145_728,
  textPreview: 'El paciente refiere molestias torácicas desde hace dos semanas.',
  errorMessage: null,
  createdAt: '2026-08-11T09:15:00.000Z',
  updatedAt: '2026-08-11T09:17:20.000Z',
};

export function buildTranscription(
  overrides: Partial<TranscriptionRecord> = {},
): TranscriptionRecord {
  return { ...COMPLETED_RECORD, ...overrides };
}

/**
 * A run of records numbered from `firstNumber`, newest first, as the history
 * screen expects to receive them.
 */
export function buildTranscriptions(count: number, firstNumber: number): TranscriptionRecord[] {
  return Array.from({ length: count }, (_unused, offset) => {
    const number = String(firstNumber + offset).padStart(2, '0');

    return buildTranscription({
      id: `tr-consulta-${number}`,
      fileName: `consulta-${number}.wav`,
    });
  });
}
