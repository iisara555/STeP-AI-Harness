import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STEP_AI_COMMANDS, mergeGeminiSettings, mergeVSCodeSettings, writeToolPermissions,
} from '../src/modules/adapters/tool-permissions.js';
import { getInstructionFiles } from '../src/modules/adapters/multi.js';

// Free AI apps are how most staff will run STeP AI. Only the read-only step-ai
// commands may skip the confirmation prompt, and a user's own settings must survive.

const VSCODE_KEY = 'chat.tools.terminal.autoApprove';

function vscodeRules(settings) {
  return Object.keys(settings[VSCODE_KEY]).map((key) => new RegExp(key.slice(1, key.lastIndexOf('/'))));
}

test('only the step-ai ask and output commands are pre-approved', () => {
  const gemini = mergeGeminiSettings(null);
  assert.deepEqual(gemini.tools.allowed, STEP_AI_COMMANDS.map((command) => `run_shell_command(${command})`));
  const rules = vscodeRules(mergeVSCodeSettings(null));
  const approved = (command) => rules.some((rule) => rule.test(command));
  assert.ok(approved('sh ./step-ai ask "ลาพักผ่อนได้ปีละกี่วัน"'));
  assert.ok(approved('.\\step-ai.cmd ask "ลาพักผ่อนได้ปีละกี่วัน"'));
  assert.ok(approved('sh ./step-ai output --team cc --title x'));
  for (const command of ['sh ./step-ai config --team qs', 'sh ./step-ai update', 'rm -rf .', 'sh ./step-ai-evil ask', 'sh ./step-ai asking']) {
    assert.ok(!approved(command), `${command} must still ask`);
  }
});

test('merging keeps the user\'s own settings and does not duplicate entries', () => {
  const gemini = mergeGeminiSettings({ theme: 'dark', tools: { allowed: ['run_shell_command(git status)'] } });
  assert.equal(gemini.theme, 'dark');
  assert.equal(gemini.tools.allowed[0], 'run_shell_command(git status)');
  assert.deepEqual(mergeGeminiSettings(gemini), gemini, 'second merge is a no-op');

  const vscode = mergeVSCodeSettings({ 'editor.fontSize': 16, [VSCODE_KEY]: { '/^sh \\.\\/step-ai (ask|output)\\b/': false } });
  assert.equal(vscode['editor.fontSize'], 16);
  assert.equal(vscode[VSCODE_KEY]['/^sh \\.\\/step-ai (ask|output)\\b/'], false, 'a user who chose to be asked stays asked');

  assert.equal(mergeGeminiSettings({ tools: 'broken' }), null);
  assert.equal(mergeVSCodeSettings({ [VSCODE_KEY]: true }), null);
});

test('writeToolPermissions creates, re-runs cleanly and never overwrites unreadable files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-perm-'));
  try {
    const first = await writeToolPermissions(dir);
    assert.deepEqual(first.map((item) => item.status), ['created', 'created']);
    const second = await writeToolPermissions(dir);
    assert.deepEqual(second.map((item) => item.status), ['unchanged', 'unchanged']);

    const jsonc = '{\n  // my comment\n  "editor.tabSize": 2\n}\n';
    await writeFile(join(dir, '.vscode', 'settings.json'), jsonc);
    const third = await writeToolPermissions(dir);
    assert.equal(third.find((item) => item.relativePath === '.vscode/settings.json').status, 'skipped-unparseable');
    assert.equal(await readFile(join(dir, '.vscode', 'settings.json'), 'utf8'), jsonc, 'commented settings are left untouched');

    const dry = await mkdtemp(join(tmpdir(), 'step-perm-dry-'));
    await writeToolPermissions(dry, true);
    await assert.rejects(readFile(join(dry, '.gemini', 'settings.json')), 'dry run writes nothing');
    await rm(dry, { recursive: true, force: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('VS Code + Copilot gets the same instructions as AGENTS.md', () => {
  const role = { id: 'qs', name: 'QS', description: '' };
  const files = getInstructionFiles(role, [{ relativePath: 'skills/common/step-writing/SKILL.md', type: 'skill' }]);
  const agents = files.find((file) => file.filename === 'AGENTS.md');
  const copilot = files.find((file) => file.filename === '.github/copilot-instructions.md');
  assert.ok(copilot, 'multi adapter must write .github/copilot-instructions.md');
  assert.equal(copilot.content, agents.content);
  for (const file of files) assert.ok(!/Commercial \/ Paid|Free Quota AI Assistant/.test(file.content), `${file.filename} must not label a price tier`);
});
