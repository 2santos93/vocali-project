import { mount } from '@vue/test-utils';
import type { DOMWrapper } from '@vue/test-utils';
import ProgressBar from './ProgressBar.vue';

function indicatorOf(value: number): DOMWrapper<Element> {
  return mount(ProgressBar, { props: { value, label: 'Progreso de la subida' } }).find(
    '[data-testid="progress-indicator"]',
  );
}

describe('ProgressBar', () => {
  it('exposes itself as a labelled progress bar', () => {
    const indicator = indicatorOf(42);

    expect(indicator.attributes('role')).toBe('progressbar');
    expect(indicator.attributes('aria-label')).toBe('Progreso de la subida');
    expect(indicator.attributes('aria-valuemin')).toBe('0');
    expect(indicator.attributes('aria-valuemax')).toBe('100');
    expect(indicator.attributes('aria-valuenow')).toBe('42');
  });

  it('sets the width from the value', () => {
    expect(indicatorOf(42).attributes('style')).toContain('width: 42%');
  });

  // XMLHttpRequest reports `loaded / total * 100`. The first event of an
  // upload has total 0, so the value is NaN; the last can round just past 100.
  // Both would render a bar outside its own track, and NaN would be announced.
  it.each([
    [-10, '0'],
    [0, '0'],
    [100, '100'],
    [140, '100'],
    [Number.NaN, '0'],
    [Number.POSITIVE_INFINITY, '0'],
  ])('clamps a value of %p to %s', (value, expected) => {
    expect(indicatorOf(value).attributes('aria-valuenow')).toBe(expected);
  });

  it('rounds a fractional percentage', () => {
    expect(indicatorOf(42.6).attributes('aria-valuenow')).toBe('43');
  });

  it('shows the percentage as text by default', () => {
    const wrapper = mount(ProgressBar, { props: { value: 42, label: 'Subiendo' } });

    expect(wrapper.text()).toContain('42 %');
  });

  it('can hide the text without losing the announced value', () => {
    const wrapper = mount(ProgressBar, {
      props: { value: 42, label: 'Subiendo', hideValueText: true },
    });

    expect(wrapper.text()).not.toContain('42 %');
    expect(wrapper.find('[data-testid="progress-indicator"]').attributes('aria-valuenow')).toBe(
      '42',
    );
  });
});
