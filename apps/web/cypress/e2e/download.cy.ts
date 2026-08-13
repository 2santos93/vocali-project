import { signInOnTheWayTo } from '../support/session';
import { buildTranscription } from '../support/transcriptions';

const TRANSCRIPT_URL = 'https://transcripciones.example.test/tr-consulta-01.txt?firma=corta';

const COMPLETED = buildTranscription({
  id: 'tr-consulta-01',
  fileName: 'consulta-cardiologia.wav',
  status: 'COMPLETED',
});

const PROCESSING = buildTranscription({
  id: 'tr-consulta-02',
  fileName: 'revision-neumologia.wav',
  status: 'PROCESSING',
  durationSeconds: null,
  textPreview: null,
});

const FAILED = buildTranscription({
  id: 'tr-consulta-03',
  fileName: 'urgencias-madrugada.wav',
  status: 'FAILED',
  textPreview: null,
  errorMessage: 'No se ha podido transcribir el audio.',
});

const PENDING_UPLOAD = buildTranscription({
  id: 'tr-consulta-04',
  fileName: 'seguimiento-oncologia.wav',
  status: 'PENDING_UPLOAD',
  durationSeconds: null,
  sizeBytes: null,
  textPreview: null,
});

function stubHistory(): void {
  cy.intercept('GET', '/api/transcriptions*', {
    statusCode: 200,
    body: { items: [COMPLETED, PROCESSING, FAILED, PENDING_UPLOAD], nextCursor: null },
  }).as('history');
}

describe('Downloading a transcription', () => {
  it('offers the download only on the completed transcription', () => {
    stubHistory();
    signInOnTheWayTo('/historial');
    cy.wait('@history');

    cy.get('[data-testid=history-row]').should('have.length', 4);

    cy.get('[data-testid=history-row]')
      .eq(0)
      .within(() => {
        cy.get('[data-testid=history-download]').should('contain', 'Descargar');
      });

    for (const row of [1, 2, 3]) {
      cy.get('[data-testid=history-row]')
        .eq(row)
        .within(() => {
          cy.get('[data-testid=history-download]').should('not.exist');
          cy.get('[data-testid=history-no-actions]').should('exist');
        });
    }
  });

  it('asks for the signed URL when the button is pressed, and not before', () => {
    stubHistory();

    cy.intercept('GET', '/api/transcriptions/*/download*', {
      statusCode: 200,
      body: { url: TRANSCRIPT_URL, format: 'txt', expiresAt: '2026-08-11T09:30:00.000Z' },
    }).as('downloadUrl');

    // Answered as an attachment, which is what makes the browser download the
    // transcript instead of navigating away from the application.
    cy.intercept('GET', 'https://transcripciones.example.test/**', {
      statusCode: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="consulta-cardiologia.txt"',
      },
      body: 'El paciente refiere molestias torácicas desde hace dos semanas.',
    }).as('transcriptFile');

    signInOnTheWayTo('/historial');
    cy.wait('@history');

    cy.get('[data-testid=history-download]').should('be.visible');

    // Nothing asked for, and no address on the page that could have been: a
    // rendered link carries a signature that expires while the page is open.
    cy.get('@downloadUrl.all').should('have.length', 0);
    cy.get('[data-testid=history-download]').should('match', 'button');
    cy.get('a[href*="transcripciones.example.test"]').should('not.exist');

    cy.get('[data-testid=history-download]').click();

    cy.wait('@downloadUrl')
      .its('request.url')
      .should('contain', '/api/transcriptions/tr-consulta-01/download');

    // The browser followed the URL it was handed, and it landed as a file.
    cy.wait('@transcriptFile');
    cy.readFile('cypress/downloads/consulta-cardiologia.txt').should(
      'contain',
      'El paciente refiere molestias torácicas',
    );
  });

  it('says why when the signed URL cannot be minted, and leaves the history readable', () => {
    stubHistory();

    cy.intercept('GET', '/api/transcriptions/*/download*', {
      statusCode: 404,
      body: { code: 'TRANSCRIPTION_NOT_FOUND', message: 'No encontrada.' },
    }).as('downloadUrl');

    signInOnTheWayTo('/historial');
    cy.wait('@history');

    cy.get('[data-testid=history-download]').click();
    cy.wait('@downloadUrl');

    cy.contains('No hemos podido preparar la descarga. Vuelve a intentarlo.').should('be.visible');
    cy.get('[data-testid=history-row]').should('have.length', 4);
  });
});
