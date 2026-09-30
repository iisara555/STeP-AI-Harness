import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { Workbench } from './workbench';
import { safeMemory } from './memory';
import type { Settings } from '../src/types';

export class WorkspaceContext {
  constructor(
    private workbench: Workbench,
    private data: string,
    private settings: () => Settings,
    private privacy: (text: string) => any,
  ) {}
  async styles() {
    if (!this.settings().workspace) return [];
    try {
      const result = await this.workbench.files('.step/output-styles');
      return result.entries.filter(e => !e.directory && /^[a-zA-Z0-9_-]{1,60}\.md$/.test(e.name)).map(e => e.name);
    } catch (e: any) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }
  async load() {
    const settings = this.settings(),
      loaded: { path: string; text: string }[] = [];
    const paths = settings.workspace ? ['STEP.md', 'AGENTS.md', 'ASSISTANT.md'] : [];
    if (settings.workspace && settings.outputStyle) {
      if (!/^[a-zA-Z0-9_-]{1,60}\.md$/.test(settings.outputStyle)) throw new Error('INVALID_OUTPUT_STYLE');
      paths.push('.step/output-styles/' + settings.outputStyle);
    }
    for (const path of paths) {
      try {
        const bytes = await this.workbench.bytes(path, 24_000);
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        safeMemory(text, this.privacy);
        loaded.push({ path, text });
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    if (!settings.workspace) {
      try {
        const path = join(this.data, 'ASSISTANT.md'),
          info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 24_000) throw new Error('INVALID_PATH');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
        safeMemory(text, this.privacy);
        loaded.push({ path: 'ASSISTANT.md', text });
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    return loaded;
  }
}
