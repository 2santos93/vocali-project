import { providerSocket, useSilentMicrophoneAndProviderSocket } from '../support/microphone';
import type { ProviderSocket } from '../support/microphone';
import { signInOnTheWayTo } from '../support/session';
import { buildTranscription } from '../support/transcriptions';

/**
 * Journey 5: dictating into the microphone and having it transcribed live.
 *
 * The microphone and the provider's stream are replaced at the boundary the
 * application uses rather than skipped; everything between them is real — the
 * session request through the proxy, the audio graph, the state machine, the
 * screen, and the save.
 *
 * No audio is transcribed and no provider is contacted. Under test is the
 * application's half of the protocol.
 */

const SESSION = {
  token: 'proveedor-token-efimero',
  websocketUrl: 'wss://transcripcion.example.test/v2',
  expiresAt: '2026-08-11T09:30:00.000Z',
  audioFormat: { type: 'raw', encoding: 'pcm_s16le', sampleRate: 16_000 },
};

const SAVED = buildTranscription({
  id: 'tr-dictado-01',
  fileName: 'Dictado del 11 de agosto',
  source: 'MICROPHONE',
  status: 'COMPLETED',
  sizeBytes: null,
  textPreview: 'Paciente de 62 años con dolor lumbar irradiado.',
});

function visitDictation(): void {
  cy.intercept('POST', '/api/realtime-sessions', { statusCode: 200, body: SESSION }).as(
    'realtimeSession',
  );
  cy.intercept('POST', '/api/transcriptions/realtime', { statusCode: 200, body: SAVED }).as(
    'saveDictation',
  );

  signInOnTheWayTo('/dictar', { onBeforeLoad: useSilentMicrophoneAndProviderSocket });
}

/** Takes the dictation as far as the provider having accepted the stream. */
function startDictating(): Cypress.Chainable<ProviderSocket> {
  cy.contains('button', 'Empezar a dictar').click();
  cy.wait('@realtimeSession');

  return providerSocket().then((socket): ProviderSocket => {
    // The credential is minted for the browser and travels in the query
    // string, because a browser websocket cannot carry an Authorization
    // header.
    expect(socket.url).to.contain('jwt=proveedor-token-efimero');

    socket.accept();

    // Announced from the session the API minted rather than restated by the
    // client. A mismatch is rejected by the provider only after the socket is
    // open and the user has already started speaking.
    expect(socket.messagesSent[0]).to.deep.equal({
      message: 'StartRecognition',
      audio_format: { type: 'raw', encoding: 'pcm_s16le', sample_rate: 16_000 },
      transcription_config: {
        language: 'es',
        operating_point: 'enhanced',
        enable_partials: true,
      },
    });

    socket.deliver({ message: 'RecognitionStarted' });

    return socket;
  });
}

describe('Dictating by microphone', () => {
  it('shows the words while they are being spoken and saves the dictation', () => {
    visitDictation();

    cy.get('[data-testid=transcript-placeholder]').should('be.visible');

    startDictating().then((socket): void => {
      cy.get('[data-testid=recording-indicator]').should('be.visible');

      socket.deliver({
        message: 'AddPartialTranscript',
        metadata: { transcript: 'Paciente de sesenta y dos' },
      });

      // A partial is rendered as provisional, and said to be so in words: a
      // tail that looks settled and is then rewritten reads as the system
      // contradicting itself.
      cy.get('[data-testid=partial-text]').should('contain', 'Paciente de sesenta y dos');
      cy.get('[data-testid=partial-legend]').should(
        'contain',
        'El texto en cursiva todavía es provisional',
      );

      cy.then((): void => {
        socket.deliver({
          message: 'AddTranscript',
          metadata: { transcript: 'Paciente de 62 años con dolor lumbar irradiado.' },
        });
      });

      cy.get('[data-testid=final-text]').should(
        'contain',
        'Paciente de 62 años con dolor lumbar irradiado.',
      );
      cy.get('[data-testid=partial-text]').should('not.exist');

      cy.contains('button', 'Detener y guardar').click();

      // Stopping tells the provider no more audio is coming and waits for its
      // last words before saving.
      cy.wrap(socket)
        .its('messagesSent')
        .should('have.length', 2)
        .then((sent: unknown[]): void => {
          expect(sent[1]).to.have.property('message', 'EndOfStream');
        });

      cy.then((): void => {
        socket.deliver({ message: 'EndOfTranscript' });
      });
    });

    cy.wait('@saveDictation').its('request.body').should('deep.include', {
      text: 'Paciente de 62 años con dolor lumbar irradiado.',
      language: 'es',
    });

    cy.get('[data-testid=saved-alert]').should(
      'contain',
      'La transcripción se ha guardado. Puedes consultarla en el historial.',
    );
    cy.get('[data-testid=transcription-result]').should('contain', 'Dictado del 11 de agosto');
  });

  it('keeps what was dictated when the connection drops, and saves it on request', () => {
    visitDictation();

    startDictating().then((socket): void => {
      socket.deliver({
        message: 'AddTranscript',
        metadata: { transcript: 'Paciente de 62 años con dolor lumbar irradiado.' },
      });

      cy.get('[data-testid=final-text]').should('contain', 'dolor lumbar irradiado');

      // The socket goes away underneath a dictation that is still running.
      // Losing a clinician's words here is the worst thing this screen can do.
      cy.then((): void => {
        socket.drop(1006);
      });
    });

    cy.get('[data-testid=failure-alert]').should(
      'contain',
      'No se ha perdido nada de lo transcrito',
    );
    cy.get('[data-testid=final-text]').should(
      'contain',
      'Paciente de 62 años con dolor lumbar irradiado.',
    );

    cy.get('[data-testid=save-recovered-button]').click();

    cy.wait('@saveDictation')
      .its('request.body')
      .should('deep.include', { text: 'Paciente de 62 años con dolor lumbar irradiado.' });

    cy.get('[data-testid=saved-alert]').should('be.visible');
  });

  it('says what to do when the microphone session cannot be minted', () => {
    cy.intercept('POST', '/api/realtime-sessions', {
      statusCode: 502,
      body: { code: 'PROVIDER_UNAVAILABLE', message: 'No disponible.' },
    }).as('realtimeSession');

    signInOnTheWayTo('/dictar', { onBeforeLoad: useSilentMicrophoneAndProviderSocket });

    cy.contains('button', 'Empezar a dictar').click();
    cy.wait('@realtimeSession');

    cy.get('[data-testid=failure-alert]').should(
      'contain',
      'No hemos podido preparar la sesión de dictado. Inténtalo de nuevo en unos segundos.',
    );
    cy.get('[data-testid=recording-indicator]').should('not.exist');
  });
});
