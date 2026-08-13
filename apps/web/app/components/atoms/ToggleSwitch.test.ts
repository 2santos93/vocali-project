import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import ToggleSwitch from './ToggleSwitch.vue';

function mountSwitch(props: Record<string, unknown> = {}): VueWrapper {
  return mount(ToggleSwitch, { props: { modelValue: false, label: 'Modo oscuro', ...props } });
}

describe('ToggleSwitch', () => {
  /*
   * `role="switch"` rather than a checkbox, because the two are announced
   * differently and only one of them is true here: a switch is "on" and "off",
   * a checkbox is "ticked" on a form that has not been submitted. This setting
   * applies the moment it is pressed.
   */
  it('is a switch that says whether it is on', () => {
    expect(mountSwitch().attributes('role')).toBe('switch');
    expect(mountSwitch({ modelValue: false }).attributes('aria-checked')).toBe('false');
    expect(mountSwitch({ modelValue: true }).attributes('aria-checked')).toBe('true');
  });

  it('is named by its visible label rather than by an aria-label', () => {
    const wrapper = mountSwitch();

    expect(wrapper.text()).toContain('Modo oscuro');
    expect(wrapper.attributes('aria-label')).toBeUndefined();
  });

  it.each([
    [false, true],
    [true, false],
  ])('reports the position it was moved to, from %s', async (modelValue, expected) => {
    const wrapper = mountSwitch({ modelValue });

    await wrapper.trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[expected]]);
  });

  /*
   * The whole row is the control, label included. A switch whose hit target is
   * the twenty-pixel track beside the words is a switch that gets missed on a
   * touchscreen.
   */
  it('is pressable across the whole row', () => {
    expect(mountSwitch().classes()).toContain('w-full');
  });

  it('carries a visible focus ring, because it is reached by keyboard', () => {
    expect(mountSwitch().classes()).toContain('focus-visible:focus-ring');
  });

  it('does not submit a form it happens to be dropped into', () => {
    expect(mountSwitch().attributes('type')).toBe('button');
  });

  it('takes a leading icon without letting it speak', () => {
    const wrapper = mount(ToggleSwitch, {
      props: { modelValue: false, label: 'Modo oscuro' },
      slots: { icon: '<svg data-testid="moon" aria-hidden="true" />' },
    });

    expect(wrapper.find('[data-testid=moon]').exists()).toBe(true);
  });
});
