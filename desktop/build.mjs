import { build } from 'esbuild';
import { build as buildRenderer } from 'vite';
await buildRenderer();
await build({ entryPoints: ['electron/main.ts'], outfile: 'dist/main.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', '@anthropic-ai/claude-agent-sdk'] });
await build({ entryPoints: ['electron/preload.ts'], outfile: 'dist/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
