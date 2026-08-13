import { signInOnTheWayTo } from '../support/session';
import { buildTranscriptions } from '../support/transcriptions';

/**
 * Journey 6: browsing the paginated history.
 *
 * Two things are pinned here and neither is reachable below the browser.
 *
 * **Ten per page.** The number is a product requirement, and the screen states
 * it in a sentence the user reads. Asserting the literal ten — rather than the
 * constant the application computes it from — is what makes the assertion fail
 * when the page size changes, instead of agreeing with whatever the constant
 * happens to say.
 *
 * **The cursor.** The API pages forwards over an opaque key and has no
 * backwards page to ask for, so "Anterior" is served from a trail of cursors
 * the browser remembers. Nothing below the running application holds that
 * trail. There are deliberately no page numbers asserted: a page number is not
 * expressible against an opaque cursor, and asserting one would pin a
 * counter rather than a journey.
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

    // Eleven records is not something this screen can show without silently
    // breaking the requirement, so it reports a failure the user can retry
    // rather than quietly growing the page.
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

    // The cursor the first page returned is the one the second page is asked
    // for. A client that invented an offset instead would ask for something
    // this API does not serve.
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

    // A 401 is the session being over, not the network being unreliable, and
    // the two need different remedies: repeating a request that will 401 again
    // reads to a clinician as the product refusing to work.
    cy.contains('Tu sesión ha caducado').should('be.visible');
    cy.contains('button', 'Iniciar sesión').should('be.visible');
    cy.contains('button', 'Reintentar').should('not.exist');
  });
});
