import { typeIntoField } from './forms';

/**
 * Signing in, as every protected journey has to start.
 *
 * There is no shortcut available and that is by design: the session lives in
 * cookies the server marks httpOnly, so nothing a test can run in the browser
 * could forge one. Going through the form is the only way in, and it costs
 * three commands.
 *
 * What is stubbed is the reply from `/api/auth/login`. Cognito is not reached,
 * so none of this proves that a password is checked — that lives in the
 * server's own tests. What it does prove is everything the browser does either
 * side of the reply: the guarded route, the destination carried through the
 * redirect, the session the shell then believes in, and the screens that open
 * up because of it.
 */

export const SIGNED_IN_EMAIL = 'ana.torres@clinicavocali.es';

export const SIGN_IN_PASSWORD = 'Consulta7-segura';

const SIGNED_IN_USER = {
  email: SIGNED_IN_EMAIL,
  subject: '4b1f0c3a-2d77-4f19-9b5e-6c0a8de41c25',
};

/**
 * Answers the sign-in route, so that no spec can reach Cognito even when the
 * screen it is driving misbehaves.
 */
export function stubSignIn(): void {
  cy.intercept('POST', '/api/auth/login', { statusCode: 200, body: SIGNED_IN_USER }).as('signIn');
}

/**
 * Asks for a protected screen while signed out, signs in on the sign-in form
 * the application interposes, and expects to arrive at the screen originally
 * asked for.
 *
 * The path must be one that needs a session; `/login` itself is not one.
 */
export function signInOnTheWayTo(
  path: string,
  visitOptions: Partial<Cypress.VisitOptions> = {},
): void {
  stubSignIn();

  cy.visit(path, visitOptions);

  cy.location('pathname').should('equal', '/login');

  typeIntoField('Correo electrónico', SIGNED_IN_EMAIL);
  typeIntoField('Contraseña', SIGN_IN_PASSWORD);
  cy.contains('button', 'Entrar').click();

  cy.wait('@signIn');

  cy.location('pathname').should('equal', path);
}
