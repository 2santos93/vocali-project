import { AudioFile } from '../value-objects/audio-file.js';
import { Transcription } from './transcription.js';

const AT = new Date('2026-08-10T10:00:00.000Z');
const LATER = new Date('2026-08-10T10:01:00.000Z');

function buildAudioFile(): AudioFile {
  const result = AudioFile.create({
    fileName: 'visit.mp3',
    contentType: 'audio/mpeg',
    sizeBytes: 2_048,
  });
  if (!result.success) throw new Error('fixture must be valid');
  return result.value;
}

function buildPendingTranscription(): Transcription {
  return Transcription.createForFileUpload({
    id: '01ABC',
    userId: 'user-1',
    audioFile: buildAudioFile(),
    audioObjectKey: 'audio/user-1/01ABC/visit.mp3',
    language: 'es',
    createdAt: AT,
  });
}

describe('Transcription', () => {
  it('starts pending upload when created from a file', () => {
    const transcription = buildPendingTranscription();

    expect(transcription.status).toBe('PENDING_UPLOAD');
    expect(transcription.toPrimitives().source).toBe('FILE');
    expect(transcription.toPrimitives().textPreview).toBeNull();
  });

  it('starts completed when created from a realtime session', () => {
    const transcription = Transcription.createFromRealtimeSession({
      id: '01DEF',
      userId: 'user-1',
      language: 'es',
      durationSeconds: 12,
      transcriptObjectKey: 'transcripts/user-1/01DEF.txt',
      text: 'the patient reports mild pain',
      createdAt: AT,
    });

    expect(transcription.status).toBe('COMPLETED');
    expect(transcription.toPrimitives().source).toBe('MICROPHONE');
    expect(transcription.toPrimitives().textPreview).toBe('the patient reports mild pain');
  });

  it('moves to processing and records the external job id', () => {
    const transcription = buildPendingTranscription();

    const result = transcription.markAsProcessing('job-77', LATER);

    expect(result.success).toBe(true);
    expect(transcription.status).toBe('PROCESSING');
    expect(transcription.externalJobId).toBe('job-77');
    expect(transcription.toPrimitives().updatedAt).toBe(LATER.toISOString());
  });

  it('stores a truncated preview when completed', () => {
    const transcription = buildPendingTranscription();
    transcription.markAsProcessing('job-77', LATER);

    const result = transcription.markAsCompleted({
      transcriptObjectKey: 'transcripts/user-1/01ABC.txt',
      text: 'a'.repeat(500),
      durationSeconds: 30,
      at: LATER,
    });

    expect(result.success).toBe(true);
    expect(transcription.status).toBe('COMPLETED');
    expect(transcription.toPrimitives().textPreview).toHaveLength(200);
    expect(transcription.toPrimitives().durationSeconds).toBe(30);
  });

  it('refuses to complete a transcription that was never processing', () => {
    const transcription = buildPendingTranscription();

    const result = transcription.markAsCompleted({
      transcriptObjectKey: 'transcripts/user-1/01ABC.txt',
      text: 'text',
      durationSeconds: 1,
      at: LATER,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
    }
    expect(transcription.status).toBe('PENDING_UPLOAD');
  });

  it('records the reason when it fails', () => {
    const transcription = buildPendingTranscription();

    const result = transcription.markAsFailed('provider rejected the audio', LATER);

    expect(result.success).toBe(true);
    expect(transcription.status).toBe('FAILED');
    expect(transcription.toPrimitives().errorMessage).toBe('provider rejected the audio');
  });

  it('survives a round trip through primitives', () => {
    const original = buildPendingTranscription();

    const restored = Transcription.fromPrimitives(original.toPrimitives());

    expect(restored.toPrimitives()).toEqual(original.toPrimitives());
  });
});
