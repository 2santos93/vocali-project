import { mount } from '@vue/test-utils';
import { computed, defineComponent } from 'vue';
import type { PropType } from 'vue';
import { withTranslations } from '../testing';
import { createInterfaceI18n } from '../translate';
import type { TranslatableMessage } from '../types';
import { useTranslations } from '../translations';

/**
 * The mechanism the design system depends on: a component reaching the
 * interface language through a Vue plugin, with no Nuxt runtime anywhere near
 * it.
 *
 * One harness component rather than several, so the file describes one subject.
 * With no `message` it reports what it can see of the translations; with one,
 * it renders that message the way a panel renders a failure it was handed.
 */
const Speaking = defineComponent({
  props: {
    message: {
      type: Object as PropType<TranslatableMessage | null>,
      default: null,
    },
  },
  setup(props) {
    const { t, locale, language } = useTranslations();

    const line = computed<string>(() =>
      props.message === null
        ? `${t('history.retry')} · ${locale.value} · ${language.value}`
        : t(props.message),
    );

    return { line };
  },
  template: `<p>{{ line }}</p>`,
});

describe('the translations a component injects', () => {
  it('renders in the language that was provided', () => {
    expect(mount(Speaking, { global: withTranslations('es') }).text()).toBe(
      'Reintentar · es-ES · es',
    );
    expect(mount(Speaking, { global: withTranslations('en') }).text()).toBe(
      'Try again · en-GB · en',
    );
  });

  /*
   * Changing language has to redraw the screen already on the display, not only
   * the next one somebody navigates to. A reader who switches and sees the old
   * language until they click something has not been given a language control,
   * they have been given a reload button.
   *
   * Driven through the instance's own locale, which is what the Nuxt plugin
   * writes to when the cookie-backed state changes.
   */
  it('re-renders the screen already on display when the language changes', async () => {
    const i18n = createInterfaceI18n('es');
    const wrapper = mount(Speaking, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toBe('Reintentar · es-ES · es');

    i18n.global.locale.value = 'en';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toBe('Try again · en-GB · en');
  });

  /*
   * The alternative — falling back to a Spanish catalogue of our own when no
   * instance has been installed — would mean a plugin that failed to install
   * shows a Spanish interface to somebody who chose English, on every screen,
   * with nothing anywhere reporting it. A component that renders words and
   * cannot say which language they are in is broken, and says so where it
   * breaks.
   */
  it('refuses to render when no translations were provided', () => {
    expect(() => mount(Speaking)).toThrow('No interface translations were provided');
  });

  it('renders a message that was decided elsewhere, values and all', () => {
    const wrapper = mount(Speaking, {
      global: withTranslations('en'),
      props: { message: { key: 'upload.rejected.empty', values: { fileName: 'x.wav' } } },
    });

    expect(wrapper.text()).toBe('“x.wav” is empty, so there is no audio to transcribe.');
  });

  /*
   * The guarantee the library does not offer. A named value it was not given is
   * substituted with an empty string, so this sentence would reach a user as
   * `“” is empty, so there is no audio to transcribe.` — a refusal that names
   * no file.
   */
  it('refuses to render a message whose placeholder has no value', () => {
    expect(() =>
      mount(Speaking, {
        global: withTranslations('en'),
        props: { message: { key: 'upload.rejected.empty' } },
      }),
    ).toThrow('needs a value for "{fileName}"');
  });
});
