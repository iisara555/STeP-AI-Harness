import { build } from 'esbuild';
import { build as buildRenderer } from 'vite';
import { copyFile } from 'node:fs/promises';
await buildRenderer();
await build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', '@anthropic-ai/claude-agent-sdk'],
});
await copyFile('electron/sheet-worker.cjs', 'dist/sheet-worker.cjs');
await build({
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
