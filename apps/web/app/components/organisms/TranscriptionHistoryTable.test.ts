import { mount } from '@vue/test-utils';
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import { TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import type { Transcription } from '@vocali/contracts';
import TranscriptionHistoryTable from './TranscriptionHistoryTable.vue';
import { withTranslations } from '../../i18n/testing';

function makeTranscription(overrides: Partial<Transcription> = {}): Transcription {
  return {
    id: 'transcription-1',
    fileName: 'consulta.mp3',
    source: 'FILE',
    status: 'COMPLETED',
    language: 'es',
    durationSeconds: 95,
    sizeBytes: 2 * 1024 * 1024,
    textPreview: 'El paciente refiere dolor lumbar.',
    errorMessage: null,
    createdAt: '2026-08-11T09:30:00.000Z',
    updatedAt: '2026-08-11T09:31:00.000Z',
    ...overrides,
  };
}

function makePageOf(count: number): Transcription[] {
  return Array.from({ length: count }, (_unused, index) =>
    makeTranscription({ id: `transcription-${String(index + 1)}` }),
  );
}

function mountTable(props: Record<string, unknown> = {}): VueWrapper {
  return mount(TranscriptionHistoryTable, {
    global: withTranslations(),
    props: { transcriptions: [makeTranscription()], ...props },
  });
}

function rowsOf(wrapper: VueWrapper): DOMWrapper<Element>[] {
  return wrapper.findAll('[data-testid="history-row"]');
}

describe('TranscriptionHistoryTable', () => {
  it('renders one row per transcription, and a full page is ten of them', () => {
    const wrapper = mountTable({ transcriptions: makePageOf(TRANSCRIPTION_PAGE_SIZE) });

    expect(rowsOf(wrapper)).toHaveLength(10);
  });

  it('shows the name, source, status, duration, size and date of a record', () => {
    const wrapper = mountTable({
      transcriptions: [
        makeTranscription({ source: 'MICROPHONE', durationSeconds: 95, sizeBytes: 512 * 1024 }),
      ],
    });
    const row = rowsOf(wrapper)[0]!;

    expect(row.text()).toContain('consulta.mp3');
    expect(row.text()).toContain('Micrófono');
    expect(row.text()).toContain('Completada');
    expect(row.text()).toContain('1:35');
    expect(row.text()).toContain('512 kB');
    expect(row.text()).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('formats a size in megabytes and a duration past an hour', () => {
    const wrapper = mountTable({
      transcriptions: [makeTranscription({ durationSeconds: 3725, sizeBytes: 3 * 1024 * 1024 })],
    });

    expect(rowsOf(wrapper)[0]!.text()).toContain('1:02:05');
    expect(rowsOf(wrapper)[0]!.text()).toContain('3 MB');
  });

  // A record that is still uploading has no duration and no size yet. A zero
  // would read as silent audio in an empty file.
  it('marks a duration and a size that do not exist yet', () => {
    const wrapper = mountTable({
      transcriptions: [
        makeTranscription({
          status: 'PENDING_UPLOAD',
          durationSeconds: null,
          sizeBytes: null,
          textPreview: null,
        }),
      ],
    });

    const cells = rowsOf(wrapper)[0]!.findAll('td');

    expect(cells[2]!.text()).toBe('—');
    expect(cells[3]!.text()).toBe('—');
  });

  it('shows why a transcription failed, in place of a preview it does not have', () => {
    const wrapper = mountTable({
      transcriptions: [
        makeTranscription({
          status: 'FAILED',
          textPreview: null,
          errorMessage: 'El audio no contiene voz reconocible.',
        }),
      ],
    });

    expect(wrapper.find('[data-testid="row-error-message"]').text()).toBe(
      'El audio no contiene voz reconocible.',
    );
    expect(wrapper.find('[data-testid="row-text-preview"]').exists()).toBe(false);
  });

  it('shows a preview of the transcript when there is one', () => {
    expect(mountTable().find('[data-testid="row-text-preview"]').text()).toBe(
      'El paciente refiere dolor lumbar.',
    );
  });

  /*
   * Download is offered on a completed transcription and on nothing else. Any
   * other status has no transcript object behind it, so the action could only
   * 404 — which reads to a clinician as data loss.
   */
  it('offers a download only for a completed transcription', () => {
    const wrapper = mountTable({
      transcriptions: [
        makeTranscription({ id: 'a', status: 'COMPLETED' }),
        makeTranscription({ id: 'b', status: 'PROCESSING' }),
        makeTranscription({ id: 'c', status: 'PENDING_UPLOAD' }),
        makeTranscription({ id: 'd', status: 'FAILED' }),
      ],
    });

    expect(wrapper.findAll('[data-testid="history-download"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="history-no-actions"]')).toHaveLength(3);
    expect(rowsOf(wrapper)[0]!.find('[data-testid="history-download"]').exists()).toBe(true);
  });

  it('says in words why a row carries no download, not only with a dash', () => {
    const wrapper = mountTable({
      transcriptions: [makeTranscription({ status: 'PROCESSING' })],
    });
    const cell = wrapper.find('[data-testid="history-no-actions"]');

    expect(cell.find('[aria-hidden="true"]').text()).toBe('—');
    expect(cell.find('.sr-only').text()).toBe('Sin descarga disponible');
  });

  // Clinical file names run long and are told apart by their ends, which is
  // exactly what truncation removes.
  it('keeps a truncated file name reachable', () => {
    const wrapper = mountTable({
      transcriptions: [makeTranscription({ fileName: 'consulta-cardiologia-2026-08-11.mp3' })],
    });

    expect(wrapper.find('th[scope="row"] span').attributes('title')).toBe(
      'consulta-cardiologia-2026-08-11.mp3',
    );
  });

  it('emits the transcription to download when the action is used', async () => {
    const completed = makeTranscription({ id: 'completed-one' });
    const wrapper = mountTable({
      transcriptions: [
        makeTranscription({ id: 'processing-one', status: 'PROCESSING' }),
        completed,
      ],
    });

    await wrapper.find('[data-testid="history-download"]').trigger('click');

    expect(wrapper.emitted('download')).toEqual([[completed]]);
  });

  /*
   * The signed URL is short-lived, so it is asked for when the button is
   * pressed. A link rendered with the page carries a URL that will have
   * expired by the time most users reach it, and the failure looks to them
   * like a broken product.
   */
  it('renders no link, so no signed URL can be baked into the page', () => {
    const wrapper = mountTable({ transcriptions: makePageOf(TRANSCRIPTION_PAGE_SIZE) });

    expect(wrapper.findAll('a')).toHaveLength(0);
    expect(wrapper.find('[data-testid="history-download"]').element.tagName).toBe('BUTTON');
    expect(wrapper.html()).not.toContain('href');
  });

  it('marks only the row whose URL is being prepared', () => {
    const wrapper = mountTable({
      transcriptions: [
        makeTranscription({ id: 'a' }),
        makeTranscription({ id: 'b' }),
        makeTranscription({ id: 'c' }),
      ],
      downloadingId: 'b',
    });
    const actions = wrapper.findAll('[data-testid="history-download"]');

    expect(actions[0]!.attributes('aria-busy')).toBeUndefined();
    expect(actions[1]!.attributes('aria-busy')).toBe('true');
    expect(actions[1]!.attributes('disabled')).toBeDefined();
    expect(actions[2]!.attributes('aria-busy')).toBeUndefined();
  });

  it('reports a failed download without disturbing the list', async () => {
    const wrapper = mountTable({
      downloadErrorMessage: { key: 'failure.download' },
    });

    expect(wrapper.find('[data-testid="alert-banner"]').text()).toContain(
      'No hemos podido preparar la descarga',
    );
    expect(rowsOf(wrapper)).toHaveLength(1);

    await wrapper.find('[data-testid="alert-dismiss"]').trigger('click');

    expect(wrapper.emitted('dismissDownloadError')).toHaveLength(1);
  });

  it('shows no download banner when nothing has failed', () => {
    expect(mountTable().find('[data-testid="alert-banner"]').exists()).toBe(false);
  });

  /*
   * "No tienes transcripciones" and "no hemos podido cargar tu historial" are
   * different facts. The first invites a first upload; the second admits a
   * failure and offers a way out of it.
   */
  it('invites a first upload when the history is genuinely empty', async () => {
    const wrapper = mountTable({ transcriptions: [] });
    const emptyState = wrapper.find('[data-testid="empty-state"]');

    expect(emptyState.attributes('role')).toBe('status');
    expect(emptyState.text()).toContain('Todavía no tienes transcripciones');
    expect(wrapper.find('table').exists()).toBe(false);

    await emptyState.find('button').trigger('click');

    expect(wrapper.emitted('upload')).toHaveLength(1);
  });

  it('does not claim an empty later page means an empty history', () => {
    const wrapper = mountTable({ transcriptions: [], pageNumber: 3, hasPrevious: true });
    const emptyState = wrapper.find('[data-testid="empty-state"]');

    expect(emptyState.text()).not.toContain('Todavía no tienes transcripciones');
    expect(emptyState.text()).toContain('Esta página ya no tiene resultados');
    // Anterior is the way out, so the controls stay.
    expect(wrapper.find('[data-testid="pagination-previous"]').exists()).toBe(true);
  });

  it('reports a failed page as an error, with a way to retry it', async () => {
    const wrapper = mountTable({
      transcriptions: [],
      loadErrorMessage: { key: 'failure.historyLoad' },
    });
    const emptyState = wrapper.find('[data-testid="empty-state"]');

    expect(emptyState.attributes('role')).toBe('alert');
    expect(emptyState.text()).toContain('No hemos podido cargar tu historial');
    expect(emptyState.text()).toContain('Comprueba tu conexión y vuelve a intentarlo');
    expect(wrapper.find('table').exists()).toBe(false);
    // Pagination over a page that failed to load would page over nothing.
    expect(wrapper.find('[data-testid="pagination-next"]').exists()).toBe(false);

    await emptyState.find('button').trigger('click');

    expect(wrapper.emitted('retry')).toHaveLength(1);
    expect(wrapper.emitted('signIn')).toBeUndefined();
  });

  // Retrying a request that will 401 again is not a remedy; signing in is.
  it('offers sign-in rather than retry when the session has ended', async () => {
    const wrapper = mountTable({
      transcriptions: [],
      loadErrorMessage: { key: 'failure.sessionExpired' },
      sessionExpired: true,
    });
    const emptyState = wrapper.find('[data-testid="empty-state"]');

    expect(emptyState.text()).toContain('Tu sesión ha caducado');
    expect(emptyState.find('button').text()).toBe('Iniciar sesión');

    await emptyState.find('button').trigger('click');

    expect(wrapper.emitted('signIn')).toHaveLength(1);
    expect(wrapper.emitted('retry')).toBeUndefined();
  });

  it('shows a spinner while the first page loads, and no empty state', () => {
    const wrapper = mountTable({ transcriptions: [], loading: true });

    expect(wrapper.find('[data-testid="history-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="spinner-icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pagination-next"]').exists()).toBe(false);
  });

  // Blanking the list to load the next page throws away what the user was
  // reading and makes the screen jump.
  it('keeps the page on screen while the next one loads', () => {
    const wrapper = mountTable({ transcriptions: makePageOf(10), loading: true, hasNext: true });

    expect(wrapper.find('[data-testid="history-loading"]').exists()).toBe(false);
    expect(rowsOf(wrapper)).toHaveLength(10);
    expect(wrapper.find('table').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-testid="pagination-next"]').attributes('disabled')).toBeDefined();
  });

  /*
   * A table this wide would otherwise set the width of the document, dragging
   * the navigation and the headings sideways with it on a phone.
   */
  it('scrolls the table inside its own container rather than widening the page', () => {
    const wrapper = mountTable();
    const container = wrapper.find('[data-testid="history-scroll-container"]');

    expect(container.classes()).toContain('overflow-x-auto');
    expect(container.find('table').exists()).toBe(true);
  });

  it('drives pagination from the cursor trail the page keeps', async () => {
    const wrapper = mountTable({ pageNumber: 2, hasPrevious: true, hasNext: true });

    expect(wrapper.text()).toContain('Página 2');

    await wrapper.find('[data-testid="pagination-next"]').trigger('click');
    await wrapper.find('[data-testid="pagination-previous"]').trigger('click');

    expect(wrapper.emitted('next')).toHaveLength(1);
    expect(wrapper.emitted('previous')).toHaveLength(1);
  });

  it('offers no way back from the first page', () => {
    const wrapper = mountTable({ pageNumber: 1, hasPrevious: false, hasNext: true });

    expect(
      wrapper.find('[data-testid="pagination-previous"]').attributes('disabled'),
    ).toBeDefined();
  });

  it('labels the table for a reader who cannot see it', () => {
    const wrapper = mountTable();

    expect(wrapper.find('caption').text()).toBe('Historial de transcripciones');
    expect(wrapper.findAll('th[scope="col"]')).toHaveLength(7);
    expect(wrapper.find('th[scope="row"]').exists()).toBe(true);
  });

  /*
   * The densest screen in the application, read by somebody working in
   * English: every column heading, the invitation shown to a new user, and the
   * dates and sizes beside them, which follow the interface rather than the
   * machine's locale.
   */
  describe('read in English', () => {
    function englishTable(props: Record<string, unknown> = {}): VueWrapper {
      return mount(TranscriptionHistoryTable, {
        global: withTranslations('en'),
        props: { transcriptions: [makeTranscription()], ...props },
      });
    }

    it('heads every column in English', () => {
      const headings = englishTable()
        .findAll('thead th')
        .map((cell) => cell.text());

      expect(headings).toEqual(['File', 'Source', 'Status', 'Length', 'Size', 'Date', 'Actions']);
    });

    it('invites a first upload in English', () => {
      const wrapper = englishTable({ transcriptions: [] });

      expect(wrapper.text()).toContain('You have no transcriptions yet');
      expect(wrapper.find('[data-testid="empty-state"] button').text()).toBe('Transcribe a file');
    });

    /*
     * `es-ES` and `en-GB` write the day first and the decimal separator
     * differently, so the same row reads differently and correctly in each. It
     * is deliberately never the browser's own locale: a clinic machine set to
     * `en-US` would put 08/12 next to Spanish prose that meant 12/08.
     */
    it('writes dates and sizes the way the chosen language writes them', () => {
      const spanish = mountTable().text();
      const english = englishTable().text();

      expect(spanish).toContain('11/08/2026');
      expect(english).toContain('11/08/2026');
      expect(spanish).toContain('2 MB');
      expect(english).toContain('2 MB');
      expect(spanish).toContain('Archivo');
      expect(english).toContain('File');
    });
  });
});
