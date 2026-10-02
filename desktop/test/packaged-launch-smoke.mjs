// Tests the shipped application with a synthetic runtime. No real sign-in or provider quota.
// An optional profile is used by the installer test to verify preservation across upgrades.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const [executablePath, existingProfile, reuse] = process.argv.slice(2);
assert.ok(executablePath, 'pass the packaged app executable');
const home = await mkdtemp(join(tmpdir(), 'step-packaged-'));
const profile = existingProfile ? resolve(existingProfile) : join(home, 'profile');
const workspace = join(profile, 'acceptance-files');
await mkdir(workspace, { recursive: true });
await writeFile(join(workspace, 'note.txt'), 'PACKAGED_SOURCE_MARKER');
const runtime = join(profile, 'codex.mjs');
await writeFile(
  runtime,
  `
import readline from 'node:readline';
if(process.argv.includes('--version')) { console.log('codex 0.158.0'); process.exit(0); }
const send=o=>console.log(JSON.stringify(o)); let thread='', turns=0;
readline.createInterface({input:process.stdin}).on('line', line=>{
 const m=JSON.parse(line); let result={};
 if(m.method==='account/read') result={account:{type:'chatgpt'}};
 if(m.method==='model/list') result={data:[{id:'fixture-model',model:'fixture-model',displayName:'Synthetic fixture',isDefault:true}]};
 if(m.method==='thread/start') {result={thread:{id:'fixture'}};thread='';turns=0;}
 send({id:m.id,result});
 if(m.method!=='turn/start') return;
 thread+=m.params.input.map(i=>i.text||'').join(''); turns++;
 const tool=(tool,input,args)=>'\x60\x60\x60step-tool\\n'+JSON.stringify({tool,input,args})+'\\n\x60\x60\x60';
 let text='OK';
 if(thread.includes('Read acceptance note')) {
  if(!thread.includes('<tool_results>')) text=tool('files','note.txt');
  else if(!thread.includes('"tool":"ask_user"')) text=tool('ask_user','Choose acceptance style',{options:['Brief','Detailed']});
  else text=thread.includes('PACKAGED_SOURCE_MARKER')?'Packaged tool result verified':'Missing source';
 }
 send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10*turns,outputTokens:5*turns,totalTokens:15*turns}}}});
 send({method:'item/agentMessage/delta',params:{delta:text}});
 send({method:'turn/completed',params:{turn:{status:'completed'}}});
});
`,
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.STEP_DESKTOP_TEST_HOME;
const timeout = Number(process.env.STEP_LAUNCH_TIMEOUT) || 90000;
let app;
const launch = async () => {
  app = await electron.launch({ executablePath, args: ['--user-data-dir=' + profile], env, timeout });
  const page = await app.firstWindow({ timeout });
  page.setDefaultTimeout(30000);
  // Fail before seeding anything if Chromium did not isolate the application profile.
  assert.equal(resolve(await app.evaluate(({ app }) => app.getPath('userData'))), profile);
  return page;
};
try {
  let page = await launch();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (!existingProfile || reuse !== '--reuse') {
    await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ timeout });
    await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  }
  await page.locator('.composer textarea').waitFor({ timeout: 30000 });
  const shipped = await app.evaluate(({ app }) => {
    const { existsSync } = process.mainModule.require('node:fs');
    const { join } = process.mainModule.require('node:path');
    return {
      packaged: app.isPackaged,
      version: app.getVersion(),
      arch: process.arch,
      platform: process.platform,
      files: Object.fromEntries(
        [
          'manifest/documents.yaml',
          'manifest/services.yaml',
          'docs/hr-personnel-welfare-index.md',
          'docs/hr-service-channels.md',
          'docs/step-executive-board.md',
          'docs/teams.md',
          'docs/step-public-profile.md',
          'docs/project-code-scheme.md',
          'docs/step-context.md',
          'docs/employee-guide.md',
          'skills/common/hr-policy-lookup/SKILL.md',
          'rules/human-approval.md',
        ].map(file => [file, existsSync(join(process.resourcesPath, 'harness', file))]),
      ),
    };
  });
  assert.equal(shipped.packaged, true);
  if (process.env.STEP_EXPECT_ARCH) assert.equal(shipped.arch, process.env.STEP_EXPECT_ARCH);
  for (const [file, present] of Object.entries(shipped.files)) assert.ok(present, `missing ${file}`);
  const before = await page.evaluate(() => window.step.call('snapshot'));
  if (reuse === '--reuse') {
    assert.ok(before.sessions.some(s => s.project === 'Packaged acceptance' && s.draft === 'PACKAGED_PERSISTED_DRAFT'));
    assert.equal(before.settings.workspace, workspace);
    assert.ok(before.connections.some(c => c.provider === 'openai' && c.ready));
    assert.ok((await page.evaluate(() => window.step.call('memoryList'))).entries.some(m => m.text === 'Prefer short acceptance answers.'));
  }
  await page.evaluate(async workspace => {
    const s = await window.step.call('snapshot');
    await window.step.call('settings', { ...s.settings, workspace, onboarding: true, tourDone: true, team: 'cc' });
  }, workspace);
  await app.evaluate(({ dialog }, workspace) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
  }, workspace);
  assert.equal((await page.evaluate(() => window.step.call('workspace'))).workspace, workspace);
  await app.evaluate(({ dialog }, runtime) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [runtime] });
  }, runtime);
  const connection = await page.evaluate(async () => {
    const c = await window.step.call('connection', { provider: 'openai', mode: 'subscription' });
    await window.step.call('runtime', { id: c.id });
    return window.step.call('connect', { id: c.id });
  });
  assert.equal(connection.ready, true, connection.note);
  const task = await page.evaluate(async id => {
    const s = await window.step.call('create', { connectionId: id, project: 'Packaged acceptance' });
    return s;
  }, connection.id);
  await page.reload();
  await page.locator('.composer textarea').fill('Read acceptance note and ask which style to use.');
  await page.locator('.send').click();
  if (!before.settings.termsVersion) {
    const consent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
    await consent.getByRole('checkbox').check();
    await consent.getByRole('button', { name: 'รับทราบและส่ง' }).click();
  }
  await page.locator('.tool-question').getByRole('button', { name: /Brief/ }).click({ timeout: 30000 });
  await page.getByText('Packaged tool result verified', { exact: true }).waitFor({ timeout: 30000 });
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === task.id)?.status, {
      timeout: 30000,
    })
    .toBe('review');
  const finished = (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === task.id);
  assert.ok(finished.runs.at(-1).firstResponseMs >= 0);
  await page.evaluate(async id => {
    await window.step.call('edit', { id, revision: 0, text: 'PACKAGED_PERSISTED_DRAFT' });
    await window.step.call('memorySave', {
      name: 'Acceptance preference',
      text: 'Prefer short acceptance answers.',
      type: 'user',
      scope: 'private',
      importance: 0.5,
      ttl_days: 0,
    });
  }, task.id);
  const exported = await page.evaluate(id => window.step.call('export', { id, format: 'md' }), task.id);
  assert.match(await readFile(exported.path, 'utf8'), /PACKAGED_PERSISTED_DRAFT/);
  assert.deepEqual(errors, []);
  await app.close();
  app = null;
  page = await launch();
  await page.locator('.composer textarea').waitFor();
  const saved = await page.evaluate(() => window.step.call('snapshot'));
  assert.equal(saved.sessions.find(s => s.id === task.id)?.draft, 'PACKAGED_PERSISTED_DRAFT');
  assert.equal(saved.connections.find(c => c.id === connection.id)?.ready, true);
  assert.ok((await page.evaluate(() => window.step.call('memoryList'))).entries.some(m => m.text === 'Prefer short acceptance answers.'));
  await mkdir('release/qa', { recursive: true });
  await writeFile(
    `release/qa/packaged-${shipped.platform}-${shipped.arch}.json`,
    JSON.stringify(
      {
        ...shipped,
        synthetic: true,
        passed: true,
        restart: true,
        tools: true,
        export: true,
        upgradedProfile: reuse === '--reuse',
        firstResponseMs: finished.runs.at(-1).firstResponseMs,
        totalMs: finished.runs.at(-1).ms,
        liveAccount: 'not-tested',
        gatekeeperOrSmartScreen: 'not-tested',
      },
      null,
      2,
    ),
  );
  console.log(
    `Packaged app ${shipped.version} ${shipped.arch}: connect, chat, tool read, question, export, memory and restart passed with a synthetic runtime.`,
  );
} finally {
  await app?.close().catch(() => {});
  await rm(home, { recursive: true, force: true }).catch(() => {});
}
