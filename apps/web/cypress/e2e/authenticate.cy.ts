import { typeIntoField } from '../support/forms';
import { SIGNED_IN_EMAIL, SIGN_IN_PASSWORD, stubSignIn } from '../support/session';
import { buildTranscriptions } from '../support/transcriptions';

/**
 * Journey 2: authenticating, and the guard that makes it necessary.
 *
 * The redirect is the part worth driving in a browser. It is decided by global
 * route middleware that runs on the server for the first navigation and in the
 * browser for every one after it, and neither half is reachable from a unit
 * test: `decideRouteAccess` is pure and covered, but that it is *called*, that
 * the destination survives the round trip, and that a signed-in visitor is not
 * shown the form again are properties of the running application.
 */

describe('Signing in', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: { items: buildTranscriptions(3, 1), nextCursor: null },
    }).as('history');
  });

  it('sends a signed-out visitor to the sign-in screen and then on to where they were going', () => {
    stubSignIn();

    cy.visit('/historial');

    cy.location('pathname').should('equal', '/login');
    cy.contains('h1', 'Iniciar sesión').should('be.visible');

    // The destination travels with the redirect, so signing in resumes the
    // navigation rather than dropping the visitor on a home screen.
    cy.location('search').should('equal', '?redirect=/historial');

    typeIntoField('Correo electrónico', SIGNED_IN_EMAIL);
    typeIntoField('Contraseña', SIGN_IN_PASSWORD);
    cy.contains('button', 'Entrar').click();

    cy.wait('@signIn');

    cy.location('pathname').should('equal', '/historial');
    cy.contains('h1', 'Historial de transcripciones').should('be.visible');
    // Behind the account menu now, and shown in full rather than truncated:
    // "which account am I in" is the question this button exists to answer.
    cy.get('[data-testid=user-menu]').click();
    cy.get('[data-testid=signed-in-user]').should('contain', SIGNED_IN_EMAIL);
  });

  it('guards every protected screen, not only the one that happens to be linked', () => {
    for (const path of ['/transcribir', '/dictar', '/historial']) {
      cy.visit(path);
      cy.location('pathname').should('equal', '/login');
      cy.location('search').should('equal', `?redirect=${path}`);
    }
  });

  it('sends a visitor who asks for nothing in particular to the sign-in screen', () => {
    cy.visit('/');

    cy.location('pathname').should('equal', '/login');
  });

  it('keeps the visitor on the form and says why when the credentials are refused', () => {
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 401,
      body: {
        code: 'INVALID_CREDENTIALS',
        message:
          'El correo electrónico o la contraseña no son correctos. Revísalos e inténtalo de nuevo.',
      },
    }).as('signIn');

    cy.visit('/login');

    typeIntoField('Correo electrónico', SIGNED_IN_EMAIL);
    typeIntoField('Contraseña', 'equivocada');
    cy.contains('button', 'Entrar').click();

    cy.wait('@signIn');

    cy.contains(
      'El correo electrónico o la contraseña no son correctos. Revísalos e inténtalo de nuevo.',
    ).should('be.visible');
    cy.location('pathname').should('equal', '/login');
  });

  it('sends an unconfirmed account to the confirmation screen rather than blaming the password', () => {
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 403,
      body: {
        code: 'ACCOUNT_NOT_CONFIRMED',
        message:
          'Tu cuenta todavía no está confirmada. Introduce el código que te enviamos por correo o pide uno nuevo.',
      },
    }).as('signIn');

    cy.visit('/login');

    typeIntoField('Correo electrónico', SIGNED_IN_EMAIL);
    typeIntoField('Contraseña', SIGN_IN_PASSWORD);
    cy.contains('button', 'Entrar').click();

    cy.wait('@signIn');

    cy.location('pathname').should('equal', '/confirm');
    cy.contains(SIGNED_IN_EMAIL).should('be.visible');
  });
});
