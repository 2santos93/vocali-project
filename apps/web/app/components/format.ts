/**
 * How the design system writes a number a clinician reads.
 *
 * Alongside `types.ts` for the same reason: it is vocabulary shared by the
 * components rather than the property of any one of them. `1024 * 1024` was
 * declared in the drop zone and again in the history table, each with its own
 * Spanish-locale formatter — two copies of a decision about how this product
 * writes a file size, which is how one screen ends up saying `1.5 MB` and the
 * other `1,5 MB`.
 *
 * Everything here is pure and locale-explicit. `es-ES` is stated rather than
 * left to the browser: a decimal comma is what the interface says everywhere
 * else, and a user whose machine is set to English would otherwise read one
 * screen in one convention and the next in another.
 */

const BYTES_PER_KILOBYTE = 1024;

const BYTES_PER_MEGABYTE = 1024 * 1024;

const SECONDS_PER_MINUTE = 60;

const SECONDS_PER_HOUR = 3600;

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDecimal(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: fractionDigits }).format(value);
}

/** Always megabytes, for the two places that talk about the platform's size limit. */
export function formatMegabytes(bytes: number): string {
  return `${formatDecimal(bytes / BYTES_PER_MEGABYTE, 1)} MB`;
}

/**
 * Kilobytes below a megabyte, megabytes above it. A dictation of a few seconds
 * measured in megabytes reads as `0 MB`, which looks like a failed upload.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < BYTES_PER_MEGABYTE) {
    return `${formatDecimal(bytes / BYTES_PER_KILOBYTE, 0)} kB`;
  }
  return formatMegabytes(bytes);
}

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

/** `m:ss`, or `h:mm:ss` once there is an hour to show. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const remainder = total % SECONDS_PER_MINUTE;

  if (total >= SECONDS_PER_HOUR) {
    return `${String(Math.floor(total / SECONDS_PER_HOUR))}:${padded(minutes)}:${padded(remainder)}`;
  }
  return `${String(minutes)}:${padded(remainder)}`;
}

export function formatDateTime(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(isoDate));
}
