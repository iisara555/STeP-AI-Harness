// Whole-app agent protocol, transmission and Changes approval. Synthetic local files only.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const home = await mkdtemp(join(tmpdir(), 'step-file-operations-smoke-'));
const workspace = join(home, 'work'),
  executable = join(home, 'codex.mjs'),
  audit = join(home, 'audit.jsonl');
await mkdir(join(workspace, 'nested'), { recursive: true });
const original = 'marker one\nmarker two\nunique original\nduplicate duplicate';
await writeFile(join(workspace, 'nested', 'note.txt'), original);
await writeFile(join(workspace, '.env'), 'SYNTHETIC_PROTECTED');
await writeFile(join(workspace, 'blocked.txt'), 'marker SYNTHETIC_DENIED');
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    pilot: false,
    checks: { authority: true, privacy: true },
    permission: { pathRules: [{ pattern: 'blocked.txt', allow: false }] },
  }),
);
await writeFile(
  executable,
  `import readline from 'node:readline';
import {appendFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
const state=${JSON.stringify(join(home, 'state.json'))}, audit=${JSON.stringify(audit)};
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
let thread='';
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);let result={};if(m.method==='thread/start'){result={thread:{id:'fixture'}};thread='';}send({id:m.id,result});
 if(m.method!=='turn/start')return;
 thread+=m.params.input?.map(i=>i.text||'').join('')||'';
 const blocks=[...thread.matchAll(/<tool_results>\\s*([\\s\\S]*?)\\s*<\\/tool_results>/g)];
 const last=blocks.length?JSON.parse(blocks.at(-1)[1]):[];
 const prior=last[0]?.text?JSON.parse(last[0].text):null;
 const s=existsSync(state)?JSON.parse(readFileSync(state,'utf8')):{turn:0};
 if(s.turn===1)s.cursor=prior?.nextCursor;
 const requests=[
 {tool:'search_files',input:'.',args:{pattern:'marker',target:'content',maxResults:1}},
 {tool:'search_files',input:'.',args:{pattern:'marker',target:'content',maxResults:1,cursor:s.cursor}},
 {tool:'patch',input:'nested/note.txt',args:{old_string:'unique original',new_string:'unique replacement'}},
 {tool:'patch',input:'blocked.txt',args:{old_string:'marker',new_string:'forbidden'}},
 {tool:'search_files',input:'.',args:{pattern:'(a+)+$',regex:true}},
 {tool:'patch',input:'nested/note.txt',args:{old_string:'duplicate',new_string:'forbidden'}},
 {tool:'search_files',input:'.',args:{pattern:'**/*.txt',target:'files'}},
 ];
 const request=requests[s.turn];appendFileSync(audit,JSON.stringify({turn:s.turn,last,prior,request})+'\\n');s.turn++;writeFileSync(state,JSON.stringify(s));
 const text=request?'\x60\x60\x60step-tool\\n'+JSON.stringify(request)+'\\n\x60\x60\x60':'File operations fixture complete';
 send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});
});`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let child;
try {
  child = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await child.firstWindow(),
    errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await child.evaluate(
    ({ app }, data) => {
      const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const put = (kind, id, value) =>
        db
          .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
          .run(kind, id, JSON.stringify(value));
      const settings = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      put('settings', 'main', {
        ...settings,
        workspace: data.workspace,
        tourDone: true,
        consentedAt: new Date().toISOString(),
        termsVersion: '2026-10-02',
      });
      put('connection', 'fake', {
        id: 'fake',
        provider: 'openai',
        mode: 'subscription',
        model: '',
        executable: data.executable,
        customRuntime: true,
        ready: true,
        note: 'Synthetic',
        modelsAt: new Date().toISOString(),
      });
      db.close();
    },
    { workspace, executable },
  );
  await page.reload();
  await page.locator('.statusbar .status-dot.ok').waitFor();
  await page.locator('.composer textarea').fill('Search and patch the synthetic local file fixture');
  await page.keyboard.press('Enter');
  const finish = page.getByText('File operations fixture complete', { exact: true });
  let approved = 0;
  for (let i = 0; i < 600 && !(await finish.isVisible()); i++) {
    const allow = page.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true });
    if (await allow.isVisible()) {
      await allow.click();
      approved++;
    }
    await page.waitForTimeout(100);
  }
  await expect(finish).toBeVisible();
  const records = (await readFile(audit, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  assert.equal(records.length, 8);
  assert.deepEqual(records[1].prior.matches, [{ path: 'nested/note.txt', line: 1, text: 'marker one' }]);
  assert.deepEqual(records[2].prior.matches, [{ path: 'nested/note.txt', line: 2, text: 'marker two' }]);
  assert.equal(records[3].prior.status, 'staged-for-human-review');
  assert.equal(records[4].last[0].code, 'PATH_RULE_DENIED');
  assert.equal(records[5].last[0].code, 'INVALID_INPUT');
  assert.equal(records[6].last[0].code, 'PATCH_AMBIGUOUS');
  assert.deepEqual(records[7].prior.matches, [{ path: 'nested/note.txt' }]);
  assert.doesNotMatch(JSON.stringify(records), /SYNTHETIC_PROTECTED|SYNTHETIC_DENIED/);
  assert.equal(await readFile(join(workspace, 'nested', 'note.txt'), 'utf8'), original, 'staging must not write');
  const apply = async id =>
    page.evaluate(id => {
      window.fixtureApply = { done: false };
      void window.step.call('toolApply', { id }).then(
        result => (window.fixtureApply = { done: true, result }),
        error => (window.fixtureApply = { done: true, error: error.message }),
      );
    }, id);
  const id = records[3].prior.id;
  await apply(id);
  const approval = page.getByRole('alertdialog', { name: 'เขียนไฟล์ที่ตรวจแล้ว?' });
  await approval.waitFor();
  await approval.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await page.waitForFunction(() => window.fixtureApply.done);
  assert.equal(await readFile(join(workspace, 'nested', 'note.txt'), 'utf8'), original);
  await apply(id);
  await approval.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true }).click();
  await page.waitForFunction(() => window.fixtureApply.done);
  assert.ok((await page.evaluate(() => window.fixtureApply)).result.snapshotId);
  assert.equal(await readFile(join(workspace, 'nested', 'note.txt'), 'utf8'), original.replace('unique original', 'unique replacement'));
  assert.ok(approved >= 3, `transmission approval dialogs: ${approved}`);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      smoke: 'file-operations',
      turns: records.length,
      approved,
      file: 'recursive search/staged/denied apply/approved apply/snapshot',
    }),
  );
} finally {
  await child?.close();
  await rm(home, { recursive: true, force: true });
}
