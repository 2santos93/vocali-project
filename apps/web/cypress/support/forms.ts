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
