/**
 * Reaching a field the way a user reaches it: by the label above it.
 *
 * Not by its id, and not by walking the markup. A selector chain that mirrors
 * the DOM tree breaks on the next restyle while pinning nothing, and an id is
 * an implementation detail nobody sees. The label is the one handle a person
 * and a screen reader both use, so going through it also fails when the label
 * stops naming the field — an accessibility defect that no amount of visual
 * checking catches.
 */
export function typeIntoField(label: string, value: string): void {
  cy.contains('label', label)
    .invoke('attr', 'for')
    .then((fieldId: string | undefined) => {
      expect(fieldId, `the label «${label}» names a field`).to.be.a('string');

      cy.get(`#${String(fieldId)}`)
        .clear()
        .type(value);
    });
}
