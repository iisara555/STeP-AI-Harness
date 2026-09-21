import { lstat } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';

export function validateRelativePath(value) {
  if (typeof value !== 'string' || !value || /[\\:<>"|?*\x00-\x1f]/.test(value) || isAbsolute(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('Unsafe workspace path');
  }
  return value;
}

export function validateBackupId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value) || value.endsWith('.')) {
    throw new Error('Unsafe backup identifier');
  }
  return value;
}

/** Validate lexical containment and every existing component before I/O.
 * Reject links (including Windows junctions) and multiply-linked files. This
 * does not claim protection against a hostile process racing filesystem writes.
 */
export async function safeWorkspacePath(workspaceDir, relPath) {
  validateRelativePath(relPath);
  const root = resolve(workspaceDir);
  const target = resolve(root, relPath);
  const rel = relative(root, target);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe workspace path');
  let cursor = root;
  for (const part of ['', ...relPath.split('/')]) {
    if (part) cursor = join(cursor, part);
    try {
      const info = await lstat(cursor);
      if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) throw new Error('Linked workspace path is not allowed');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return target;
}
