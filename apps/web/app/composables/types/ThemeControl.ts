import type { ComputedRef } from 'vue';
import type { ThemePreference } from '../../utils/types/ThemePreference';

export interface ThemeControl {
  readonly preference: ComputedRef<ThemePreference>;
  /** What `<html>` carries: `theme-light`, `theme-dark`, or nothing at all. */
  readonly rootClass: ComputedRef<string>;
  /**
   * The palette on screen, with `system` resolved. For the two-position switch
   * only: the class on `<html>` is still decided by the preference, because
   * `system` must stay the absence of a class for the stylesheet to reach it.
   */
  readonly isDark: ComputedRef<boolean>;
  choose: (preference: ThemePreference) => void;
}
