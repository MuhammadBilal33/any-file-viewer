/** Re-indents valid JSON. Returns the input unchanged when it is not valid JSON. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * Locks an HTML file inside a frame: no scripts (the sandbox), and no network at all (the CSP),
 * so tracking pixels and remote styles in the file cannot load. The meta tag goes first, which
 * puts it in the document head even when the file has its own <head>.
 */
export function lockedHtmlDocument(html: string): string {
  const csp =
    "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:; form-action 'none'";
  return `<meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">${html}`;
}
