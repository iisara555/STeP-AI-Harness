import { build } from 'esbuild';
import { build as buildRenderer } from 'vite';
import { copyFile, cp } from 'node:fs/promises';
import { googleClientBuildConfig } from './electron/google-client.ts';
// Read only at build time; never write the input JSON to the checkout or pass it to Vite/preload.
const googleClient = googleClientBuildConfig(
  process.env.STEP_GOOGLE_DESKTOP_CLIENT_JSON,
  process.env.STEP_REQUIRE_GOOGLE_DESKTOP_CLIENT === 'true',
);
delete process.env.STEP_GOOGLE_DESKTOP_CLIENT_JSON;
await buildRenderer();
await build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  define: { __STEP_GOOGLE_DESKTOP_CLIENT__: JSON.stringify(googleClient) },
  external: ['electron', '@anthropic-ai/claude-agent-sdk', '@github/copilot-sdk'],
});
await copyFile('electron/sheet-worker.cjs', 'dist/sheet-worker.cjs');
await build({
  entryPoints: ['electron/code-worker.cjs'],
  outfile: 'dist/code-worker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
await cp('node_modules/typescript/lib', 'dist/typescript-lib', { recursive: true, filter: path => !/\.(?:js|map|json)$/.test(path) });
await copyFile('node_modules/typescript/LICENSE.txt', 'dist/typescript-lib/LICENSE.txt');
await copyFile('node_modules/typescript/ThirdPartyNoticeText.txt', 'dist/typescript-lib/ThirdPartyNoticeText.txt');
await copyFile('electron/office-package.cjs', 'dist/office-package.cjs');
await cp('assets/document-fonts', 'dist/document-fonts', { recursive: true });
await build({
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
