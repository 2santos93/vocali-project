import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import type { Transcription } from '@vocali/contracts';
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

function submittedFrom(wrapper: VueWrapper): File | undefined {
  return wrapper.emitted('submit')?.[0]?.[0] as File | undefined;
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

  it('submits the chosen file, and nothing else', async () => {
    const wrapper = panel();
    await drop(wrapper, AUDIO_FILE);

    await wrapper.find('[data-testid="submit-button"]').trigger('click');

    expect(submittedFrom(wrapper)).toBe(AUDIO_FILE);
  });

  it('shows the name of the file that was chosen', async () => {
    const wrapper = panel();

    await drop(wrapper, AUDIO_FILE);

    expect(wrapper.find('[data-testid="selected-file-name"]').text()).toContain(
      'consulta-paciente.mp3',
    );
  });

  /*
   * The question this screen used to ask. It was answered by a dropdown
   * defaulted to Spanish, by somebody who may not have made the recording and
   * had no way to check — an English file filed as Spanish, silently. The
   * provider identifies the language from the audio, so the screen states that
   * instead of asking.
   */
  it('asks nothing about the language, and says so', () => {
    const wrapper = panel();

    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.find('[data-testid="automatic-language-note"]').text()).toContain(
      'Detectamos el idioma',
    );
  });

  it('names the language the provider identified, beside the finished record', () => {
    const wrapper = panel({
      phase: 'completed',
      transcription: { ...COMPLETED, language: 'en' },
    });

    expect(wrapper.find('[data-testid="detected-language"]').text()).toBe(
      'Idioma detectado: Inglés',
    );
  });

  /*
   * Silence rather than "unknown": a recording too short to identify still
   * produced a transcript, and giving that non-event a line of its own would
   * make the reader wonder what went wrong.
   */
  it('says nothing when the provider identified no language', () => {
    const wrapper = panel({
      phase: 'completed',
      transcription: { ...COMPLETED, language: null },
    });

    expect(wrapper.find('[data-testid="detected-language"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="transcription-result"]').exists()).toBe(true);
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

  /*
   * The distinction this feature turns on, in the one place it still applies
   * to this screen.
   *
   * `language` on a transcription is the language of the *audio*. The
   * interface language is a different fact about a different thing, and
   * neither may drive the other: a clinician reading these screens in English
   * may well have uploaded a Spanish consultation. The screen no longer asks
   * for the first, but it still reports it — and reporting it in the reader's
   * own language is not the same as letting one decide the other.
   */
  describe('the language of the audio, which is not the language of the screen', () => {
    it('names the identified language in the language the reader chose', () => {
      const spanish = panel({
        phase: 'completed',
        transcription: { ...COMPLETED, language: 'ca' },
      });
      expect(spanish.find('[data-testid="detected-language"]').text()).toBe(
        'Idioma detectado: Catalán',
      );

      const english = mount(FileTranscriptionPanel, {
        global: withTranslations('en'),
        props: {
          phase: 'completed',
          progress: 100,
          transcription: { ...COMPLETED, language: 'ca' },
        },
      });
      expect(english.find('[data-testid="detected-language"]').text()).toBe(
        'Detected language: Catalan',
      );
    });

    it('uploads the same way whichever language the interface is read in', async () => {
      const wrapper = mount(FileTranscriptionPanel, {
        global: withTranslations('en'),
        props: { phase: 'idle', progress: 0 },
      });

      await drop(wrapper, AUDIO_FILE);
      await wrapper.find('[data-testid="submit-button"]').trigger('click');

      expect(wrapper.emitted('submit')?.[0]?.[0]).toBe(AUDIO_FILE);
      // And the screen it was submitted from is still English.
      expect(wrapper.text()).toContain('Transcribe an audio file');
    });

    // A Catalan recording does not turn the application into Catalan.
    it('leaves the interface alone when the identified language is not the reader’s', () => {
      const wrapper = panel({
        phase: 'completed',
        transcription: { ...COMPLETED, language: 'en' },
      });

      expect(wrapper.text()).toContain('Transcribir un archivo de audio');
      expect(wrapper.text()).not.toContain('Transcribe an audio file');
    });
  });
});
