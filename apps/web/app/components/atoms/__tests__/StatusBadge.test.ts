import { TRANSCRIPTION_STATUSES } from '@vocali/contracts';
import { mount } from '@vue/test-utils';
import StatusBadge from '../StatusBadge.vue';
import { withTranslations } from '../../../i18n/testing';

describe('StatusBadge', () => {
  it.each([
    ['PENDING_UPLOAD', 'Pendiente de subida'],
    ['PROCESSING', 'Procesando'],
    ['COMPLETED', 'Completada'],
    ['FAILED', 'Fallida'],
  ] as const)('renders %s in Spanish', (status, expectedLabel) => {
    const wrapper = mount(StatusBadge, { global: withTranslations(), props: { status } });

    expect(wrapper.text()).toBe(expectedLabel);
  });

  it('covers every status the contracts package defines', () => {
    const rendered = TRANSCRIPTION_STATUSES.map((status) =>
      mount(StatusBadge, { global: withTranslations(), props: { status } }).text(),
    );

    expect(rendered).toHaveLength(4);
    expect(rendered.every((text) => text.length > 0)).toBe(true);
    expect(new Set(rendered).size).toBe(TRANSCRIPTION_STATUSES.length);
  });

  it.each([
    ['PENDING_UPLOAD', 'bg-muted-soft'],
    ['PROCESSING', 'bg-info-soft'],
    ['COMPLETED', 'bg-success-soft'],
    ['FAILED', 'bg-danger-soft'],
  ] as const)('paints %s distinctly', (status, expectedClass) => {
    expect(
      mount(StatusBadge, { global: withTranslations(), props: { status } }).classes(),
    ).toContain(expectedClass);
  });

  it('gives every status its own colour', () => {
    const backgrounds = TRANSCRIPTION_STATUSES.map(
      (status) =>
        mount(StatusBadge, { global: withTranslations(), props: { status } })
          .classes()
          .find((className) => className.startsWith('bg-')) ?? '',
    );

    expect(new Set(backgrounds).size).toBe(TRANSCRIPTION_STATUSES.length);
  });

  it('states the status in text, not only in colour', () => {
    const wrapper = mount(StatusBadge, { global: withTranslations(), props: { status: 'FAILED' } });

    expect(wrapper.text()).toBe('Fallida');
    expect(wrapper.attributes('data-status')).toBe('FAILED');
  });

  it.each([
    ['PENDING_UPLOAD', 'Awaiting upload'],
    ['PROCESSING', 'In progress'],
    ['COMPLETED', 'Completed'],
    ['FAILED', 'Failed'],
  ] as const)('renders %s in English for a reader who chose it', (status, expectedLabel) => {
    const wrapper = mount(StatusBadge, { global: withTranslations('en'), props: { status } });

    expect(wrapper.text()).toBe(expectedLabel);
  });
});
