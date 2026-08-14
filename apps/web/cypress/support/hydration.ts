/**
 * Waits for the client to take over the server's markup.
 *
 * Vue records the application on its mount container, so the property appears
 * at the moment the page stops being HTML and starts having handlers. A click
 * landing before that is swallowed silently: the element is there, the event
 * fires, and nothing is listening.
 *
 * That is a race with the machine rather than with the code, which is why it
 * passed on a laptop and failed on a CI runner.
 */
export function waitForHydration(): void {
  cy.get('#__nuxt').should(($root) => {
    expect($root[0]).to.have.property('__vue_app__');
  });
}
