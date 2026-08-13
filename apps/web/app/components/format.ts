/**
 * How a number a clinician reads is written.
 *
 * Alongside `types.ts` for the same reason: it is vocabulary shared by the
 * components rather than the property of any one of them. `1024 * 1024` was
 * declared in the drop zone and again in the history table, each with its own
 * formatter — two copies of a decision about how this product writes a file
 * size, which is how one screen ends up saying `1.5 MB` and the other `1,5 MB`.
 *
 * Everything here is pure, and the locale is an argument rather than a
 * constant. It used to be `es-ES` everywhere, which was right while the
 * interface had one language; now a reader in English would otherwise meet a
 * decimal comma in the middle of an English sentence. The tag comes from
 * `i18n/language.ts` — `es-ES` or `en-GB` — so a date is `12/08/2026` in both
 * and only the separators and the month names move.
 *
 * It is never the browser's own locale. A clinic machine set to `en-US` would
 * otherwise render `8/12/2026` next to Spanish prose, and the twelfth of
 * August and the eighth of December are not a formatting difference.
 */

const BYTES_PER_KILOBYTE = 1024;

const BYTES_PER_MEGABYTE = 1024 * 1024;

const SECONDS_PER_MINUTE = 60;

const SECONDS_PER_HOUR = 3600;

/*
 * `Intl.DateTimeFormat` is expensive to construct and this runs once per row,
 * so the formatters are kept. Keyed by locale rather than replaced, because
 * both languages can appear in one session and rebuilding on every switch
 * would throw away the one before it.
 */
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: string): Intl.DateTimeFormat {
  const existing = DATE_FORMATTERS.get(locale);
  if (existing !== undefined) {
    return existing;
  }

  const created = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  DATE_FORMATTERS.set(locale, created);

  return created;
}

export function formatDecimal(value: number, fractionDigits: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: fractionDigits }).format(value);
}

/** Always megabytes, for the two places that talk about the platform's size limit. */
export function formatMegabytes(bytes: number, locale: string): string {
  return `${formatDecimal(bytes / BYTES_PER_MEGABYTE, 1, locale)} MB`;
}

/**
 * Kilobytes below a megabyte, megabytes above it. A dictation of a few seconds
 * measured in megabytes reads as `0 MB`, which looks like a failed upload.
 */
export function formatFileSize(bytes: number, locale: string): string {
  if (bytes < BYTES_PER_MEGABYTE) {
    return `${formatDecimal(bytes / BYTES_PER_KILOBYTE, 0, locale)} kB`;
  }
  return formatMegabytes(bytes, locale);
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * `m:ss`, or `h:mm:ss` once there is an hour to show.
 *
 * No locale: this is a clock reading in digits and colons, and both languages
 * write it the same way.
 */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const remainder = total % SECONDS_PER_MINUTE;

  if (total >= SECONDS_PER_HOUR) {
    return `${String(Math.floor(total / SECONDS_PER_HOUR))}:${padded(minutes)}:${padded(remainder)}`;
  }
  return `${String(minutes)}:${padded(remainder)}`;
}

export function formatDateTime(isoDate: string, locale: string): string {
  return dateFormatter(locale).format(new Date(isoDate));
}
