import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { build, Platform } = require('electron-builder');
const { Arch } = require('builder-util');
const { NsisTarget } = require('app-builder-lib/out/targets/nsis/NsisTarget');
const templates = join(dirname(require.resolve('app-builder-lib/package.json')), 'templates/nsis');
let section = await readFile(join(templates, 'installSection.nsh'), 'utf8');
for (const root of ['SHELL_CONTEXT', 'HKEY_CURRENT_USER']) {
  const pattern = new RegExp(`!insertmacro uninstallOldVersion ${root}\\r?\\n\\s*!insertmacro handleUninstallResult ${root}`, 'g');
  if ([...section.matchAll(pattern)].length !== 1) throw new Error(`Unsupported NSIS upgrade template: ${root}`);
  section = section.replace(pattern, `!insertmacro stepUninstallOldVersion ${root}`);
}
// Expand only the install section in this packaging process. Keep the standard
// uninstaller generation/signing and leave dependency files untouched.
const compile = NsisTarget.prototype.computeFinalScript;
if (typeof compile !== 'function') throw new Error('Unsupported NSIS compiler interface');
NsisTarget.prototype.computeFinalScript = function (script, installer, archs) {
  if (installer) {
    const anchor = '!include "installSection.nsh"';
    if (script.split(anchor).length !== 2) throw new Error('Unsupported NSIS install section');
    script = script.replace(anchor, section);
  }
  return compile.call(this, script, installer, archs);
};
const args = process.argv.slice(2);
const options = { targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never', config: { npmRebuild: false } };
while (args.length) {
  const flag = args.shift();
  const value = args.shift();
  if (!value) throw new Error('Missing packaging option');
  if (flag === '--prepackaged') options.prepackaged = value;
  else if (flag === '--artifact-name') options.config.win = { artifactName: value };
  else if (flag === '--fixture-id') {
    if (!/^th\.ac\.cmu\.step\.installer-test\.[a-z0-9-]+$/.test(value)) throw new Error('Invalid installer fixture identity');
    options.config.appId = value;
    options.config.nsis = {
      shortcutName: 'STeP Installer Test',
      createDesktopShortcut: false,
      createStartMenuShortcut: false,
      runAfterFinish: false,
      allowElevation: false,
    };
  } else throw new Error(`Unknown packaging option: ${flag}`);
}
await build(options);
