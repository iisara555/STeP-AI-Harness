import { mkdtemp, mkdir, copyFile, lstat, rm } from 'node:fs/promises';
import { realpathSync, existsSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { containsPath } from '../office-skill-benefit/config.mjs';

export async function isolatedWorkspace(repo, base = tmpdir()) {
  const parent = realpathSync(base);
  const source = realpathSync(repo);
  if (containsPath(source, parent) || containsPath(parent, source)) throw new Error('EVAL_WORKSPACE_NOT_ISOLATED');
  // Reject ambient project instructions instead of silently inheriting them.
  for (let ancestor = parent; ; ancestor = dirname(ancestor)) {
    if (['.git', 'AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'GEMINI.md'].some(name => existsSync(join(ancestor, name))))
      throw new Error('EVAL_AMBIENT_INSTRUCTIONS');
    if (dirname(ancestor) === ancestor) break;
  }
  const path = await mkdtemp(join(parent, 'step-parity-trial-'));
  return {
    path,
    async publish(destination) {
      await mkdir(destination, { recursive: true });
      // Only named artifacts leave the trial: never copy an OAuth home,
      // provider logs, sockets or other incidental runtime state.
      for (const name of ['brief.md', 'budget.xlsx', 'recovery.md']) {
        const file = join(path, name);
        let info;
        try {
          info = await lstat(file);
        } catch (e) {
          if (e.code === 'ENOENT') continue;
          throw e;
        }
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('EVAL_ARTIFACT_INVALID');
        await copyFile(file, join(destination, name), constants.COPYFILE_EXCL);
      }
    },
    async close() {
      if (dirname(realpathSync(path)) !== parent || !basename(path).startsWith('step-parity-trial-'))
        throw new Error('EVAL_WORKSPACE_INVALID');
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
