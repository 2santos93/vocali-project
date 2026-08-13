/**
 * Which of the two palettes a reader is actually looking at.
 *
 * A preference has three values and a screen only ever has two, and the gap
 * between them is not academic: a switch in the account menu has to show the
 * position the page is *painted* in, or somebody on a machine set to dark
 * meets a control that says "off" on a dark screen and stops trusting it.
 */
export type EffectiveTheme = 'light' | 'dark';
