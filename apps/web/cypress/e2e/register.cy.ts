import { typeIntoField } from '../support/forms';

const EMAIL = 'nuevo.medico@clinicavocali.es';
const PASSWORD = 'Consulta7-segura';

describe('Registering an account', () => {
  it('creates the account, confirms the address and arrives at the sign-in screen', () => {
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 200,
      body: { status: 'CONFIRMATION_REQUIRED', email: EMAIL },
    }).as('register');

    cy.intercept('POST', '/api/auth/confirm', {
      statusCode: 200,
      body: { status: 'CONFIRMED' },
    }).as('confirm');

    cy.visit('/register');
    cy.contains('h1', 'Crear cuenta').should('be.visible');

    typeIntoField('Correo electrónico', EMAIL);
    typeIntoField('Contraseña', PASSWORD);
    cy.contains('button', 'Crear cuenta').click();

    cy.wait('@register')
      .its('request.body')
      .should('deep.equal', { email: EMAIL, password: PASSWORD });

    // The address travels with the navigation, so the confirmation screen knows
    // which account it is confirming without asking for it again.
    cy.location('pathname').should('equal', '/confirm');
    cy.contains('h1', 'Confirma tu correo').should('be.visible');
    cy.contains(EMAIL).should('be.visible');

    typeIntoField('Código de verificación', '463928');
    cy.contains('button', 'Confirmar cuenta').click();

    cy.wait('@confirm').its('request.body').should('deep.equal', { email: EMAIL, code: '463928' });

    cy.location('pathname').should('equal', '/login');
    cy.contains('Tu cuenta ya está confirmada. Puedes iniciar sesión.').should('be.visible');
  });

  it('offers a new code when the one that arrived has expired', () => {
    cy.intercept('POST', '/api/auth/confirm', {
      statusCode: 400,
      body: {
        code: 'CODE_EXPIRED',
        message: 'El código ha caducado. Pide uno nuevo y vuelve a introducirlo.',
      },
    }).as('confirm');

    cy.intercept('POST', '/api/auth/resend', { statusCode: 200, body: { status: 'CODE_SENT' } }).as(
      'resend',
    );

    cy.visit(`/confirm?email=${encodeURIComponent(EMAIL)}`);

    typeIntoField('Código de verificación', '000000');
    cy.contains('button', 'Confirmar cuenta').click();

    cy.wait('@confirm');
    cy.contains('El código ha caducado. Pide uno nuevo y vuelve a introducirlo.').should(
      'be.visible',
    );

    // The screen is not a dead end: a code that expired while the user was
    // elsewhere is the ordinary path through it, not an edge case.
    cy.get('[data-testid=resend-code]').click();
    cy.wait('@resend').its('request.body').should('deep.equal', { email: EMAIL });

    cy.contains(
      'Te hemos enviado un código nuevo. Puede tardar un par de minutos en llegar.',
    ).should('be.visible');
  });

  it('reports a refused password in Spanish and keeps the visitor on the form', () => {
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 400,
      body: {
        code: 'WEAK_PASSWORD',
        message:
          'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y símbolos.',
      },
    }).as('register');

    cy.visit('/register');

    typeIntoField('Correo electrónico', EMAIL);
    typeIntoField('Contraseña', 'secreto');
    cy.contains('button', 'Crear cuenta').click();

    cy.wait('@register');

    cy.contains(
      'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y símbolos.',
    ).should('be.visible');
    cy.location('pathname').should('equal', '/register');
  });

  it('will not submit an empty form, and says which field is missing', () => {
    cy.intercept('POST', '/api/auth/register', {
      statusCode: 200,
      body: { status: 'CONFIRMATION_REQUIRED', email: EMAIL },
    }).as('register');

    cy.visit('/register');
    cy.contains('button', 'Crear cuenta').click();

    cy.contains('Introduce tu correo electrónico.').should('be.visible');
    cy.contains('Introduce tu contraseña.').should('be.visible');
    cy.get('@register.all').should('have.length', 0);
  });
});
