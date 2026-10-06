import { mkdir, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';

/** Keep transcripts and runtime homes in the employee's private profile, not in a shared directory. */
export async function prepareLocalData(data: string) {
  for (const directory of [data, join(data, 'logs')]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('LOCAL_DATA_INVALID');
    // Windows uses the user profile's ACLs; chmod cannot establish an equivalent Windows ACL.
    if (process.platform !== 'win32') await chmod(directory, 0o700);
  }
  // SQLite writes its journal beside the database. Refuse preexisting aliases before opening any of them.
  for (const name of ['workspace.sqlite', 'workspace.sqlite-wal', 'workspace.sqlite-shm']) {
    try {
      const info = await lstat(join(data, name));
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('LOCAL_DATA_INVALID');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
