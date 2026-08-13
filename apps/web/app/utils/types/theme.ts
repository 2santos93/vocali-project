import type { THEME_PREFERENCES } from '../theme';

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export type EffectiveTheme = 'light' | 'dark';
