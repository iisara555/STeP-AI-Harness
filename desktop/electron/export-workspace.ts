import { mkdir, stat } from 'node:fs/promises';

/** One native folder picker owns workspace changes; no path comes from renderer export input. */
export class ExportWorkspace<T extends { workspace?: string }> {
  private choosing?: Promise<string | null>;
  constructor(
    private current: () => T,
    private save: (settings: T) => void,
    private pick: () => Promise<string | null>,
    private changed: () => Promise<void>,
  ) {}
  async resolve() {
    const folder = this.current().workspace;
    if (folder) {
      try {
        if ((await stat(folder)).isDirectory()) return folder;
      } catch (error: any) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      }
    }
    return this.choose();
  }
  async choose() {
    if (this.choosing) return this.choosing;
    const task = (async () => {
      const folder = await this.pick();
      if (!folder) return null;
      await mkdir(folder, { recursive: true });
      if (!(await stat(folder)).isDirectory()) throw new Error('WORKSPACE_REQUIRED');
      this.save({ ...this.current(), workspace: folder });
      await this.changed();
      return folder;
    })();
    this.choosing = task;
    try {
      return await task;
    } finally {
      if (this.choosing === task) this.choosing = undefined;
    }
  }
}
