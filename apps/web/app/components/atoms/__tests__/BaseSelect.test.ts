import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import BaseSelect from '../BaseSelect.vue';
import type { SelectOption } from '../../types/SelectOption';
import { withTranslations } from '../../../i18n/testing';

const LANGUAGES: readonly SelectOption[] = [
  { value: 'es', label: 'Español' },
  { value: 'ca', label: 'Catalán' },
  { value: 'eu', label: 'Euskera', disabled: true },
];

function mountSelect(props: Record<string, unknown> = {}): VueWrapper {
  return mount(BaseSelect, {
    global: withTranslations(),
    props: { id: 'idioma', modelValue: 'es', options: LANGUAGES, ...props },
  });
}

describe('BaseSelect', () => {
  it('carries the id it was given, so a label can point at it', () => {
    expect(mountSelect().attributes('id')).toBe('idioma');
  });

  it('renders one option per entry, labelled in Spanish', () => {
    const options = mountSelect().findAll('option');

    expect(options.map((option) => option.text())).toEqual(['Español', 'Catalán', 'Euskera']);
    expect(options.map((option) => option.attributes('value'))).toEqual(['es', 'ca', 'eu']);
  });

  it('disables only the options marked as disabled', () => {
    const options = mountSelect().findAll('option');

    expect(options[0]?.attributes('disabled')).toBeUndefined();
    expect(options[2]?.attributes('disabled')).toBeDefined();
  });

  it('selects the bound value', () => {
    expect((mountSelect({ modelValue: 'ca' }).element as HTMLSelectElement).value).toBe('ca');
  });

  /*
   * Through `find('select')`, not the component wrapper: `VueWrapper.setValue`
   * emits `update:modelValue` on the instance itself, so the assertion would
   * hold even if the component ignored the change entirely.
   */
  it('emits update:modelValue with the chosen value', async () => {
    const wrapper = mountSelect();

    await wrapper.find('select').setValue('ca');

    expect(wrapper.emitted('update:modelValue')).toEqual([['ca']]);
  });

  it('prepends a disabled placeholder when one is given, and none otherwise', () => {
    expect(mountSelect().findAll('option')).toHaveLength(3);

    const withPlaceholder = mountSelect({ placeholder: 'Elige un idioma' });
    const first = withPlaceholder.findAll('option')[0];
    expect(withPlaceholder.findAll('option')).toHaveLength(4);
    expect(first?.text()).toBe('Elige un idioma');
    expect(first?.attributes('disabled')).toBeDefined();
    expect(first?.attributes('value')).toBe('');
  });

  it('announces invalidity as well as painting it', () => {
    const valid = mountSelect();
    expect(valid.attributes('aria-invalid')).toBeUndefined();
    expect(valid.classes()).toContain('border-line');

    const invalid = mountSelect({ invalid: true });
    expect(invalid.attributes('aria-invalid')).toBe('true');
    expect(invalid.classes()).toContain('border-danger-line');
  });

  it('points at the description it was given, and omits the attribute otherwise', () => {
    expect(mountSelect().attributes('aria-describedby')).toBeUndefined();
    expect(mountSelect({ describedBy: 'idioma-hint' }).attributes('aria-describedby')).toBe(
      'idioma-hint',
    );
  });

  it('passes through disabled and required', () => {
    const wrapper = mountSelect({ disabled: true, required: true });

    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('required')).toBeDefined();
  });

  it('carries a visible focus ring', () => {
    expect(mountSelect().classes()).toContain('focus-visible:focus-ring');
  });
});
