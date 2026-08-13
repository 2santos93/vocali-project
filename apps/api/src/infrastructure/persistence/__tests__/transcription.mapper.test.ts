import type { TranscriptionPrimitives } from '../../../domain/types/transcription-primitives.js';
import {
  buildPartitionKey,
  buildTranscriptionSortKey,
  MalformedTranscriptionRecordError,
  toTranscriptionItem,
  toTranscriptionPrimitives,
} from '../transcription.mapper.js';

const COMPLETED_FILE_UPLOAD: TranscriptionPrimitives = {
  id: '01JAAAAAAAAAAAAAAAAAAAAAAA',
  version: 3,
  userId: 'a3f1c2d4-0000-4000-8000-000000000001',
  fileName: 'informe radiologia.mp3',
  source: 'FILE',
  status: 'COMPLETED',
  language: 'es',
  sizeBytes: 2_048,
  durationSeconds: 42.5,
  audioObjectKey: 'audio/user-1/01A/informe radiologia.mp3',
  transcriptObjectKey: 'transcripts/user-1/01A.txt',
  externalJobId: 'job-1',
  textPreview: 'el paciente refiere dolor leve',
  errorMessage: 'the provider rejected the audio',
  createdAt: '2026-08-10T10:00:00.000Z',
  updatedAt: '2026-08-10T10:05:00.000Z',
};

/** Every field that may be null, actually null. */
const PENDING_MICROPHONE_SESSION: TranscriptionPrimitives = {
  ...COMPLETED_FILE_UPLOAD,
  source: 'MICROPHONE',
  status: 'PENDING_UPLOAD',
  sizeBytes: null,
  durationSeconds: null,
  audioObjectKey: null,
  transcriptObjectKey: null,
  externalJobId: null,
  textPreview: null,
  errorMessage: null,
};

