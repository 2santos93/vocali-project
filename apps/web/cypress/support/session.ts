import { typeIntoField } from './forms';
import { waitForHydration } from './hydration';

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

export function signInOnTheWayTo(
  path: string,
  visitOptions: Partial<Cypress.VisitOptions> = {},
): void {
  stubSignIn();

  cy.visit(path, visitOptions);

  cy.location('pathname').should('equal', '/login');

  waitForHydration();

  typeIntoField('Correo electrónico', SIGNED_IN_EMAIL);
  typeIntoField('Contraseña', SIGN_IN_PASSWORD);
  cy.contains('button', 'Entrar').click();

  cy.wait('@signIn');

  cy.location('pathname').should('equal', path);
}
