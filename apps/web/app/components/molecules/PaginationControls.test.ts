import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import PaginationControls from './PaginationControls.vue';
import { withTranslations } from '../../i18n/testing';

function mountControls(props: Record<string, unknown> = {}): VueWrapper {
  return mount(PaginationControls, {
    global: withTranslations(),
    props: { pageNumber: 2, hasPrevious: true, hasNext: true, ...props },
  });
}

describe('PaginationControls', () => {
  it('names the current page in Spanish', () => {
    expect(mountControls({ pageNumber: 3 }).text()).toContain('Página 3');
  });

  it('emits next when there is a next page', async () => {
    const wrapper = mountControls();

    await wrapper.find('[data-testid="pagination-next"]').trigger('click');

    expect(wrapper.emitted('next')).toHaveLength(1);
    expect(wrapper.emitted('previous')).toBeUndefined();
  });

  it('emits previous when there is a previous page', async () => {
    const wrapper = mountControls();

    await wrapper.find('[data-testid="pagination-previous"]').trigger('click');

    expect(wrapper.emitted('previous')).toHaveLength(1);
    expect(wrapper.emitted('next')).toBeUndefined();
  });

  /*
   * The API paginates by an opaque cursor, so the end of the history is the
   * absence of a `nextCursor` and nothing else. A live Siguiente button at
   * that point asks the server for a page that does not exist.
   */
  it('disables next at the end of the history, and emits nothing', async () => {
    const wrapper = mountControls({ hasNext: false });
    const next = wrapper.find('[data-testid="pagination-next"]');

    expect(next.attributes('disabled')).toBeDefined();
    await next.trigger('click');
    expect(wrapper.emitted('next')).toBeUndefined();
  });

  it('disables previous on the first page, and emits nothing', async () => {
    const wrapper = mountControls({ hasPrevious: false, pageNumber: 1 });
    const previous = wrapper.find('[data-testid="pagination-previous"]');

    expect(previous.attributes('disabled')).toBeDefined();
    await previous.trigger('click');
    expect(wrapper.emitted('previous')).toBeUndefined();
  });

  // A second click while a page is in flight advances the cursor stack twice
  // and skips a page of the user's own history.
  it('disables both buttons while a page is loading', async () => {
    const wrapper = mountControls({ busy: true });

    await wrapper.find('[data-testid="pagination-next"]').trigger('click');
    await wrapper.find('[data-testid="pagination-previous"]').trigger('click');

    expect(wrapper.emitted('next')).toBeUndefined();
    expect(wrapper.emitted('previous')).toBeUndefined();
  });

  it('offers no page numbers, because a cursor cannot address one', () => {
    const wrapper = mountControls({ pageNumber: 5 });

    expect(wrapper.findAll('button')).toHaveLength(2);
    expect(wrapper.text()).not.toContain('4');
    expect(wrapper.text()).not.toContain('6');
  });

  it('is labelled as navigation', () => {
    expect(mountControls().find('nav').attributes('aria-label')).toBe('Paginación del historial');
  });

  it('names the current page and both directions in English', () => {
    const wrapper = mount(PaginationControls, {
      global: withTranslations('en'),
      props: { pageNumber: 3, hasPrevious: true, hasNext: true },
    });

    expect(wrapper.text()).toContain('Page 3');
    expect(wrapper.find('[data-testid="pagination-previous"]').text()).toBe('Previous');
    expect(wrapper.find('[data-testid="pagination-next"]').text()).toBe('Next');
    expect(wrapper.find('nav').attributes('aria-label')).toBe('History pagination');
  });
});
