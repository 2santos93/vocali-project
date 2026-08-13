import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import FileDropZone from '../FileDropZone.vue';
import type { FileRejection } from '../../types/files';
import { withTranslations } from '../../../i18n/testing';
import { translate } from '../../../i18n/translate';
import type { TranslatableMessage } from '../../../i18n/types';

/**
 * Rendered through the real catalogue: a test that only checked the emitted
 * key would pass while the sentence behind it said nothing about the limit.
 */
function spanish(message: TranslatableMessage | undefined): string {
  return message === undefined ? '' : translate('es', message.key, message.values);
}

/** jsdom derives `size` from the content, so the limit is faked rather than allocated. */
function fileOf(name: string, type: string, size: number): File {
  const file = new File(['audio'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

const VALID_FILE = fileOf('consulta-paciente.mp3', 'audio/mpeg', 1_048_576);

function drop(wrapper: VueWrapper, file: File): Promise<void> {
  return wrapper.find('[data-testid="file-drop-zone"]').trigger('drop', {
    dataTransfer: { files: [file] },
  });
}

async function pick(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.find('[data-testid="file-input"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
}

function rejectionFrom(wrapper: VueWrapper): FileRejection | undefined {
  return wrapper.emitted('reject')?.[0]?.[0] as FileRejection | undefined;
}

describe('FileDropZone', () => {
  it('emits select with the dropped file', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    await drop(wrapper, VALID_FILE);

    expect(wrapper.emitted('select')).toEqual([[VALID_FILE]]);
    expect(wrapper.emitted('reject')).toBeUndefined();
  });

  it('emits select with the file chosen through the picker', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    await pick(wrapper, VALID_FILE);

    expect(wrapper.emitted('select')).toEqual([[VALID_FILE]]);
  });

  it('refuses an unsupported format and names the ones it accepts', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    await drop(wrapper, fileOf('informe.pdf', 'application/pdf', 2048));

    expect(wrapper.emitted('select')).toBeUndefined();
    const rejection = rejectionFrom(wrapper);
    expect(rejection?.code).toBe('UNSUPPORTED_FORMAT');
    expect(rejection?.fileName).toBe('informe.pdf');
    expect(spanish(rejection?.message)).toContain('MP3');
  });

  it('refuses a file over the limit and states both sizes in Spanish', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    await drop(wrapper, fileOf('sesion-larga.wav', 'audio/wav', MAX_AUDIO_FILE_SIZE_BYTES + 1));

    expect(wrapper.emitted('select')).toBeUndefined();
    const rejection = rejectionFrom(wrapper);
    expect(rejection?.code).toBe('FILE_TOO_LARGE');
    expect(spanish(rejection?.message)).toContain('20 MB');
  });

  it('accepts a file of exactly the limit', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    await drop(wrapper, fileOf('justo.wav', 'audio/wav', MAX_AUDIO_FILE_SIZE_BYTES));

    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('reject')).toBeUndefined();
  });

  it('refuses an empty file, which S3 would reject as well', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    await drop(wrapper, fileOf('vacio.mp3', 'audio/mpeg', 0));

    expect(rejectionFrom(wrapper)?.code).toBe('EMPTY_FILE');
  });

  it('honours a caller-supplied limit rather than only the contract default', async () => {
    const wrapper = mount(FileDropZone, {
      global: withTranslations(),
      props: { maxSizeBytes: 1024 },
    });

    await drop(wrapper, fileOf('pequeno.mp3', 'audio/mpeg', 2048));

    expect(rejectionFrom(wrapper)?.code).toBe('FILE_TOO_LARGE');
  });

  it('honours a caller-supplied format list', async () => {
    const wrapper = mount(FileDropZone, {
      global: withTranslations(),
      props: { accept: ['audio/wav'] },
    });

    await drop(wrapper, VALID_FILE);

    expect(rejectionFrom(wrapper)?.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('advertises the accepted formats and the limit it will enforce', () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    expect(wrapper.text()).toContain('MP3');
    expect(wrapper.text()).toContain('20 MB');
    expect(wrapper.find('[data-testid="file-input"]').attributes('accept')).toContain('audio/mpeg');
  });

  it('highlights itself while a file is dragged over it, and stops when it leaves', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });
    const zone = wrapper.find('[data-testid="file-drop-zone"]');

    expect(zone.classes()).toContain('border-line');

    await zone.trigger('dragover');
    expect(zone.classes()).toContain('border-brand-500');

    await zone.trigger('dragleave');
    expect(zone.classes()).toContain('border-line');
  });

  it('accepts nothing while disabled', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations(), props: { disabled: true } });
    const zone = wrapper.find('[data-testid="file-drop-zone"]');

    await zone.trigger('dragover');
    expect(zone.classes()).toContain('border-line');

    await drop(wrapper, VALID_FILE);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('reject')).toBeUndefined();
  });

  it('ignores a drop that carries no file', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });

    await wrapper.find('[data-testid="file-drop-zone"]').trigger('drop', {
      dataTransfer: { files: [] },
    });

    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('reject')).toBeUndefined();
  });

  it('opens the file picker from a keyboard-reachable button', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });
    const input = wrapper.find('[data-testid="file-input"]').element as HTMLInputElement;
    const click = jest.spyOn(input, 'click').mockImplementation(() => undefined);

    await wrapper.find('button').trigger('click');

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('clears the input so the same file can be chosen twice', async () => {
    const wrapper = mount(FileDropZone, { global: withTranslations() });
    const input = wrapper.find('[data-testid="file-input"]');
    const assignedValues: string[] = [];
    Object.defineProperty(input.element, 'files', { value: [VALID_FILE], configurable: true });
    Object.defineProperty(input.element, 'value', {
      configurable: true,
      get: () => 'C:\\fakepath\\consulta-paciente.mp3',
      set: (value: string) => assignedValues.push(value),
    });

    await input.trigger('change');

    expect(assignedValues).toEqual(['']);
  });

  it('shows the selected file name only once there is one', () => {
    expect(
      mount(FileDropZone, { global: withTranslations() })
        .find('[data-testid="selected-file-name"]')
        .exists(),
    ).toBe(false);

    const wrapper = mount(FileDropZone, {
      global: withTranslations(),
      props: { selectedFileName: 'consulta.mp3' },
    });
    expect(wrapper.find('[data-testid="selected-file-name"]').text()).toContain('consulta.mp3');
  });
});
