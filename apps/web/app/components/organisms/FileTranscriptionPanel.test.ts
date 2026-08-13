import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import type { Transcription, TranscriptionLanguage } from '@vocali/contracts';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import FileTranscriptionPanel from './FileTranscriptionPanel.vue';
import { withTranslations } from '../../i18n/testing';

function fileOf(name: string, type: string, size: number): File {
  const file = new File(['audio'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const AUDIO_FILE = fileOf('consulta-paciente.mp3', 'audio/mpeg', 1_048_576);

const COMPLETED: Transcription = {
  id: 't-1',
  fileName: 'consulta-paciente.mp3',
  source: 'FILE',
  status: 'COMPLETED',
  language: 'es',
  durationSeconds: 42,
  sizeBytes: 1_048_576,
  textPreview: 'El paciente refiere dolor lumbar de dos semanas.',
  errorMessage: null,
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:01:00.000Z',
};

function panel(props: Record<string, unknown> = {}): VueWrapper {
  return mount(FileTranscriptionPanel, {
    global: withTranslations(),
    props: { phase: 'idle', progress: 0, ...props },
  });
}

function drop(wrapper: VueWrapper, file: File): Promise<void> {
  return wrapper
    .find('[data-testid="file-drop-zone"]')
    .trigger('drop', { dataTransfer: { files: [file] } });
}

function submittedFrom(
  wrapper: VueWrapper,
): { file: File; language: TranscriptionLanguage } | undefined {
  return wrapper.emitted('submit')?.[0]?.[0] as
    { file: File; language: TranscriptionLanguage } | undefined;
}

describe('FileTranscriptionPanel', () => {
  /*
   * The button stays operable with nothing chosen, and says why it will not
   * proceed. A disabled control explains nothing: someone who did not notice
   * that the drop zone refused their file sees a dead button and no reason.
   */
  it('asks for a file instead of submitting nothing', async () => {
    const wrapper = panel();

    await wrapper.find('[data-testid="submit-button"]').trigger('click');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[data-testid="rejection-alert"]').text()).toContain(
      'Elige primero un archivo',
    );
  });

  it('submits the chosen file with the default language', async () => {
    const wrapper = panel();
    await drop(wrapper, AUDIO_FILE);

    await wrapper.find('[data-testid="submit-button"]').trigger('click');

    expect(submittedFrom(wrapper)).toEqual({ file: AUDIO_FILE, language: 'es' });
  });

  it('shows the name of the file that was chosen', async () => {
    const wrapper = panel();

    await drop(wrapper, AUDIO_FILE);

    expect(wrapper.find('[data-testid="selected-file-name"]').text()).toContain(
      'consulta-paciente.mp3',
    );
  });

  it('submits the language the user picked instead of the default', async () => {
    const wrapper = panel();
    await drop(wrapper, AUDIO_FILE);

    await wrapper.find('select').setValue('ca');
    await wrapper.find('[data-testid="submit-button"]').trigger('click');

    expect(submittedFrom(wrapper)?.language).toBe('ca');
  });

  it('offers every language the contract supports, in Spanish', () => {
    const options = panel()
      .findAll('option')
      .map((option) => option.text());

    expect(options).toEqual(['Español', 'Inglés', 'Catalán', 'Euskera', 'Gallego']);
  });

  /*
   * `BaseSelect` speaks in strings because a DOM select does. A value that is
   * not one the contract names must not reach the request, so it is dropped
   * rather than asserted into the union.
   */
  it('ignores a language value the contract does not name', async () => {
    const wrapper = panel();
    await drop(wrapper, AUDIO_FILE);

    const select = wrapper.find('select');
    Object.defineProperty(select.element, 'value', { value: 'de', configurable: true });
    await select.trigger('change');
    await wrapper.find('[data-testid="submit-button"]').trigger('click');

    expect(submittedFrom(wrapper)?.language).toBe('es');
  });

  it('stops asking for a file once one has been chosen', async () => {
    const wrapper = panel();
    await wrapper.find('[data-testid="submit-button"]').trigger('click');

    await drop(wrapper, AUDIO_FILE);
    await wrapper.find('[data-testid="submit-button"]').trigger('click');

    expect(wrapper.emitted('submit')).toHaveLength(1);
    expect(wrapper.find('[data-testid="rejection-alert"]').exists()).toBe(false);
  });

  /*
   * The drop zone owns the limits it checked and phrases the refusal; the
   * panel only decides that it is a warning rather than a failure, because
   * nothing has been attempted yet.
   */
  it('shows the drop zone’s refusal as a warning and keeps the form usable', async () => {
    const wrapper = panel();

    await drop(wrapper, fileOf('grande.wav', 'audio/wav', MAX_AUDIO_FILE_SIZE_BYTES + 1));

    const alert = wrapper.find('[data-testid="rejection-alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('20 MB');

    await wrapper.find('[data-testid="submit-button"]').trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  // A refusal left on screen next to a file that was accepted says the
  // opposite of what happened.
  it('clears the refusal once an acceptable file is chosen', async () => {
    const wrapper = panel();
    await drop(wrapper, fileOf('informe.pdf', 'application/pdf', 2048));
    expect(wrapper.find('[data-testid="rejection-alert"]').exists()).toBe(true);

    await drop(wrapper, AUDIO_FILE);

    expect(wrapper.find('[data-testid="rejection-alert"]').exists()).toBe(false);
  });

  it('forgets a previously chosen file when a later one is refused', async () => {
    const wrapper = panel();
    await drop(wrapper, AUDIO_FILE);

    await drop(wrapper, fileOf('informe.pdf', 'application/pdf', 2048));

    await wrapper.find('[data-testid="submit-button"]').trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('[data-testid="selected-file-name"]').exists()).toBe(false);
  });

  it.each([['requesting'], ['uploading'], ['processing']])(
    'locks the controls while the phase is %s',
    async (phase) => {
      const wrapper = panel({ phase });
      await drop(wrapper, AUDIO_FILE);

      expect(wrapper.find('[data-testid="submit-button"]').attributes('disabled')).toBeDefined();
      expect(wrapper.find('select').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[data-testid="file-input"]').attributes('disabled')).toBeDefined();
    },
  );

  /*
   * Shown only while the file is on its way. A bar during the transcription
   * itself would be measuring nothing, which is the fake-progress problem in a
   * different costume.
   */
  it('shows real upload progress only while the file is being sent', () => {
    expect(panel({ phase: 'requesting' }).find('[role="progressbar"]').exists()).toBe(false);
    expect(panel({ phase: 'processing' }).find('[role="progressbar"]').exists()).toBe(false);

    const uploading = panel({ phase: 'uploading', progress: 42 });
    expect(uploading.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('42');
  });

  it('says the upload is being prepared before it starts sending', () => {
    expect(panel({ phase: 'requesting' }).text()).toContain('Preparando la subida');
  });

  it('says transcription is under way once the file has been sent', () => {
    const notice = panel({ phase: 'processing' }).find('[data-testid="processing-notice"]');

    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain('Estamos transcribiéndolo');
    expect(notice.attributes('role')).toBe('status');
  });

  it('surfaces a failure with the message the caller supplied', () => {
    const wrapper = panel({
      phase: 'failed',
      failure: { code: 'STORAGE_REFUSED', message: { key: 'failure.upload.storageRefused' } },
    });

    const alert = wrapper.find('[data-testid="failure-alert"]');
    expect(alert.text()).toContain('El almacenamiento ha rechazado el archivo');
    // AlertBanner gives an error role="alert", so it interrupts rather than
    // waiting for the user to look at it.
    expect(alert.attributes('role')).toBe('alert');
  });

  /*
   * Not an error: the audio is stored and the work is still running. Saying
   * "failed" here would send the user to upload it a second time.
   */
  it('distinguishes a transcription still running from one that failed', () => {
    const wrapper = panel({ phase: 'stillProcessing' });

    const alert = wrapper.find('[data-testid="still-processing-alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('historial');
    expect(wrapper.find('[data-testid="failure-alert"]').exists()).toBe(false);
  });

  it('shows the finished transcription with its status and its text', () => {
    const wrapper = panel({ phase: 'completed', transcription: COMPLETED });

    const result = wrapper.find('[data-testid="transcription-result"]');
    expect(result.text()).toContain('consulta-paciente.mp3');
    expect(result.find('[data-status="COMPLETED"]').text()).toBe('Completada');
    expect(wrapper.find('[data-testid="transcription-preview"]').text()).toContain('dolor lumbar');
  });

  it('shows a record that failed without pretending it has text', () => {
    const wrapper = panel({
      phase: 'failed',
      transcription: { ...COMPLETED, status: 'FAILED', textPreview: null },
      failure: {
        code: 'TRANSCRIPTION_FAILED',
        message: { key: 'failure.upload.transcriptionFailed' },
      },
    });

    expect(wrapper.find('[data-status="FAILED"]').text()).toBe('Fallida');
    expect(wrapper.find('[data-testid="transcription-preview"]').exists()).toBe(false);
  });

  it('shows no result block before there is a record', () => {
    expect(panel().find('[data-testid="transcription-result"]').exists()).toBe(false);
  });

  it.each([['completed'], ['failed'], ['stillProcessing']])(
    'offers a fresh start once the phase is %s',
    (phase) => {
      expect(panel({ phase }).find('[data-testid="reset-button"]').exists()).toBe(true);
    },
  );

  it.each([['idle'], ['requesting'], ['uploading'], ['processing']])(
    'offers no fresh start while the phase is %s',
    (phase) => {
      expect(panel({ phase }).find('[data-testid="reset-button"]').exists()).toBe(false);
    },
  );

  it('clears its own selection and asks the caller to reset', async () => {
    const wrapper = panel({ phase: 'completed', transcription: COMPLETED });
    await drop(wrapper, AUDIO_FILE);

    await wrapper.find('[data-testid="reset-button"]').trigger('click');

    expect(wrapper.emitted('reset')).toHaveLength(1);
    expect(wrapper.find('[data-testid="selected-file-name"]').exists()).toBe(false);
  });

  it('joins the language control to its label and its hint', () => {
    const wrapper = panel();

    const select = wrapper.find('select');
    expect(wrapper.find('label').attributes('for')).toBe('audio-language');
    expect(select.attributes('id')).toBe('audio-language');
    expect(select.attributes('aria-describedby')).toBe('audio-language-hint');
  });

  /*
   * The distinction this whole feature turns on.
   *
   * `language` on a transcription is the language of the *audio*. The
   * interface language is a different fact about a different thing, and
   * neither may drive the other: a clinician reading these screens in English
   * still dictates in Spanish, and one reading in Spanish may well be
   * transcribing an English consultation. Wiring the two together would force
   * them to give one of the two up.
   */
  describe('the language of the audio, which is not the language of the screen', () => {
    it('names the audio languages in the language the reader chose', () => {
      const spanish = panel().findAll('#audio-language option');
      expect(spanish.map((option) => option.text())).toEqual([
        'Español',
        'Inglés',
        'Catalán',
        'Euskera',
        'Gallego',
      ]);

      const english = mount(FileTranscriptionPanel, {
        global: withTranslations('en'),
        props: { phase: 'idle', progress: 0 },
      }).findAll('#audio-language option');
      expect(english.map((option) => option.text())).toEqual([
        'Spanish',
        'English',
        'Catalan',
        'Basque',
        'Galician',
      ]);
    });

    it('still submits Spanish audio when the interface is in English', async () => {
      const wrapper = mount(FileTranscriptionPanel, {
        global: withTranslations('en'),
        props: { phase: 'idle', progress: 0 },
      });

      await drop(wrapper, AUDIO_FILE);
      await wrapper.find('[data-testid="submit-button"]').trigger('click');

      const submitted = wrapper.emitted('submit')?.[0]?.[0] as {
        language: TranscriptionLanguage;
      };
      expect(submitted.language).toBe('es');
      // And the screen it was submitted from is still English.
      expect(wrapper.text()).toContain('Transcribe an audio file');
    });

    it('leaves the interface alone when the audio language changes', async () => {
      const wrapper = panel();

      await wrapper.find('#audio-language').setValue('en');
      await drop(wrapper, AUDIO_FILE);
      await wrapper.find('[data-testid="submit-button"]').trigger('click');

      const submitted = wrapper.emitted('submit')?.[0]?.[0] as {
        language: TranscriptionLanguage;
      };
      expect(submitted.language).toBe('en');
      // Choosing English audio is not a request to read the application in
      // English, and the screen has not become one.
      expect(wrapper.text()).toContain('Transcribir un archivo de audio');
      expect(wrapper.text()).not.toContain('Transcribe an audio file');
    });
  });
});
