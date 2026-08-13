import type { Ref } from 'vue';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export type ControlSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

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
  dismiss: () => void;
}
