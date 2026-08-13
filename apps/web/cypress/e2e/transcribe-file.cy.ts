import { readPartNames } from '../support/multipart';
import { signInOnTheWayTo } from '../support/session';
import { buildTranscription } from '../support/transcriptions';

const AUDIO_CONTENT = 'RIFF----WAVEfmt consulta de cardiologia';
const FILE_NAME = 'consulta-cardiologia.wav';

const UPLOAD_URL = 'https://almacenamiento.example.test/vocali-audio';

const PRESIGNED_FIELDS = {
  key: 'audio/4b1f0c3a/tr-consulta-01.wav',
  'Content-Type': 'audio/wav',
  policy: 'eyJleHBpcmF0aW9uIjoiMjAyNi0wOC0xMVQwOTozMDowMFoifQ',
  'x-amz-algorithm': 'AWS4-HMAC-SHA256',
  'x-amz-credential': 'AKIAEXAMPLE/20260811/eu-west-1/s3/aws4_request',
  'x-amz-date': '20260811T091500Z',
  'x-amz-signature': '5f2c0a7d9b3e18c4a6d0f7b25e91c8ab',
};

const TRANSCRIPTION_ID = 'tr-consulta-01';

const UPLOAD_INTENT = {
  transcriptionId: TRANSCRIPTION_ID,
  upload: {
    url: UPLOAD_URL,
    fields: PRESIGNED_FIELDS,
    expiresAt: '2026-08-11T09:30:00.000Z',
  },
};

describe('Transcribing an audio file', () => {
  it('sends the policy fields before the file, and follows the upload until it is transcribed', () => {
    cy.intercept('POST', '/api/uploads', { statusCode: 200, body: UPLOAD_INTENT }).as(
      'uploadIntent',
    );

    // A cross-origin POST, so the stub has to say the origin may read the
    // answer; without the header the browser reports a network failure.
    cy.intercept('POST', UPLOAD_URL, {
      statusCode: 204,
      headers: { 'access-control-allow-origin': '*' },
    }).as('storageUpload');

    /*
     * Refused, so the run takes the fallback rather than waiting out the
     * socket's budget on a connection this browser cannot open.
     */
    cy.intercept('POST', '/api/connection-tickets', { statusCode: 503, body: {} }).as('ticket');

    cy.intercept('GET', `/api/transcriptions/${TRANSCRIPTION_ID}`, {
      statusCode: 200,
      body: buildTranscription({
        id: TRANSCRIPTION_ID,
        fileName: FILE_NAME,
        status: 'COMPLETED',
        textPreview: 'El paciente refiere molestias torácicas desde hace dos semanas.',
      }),
    }).as('record');

    signInOnTheWayTo('/transcribir');

    cy.get('[data-testid=file-input]').selectFile(
      {
        contents: Cypress.Buffer.from(AUDIO_CONTENT),
        fileName: FILE_NAME,
        mimeType: 'audio/wav',
      },
      { force: true },
    );

    cy.get('[data-testid=selected-file-name]').should('contain', FILE_NAME);
    cy.get('[data-testid=submit-button]').click();

    // No language: the provider identifies it from the audio, so the screen
    // has nothing to ask and nothing to send.
    cy.wait('@uploadIntent').its('request.body').should('deep.equal', {
      fileName: FILE_NAME,
      contentType: 'audio/wav',
      sizeBytes: AUDIO_CONTENT.length,
    });

    cy.wait('@storageUpload').then((interception): void => {
      const partNames = readPartNames(interception.request.body);

      expect(partNames).to.deep.equal([...Object.keys(PRESIGNED_FIELDS), 'file']);
    });

    cy.get('[data-testid=processing-notice]').should('be.visible');

    cy.wait('@record', { timeout: 25_000 });
    cy.get('[data-testid=transcription-result]', { timeout: 25_000 }).should('contain', FILE_NAME);
    cy.get('[data-testid=transcription-preview]').should(
      'contain',
      'El paciente refiere molestias torácicas',
    );
  });

  it('refuses a file over the 20 MB limit before anything is uploaded', () => {
    cy.intercept('POST', '/api/uploads', { statusCode: 200, body: UPLOAD_INTENT }).as(
      'uploadIntent',
    );

    signInOnTheWayTo('/transcribir');

    cy.get('[data-testid=file-input]').selectFile(
      {
        contents: Cypress.Buffer.alloc(21 * 1024 * 1024),
        fileName: 'sesion-larga.wav',
        mimeType: 'audio/wav',
      },
      { force: true },
    );

    cy.get('[data-testid=rejection-alert]').should(
      'contain',
      '«sesion-larga.wav» ocupa 21 MB y el límite es 20 MB.',
    );
    cy.get('[data-testid=selected-file-name]').should('not.exist');

    cy.get('[data-testid=submit-button]').click();
    cy.get('[data-testid=rejection-alert]').should(
      'contain',
      'Elige primero un archivo de audio para transcribirlo.',
    );

    cy.get('@uploadIntent.all').should('have.length', 0);
  });

  it('says what to do when the storage refuses the upload', () => {
    cy.intercept('POST', '/api/uploads', { statusCode: 200, body: UPLOAD_INTENT }).as(
      'uploadIntent',
    );

    cy.intercept('POST', UPLOAD_URL, {
      statusCode: 403,
      headers: { 'access-control-allow-origin': '*' },
      body: '<Error><Code>AccessDenied</Code></Error>',
    }).as('storageUpload');

    signInOnTheWayTo('/transcribir');

    cy.get('[data-testid=file-input]').selectFile(
      {
        contents: Cypress.Buffer.from(AUDIO_CONTENT),
        fileName: FILE_NAME,
        mimeType: 'audio/wav',
      },
      { force: true },
    );
    cy.get('[data-testid=submit-button]').click();

    cy.wait('@storageUpload');

    cy.get('[data-testid=failure-alert]').should(
      'contain',
      'Vuelve a intentarlo con un archivo de menos de 20 MB.',
    );
  });
});
