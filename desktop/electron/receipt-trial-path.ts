import { lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Resolve existing files and parent symlinks before checking every Git ancestor. Fail closed on other IO errors. */
export async function assertPrivateTrialPath(path: string) {
  let current: string;
  try {
    current = await realpath(path);
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    current = await realpath(dirname(resolve(path)));
  }
  for (;;) {
    try {
      const marker = await lstat(join(current, '.git'));
      if (marker.isDirectory()) await lstat(join(current, '.git', 'HEAD'));
      throw new Error('OCR_TRIAL_REPO_PATH');
    } catch (error: any) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
