// While the AI works through tools, the working area changes calmly: the status line does not swap words back and
// forth, streamed words do not vanish and come back, and the thinking panel neither blinks out nor shows half-typed
// markup. Real renderer/preload/host path with a synthetic Gemini-style provider that thinks, reads a Skill and a
// document list, then writes; every frame of the working area is recorded and checked. No account or quota is used.
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const home = await mkdtemp(join(tmpdir(), 'step-thinking-steady-smoke-'));
const workspace = join(home, 'work'),
  executable = join(home, 'codex.mjs'),
  shots = process.env.STEP_SCREENSHOTS || '';
await mkdir(workspace);
if (shots) await mkdir(shots, { recursive: true });
await writeFile(
  join(home, 'desktop-policy.json'),
  JSON.stringify({
    pilot: false,
    // The drafting mode is offered where the coordinator feature is on.
    features: { toolLoop: true, coordinator: process.env.STEP_STEADY_MODE === 'draft' },
    checks: { authority: true, privacy: true },
  }),
);
// Each turn streams its reasoning in small pieces (a heading arrives split, as Gemini sends it), then a short line and a
// tool request, as a reading turn often does. The third turn writes the answer.
await writeFile(
  executable,
  `import readline from 'node:readline';
const send=o=>console.log(JSON.stringify({jsonrpc:'2.0',...o}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let thread='';
const pieces=(text,n)=>{const out=[];for(let i=0;i<text.length;i+=n)out.push(text.slice(i,i+n));return out;};
const turns=[
 {think:'**ทบทวนโจทย์ของงาน**\\n\\nผู้ใช้ต้องการรายงานการประชุมสำรวจหน้างาน จึงเปิดแนวทางสรุปการประชุมก่อน',say:'ขอเปิดแนวทางสรุปการประชุมก่อน\\n',tool:{tool:'skill',input:'meeting-summary'}},
 {think:'\\n\\n**ตรวจเอกสารขององค์กร**\\n\\nดูรายชื่อเอกสาร STeP ที่อาจใช้ประกอบรายงาน',say:'ขอดูรายชื่อเอกสารที่เกี่ยวข้อง\\n',tool:{tool:'reference',input:''}},
 {think:'\\n\\n**เรียบเรียงรายงาน**\\n\\nจัดหัวข้อตามแนวทาง แล้วเว้นช่องที่ยังต้องยืนยัน',answer:'รายงานการประชุมสำรวจหน้างาน\\n\\nสรุปประเด็นหลักและสิ่งที่ต้องยืนยันต่อ ฉบับสังเคราะห์สำหรับทดสอบ'},
];
readline.createInterface({input:process.stdin}).on('line',async line=>{
 const m=JSON.parse(line);if(m.method==='thread/start')thread='';
 send({id:m.id,result:m.method==='thread/start'?{thread:{id:'fixture'}}:m.method==='model/list'?{data:[{id:'synthetic',displayName:'Synthetic',isDefault:true}]}:{}});
 if(m.method!=='turn/start')return;
 if(m.params.outputSchema?.properties?.skillId){send({method:'item/agentMessage/delta',params:{delta:JSON.stringify({skillId:'meeting-summary',reason:'Synthetic'})}});send({method:'turn/completed',params:{turn:{status:'completed'}}});return;}
 if(m.params.outputSchema){send({method:'turn/completed',params:{turn:{status:'completed'}}});return;}
 thread+=m.params.input?.map(i=>i.text||'').join('')||'';
 const turn=turns[Math.min(turns.length-1,[...thread.matchAll(/<tool_results>/g)].length)];
 for(const piece of pieces(turn.think,9)){send({method:'item/reasoning/summaryTextDelta',params:{delta:piece}});await wait(70);}
 await wait(600);
 if(turn.tool){
  for(const piece of pieces(turn.say,6)){send({method:'item/agentMessage/delta',params:{delta:piece}});await wait(60);}
  send({method:'item/agentMessage/delta',params:{delta:'\\x60\\x60\\x60step-tool\\n'+JSON.stringify(turn.tool)+'\\n\\x60\\x60\\x60'}});
 } else for(const piece of pieces(turn.answer,8)){send({method:'item/agentMessage/delta',params:{delta:piece}});await wait(50);}
 send({method:'turn/completed',params:{turn:{status:'completed'}}});
});`,
);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home, STEP_DISABLE_UPDATES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
let child;
try {
  child = await electron.launch({ args: ['.'], env, timeout: 45000 });
  const page = await child.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1100, height: 780 });
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
        team: 'pm',
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
  // Every animation frame, what the working area shows: the status line, the thinking panel and the streamed words.
  await page.evaluate(() => {
    const frames = [];
    let last = '';
    const read = () => {
      const working = [...document.querySelectorAll('article.message.assistant')].find(a => a.querySelector('.activity'));
      const panel = working?.querySelector('.thinking-panel');
      const frame = {
        at: performance.now(),
        working: Boolean(working),
        status: working?.querySelector('.activity > span:not(.thinking-scribble):not(.activity-detail)')?.textContent || '',
        panel: Boolean(panel),
        stages: [...(panel?.querySelectorAll('.thinking-stage-title') || [])].map(el => el.textContent.replace(/\d+ วินาที$/, '')),
        notes: [...(panel?.querySelectorAll('.thinking-note') || [])].map(el => el.textContent),
        text: working?.querySelector('.streaming')?.textContent || '',
      };
      const key = JSON.stringify({ ...frame, at: 0 });
      if (key !== last) (frames.push(frame), (last = key));
      requestAnimationFrame(read);
    };
    requestAnimationFrame(read);
    window.__frames = frames;
  });
  // Chat and the drafting mode share the working area; the drafting mode used to clear streamed words on every turn.
  const mode = process.env.STEP_STEADY_MODE || 'chat';
  if (mode !== 'chat') await page.getByRole('combobox', { name: 'โหมดทำงาน' }).selectOption(mode);
  await page.locator('.composer textarea').fill('ลองอีกครับ เอาเป็นรายงานการประชุมสำรวจหน้างาน');
  await page.keyboard.press('Enter');
  let shot = 0;
  const working = page.locator('article.message.assistant .activity');
  await working.waitFor();
  for (let i = 0; i < 900 && (await working.isVisible()); i++) {
    const allow = page.getByRole('button', { name: 'อนุญาตครั้งนี้', exact: true });
    if (await allow.isVisible().catch(() => false)) await allow.click();
    if (shots && shot < 3 && i % 15 === 14 && (await page.locator('.thinking-panel.running').isVisible()))
      await page.screenshot({ path: join(shots, `steady-${++shot}.png`) });
    await page.waitForTimeout(100);
  }
  await expect(working).toHaveCount(0);
  await expect(page.getByText('ฉบับสังเคราะห์สำหรับทดสอบ').first()).toBeAttached();
  const frames = (await page.evaluate(() => window.__frames)).filter(frame => frame.working);
  const report = { frames: frames.length };

  // The status line: a label replaced within a second blinks past (before the fix, "writing" and a tool stage each
  // flashed for a moment between two "preparing" lines on every tool turn).
  const labels = [];
  for (const frame of frames) if (labels.at(-1)?.text !== frame.status) labels.push({ text: frame.status, at: frame.at });
  const brief = labels.slice(0, -1).filter((label, i) => labels[i + 1].at - label.at < 1000);
  report.labels = labels.map(label => label.text);
  report.briefLabels = brief.map(label => label.text);

  // The thinking panel: once shown it stays; a stage title, once shown, stays; no raw ** of a heading still arriving.
  let shown = false,
    panelGone = 0;
  const seen = new Set();
  const lostStages = new Set();
  for (const frame of frames) {
    if (shown && !frame.panel) panelGone++;
    shown ||= frame.panel;
    for (const stage of seen) if (!frame.stages.includes(stage)) lostStages.add(stage);
    for (const stage of frame.stages) seen.add(stage);
  }
  report.panelGone = panelGone;
  report.lostStages = [...lostStages];
  report.rawMarkup = frames.filter(frame => frame.notes.some(note => note.includes('**'))).length;

  // The streamed words: what was on screen is not taken away while the AI works (only added to).
  let shrinks = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i - 1].text && !frames[i].text.startsWith(frames[i - 1].text.trim())) shrinks++;
  report.textShrinks = shrinks;
  console.log(JSON.stringify(report, null, 1));

  if (!process.env.STEP_STEADY_REPORT_ONLY) {
    assert.deepEqual(report.briefLabels, [], 'no status label blinks past');
    assert.equal(report.panelGone, 0, 'the thinking panel does not blink out');
    assert.deepEqual(report.lostStages, [], 'a stage title stays once shown');
    assert.equal(report.rawMarkup, 0, 'no half-typed heading markup');
    assert.equal(report.textShrinks, 0, 'streamed words do not vanish');
  }
  assert.deepEqual(errors, []);
  console.log('Thinking steady smoke passed: the working area changes without blinking.');
} finally {
  await child?.close();
  const target = resolve(home);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep));
  await rm(target, { recursive: true, force: true });
}
// The same run in the drafting mode, in a fresh app.
if (!process.env.STEP_STEADY_MODE) {
  const draft = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, STEP_STEADY_MODE: 'draft' },
    stdio: 'inherit',
  });
  assert.equal(draft.status, 0, 'the drafting mode run passes too');
}
