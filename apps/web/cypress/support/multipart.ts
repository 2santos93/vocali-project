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
