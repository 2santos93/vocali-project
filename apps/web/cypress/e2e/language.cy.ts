import { typeIntoField } from '../support/forms';
import { chooseInterfaceLanguage, expectInterfaceLanguage } from '../support/preferences';
import { SIGNED_IN_EMAIL, SIGN_IN_PASSWORD, stubSignIn } from '../support/session';
import { buildTranscriptions } from '../support/transcriptions';

function signInReadingEnglish(path: string): void {
  stubSignIn();

  cy.visit(path);
  cy.location('pathname').should('equal', '/login');

  typeIntoField('Email address', SIGNED_IN_EMAIL);
  typeIntoField('Password', SIGN_IN_PASSWORD);
  cy.contains('button', 'Sign in').click();

  cy.wait('@signIn');
  cy.location('pathname').should('equal', path);
}

describe('Choosing the interface language', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/transcriptions*', {
      statusCode: 200,
      body: { items: buildTranscriptions(3, 1), nextCursor: null },
    }).as('history');
  });

  it('is Spanish for a visitor who has never chosen', () => {
    cy.visit('/login');

    cy.contains('h1', 'Iniciar sesión').should('be.visible');
    cy.get('html').should('have.attr', 'lang', 'es-ES');
    cy.getCookie('vocali_interface_language').should('be.null');
  });

  it('redraws the screen already on display, without a reload', () => {
    cy.visit('/login');

    chooseInterfaceLanguage('en');

    cy.contains('h1', 'Sign in').should('be.visible');
    cy.contains('button', 'Sign in').should('be.visible');
    cy.get('html').should('have.attr', 'lang', 'en-GB');
    cy.getCookie('vocali_interface_language').should('have.property', 'value', 'en');
  });

  it('is already in the HTML the server sends', () => {
    cy.visit('/login');
    chooseInterfaceLanguage('en');

    cy.request('/login').then((response) => {
      expect(response.body).to.contain('Sign in');
      expect(response.body).to.not.contain('Iniciar sesión');
      expect(response.body).to.match(/<html[^>]*lang="en-GB"/);
    });
  });

  it('leaves every address exactly as it was', () => {
    cy.visit('/login');
    chooseInterfaceLanguage('en');

    signInReadingEnglish('/historial');

    cy.location('pathname').should('equal', '/historial');
    cy.contains('h1', 'Transcription history').should('be.visible');
    cy.contains('a', 'Dictate').click();
    cy.location('pathname').should('equal', '/dictar');
  });

  it('survives a reload and follows the reader across screens', () => {
    cy.visit('/login');
    chooseInterfaceLanguage('en');

    cy.reload();
    cy.contains('h1', 'Sign in').should('be.visible');

    signInReadingEnglish('/transcribir');

    cy.contains('h1', 'Transcribe a file').should('be.visible');
    cy.contains('button', 'Transcribe').should('be.visible');
    expectInterfaceLanguage('en');
  });

  it('ignores a language nobody offered', () => {
    cy.setCookie('vocali_interface_language', 'fr');
    cy.visit('/login');

    cy.contains('h1', 'Iniciar sesión').should('be.visible');
    cy.get('html').should('have.attr', 'lang', 'es-ES');
  });

  it('keeps the language of the audio apart from the language of the screen', () => {
    cy.visit('/login');
    chooseInterfaceLanguage('en');

    signInReadingEnglish('/dictar');

    cy.contains('h1', 'Dictate into the microphone').should('be.visible');

    // The audio languages are named in English, and Spanish is still the one
    // selected: the reader's language did not choose it.
    cy.get('#dictation-language option').should('have.length', 5);
    cy.get('#dictation-language').should('have.value', 'es');
    cy.contains('#dictation-language option', 'Catalan').should('exist');

    cy.get('#dictation-language').select('ca');

    // The screen is still English, and the interface cookie is untouched.
    cy.contains('h1', 'Dictate into the microphone').should('be.visible');
    cy.getCookie('vocali_interface_language').should('have.property', 'value', 'en');
  });

  it('says why a sign-in was refused in the language the reader chose', () => {
    cy.intercept('POST', '/api/auth/login', {
      statusCode: 401,
      body: {
        code: 'INVALID_CREDENTIALS',
        message:
          'El correo electrónico o la contraseña no son correctos. Revísalos e inténtalo de nuevo.',
      },
    }).as('signIn');

    cy.visit('/login');
    chooseInterfaceLanguage('en');

    cy.get('#auth-email').type('ana.torres@clinicavocali.es');
    cy.get('#auth-password').type('equivocada');
    cy.contains('button', 'Sign in').click();

    cy.wait('@signIn');

    cy.contains('That email address or password is not correct.').should('be.visible');
    cy.contains('El correo electrónico o la contraseña no son correctos.').should('not.exist');
  });
});
