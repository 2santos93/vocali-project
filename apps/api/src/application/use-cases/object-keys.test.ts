import { buildAudioObjectKey, buildTranscriptObjectKey } from './object-keys.js';

describe('buildAudioObjectKey', () => {
  it('joins the user, transcription and file name under the audio prefix', () => {
    expect(buildAudioObjectKey('user-1', '01ID001', 'visit.mp3')).toBe(
      'audio/user-1/01ID001/visit.mp3',
    );
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
