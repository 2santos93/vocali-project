import type { INTERFACE_LANGUAGES } from '../language';

/**
 * The language the **interface** is written in.
 *
 * Not to be confused with `TranscriptionLanguage` from `@vocali/contracts`,
 * which is the language spoken in a recording. They are different facts about
 * different things and neither may drive the other: a clinician can dictate a
 * consultation in Catalan while reading this application in English, and a
 * product that ties the two together forces them to choose which of the two
 * truths to break.
 *
 * The name is deliberately unabbreviatable. `Language` on its own would be
 * ambiguous in every file that imports both.
 */
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];
