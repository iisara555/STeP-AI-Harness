import { _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-readme-shot-'));
const out = 'release/readme';
await mkdir(out, { recursive: true });

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 940 });
  const capture = async name => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.section-art img')].map(image => image.decode()));
    });
    await page.screenshot({ path: join(out, name), fullPage: true });
  };

  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor();
  await capture('01-setup-wizard.png');

  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.locator('.welcome h1').waitFor();

  await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await window.step.call('settings', {
      ...snapshot.settings,
      userName: 'พนักงาน STeP',
      assistant: 'STeP Mate',
      team: 'cc',
      theme: 'light',
      onboarding: true,
      whatsNewSeen: '999.0.0',
      tourDone: true,
    });
  });

  await page.reload();
  await page.locator('.welcome h1').waitFor();
  await capture('06-welcome.png');
  await page.setViewportSize({ width: 800, height: 650 });
  await capture('07-welcome-compact.png');
  await page.setViewportSize({ width: 1440, height: 940 });
  await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await window.step.call('settings', { ...snapshot.settings, theme: 'dark' });
  });
  await page.reload();
  await page.locator('.welcome h1').waitFor();
  await capture('08-welcome-dark.png');
  await page.evaluate(async () => {
    const snapshot = await window.step.call('snapshot');
    await window.step.call('settings', { ...snapshot.settings, theme: 'light' });
  });
  await page.reload();
  await page.locator('.welcome h1').waitFor();
  await page.getByRole('navigation', { name: 'เครื่องมือข้างร่าง' }).getByRole('button', { name: 'เว็บ', exact: true }).click();
  await page.getByRole('textbox', { name: 'Browser URL' }).waitFor();
  await capture('09-browser.png');
  await page.getByRole('navigation', { name: 'เครื่องมือข้างร่าง' }).getByRole('button', { name: 'ผลงาน', exact: true }).click();

  const seeded = await page.evaluate(async () => {
    const connection = await window.step.call('connection', {
      provider: 'openai',
      mode: 'subscription',
      model: '',
    });
    const session = await window.step.call('create', {
      connectionId: connection.id,
      project: 'Food Hall · Action Plan',
    });
    await window.step.call('edit', {
      id: session.id,
      revision: 0,
      text: [
        'สรุปการประชุม Food Hall',
        '',
        'มติสำคัญ',
        '• ปรับ customer journey ตั้งแต่ทางเข้าไปจนถึงจุดชำระเงิน',
        '• ทีม CC จัดทำ key visual และ signage draft',
        '• ทีม IFU ยืนยันข้อมูลร้านค้าและพื้นที่ใช้งาน',
        '',
        'Action Items',
        '1. CC — ร่างแนวทางสื่อสารและภาพรวมพื้นที่ — 5 ต.ค. 2569',
        '2. IFU — ยืนยัน tenant list และ requirement — 6 ต.ค. 2569',
        '3. PM — รวม timeline และ dependency — 7 ต.ค. 2569',
      ].join('\n'),
    });
    await window.step.call('rename', { id: session.id, title: 'สรุปประชุม Food Hall' });
    return { connectionId: connection.id, sessionId: session.id };
  });

  const db = new DatabaseSync(join(home, 'workspace.sqlite'));
  try {
    const get = (kind, id) => {
      const row = db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind, id);
      return row ? JSON.parse(String(row.value)) : null;
    };
    const put = (kind, id, value) =>
      db
        .prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value')
        .run(kind, id, JSON.stringify(value));

    const connection = get('connection', seeded.connectionId);
    connection.ready = true;
    connection.signedIn = true;
    connection.note = 'พร้อมทำงาน';
    connection.models = [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', description: 'งานความรู้และงานซับซ้อน', isDefault: true }];
    connection.modelsAt = new Date().toISOString();
    put('connection', connection.id, connection);

    const session = get('session', seeded.sessionId);
    session.status = 'done';
    session.model = 'gpt-5.6-sol';
    session.messages = [
      {
        role: 'user',
        text: 'สรุปการประชุมนี้ แยกมติ งานที่ต้องทำ ผู้รับผิดชอบ และวันครบกำหนด',
        at: '2026-09-30T03:28:00.000Z',
      },
      {
        role: 'assistant',
        text: 'สรุปให้แล้วครับ โดยแยกมติสำคัญและ Action Items ไว้ในร่างด้านขวาเพื่อให้ตรวจแก้ก่อนนำไปใช้',
        at: '2026-09-30T03:29:00.000Z',
      },
    ];
    session.sources = ['Meeting Notes · Food Hall · 30 Sep 2026'];
    session.usage = { input: 1840, output: 620, total: 2460, runs: 1 };
    session.skill = 'meeting-summary';
    session.pinned = true;
    put('session', session.id, session);
  } finally {
    db.close();
  }

  await page.reload();
  await page.getByText('สรุปประชุม Food Hall', { exact: true }).first().waitFor();
  await page.locator('.draft-editor').waitFor();
  await capture('02-workspace.png');

  await page.getByRole('button', { name: /ศูนย์รวม Skill/ }).click();
  await page.getByPlaceholder('ค้นหา Skill, ทีม หรือคำที่ใช้เรียก').waitFor();
  await capture('03-skill-hub.png');

  await page.getByRole('button', { name: /ตรวจใบเสร็จ AFP/ }).click();
  await page.getByRole('heading', { name: 'ตรวจใบเสร็จก่อนส่ง AFP', level: 1 }).waitFor();
  await capture('04-receipt-afp.png');

  await page.getByRole('button', { name: /ตั้งค่าพื้นที่ทำงาน/ }).click();
  await page.getByRole('tab', { name: /การเชื่อมต่อ AI/ }).click();
  await page.getByRole('heading', { name: 'การเชื่อมต่อ AI' }).waitFor();
  await capture('05-ai-connections.png');

  console.log('README GUI screenshots created in', out);
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
