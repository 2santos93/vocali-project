import type { Transcription } from '@vocali/contracts';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import RecordingPanel from './RecordingPanel.vue';
import { withTranslations } from '../../i18n/testing';

const SAVED: Transcription = {
  id: 't-9',
  fileName: 'Dictado 11-08-2026',
  source: 'MICROPHONE',
  status: 'COMPLETED',
  language: 'es',
  durationSeconds: 12,
  sizeBytes: null,
  textPreview: 'El paciente refiere dolor lumbar.',
  errorMessage: null,
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:12.000Z',
};

function panel(props: Record<string, unknown> = {}): VueWrapper {
  return mount(RecordingPanel, {
    global: withTranslations(),
    props: { phase: 'idle', finalText: '', partialText: '', ...props },
  });
}

describe('RecordingPanel', () => {
  it('offers to start a dictation and nothing else when idle', () => {
    const wrapper = panel();

    expect(wrapper.find('[data-testid="start-button"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="discard-button"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="save-recovered-button"]').exists()).toBe(false);
  });

  it('starts with the default language', async () => {
    const wrapper = panel();

    await wrapper.find('[data-testid="start-button"]').trigger('click');

    expect(wrapper.emitted('start')).toEqual([['es']]);
  });

  it('starts with the language the user picked', async () => {
    const wrapper = panel();

    await wrapper.find('select').setValue('gl');
    await wrapper.find('[data-testid="start-button"]').trigger('click');

    expect(wrapper.emitted('start')).toEqual([['gl']]);
  });

  // A stale option in an already-rendered page must not put a language the API
  // rejects into the request.
  it('ignores a language value the contract does not name', async () => {
    const wrapper = panel();

    const select = wrapper.find('select');
    Object.defineProperty(select.element, 'value', { value: 'de', configurable: true });
    await select.trigger('change');
    await wrapper.find('[data-testid="start-button"]').trigger('click');

    expect(wrapper.emitted('start')).toEqual([['es']]);
  });

  it('offers every language the platform transcribes, in Spanish', () => {
    expect(
      panel()
        .findAll('option')
        .map((option) => option.text()),
    ).toEqual(['Español', 'Inglés', 'Catalán', 'Euskera', 'Gallego']);
  });

  it.each([['connecting'], ['recording'], ['finishing'], ['saving']])(
    'locks the language once the dictation is under way (%s)',
    (phase) => {
      expect(panel({ phase }).find('select').attributes('disabled')).toBeDefined();
    },
  );

  it.each([['connecting'], ['recording']])(
    'offers only the stop control while live (%s)',
    (phase) => {
      const wrapper = panel({ phase });

      expect(wrapper.find('[data-testid="stop-button"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="start-button"]').exists()).toBe(false);
    },
  );

  it('asks the caller to stop when the stop control is used', async () => {
    const wrapper = panel({ phase: 'recording' });

    await wrapper.find('[data-testid="stop-button"]').trigger('click');

    expect(wrapper.emitted('stop')).toHaveLength(1);
  });

  /*
   * The distinction that keeps the interface honest. A partial rendered like a
   * final reads as the system contradicting itself the moment it is revised,
   * and the slant carries the meaning where colour alone would not.
   */
  it('renders the provisional tail differently from the confirmed text', () => {
    const wrapper = panel({
      phase: 'recording',
      finalText: 'El paciente refiere ',
      partialText: 'dolor lum',
    });

    const final = wrapper.find('[data-testid="final-text"]');
    const partial = wrapper.find('[data-testid="partial-text"]');

    expect(final.text()).toBe('El paciente refiere');
    expect(partial.text()).toBe('dolor lum');
    expect(partial.classes()).toContain('italic');
    expect(final.classes()).not.toContain('italic');
    expect(partial.classes()).toContain('text-ink-muted');
    expect(final.classes()).toContain('text-ink');
  });

  it('says in words what the italics mean, for anyone the styling does not reach', () => {
    const wrapper = panel({ phase: 'recording', partialText: 'dolor lum' });

    expect(wrapper.find('[data-testid="partial-legend"]').text()).toContain('provisional');
  });

  it('drops the legend once there is no provisional text left', () => {
    const wrapper = panel({ phase: 'recording', finalText: 'Todo confirmado.', partialText: '' });

    expect(wrapper.find('[data-testid="partial-legend"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="partial-text"]').exists()).toBe(false);
  });

  /*
   * Only the confirmed text is announced. The provisional tail is rewritten
   * several times a second, and a live region on that makes a screen reader
   * unusable.
   */
  it('announces the confirmed text and not the provisional tail', () => {
    const wrapper = panel({ phase: 'recording', finalText: 'Confirmado.', partialText: 'provis' });

    expect(wrapper.find('[data-testid="final-text"]').attributes('aria-live')).toBe('polite');
    expect(wrapper.find('[data-testid="partial-text"]').attributes('aria-live')).toBeUndefined();
  });

  it('invites the user to speak before there is anything to show', () => {
    const wrapper = panel();

    expect(wrapper.find('[data-testid="transcript-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="final-text"]').exists()).toBe(false);
  });

  it('replaces the invitation as soon as a word arrives', () => {
    expect(
      panel({ phase: 'recording', partialText: 'El' })
        .find('[data-testid="transcript-placeholder"]')
        .exists(),
    ).toBe(false);
  });

  it.each([
    ['preparing', 'connecting-notice', 'Conectando'],
    ['connecting', 'connecting-notice', 'Conectando'],
    ['recording', 'recording-indicator', 'Grabando'],
    ['finishing', 'finishing-notice', 'últimas palabras'],
    ['saving', 'saving-notice', 'Guardando'],
  ])('says what it is doing during %s', (phase, testId, fragment) => {
    const notice = panel({ phase }).find(`[data-testid="${testId}"]`);

    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain(fragment);
    expect(notice.attributes('role')).toBe('status');
  });

  it('confirms the dictation was stored, and shows the record', () => {
    const wrapper = panel({ phase: 'saved', finalText: 'Algo dicho.', transcription: SAVED });

    expect(wrapper.find('[data-testid="saved-alert"]').text()).toContain('historial');
    const result = wrapper.find('[data-testid="transcription-result"]');
    expect(result.text()).toContain('Dictado 11-08-2026');
    expect(result.find('[data-status="COMPLETED"]').exists()).toBe(true);
  });

  it('shows no record block before there is one', () => {
    expect(panel().find('[data-testid="transcription-result"]').exists()).toBe(false);
  });

  describe('recovering a dictation', () => {
    const CONNECTION_LOST = {
      code: 'CONNECTION_LOST',
      message: { key: 'failure.dictation.connectionLost' },
      recoverable: true,
    };

    /*
     * Losing a clinician's dictation is the worst thing this screen can do, so
     * the way to keep it is a primary action rather than a footnote.
     */
    it('offers to save what survived a dropped connection', () => {
      const wrapper = panel({
        phase: 'failed',
        finalText: 'Primera parte.',
        failure: CONNECTION_LOST,
        hasRecoverableText: true,
      });

      expect(wrapper.find('[data-testid="save-recovered-button"]').text()).toContain(
        'Guardar lo transcrito',
      );
      // The text is still on screen, not merely promised.
      expect(wrapper.find('[data-testid="final-text"]').text()).toBe('Primera parte.');
    });

    it('asks the caller to save the recovered text', async () => {
      const wrapper = panel({
        phase: 'failed',
        finalText: 'Primera parte.',
        failure: CONNECTION_LOST,
        hasRecoverableText: true,
      });

      await wrapper.find('[data-testid="save-recovered-button"]').trigger('click');

      expect(wrapper.emitted('saveRecovered')).toHaveLength(1);
    });

    /*
     * The message says the dictation is safe. Rendering it in the failure
     * colour would contradict the words, and colour is what a user reads first.
     */
    it('presents a recoverable failure as a warning, not as a loss', () => {
      const wrapper = panel({
        phase: 'failed',
        failure: CONNECTION_LOST,
        hasRecoverableText: true,
      });

      expect(wrapper.find('[data-testid="failure-alert"]').classes()).toContain('bg-warning-soft');
    });

    it('presents an unrecoverable failure as an error', () => {
      const wrapper = panel({
        phase: 'failed',
        failure: {
          code: 'MICROPHONE_DENIED',
          message: { key: 'failure.microphone.denied' },
          recoverable: false,
        },
      });

      const alert = wrapper.find('[data-testid="failure-alert"]');
      expect(alert.classes()).toContain('bg-danger-soft');
      // The rendered sentence, not the key: a reader meeting a denied
      // microphone has to be told where to turn it back on.
      expect(alert.text()).toContain('ha denegado el permiso');
      expect(wrapper.find('[data-testid="save-recovered-button"]').exists()).toBe(false);
    });

    it('lets a failed dictation be started again', () => {
      expect(
        panel({ phase: 'failed', failure: CONNECTION_LOST })
          .find('[data-testid="start-button"]')
          .exists(),
      ).toBe(true);
    });

    it('offers to discard text that is no longer wanted', async () => {
      const wrapper = panel({ phase: 'failed', finalText: 'Algo.', failure: CONNECTION_LOST });

      await wrapper.find('[data-testid="discard-button"]').trigger('click');

      expect(wrapper.emitted('discard')).toHaveLength(1);
    });

    // Discarding mid-dictation would throw away words that are still arriving.
    it.each([['recording'], ['finishing'], ['saving']])(
      'refuses to offer discarding during %s',
      (phase) => {
        expect(
          panel({ phase, finalText: 'Algo.' }).find('[data-testid="discard-button"]').exists(),
        ).toBe(false);
      },
    );
  });

  it('joins the language control to its label and its hint', () => {
    const wrapper = panel();

    expect(wrapper.find('label').attributes('for')).toBe('dictation-language');
    expect(wrapper.find('select').attributes('aria-describedby')).toBe('dictation-language-hint');
  });
});
