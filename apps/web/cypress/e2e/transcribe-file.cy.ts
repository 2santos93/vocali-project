import { readPartNames } from '../support/multipart';
import { signInOnTheWayTo } from '../support/session';
import { buildTranscription } from '../support/transcriptions';

/**
 * Journey 4: transcribing an audio file.
 *
 * The upload goes straight from the browser to storage with a presigned POST,
 * so the interesting part of this journey never touches the application's own
 * server: the browser asks for an intent, assembles a multipart body from the
 * fields it was given, sends 20 MB somewhere else entirely, and then watches
 * the record until it settles.
 *
 * S3 is not reached. The presigned POST is answered by the interceptor, which
 * is what makes the *shape* of that request assertable — and the shape is the
 * thing that goes wrong silently in production.
 */

const AUDIO_CONTENT = 'RIFF----WAVEfmt consulta de cardiologia';
const FILE_NAME = 'consulta-cardiologia.wav';

const UPLOAD_URL = 'https://almacenamiento.example.test/vocali-audio';

/**
 * The order matters and the names do not: these are the fields a presigned
 * POST policy carries, and every one of them has to reach S3 before the file
 * part or it is ignored.
 */
const PRESIGNED_FIELDS = {
  key: 'audio/4b1f0c3a/tr-consulta-01.wav',
  'Content-Type': 'audio/wav',
  policy: 'eyJleHBpcmF0aW9uIjoiMjAyNi0wOC0xMVQwOTozMDowMFoifQ',
  'x-amz-algorithm': 'AWS4-HMAC-SHA256',
  'x-amz-credential': 'AKIAEXAMPLE/20260811/eu-west-1/s3/aws4_request',
  'x-amz-date': '20260811T091500Z',
  'x-amz-signature': '5f2c0a7d9b3e18c4a6d0f7b25e91c8ab',
};

const UPLOAD_INTENT = {
  transcriptionId: 'tr-consulta-01',
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
    // answer; without the header the browser reports a network failure and the
    // screen would be reporting on the test rather than on the application.
    cy.intercept('POST', UPLOAD_URL, {
      statusCode: 204,
      headers: { 'access-control-allow-origin': '*' },
    }).as('storageUpload');

    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: {
        items: [
          buildTranscription({
            id: 'tr-consulta-01',
            fileName: FILE_NAME,
            status: 'COMPLETED',
            textPreview: 'El paciente refiere molestias torácicas desde hace dos semanas.',
          }),
        ],
        nextCursor: null,
      },
    }).as('history');

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

    cy.wait('@uploadIntent').its('request.body').should('deep.equal', {
      fileName: FILE_NAME,
      contentType: 'audio/wav',
      sizeBytes: AUDIO_CONTENT.length,
      language: 'es',
    });

    cy.wait('@storageUpload').then((interception): void => {
      const partNames = readPartNames(interception.request.body);

      /*
       * The whole point of this spec. S3 stops collecting form fields at the
       * file part, so every policy field has to precede it — and a body that
       * gets this wrong fails with a policy error that names none of the
       * fields it never saw, at the end of however long the upload took.
       */
      expect(partNames).to.deep.equal([...Object.keys(PRESIGNED_FIELDS), 'file']);
    });

    cy.get('[data-testid=processing-notice]').should('be.visible');

    // The record is polled until it settles, three seconds apart, so this is
    // the one assertion in the suite that has to outwait a real timer.
    cy.get('[data-testid=transcription-result]', { timeout: 15_000 }).should('contain', FILE_NAME);
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

    /*
     * The client check is a courtesy and the presigned POST policy is the real
     * control — but the courtesy is the difference between a sentence now and
     * a failed upload after twenty megabytes have been sent.
     */
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
