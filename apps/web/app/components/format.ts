const BYTES_PER_KILOBYTE = 1024;

const BYTES_PER_MEGABYTE = 1024 * 1024;

const SECONDS_PER_MINUTE = 60;

const SECONDS_PER_HOUR = 3600;

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

/** Always megabytes, so the two places quoting the platform limit agree. */
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

/** `m:ss`, or `h:mm:ss` past an hour. No locale: both languages write it alike. */
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
