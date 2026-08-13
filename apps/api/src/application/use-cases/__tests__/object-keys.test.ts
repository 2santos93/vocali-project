import {
  buildAudioObjectKey,
  buildTranscriptObjectKey,
  parseAudioObjectKey,
} from '../object-keys.js';

describe('buildAudioObjectKey', () => {
  it('joins the user, transcription and file name under the audio prefix', () => {
    expect(buildAudioObjectKey('user-1', '01ID001', 'visit.mp3')).toBe(
      'audio/user-1/01ID001/visit.mp3',
    );
  });
});

describe('parseAudioObjectKey', () => {
  it('extracts the user and transcription ids from a well-formed key', () => {
    expect(parseAudioObjectKey('audio/user-1/01A/visit.mp3')).toEqual({
      userId: 'user-1',
      transcriptionId: '01A',
    });
  });

  it('reads back what the builder wrote', () => {
    // The two halves of one format. Written as a round trip because they were
    // previously in different modules, each with its own copy of the prefix.
    expect(parseAudioObjectKey(buildAudioObjectKey('user-1', '01A', 'visit.mp3'))).toEqual({
      userId: 'user-1',
      transcriptionId: '01A',
    });
  });

  it('returns null for a key without the audio prefix', () => {
    expect(parseAudioObjectKey('transcripts/user-1/01A/visit.txt')).toBeNull();
  });

  it('returns null for a key missing the transcription id segment', () => {
    expect(parseAudioObjectKey('audio/user-1')).toBeNull();
  });

  it('returns null for a key with fewer than four segments even with a prefix and ids', () => {
    expect(parseAudioObjectKey('audio/user-1/01A')).toBeNull();
  });

  it('returns null for a key with an empty user id segment', () => {
    expect(parseAudioObjectKey('audio//01A/visit.mp3')).toBeNull();
  });

  it('returns null for a key of entirely empty segments', () => {
    expect(parseAudioObjectKey('audio///')).toBeNull();
  });

  it('parses a key with extra trailing segments structurally, leaving rejection to the caller', () => {
    // Deliberately permissive: four non-empty segments, so it parses.
    // `StartFileTranscription.execute` is what rejects this, by comparing the
    // full key against the record's own `audioObjectKey`.
    expect(parseAudioObjectKey('audio/user-1/01A/sub/dir/visit.mp3')).toEqual({
      userId: 'user-1',
      transcriptionId: '01A',
    });
  });
});

describe('buildTranscriptObjectKey', () => {
  it('joins the user and transcription id with the txt extension', () => {
    expect(buildTranscriptObjectKey('user-1', '01A', 'txt')).toBe('transcripts/user-1/01A.txt');
  });

  it('joins the user and transcription id with the json extension', () => {
    expect(buildTranscriptObjectKey('user-1', '01A', 'json')).toBe('transcripts/user-1/01A.json');
  });
});
