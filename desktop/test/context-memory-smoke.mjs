import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function minimalPdf(pages) {
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : '';
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map(o => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const home = await mkdtemp(join(tmpdir(), 'step-context-smoke-')),
  workspace = join(home, 'work'),
  executable = join(home, 'codex.mjs'),
  audit = join(home, 'calls.jsonl');
await mkdir(workspace);
await mkdir('release/qa', { recursive: true });
await writeFile(join(workspace, 'STEP.md'), 'Use source evidence and identify missing facts.');
await mkdir(join(workspace, '.step', 'output-styles'), { recursive: true });
await writeFile(join(workspace, '.step', 'output-styles', 'brief.md'), 'Keep the response concise.');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTj4AAAAASUVORK5CYII=', 'base64');
await writeFile(join(workspace, 'image.png'), png);
await writeFile(join(workspace, 'pii.png'), png);
await writeFile(join(workspace, 'scan.pdf'), minimalPdf(['']));
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    checks: { authority: true, privacy: true },
    features: { toolLoop: false, vision: true },
    prices: { 'openai:*': { input: 1, output: 2 } },
  }),
);
await writeFile(
  executable,
  `import readline from 'node:readline';import fs from 'node:fs';
let system='';const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let result={};
if(m.method==='thread/start'){system=m.params.developerInstructions||'';result={thread:{id:'fixture'}};}send({id:m.id,result});
if(m.method==='turn/start'){const prompt=m.params.input?.filter(i=>i.type==='text').map(i=>i.text||'').join('')||'';
const summary=system.startsWith('Summarize');fs.appendFileSync(${JSON.stringify(audit)},JSON.stringify({summary,images:m.params.input.filter(i=>i.type==='image').length,hasRoute:prompt.includes('<routing_contract>'),hasState:prompt.includes('<task_state>'),hasMemory:prompt.includes('<memory_context>'),hasWorkspace:prompt.includes('STEP.md')})+'\\n');
const text=summary?'Earlier conversation: preserve the source inventory and current request.':'Completed context-aware response';
send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:10,outputTokens:5,totalTokens:15}}}});
send({method:'item/agentMessage/delta',params:{delta:text}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}});`,
);
const db = new DatabaseSync(join(home, 'workspace.sqlite'));
db.exec('CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(kind,id))');
const put = (kind, id, value) => db.prepare('INSERT INTO records VALUES(?,?,?)').run(kind, id, JSON.stringify(value));
put('settings', 'main', {
  team: 'cc',
  assistant: 'STeP Mate',
  workspace,
  theme: 'light',
  onboarding: true,
  whatsNewSeen: '999.0.0',
  tourDone: true,
  consentedAt: new Date().toISOString(),
  termsVersion: '2026-10-02',
});
put('connection', 'fake', {
  id: 'fake',
  provider: 'openai',
  mode: 'subscription',
  model: '',
  executable,
  customRuntime: true,
  ready: true,
  note: 'Synthetic',
});
put('session', 'source', {
  id: 'source',
  title: 'Synthetic context session',
  project: 'Test',
  team: 'cc',
  connectionId: 'fake',
  messages: Array.from({ length: 24 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user',
    text: `Prior turn ${i}: ` + 'ก'.repeat(2300),
    at: new Date().toISOString(),
  })),
  files: [{ name: 'evidence.txt', text: 'Distinct source inventory', at: new Date().toISOString() }],
  draft: '',
  revision: 0,
  versions: [],
  proposals: [],
  originalQuery: 'Earlier task',
  answers: [],
  clarification: false,
  status: 'review',
  updatedAt: new Date().toISOString(),
  sources: [],
  mode: 'chat',
});
db.close();
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let child = await electron.launch({ args: ['.'], env, timeout: 45000 });
let errors = [];
try {
  let page = await child.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  await page.getByRole('menuitem', { name: 'ความจำ', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'detached' });
  await page.locator('.composer textarea').fill('/memory');
  await page.keyboard.press('Enter');
  const memory = page.getByRole('alertdialog', { name: 'ความจำ', exact: true });
  await memory.getByRole('button', { name: 'เพิ่มความจำ', exact: true }).click();
  await memory.getByLabel('ชื่อความจำ', { exact: true }).fill('Source preference');
  await memory.getByLabel('ข้อความความจำ', { exact: true }).fill('Prefer concise responses with source evidence.');
  await memory.getByRole('button', { name: 'ยืนยันบันทึกความจำ', exact: true }).click();
  await expect(memory.getByRole('button', { name: 'แก้ไข', exact: true })).toHaveCount(1);
  await memory.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await memory.getByLabel('ข้อความความจำ', { exact: true }).fill('Prefer concise responses and identify missing evidence.');
  await memory.getByRole('button', { name: 'ยืนยันบันทึกความจำ', exact: true }).click();
  await expect(memory).toContainText('identify missing evidence');
  await expect(memory.getByLabel('ข้อความความจำ', { exact: true })).toHaveCount(0);
  await expect(memory.getByLabel('รูปแบบคำตอบ', { exact: true })).toHaveCount(0);
  await expect(memory.getByRole('button', { name: 'แก้ไข', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'release/qa/phase3-memory.png' });
  await memory.getByRole('button', { name: 'ปิด', exact: true }).click();
  await page.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true }).click();
  await page.getByRole('tab', { name: 'ทั่วไป', exact: true }).click();
  await page.getByLabel('รูปแบบคำตอบ', { exact: true }).selectOption('brief.md');
  await page.getByRole('button', { name: 'บันทึกและไปที่งาน' }).click();
  await expect.poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).settings.outputStyle).toBe('brief.md');
  const currentSettings = (await page.evaluate(() => window.step.call('snapshot'))).settings;
  assert.equal(
    await page.evaluate(async saved => {
      try {
        await window.step.call('settings', { ...saved, assistant: 'Should not save', outputStyle: 'missing-style.md' });
        return false;
      } catch (error) {
        return String(error).includes('INVALID_OUTPUT_STYLE');
      }
    }, currentSettings),
    true,
  );
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).settings.assistant, currentSettings.assistant);
  assert.equal((await page.evaluate(() => window.step.call('snapshot'))).settings.outputStyle, 'brief.md');
  const rejected = await page.evaluate(() =>
    window.step
      .call('memorySave', {
        name: 'Unsafe',
        text: 'fake.person@example.test',
        type: 'user',
        scope: 'private',
        importance: 0.7,
        ttl_days: 0,
      })
      .catch(e => String(e)),
  );
  assert.ok(rejected.includes('MEMORY_PRIVACY_BLOCKED'));
  await page.locator('.composer textarea').fill('Summarize earlier notes briefly.');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === 'source').status)
    .toBe('review');
  // Standard mode sends saved preferences and confirmed memories without a dialog, like Claude and ChatGPT.
  await expect(page.getByRole('alertdialog', { name: 'ใช้บริบทที่บันทึกไว้กับงานนี้?' })).toHaveCount(0);
  let state = await page.evaluate(() => window.step.call('snapshot'));
  const source = state.sessions.find(s => s.id === 'source');
  assert.equal(source.compaction.method, 'summary');
  assert.ok(source.compaction.after < source.compaction.before);
  assert.ok(source.loadedContext.includes('STEP.md'));
  assert.ok(source.loadedContext.includes('.step/output-styles/brief.md'));
  assert.ok(source.loadedContext.some(s => s.includes('Source preference')));
  let calls = (await readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(calls.some(c => c.summary));
  assert.ok(calls.at(-1).hasRoute && calls.at(-1).hasState && calls.at(-1).hasMemory);
  assert.equal(state.usage.dailyTokens, calls.length * 15);
  await page.getByPlaceholder('ค้นหางานหรือเนื้อหา').fill('Distinct source');
  await expect(page.locator('.session-open')).toHaveCount(1);
  await page.getByPlaceholder('ค้นหางานหรือเนื้อหา').fill('');
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  await page.getByRole('menuitem', { name: 'ทำสำเนาเป็นงานใหม่', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.length).toBe(2);
  state = await page.evaluate(() => window.step.call('snapshot'));
  const fork = state.sessions.find(s => s.parentId === 'source');
  assert.equal(fork.status, 'idle');
  assert.equal(fork.consentedAt, undefined);
  await child.evaluate(
    ({ dialog }, data) => {
      dialog.showSaveDialog = async (_window, options) => ({
        canceled: false,
        filePath: data.home + '/conversation.' + (options.defaultPath.endsWith('json') ? 'json' : 'md'),
      });
    },
    { home },
  );
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  await page.getByRole('menuitem', { name: 'ส่งออก JSON', exact: true }).click();
  await expect
    .poll(async () =>
      readFile(join(home, 'conversation.json'), 'utf8')
        .then(t => JSON.parse(t).id)
        .catch(() => null),
    )
    .toBe(fork.id);
  const exported = JSON.parse(await readFile(join(home, 'conversation.json'), 'utf8'));
  assert.equal(exported.connectionId, undefined);
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  await page.getByRole('menuitem', { name: 'ส่งออก Markdown', exact: true }).click();
  await expect
    .poll(async () =>
      readFile(join(home, 'conversation.md'), 'utf8')
        .then(t => t.includes('Distinct source inventory'))
        .catch(() => false),
    )
    .toBe(true);
  // OCR network and provider are synthetic; routing/privacy/consent/SQLite/preload/renderer are real.
  await child.evaluate(
    ({ dialog }, data) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [data.workspace + '/image.png'] });
      const original = globalThis.fetch;
      globalThis.fetch = async (input, options) => {
        const url = String(input);
        if (url.startsWith('http://127.0.0.1:8765/api/health'))
          return new Response(JSON.stringify({ ok: true, service: 'STeP Local Thai OCR' }));
        if (url.startsWith('http://127.0.0.1:8765/api/ocr')) {
          const text = url.includes('pii.png') ? 'Email: fake.person@example.test' : 'Synthetic complete OCR source';
          return new Response(JSON.stringify({ ok: true, result: { text, pages: [{ text, lines: [{ text }] }] } }));
        }
        return original(input, options);
      };
    },
    { workspace },
  );
  const image = await page.evaluate(id => window.step.call('attach', { id, vision: true }), fork.id);
  assert.equal(image.vision, true);
  assert.equal(image.usable, true);
  let send = await page.evaluate(
    ({ id, aid }) =>
      window.step.call('send', { id, text: 'Describe the supplied source image', mode: 'chat', autoImage: false, attachments: [aid] }),
    { id: fork.id, aid: image.id },
  );
  assert.equal(send.consent.vision, true);
  await page.evaluate(
    ({ id, aid, consent }) =>
      window.step.call('send', {
        id,
        text: 'Describe the supplied source image',
        mode: 'chat',
        autoImage: false,
        attachments: [aid],
        consent,
      }),
    { id: fork.id, aid: image.id, consent: send.consent.token },
  );
  // The vision run takes about 2 s here and longer on the Windows runner; allow more than the 5 s default.
  await expect
    .poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(s => s.id === fork.id).status, {
      timeout: 30000,
    })
    .toBe('review');
  calls = (await readFile(audit, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.at(-1).images, 1);
  await child.evaluate(
    ({ dialog }, data) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [data.workspace + '/pii.png'] });
    },
    { workspace },
  );
  const pii = await page.evaluate(id => window.step.call('attach', { id, vision: true }), fork.id);
  assert.equal(pii.usable, false);
  assert.equal(pii.reason, 'ATTACH_SENSITIVE');
  await child.evaluate(
    ({ dialog }, data) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [data.workspace + '/scan.pdf'] });
    },
    { workspace },
  );
  const scan = await page.evaluate(id => window.step.call('attach', { id }), fork.id);
  assert.equal(scan.usable, true);
  assert.equal(scan.vision, undefined);
  assert.ok(scan.preview.includes('Synthetic complete OCR source'));
  const beforeRestart = calls.length;
  await child.close();
  child = await electron.launch({ args: ['.'], env, timeout: 45000 });
  page = await child.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await expect.poll(async () => (await page.evaluate(() => window.step.call('snapshot'))).sessions.length).toBe(2);
  const resumed = await page.evaluate(id => window.step.call('sessionResume', { id }), fork.id);
  assert.ok(resumed.messages.length > 24);
  await page.getByRole('button', { name: 'ตัวเลือกงานนี้' }).click();
  await page.getByRole('menuitem', { name: 'ความจำ', exact: true }).click();
  const resumedMemory = page.getByRole('alertdialog', { name: 'ความจำ', exact: true });
  await resumedMemory.getByRole('button', { name: 'ลบความจำ', exact: true }).click();
  await expect(resumedMemory).toContainText('ยังไม่มีความจำที่ยืนยันแล้ว');
  assert.equal((await readFile(audit, 'utf8')).trim().split('\n').length, beforeRestart);
  assert.deepEqual(errors, []);
  await writeFile(
    'release/qa/context-memory-smoke.json',
    JSON.stringify(
      {
        passed: true,
        synthetic: true,
        compaction: true,
        memoryCrud: true,
        piiRejected: true,
        fts: true,
        fork: true,
        exports: true,
        resumeWithoutReplay: true,
        visionPolicy: true,
        ocrText: true,
        providerCalls: beforeRestart,
      },
      null,
      2,
    ),
  );
  console.log(
    'Context/memory Electron smoke passed: real IPC, memory CRUD, compaction, FTS, fork/export/resume, synthetic OCR and vision.',
  );
} finally {
  await child.close();
}
