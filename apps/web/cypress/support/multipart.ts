/**
 * Reading the order of the parts out of a multipart body.
 *
 * The order is the assertion. S3 parses a presigned POST in the order the
 * parts were written and stops collecting form fields at the file, so a body
 * that sends the file first arrives with no policy, no signature and no key —
 * and S3 answers with a policy error that names none of them, after however
 * long the upload took. Nothing else in the system can catch that: the request
 * is well formed, the status is a plain 403, and every unit test that builds
 * the form itself agrees with whatever the form builder currently does.
 */

/**
 * Decoded one byte to one character rather than as UTF-8. The part headers are
 * ASCII, but the file part is arbitrary bytes, and a decoder that replaced the
 * invalid sequences would be re-encoding the very thing being measured.
 */
function decodeBytes(body: unknown): string {
  const decoder = new TextDecoder('iso-8859-1');

  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return decoder.decode(body);
  }
  if (ArrayBuffer.isView(body)) {
    return decoder.decode(body);
  }

  throw new Error('The intercepted upload carried neither text nor bytes.');
}

/** The names of the multipart parts, in the order the browser wrote them. */
export function readPartNames(body: unknown): string[] {
  const parts = /content-disposition:\s*form-data;\s*name="([^"]*)"/gi;
  const text = decodeBytes(body);
  const names: string[] = [];

  let match = parts.exec(text);
  while (match !== null) {
    names.push(match[1] ?? '');
    match = parts.exec(text);
  }

  return names;
}