describe('transcription mapper', () => {
  describe('toTranscriptionItem', () => {
    it('derives the partition and sort keys from the user and the record', () => {
      const item = toTranscriptionItem(COMPLETED_FILE_UPLOAD);

      expect(item.PK).toBe(`USER#${COMPLETED_FILE_UPLOAD.userId}`);
      expect(item.SK).toBe(`TRANS#${COMPLETED_FILE_UPLOAD.id}`);
      expect(item.PK).toBe(buildPartitionKey(COMPLETED_FILE_UPLOAD.userId));
      expect(item.SK).toBe(buildTranscriptionSortKey(COMPLETED_FILE_UPLOAD.id));
    });
  });

  describe('round trip', () => {
    // Asserted field by field rather than with one deep equality: a single
    // `toEqual` against a fixture passes just as happily when the mapper and
    // the fixture are both missing a field the entity has gained.
    it('preserves every field of a populated record', () => {
      const restored = toTranscriptionPrimitives(toTranscriptionItem(COMPLETED_FILE_UPLOAD));

      expect(restored.id).toBe('01JAAAAAAAAAAAAAAAAAAAAAAA');
      expect(restored.userId).toBe('a3f1c2d4-0000-4000-8000-000000000001');
      expect(restored.fileName).toBe('informe radiologia.mp3');
      expect(restored.source).toBe('FILE');
      expect(restored.status).toBe('COMPLETED');
      expect(restored.language).toBe('es');
      expect(restored.sizeBytes).toBe(2_048);
      expect(restored.durationSeconds).toBe(42.5);
      expect(restored.audioObjectKey).toBe('audio/user-1/01A/informe radiologia.mp3');
      expect(restored.transcriptObjectKey).toBe('transcripts/user-1/01A.txt');
      expect(restored.externalJobId).toBe('job-1');
      expect(restored.textPreview).toBe('el paciente refiere dolor leve');
      expect(restored.errorMessage).toBe('the provider rejected the audio');
      expect(restored.createdAt).toBe('2026-08-10T10:00:00.000Z');
      expect(restored.updatedAt).toBe('2026-08-10T10:05:00.000Z');
    });

    it('preserves every nullable field as null rather than dropping it', () => {
      const restored = toTranscriptionPrimitives(toTranscriptionItem(PENDING_MICROPHONE_SESSION));

      expect(restored.sizeBytes).toBeNull();
      expect(restored.durationSeconds).toBeNull();
      expect(restored.audioObjectKey).toBeNull();
      expect(restored.transcriptObjectKey).toBeNull();
      expect(restored.externalJobId).toBeNull();
      expect(restored.textPreview).toBeNull();
      expect(restored.errorMessage).toBeNull();
      // A dropped attribute and an attribute stored as null are the same
      // absence to a naive reader, so the keys themselves are checked.
      expect(Object.keys(restored).sort()).toEqual(Object.keys(COMPLETED_FILE_UPLOAD).sort());
    });

    it('leaves the storage keys out of the domain record', () => {
      const restored = toTranscriptionPrimitives(toTranscriptionItem(COMPLETED_FILE_UPLOAD));

      expect(restored).not.toHaveProperty('PK');
      expect(restored).not.toHaveProperty('SK');
    });
  });

  describe('toTranscriptionPrimitives', () => {
    it('rejects a record missing an attribute rather than returning a half-built one', () => {
      const withoutFileName: Record<string, unknown> = {
        ...toTranscriptionItem(COMPLETED_FILE_UPLOAD),
      };
      delete withoutFileName.fileName;

      expect(() => toTranscriptionPrimitives(withoutFileName)).toThrow(
        MalformedTranscriptionRecordError,
      );
    });

    it('rejects a status outside the set the domain can represent', () => {
      const drifted = { ...toTranscriptionItem(COMPLETED_FILE_UPLOAD), status: 'ARCHIVED' };

      expect(() => toTranscriptionPrimitives(drifted)).toThrow(MalformedTranscriptionRecordError);
    });

    it('rejects an attribute stored with the wrong type', () => {
      const drifted = { ...toTranscriptionItem(COMPLETED_FILE_UPLOAD), sizeBytes: '2048' };

      expect(() => toTranscriptionPrimitives(drifted)).toThrow(MalformedTranscriptionRecordError);
    });

    it.each(['createdAt', 'updatedAt'])(
      'rejects %s stored as a string that is not a timestamp',
      (field) => {
        const drifted = { ...toTranscriptionItem(COMPLETED_FILE_UPLOAD), [field]: 'yesterday' };

        // These two travel out to the client unchanged, so accepting any
        // string lets a value like this surface as a history row the front end
        // cannot sort or format.
        expect(() => toTranscriptionPrimitives(drifted)).toThrow(MalformedTranscriptionRecordError);
      },
    );

    it('fails deliberately rather than with a TypeError, and carries a stable code', () => {
      let thrown: unknown;
      try {
        toTranscriptionPrimitives({ id: 'only-an-id' });
      } catch (error) {
        thrown = error;
      }

      // Branching on `code` rather than on `name` or `instanceof`: the bundler
      // mangles class names, so the code is the only stable discriminator.
      expect((thrown as MalformedTranscriptionRecordError).code).toBe('MALFORMED_PERSISTED_RECORD');
      expect(thrown).not.toBeInstanceOf(TypeError);
    });

    it('names the offending attributes without repeating their stored values', () => {
      const drifted = {
        ...toTranscriptionItem(COMPLETED_FILE_UPLOAD),
        status: 'ARCHIVED',
        textPreview: 42,
      };

      let message = '';
      try {
        toTranscriptionPrimitives(drifted);
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain('status');
      expect(message).toContain('textPreview');
      // The record holds clinical text. A message that quoted the rejected
      // values would carry it into every log line the failure touches.
      expect(message).not.toContain('el paciente refiere dolor leve');
      expect(message).not.toContain('ARCHIVED');
    });
  });
});
