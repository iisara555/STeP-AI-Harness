// The AI's thinking stays with its answer: shown live while the AI works, then folded above the finished answer as
// "แสดงความคิด (time)" and opened to the same stages and thoughts. Real renderer/preload/host path with a synthetic
// provider that streams Gemini-style reasoning summaries; no account or quota is used.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-thinking-smoke-')),
  workspace = join(home, 'files'),
  shots = process.env.STEP_SCREENSHOTS || 'release/qa';
await mkdir(workspace);
await mkdir(shots, { recursive: true });
await writeFile(join(home, 'desktop-policy.json'), JSON.stringify({ features: { toolLoop: false } }));
const executable = join(home, 'codex.mjs');
// Reasoning arrives in two thoughts a moment apart, then the answer.
await writeFile(
  executable,
  `import {createInterface} from 'node:readline';
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
const reason=delta=>send({method:'item/reasoning/summaryTextDelta',params:{delta}});
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;
 const result=r.method==='thread/start'?{thread:{id:'thread'}}:r.method==='model/list'?{data:[{id:'synthetic-chat',displayName:'Synthetic Chat',isDefault:true}]}:{};
 send({id:r.id,result});if(r.method!=='turn/start')return;
 reason('**ทบทวนโจทย์ของงาน**\\n\\nผู้ใช้ต้องการแนวทางประชาสัมพันธ์ผลงานวิจัย จึงตรวจกลุ่มเป้าหมายและช่องทางที่เหมาะก่อน');
 setTimeout(()=>reason('\\n\\n**วางโครงข่าวประชาสัมพันธ์**\\n\\nเรียงประเด็นสำคัญ ตั้งชื่อบุคคลเป็นตัวอย่างไว้ก่อน และเว้นช่องวันที่ให้ผู้ใช้เติม'),1500);
 setTimeout(()=>{send({method:'item/agentMessage/delta',params:{delta:'Synthetic PR outline ready'}});send({method:'turn/completed',params:{turn:{status:'completed'}}});},3800);
});`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1100, height: 780 });
  await app.evaluate(
    async ({ app }, data) => {
      const { DatabaseSync } = process.mainModule.require('node:sqlite');
      const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
      const put = (kind, id, value) =>
        db
          .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
          .run(kind, id, JSON.stringify(value));
      const s = JSON.parse(db.prepare("SELECT value FROM records WHERE kind='settings' AND id='main'").get().value);
      put('settings', 'main', { ...s, workspace: data.workspace, tourDone: true });
      put('connection', 'synthetic', {
        id: 'synthetic',
        provider: 'openai',
        mode: 'subscription',
        model: '',
        executable: data.executable,
        customRuntime: true,
        ready: true,
        note: 'Synthetic fixture',
        modelsAt: new Date().toISOString(),
      });
      db.close();
    },
    { workspace, executable },
  );
  await page.reload();
  await page.locator('.composer textarea').fill('ช่วยเตรียมแนวทางประชาสัมพันธ์ผลงานวิจัย');
  await page.keyboard.press('Enter');
  const consent = page.getByRole('alertdialog', { name: 'ยืนยันการส่งข้อมูลให้ AI' });
  await consent.waitFor();
  await consent.getByRole('checkbox', { name: 'ฉันอ่านและรับทราบข้อตกลงการใช้งาน' }).check();
  await consent.getByRole('button', { name: 'รับทราบและส่ง' }).click();

  // While the AI works the thinking is open and grows thought by thought.
  const live = page.locator('.thinking-panel.running');
  await expect(live).toBeVisible();
  await expect(live.locator('summary')).toHaveText('กำลังคิด');
  await expect(live).toContainText('ทบทวนโจทย์ของงาน');
  await expect(live).toContainText('วางโครงข่าวประชาสัมพันธ์');
  await page.screenshot({ path: join(shots, 'thinking-1-live.png') });

  // The answer arrives and the thinking stays, folded above it with the time it took.
  const answer = page.locator('article.message.assistant').filter({ hasText: 'Synthetic PR outline ready' });
  await expect(answer).toBeVisible();
  await expect(page.locator('.thinking-panel.running')).toHaveCount(0);
  const kept = answer.locator('.thinking-panel');
  await expect(kept).toHaveCount(1);
  await expect(kept.locator('summary')).toHaveText(/^แสดงความคิด \(\d+ วินาที\)$/);
  await expect(kept.locator('.thinking-stages')).toBeHidden();
  await page.screenshot({ path: join(shots, 'thinking-2-folded.png') });
  await kept.locator('summary').click();
  await expect(kept.locator('summary')).toContainText('ซ่อนความคิด');
  await expect(kept.locator('.thinking-note strong')).toHaveText(['ทบทวนโจทย์ของงาน', 'วางโครงข่าวประชาสัมพันธ์']);
  await expect(kept).toContainText('เว้นช่องวันที่ให้ผู้ใช้เติม');
  await page.mouse.move(700, 600);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, 'thinking-3-open.png') });

  // Saved with the conversation: it is still there after a reload, and it is not part of the answer text.
  const session = (await page.evaluate(() => window.step.call('snapshot'))).sessions[0];
  const saved = session.messages.find(m => m.role === 'assistant');
  assert.equal(saved.text, 'Synthetic PR outline ready');
  assert.deepEqual(
    saved.thinking.steps.flatMap(step => step.notes.map(note => note.title)),
    ['ทบทวนโจทย์ของงาน', 'วางโครงข่าวประชาสัมพันธ์'],
  );
  // The model call is a stage of its own and holds the reasoning it streamed; routine waits are not stages.
  assert.deepEqual(
    saved.thinking.steps.map(step => [step.title, step.notes.length]),
    [['AI คิด', 2]],
  );
  await page.reload();
  await expect(page.locator('article.message.assistant .thinking-panel summary')).toHaveText(/^แสดงความคิด/);
  // Tool stages read in the employee's words with an icon each, the file they used and how long they took.
  await app.evaluate(async ({ app }, id) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const row = db.prepare("SELECT value FROM records WHERE kind='session' AND id=?").get(id);
    const session = JSON.parse(row.value);
    session.messages.find(m => m.role === 'assistant').thinking = {
      ms: 145000,
      steps: [
        { title: '', ms: 3000, notes: [{ text: 'กำลังเตรียมแนวทางการสื่อสารและประชาสัมพันธ์สำหรับผลงานวิจัยชิ้นนี้' }] },
        { title: 'skill step-pr', ms: 2000, notes: [] },
        {
          title: 'reference docs/knowledge/pr-guide.md',
          ms: 58000,
          notes: [{ title: 'ทบทวนแนวทางขององค์กร', text: 'ตรวจข้อกำหนดของ Skill และแนวทางประชาสัมพันธ์ให้ครบทุกข้อ' }],
        },
        { title: 'web_search', ms: 12000, notes: [{ title: 'ตรวจข้อมูลสาธารณะ', text: 'หาข่าวที่เกี่ยวข้องเพื่ออ้างอิงบริบท' }] },
      ],
    };
    db.prepare("UPDATE records SET value=? WHERE kind='session' AND id=?").run(JSON.stringify(session), id);
    db.close();
  }, session.id);
  await page.reload();
  const tools = page.locator('article.message.assistant .thinking-panel');
  await expect(tools.locator('summary')).toHaveText('แสดงความคิด (2 นาที 25 วินาที)');
  await tools.locator('summary').click();
  await expect(tools.locator('.thinking-stage-title')).toHaveText([
    'ตรวจแนวทางการทำงาน · step-pr2 วินาที',
    'อ่านเอกสารอ้างอิง · pr-guide.md58 วินาที',
    'ค้นหาข้อมูลบนเว็บ12 วินาที',
  ]);
  await page.mouse.move(700, 600);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, 'thinking-4-tools.png') });

  // An AI that reports steps but not the words of its thinking (Antigravity) still shows its steps, and says why.
  await app.evaluate(async ({ app }, id) => {
    const { DatabaseSync } = process.mainModule.require('node:sqlite');
    const db = new DatabaseSync(app.getPath('userData') + '/workspace.sqlite');
    const row = db.prepare("SELECT value FROM records WHERE kind='session' AND id=?").get(id);
    const session = JSON.parse(row.value);
    session.messages.find(m => m.role === 'assistant').thinking = {
      ms: 21000,
      steps: [
        { title: 'ใช้ Skill งานประชาสัมพันธ์', ms: 1000, notes: [] },
        { title: 'AI คิด', ms: 18000, notes: [] },
        { title: 'ตรวจคำตอบกับเอกสาร STeP', ms: 2000, notes: [] },
      ],
    };
    db.prepare("UPDATE records SET value=? WHERE kind='session' AND id=?").run(JSON.stringify(session), id);
    db.close();
  }, session.id);
  await page.reload();
  const stepsOnly = page.locator('article.message.assistant .thinking-panel');
  await stepsOnly.locator('summary').click();
  await expect(stepsOnly.locator('.thinking-stage-title')).toHaveText([
    'ใช้ Skill งานประชาสัมพันธ์1 วินาที',
    'AI คิด18 วินาที',
    'ตรวจคำตอบกับเอกสาร STeP2 วินาที',
  ]);
  await expect(stepsOnly.locator('.thinking-unsaid')).toHaveText('AI ที่เชื่อมอยู่ไม่ส่งข้อความความคิดออกมา จึงเห็นเฉพาะขั้นตอนที่ทำ');
  await page.mouse.move(700, 600);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(shots, 'thinking-5-steps-only.png') });
  assert.deepEqual(errors, []);
  console.log('Thinking smoke passed: live thinking, folded above the answer, opened, saved across a reload.');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
