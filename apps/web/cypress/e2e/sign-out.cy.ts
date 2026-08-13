import { signInOnTheWayTo } from '../support/session';
import { buildTranscriptions } from '../support/transcriptions';

/**
 * Journey 3: signing out.
 *
 * The requirement is that the session ends **at Cognito**, and that is not
 * something a browser can observe: it is the server's `GlobalSignOut` call,
 * pinned by the server's own tests. What a browser can observe, and what these
 * tests pin, is that pressing the control actually reaches the route that
 * makes that call, and that the application stops behaving as though anybody
 * is signed in either way.
 */

describe('Signing out', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: { items: buildTranscriptions(2, 1), nextCursor: null },
    }).as('history');
  });

  it('asks the server to end the session and returns to the sign-in screen', () => {
    cy.intercept('POST', '/api/auth/logout', {
      statusCode: 200,
      body: { status: 'SIGNED_OUT' },
    }).as('signOut');

    signInOnTheWayTo('/historial');
    cy.get('[data-testid=signed-in-user]').should('be.visible');

    cy.get('[data-testid=sign-out]').click();

    cy.wait('@signOut').its('request.method').should('equal', 'POST');

    cy.location('pathname').should('equal', '/login');
    cy.contains('h1', 'Iniciar sesión').should('be.visible');

    // The application chrome goes with the session. A header still offering
    // "Cerrar sesión" after signing out is a signed-in interface over nothing.
    cy.get('[data-testid=sign-out]').should('not.exist');
    cy.get('[data-testid=signed-in-user]').should('not.exist');
  });

  it('still signs this browser out when the server could not finish the job', () => {
    cy.intercept('POST', '/api/auth/logout', {
      statusCode: 502,
      body: {
        code: 'SIGN_OUT_INCOMPLETE',
        message:
          'Hemos cerrado la sesión en este navegador, pero no hemos podido cerrarla en los demás. Vuelve a intentarlo en unos minutos.',
      },
    }).as('signOut');

    signInOnTheWayTo('/historial');

    cy.get('[data-testid=sign-out]').click();
    cy.wait('@signOut');

    // The route clears the cookies before it reports the failure, so leaving
    // the interface signed in would show a state the next request contradicts.
    cy.location('pathname').should('equal', '/login');
    cy.get('[data-testid=sign-out]').should('not.exist');
  });
});
