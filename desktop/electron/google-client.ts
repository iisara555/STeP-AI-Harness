import { open } from 'node:fs/promises';

export const DEFAULT_GOOGLE_CLIENT_ID = '991643024129-1gd4866dn064tm72kjtavsu6qpgpa1hp.apps.googleusercontent.com';

const LIMIT = 65536;
function invalid(): never {
  throw new Error('GOOGLE_CLIENT_FILE_INVALID');
}
/** Read only a bounded user-selected file; neither its path nor its contents leave the main process. */
export async function readGoogleClientFile(path: string) {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, 'r');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > LIMIT) invalid();
    const buffer = Buffer.alloc(LIMIT + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > LIMIT) invalid();
    return buffer.subarray(0, size).toString('utf8');
  } catch {
    invalid();
  } finally {
    await file?.close().catch(() => {});
  }
}
export function parseGoogleDesktopClient(text: string, expectedClientId: string) {
  let data: any;
  try {
    if (Buffer.byteLength(text, 'utf8') > LIMIT) invalid();
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    invalid();
  }
  const client = data?.installed;
  if (
    !client ||
    typeof client !== 'object' ||
    Array.isArray(client) ||
    data.web ||
    typeof client.client_id !== 'string' ||
    typeof client.client_secret !== 'string' ||
    !/^[\x21-\x7e]{8,4096}$/.test(client.client_secret)
  )
    invalid();
  if (client.client_id !== expectedClientId) throw new Error('GOOGLE_CLIENT_MISMATCH');
  return client.client_secret as string;
}

/** Release input comes from the organization's CI secret, never from an employee or managed policy. */
export function googleClientBuildConfig(json: string | undefined, required = false) {
  if (!json) {
    if (required) throw new Error('GOOGLE_DESKTOP_CLIENT_JSON_REQUIRED');
    return null;
  }
  return { clientId: DEFAULT_GOOGLE_CLIENT_ID, clientSecret: parseGoogleDesktopClient(json, DEFAULT_GOOGLE_CLIENT_ID) };
}
