import { open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

const REFERENCE_KEYS = ['outputReference', 'reference', 'url', 'link', 'path', 'filePath', 'sheetUrl'];

export function getOutputReference(outputs = {}) {
  const refs = REFERENCE_KEYS.map((key) => outputs[key]).filter((v) => typeof v === 'string' && v.trim());
  if (!refs.length) throw new Error('Action requires a real output reference/path/link before completion');
  if (new Set(refs).size !== 1) throw new Error('Action has conflicting output references');
  return refs[0];
}

/** No arbitrary network fetch. A trusted connector must read remote output and
 * return matching identity/revision; a model response is not a verifier.
 * Local verification proves a readable, non-empty file and records its hash.
 * Neither check substitutes for document/spreadsheet semantic validation.
 */
export async function verifyActionOutput(outputs, { workspaceDir, verifyRemoteOutput } = {}) {
  const reference = getOutputReference(outputs);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(reference)) {
    let url;
    try { url = new URL(reference); } catch { throw new Error('Remote output needs a valid canonical HTTPS reference'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Remote output needs a canonical HTTPS reference without credentials, query or fragment');
    }
    if (typeof verifyRemoteOutput !== 'function') throw new Error('Remote output needs a trusted connector verifier');
    const result = await verifyRemoteOutput(reference);
    if (result?.verified !== true || result.reference !== reference || !result.resourceId || !result.revision) {
      throw new Error('Remote output verification failed: identity and revision required');
    }
    return { kind: 'remote', reference, resourceId: String(result.resourceId), revision: String(result.revision), checkedAt: new Date().toISOString() };
  }
  if (!workspaceDir) throw new Error('Local output verification requires workspaceDir');
  const workspace = await realpath(workspaceDir);
  const root = await realpath(resolve(workspaceDir, 'output'));
  const rootRelative = relative(workspace, root);
  if (!rootRelative || rootRelative === '..' || rootRelative.startsWith(`..${sep}`) || isAbsolute(rootRelative)) {
    throw new Error('Workspace output directory must not escape through a symlink');
  }
  const path = await realpath(resolve(workspaceDir, reference));
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Action output must remain inside the workspace output directory');
  }
  const file = await open(path, 'r');
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size === 0) throw new Error('Action output must be a non-empty regular file');
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await file.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error('Action output changed during verification');
    return { kind: 'local', reference, bytes: after.size, sha256: hash.digest('hex'), checkedAt: new Date().toISOString() };
  } finally {
    await file.close();
  }
}
