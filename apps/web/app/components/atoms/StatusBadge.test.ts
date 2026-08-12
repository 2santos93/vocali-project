import { TRANSCRIPTION_STATUSES } from '@vocali/contracts';
import { mount } from '@vue/test-utils';
import StatusBadge from './StatusBadge.vue';

describe('StatusBadge', () => {
  it.each([
    ['PENDING_UPLOAD', 'Pendiente de subida'],
    ['PROCESSING', 'Procesando'],
    ['COMPLETED', 'Completada'],
    ['FAILED', 'Fallida'],
  ] as const)('renders %s in Spanish', (status, expectedLabel) => {
    const wrapper = mount(StatusBadge, { props: { status } });

    expect(wrapper.text()).toBe(expectedLabel);
  });

  // The list comes from @vocali/contracts, so a status added on the backend
  // fails here rather than reaching a clinician as a blank badge.
  it('covers every status the contracts package defines', () => {
    const rendered = TRANSCRIPTION_STATUSES.map((status) =>
      mount(StatusBadge, { props: { status } }).text(),
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
    expect(mount(StatusBadge, { props: { status } }).classes()).toContain(expectedClass);
  });

  it('gives every status its own colour', () => {
    const backgrounds = TRANSCRIPTION_STATUSES.map(
      (status) =>
        mount(StatusBadge, { props: { status } })
          .classes()
          .find((className) => className.startsWith('bg-')) ?? '',
    );

    expect(new Set(backgrounds).size).toBe(TRANSCRIPTION_STATUSES.length);
  });

  // Colour is a second channel, never the only one: the text alone has to
  // carry the state on a monochrome screen.
  it('states the status in text, not only in colour', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'FAILED' } });

    expect(wrapper.text()).toBe('Fallida');
    expect(wrapper.attributes('data-status')).toBe('FAILED');
  });
});
