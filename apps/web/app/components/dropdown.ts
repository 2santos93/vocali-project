import { onScopeDispose, ref } from 'vue';
import type { Ref } from 'vue';

/**
 * The part of a dropdown that is the same in every dropdown: staying open
 * until something says otherwise, and closing when that something happens.
 *
 * Two components in this application open a panel from a button — the account
 * menu and the language chooser — and the three ways a panel has to close are
 * exactly the three that get forgotten one at a time: a click somewhere else,
 * the Escape key, and the focus moving on with the keyboard. Written twice,
 * one of them ends up missing one of the three, and the one it is missing is
 * usually Escape.
 *
 * Beside `types.ts` rather than in `composables/`, and built out of plain Vue:
 * everything under `components/` has to mount under Jest with no Nuxt runtime
 * around it, and a Nuxt auto-import here would end that.
 */
export interface Dropdown {
  readonly open: Ref<boolean>;
  /** Goes on the element that wraps both the trigger and the panel. */
  readonly container: Ref<HTMLElement | null>;
  /** Goes on the button, so focus can be handed back to it. */
  readonly trigger: Ref<HTMLElement | null>;
  toggle: () => void;
  show: () => void;
  /** Closes and leaves the focus where it is. For a click on an option. */
  close: () => void;
  /**
   * Closes and puts the focus back on the trigger. For Escape, and for
   * anything else a keyboard user did to leave: a panel that vanishes and
   * drops the focus onto `<body>` sends them back to the top of the page.
   */
  dismiss: () => void;
}

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
   * Whether whatever the event happened to is part of this dropdown.
   *
   * `composedPath` is not used and `contains` is, because the panel is rendered
   * inside the container element rather than teleported out of it — so
   * containment in the DOM is containment on screen, and there is no shadow
   * boundary in this application for the cheaper check to be wrong about.
   */
  function isOurs(target: EventTarget | null): boolean {
    return target instanceof Node && container.value?.contains(target) === true;
  }

  function onPointerDown(event: MouseEvent): void {
    if (!open.value || isOurs(event.target)) return;

    // Not `dismiss`: somebody who clicked a link on the other side of the
    // header is going there, and stealing the focus back to the trigger would
    // take it away from whatever they just chose to touch.
    close();
  }

  /*
   * Focus leaving the container closes the panel, which is what Tab does. A
   * plain `blur` on the trigger would not do: the focus legitimately moves
   * *into* the panel, and only the container knows the difference.
   */
  function onFocusIn(event: FocusEvent): void {
    if (!open.value || isOurs(event.target)) return;

    close();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!open.value || event.key !== 'Escape') return;

    // Stopped, so that Escape closes this panel rather than travelling on to
    // whatever else on the page treats it as "cancel".
    event.preventDefault();
    dismiss();
  }

  /*
   * Attached for the life of the component rather than added and removed
   * around `open`, and every handler returns immediately while the panel is
   * closed. A listener added in a watcher is a listener that survives the
   * component when the panel happened to be open as it unmounted.
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
