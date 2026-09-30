// Normalize checkout line endings without hiding malformed lone CR characters.
export function normalizeFixtureText(text) {
  return text.replace(/\r\n/g, '\n');
}
