import { signInOnTheWayTo } from '../support/session';
import { buildTranscriptions } from '../support/transcriptions';

/**
 * Journey 6: browsing the paginated history.
 *
 * **Ten per page**, asserted as the literal rather than the constant the
 * application computes it from, so the assertion fails when the page size
 * changes instead of agreeing with whatever the constant happens to say.
 *
 * **The cursor.** The API pages forwards over an opaque key and has no
 * backwards page to ask for, so "Anterior" is served from a trail the browser
 * remembers, and nothing below the running application holds it. No page
 * numbers are asserted: one is not expressible against an opaque cursor.
 */

const SECOND_PAGE_CURSOR = 'eyJwayI6InVzZXIjNGIxZiIsInNrIjoiMDFKQlFY';

describe('Browsing the transcription history', () => {
  it('shows exactly ten transcriptions on a full page, and says so', () => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: { items: buildTranscriptions(10, 1), nextCursor: SECOND_PAGE_CURSOR },
    }).as('history');

    signInOnTheWayTo('/historial');
    cy.wait('@history');

    cy.contains('en páginas de 10').should('be.visible');
    cy.get('[data-testid=history-row]').should('have.length', 10);
    cy.get('[data-testid=history-row]').first().should('contain', 'consulta-01.wav');
    cy.get('[data-testid=history-row]').last().should('contain', 'consulta-10.wav');
  });

  it('refuses a page the API overfilled instead of showing more than a page holds', () => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: { items: buildTranscriptions(11, 1), nextCursor: null },
    }).as('history');

    signInOnTheWayTo('/historial');
    cy.wait('@history');

    // Eleven records would silently break the requirement, so the screen
    // reports a failure the user can retry rather than growing the page.
    cy.get('[data-testid=history-row]').should('not.exist');
    cy.contains('No hemos podido cargar tu historial').should('be.visible');
  });

  it('advances with Siguiente and comes back to the same first page with Anterior', () => {
    cy.intercept('GET', '/api/transcriptions*', (request): void => {
      const cursor = new URL(request.url).searchParams.get('cursor');

      request.reply({
        statusCode: 200,
        body:
          cursor === null
            ? { items: buildTranscriptions(10, 1), nextCursor: SECOND_PAGE_CURSOR }
            : { items: buildTranscriptions(4, 11), nextCursor: null },
      });
    }).as('history');

    signInOnTheWayTo('/historial');

    cy.wait('@history').its('request.url').should('not.contain', 'cursor=');
    cy.get('[data-testid=history-row]').first().should('contain', 'consulta-01.wav');
    cy.get('[data-testid=pagination-previous]').should('be.disabled');

    cy.get('[data-testid=pagination-next]').click();

    // The cursor the first page returned is the one the second is asked for; a
    // client inventing an offset asks for something this API does not serve.
    cy.wait('@history')
      .its('request.url')
      .should('contain', `cursor=${encodeURIComponent(SECOND_PAGE_CURSOR)}`);

    cy.get('[data-testid=history-row]').should('have.length', 4);
    cy.get('[data-testid=history-row]').first().should('contain', 'consulta-11.wav');
    cy.get('[data-testid=pagination-next]').should('be.disabled');

    cy.get('[data-testid=pagination-previous]').click();

    // Backwards is the trail, not a request the API could answer: the first
    // page is fetched again with no cursor at all.
    cy.wait('@history').its('request.url').should('not.contain', 'cursor=');
    cy.get('[data-testid=history-row]').should('have.length', 10);
    cy.get('[data-testid=history-row]').first().should('contain', 'consulta-01.wav');
    cy.get('[data-testid=pagination-previous]').should('be.disabled');
  });

  it('invites a first upload when there is nothing to show', () => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: { items: [], nextCursor: null },
    }).as('history');

    signInOnTheWayTo('/historial');
    cy.wait('@history');

    cy.contains('Todavía no tienes transcripciones').should('be.visible');
    cy.contains('button', 'Transcribir un archivo').click();
    cy.location('pathname').should('equal', '/transcribir');
  });

  it('offers a way back in when the session ended rather than a retry that cannot work', () => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 401,
      body: { code: 'SESSION_EXPIRED', message: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' },
    }).as('history');

    signInOnTheWayTo('/historial');
    cy.wait('@history');

    // A 401 is the session being over, not the network being unreliable:
    // repeating a request that will 401 again reads as the product refusing
    // to work.
    cy.contains('Tu sesión ha caducado').should('be.visible');
    cy.contains('button', 'Iniciar sesión').should('be.visible');
    cy.contains('button', 'Reintentar').should('not.exist');
  });
});
