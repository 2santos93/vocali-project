import { mount } from '@vue/test-utils';
import { computed, defineComponent } from 'vue';
import type { PropType } from 'vue';
import { withTranslations } from '../testing';
import { createInterfaceI18n } from '../translate';
import type { TranslatableMessage } from '../types';
import { useTranslations } from '../translations';

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

  it('re-renders the screen already on display when the language changes', async () => {
    const i18n = createInterfaceI18n('es');
    const wrapper = mount(Speaking, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toBe('Reintentar · es-ES · es');

    i18n.global.locale.value = 'en';
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toBe('Try again · en-GB · en');
  });

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

  it('refuses to render a message whose placeholder has no value', () => {
    expect(() =>
      mount(Speaking, {
        global: withTranslations('en'),
        props: { message: { key: 'upload.rejected.empty' } },
      }),
    ).toThrow('needs a value for "{fileName}"');
  });
});
