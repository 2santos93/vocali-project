import { onScopeDispose, ref } from 'vue';
import type { Dropdown } from './types/Dropdown';

/**
 * Shared so that the three ways a panel has to close — a click elsewhere,
 * Escape, the focus moving on — are written once rather than twice with one
 * of them missing, which is usually Escape.
 *
 * Here rather than in `composables/`, and built out of plain Vue: everything
 * under `components/` has to mount under Jest with no Nuxt runtime around it,
 * so a Nuxt auto-import here would end that.
 */
export function useDropdown(): Dropdown {
  const open = ref(false);
  const container = ref<HTMLElement | null>(null);
  const trigger = ref<HTMLElement | null>(null);

  function close(): void {
    open.value = false;
  }

  function dismiss(): void {
    if (!open.value) return;

    open.value = false;
    trigger.value?.focus();
  }

  function show(): void {
    open.value = true;
  }

  function toggle(): void {
    open.value = !open.value;
  }

  /**
   * `contains` rather than `composedPath`: the panel renders inside the
   * container rather than teleported out, so DOM containment is containment
   * on screen. It would stop being true if the panel were ever teleported.
   */
  function isOurs(target: EventTarget | null): boolean {
    return target instanceof Node && container.value?.contains(target) === true;
  }

  function onPointerDown(event: MouseEvent): void {
    if (!open.value || isOurs(event.target)) return;

    // Not `dismiss`: returning focus to the trigger would steal it from
    // whatever the reader just clicked.
    close();
  }

  /*
   * A plain `blur` on the trigger would not do: the focus legitimately moves
   * into the panel, and only the container knows the difference.
   */
  function onFocusIn(event: FocusEvent): void {
    if (!open.value || isOurs(event.target)) return;

    close();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!open.value || event.key !== 'Escape') return;

    // So Escape closes this panel rather than travelling on to whatever else
    // treats it as "cancel".
    event.preventDefault();
    dismiss();
  }

  /*
   * Attached for the life of the component rather than around `open`: a
   * listener added in a watcher survives the component if it unmounts while
   * the panel is open. Every handler returns early while it is closed.
   */
  if (typeof document !== 'undefined') {
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);

    onScopeDispose(() => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
    }, true);
  }

  return { open, container, trigger, toggle, show, close, dismiss };
}
