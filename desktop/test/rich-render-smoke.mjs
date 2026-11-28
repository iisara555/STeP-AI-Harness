// Verifies rich chat rendering in a real Electron window: offline Mermaid SVG, KaTeX math + currency safety,
// GitHub-style callout alerts, unified diff highlighting, inline sandboxed SVG/HTML previews, and inline HTML artifacts.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-rich-render-smoke-'));
const workspace = join(home, 'files');
await mkdir(workspace);

const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 45000 });
const pageErrors = [];
const cspErrors = [];

const SAMPLE_REPLY = [
  '# ตัวอย่างการแสดงผลมาตรฐานใหม่',
  '',
  '> [!NOTE]',
  '> ข้อความหมายเหตุสำหรับทีม พร้อมลิงก์และ **ตัวหนา**',
  '',
  '> [!WARNING] ระวังอย่าส่งข้อมูลส่วนบุคคลออกนอกระบบ',
  '',
  'สูตรพลังงานคือ $E = mc^2$ และค่าเฉลี่ย:',
  '',
  '\\[',
  '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i',
  '\\]',
  '',
  'ราคาประเมิน $100 ถึง $200 บาท ไม่ควรกลายเป็นสมการ',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[ยื่นคำขอ] --> B[ตรวจเอกสาร]',
  '  B --> C[อนุมัติ]',
  '```',
  '',
  '```svg',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" rx="8" fill="#FFC709"/><text x="60" y="25" text-anchor="middle" fill="#231F20">STeP</text></svg>',
  '```',
  '',
  '```html',
  "<!doctype html><html><body><button id=\"inc\" onclick=\"document.getElementById('n').textContent = (typeof window.step === 'undefined' ? 'SAFE-OK' : 'LEAKED')\">Run</button><span id=\"n\">idle</span></body></html>",
  '```',
  '',
  '```diff',
  '--- old.ts',
  '+++ new.ts',
  '-const limit = 10;',
  '+const limit = 20;',
  '```',
].join('\n');

const SAMPLE_HTML_ARTIFACT =
  '<!doctype html><html><body><h2 id="art-title">Widget Ready</h2><p id="iso"></p><script>document.getElementById("iso").textContent = typeof window.step === "undefined" ? "ISOLATED" : "EXPOSED";</script></body></html>';

try {
  const page = await app.firstWindow();
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', msg => {
    const text = msg.text();
    if (/Content Security Policy|Refused to/i.test(text)) cspErrors.push(text);
  });

  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await page.getByRole('dialog', { name: 'ตั้งค่าเริ่มต้น STeP Desktop' }).waitFor({ state: 'detached' });

  const sessionId = 'rich-render-session';
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
      const now = new Date().toISOString();
      put('session', data.sessionId, {
        id: data.sessionId,
        title: 'ทดสอบการแสดงผล Rich Chat',
        team: 'cc',
        skill: 'general',
        connectionId: '',
        mode: 'chat',
        status: 'review',
        createdAt: now,
        updatedAt: now,
        revision: 0,
        draft: '',
        messages: [
          { role: 'user', text: 'แสดงตัวอย่างทุกแบบให้ดูหน่อย', at: now },
          {
            role: 'assistant',
            text: data.reply,
            at: now,
            artifacts: [{ id: 'demo-widget', title: 'แดชบอร์ดจำลอง', kind: 'html', version: 1, updatedAt: now }],
          },
        ],
        proposals: [],
        versions: [],
        files: [],
        images: [],
      });
      put('artifact', `${data.sessionId}:demo-widget`, {
        id: 'demo-widget',
        sessionId: data.sessionId,
        title: 'แดชบอร์ดจำลอง',
        kind: 'html',
        version: 1,
        content: data.artifactHtml,
        updatedAt: now,
      });
      put('artifact_version', `${data.sessionId}:demo-widget:1`, {
        id: 'demo-widget',
        sessionId: data.sessionId,
        title: 'แดชบอร์ดจำลอง',
        kind: 'html',
        version: 1,
        content: data.artifactHtml,
        updatedAt: now,
      });
      db.close();
    },
    { workspace, sessionId, reply: SAMPLE_REPLY, artifactHtml: SAMPLE_HTML_ARTIFACT },
  );

  await page.reload();
  await page.getByText('ทดสอบการแสดงผล Rich Chat').first().click();

  // 1. GitHub Callout Alerts
  await expect(page.locator('.chat-alert.alert-note')).toContainText('หมายเหตุ');
  await expect(page.locator('.chat-alert.alert-note')).toContainText('ข้อความหมายเหตุสำหรับทีม');
  await expect(page.locator('.chat-alert.alert-warning')).toContainText('ข้อควรระวัง');
  await expect(page.locator('.chat-alert.alert-warning')).toContainText('ระวังอย่าส่งข้อมูลส่วนบุคคล');

  // 2. Offline KaTeX Math + Currency Protection
  await expect(page.locator('.rich-text .katex').first()).toBeVisible();
  await expect(page.locator('.rich-text .katex-display')).toHaveCount(1);
  const pricePara = page.locator('.rich-text p', { hasText: 'ราคาประเมิน' });
  await expect(pricePara).toContainText('ราคาประเมิน $100 ถึง $200 บาท');
  await expect(pricePara.locator('.katex')).toHaveCount(0);

  // 3. Offline Mermaid SVG Diagram + View Code toggle
  const diagramSvg = page.locator('.chat-diagram-canvas svg');
  await expect(diagramSvg).toBeVisible({ timeout: 15000 });
  const diagramFigure = page.locator('figure.chat-diagram');
  await diagramFigure.getByRole('button', { name: 'ดูโค้ด' }).click();
  await expect(diagramFigure.locator('pre code')).toContainText('flowchart LR');
  await diagramFigure.getByRole('button', { name: 'ดูแผนภาพ' }).click();
  await expect(diagramSvg).toBeVisible();

  // 4. Inline SVG preview (script-free sandbox="", actually renders non-zero SVG dimensions)
  const svgFrame = page.locator('iframe.chat-svg-frame');
  await expect(svgFrame).toHaveAttribute('sandbox', '');
  await expect(svgFrame).toHaveAttribute('src', /^data:text\/html/);
  const svgBox = await page.frameLocator('iframe.chat-svg-frame').locator('svg').boundingBox();
  assert.ok(svgBox && svgBox.width > 50 && svgBox.height > 20, `Expected visible SVG inside sandbox iframe, got ${JSON.stringify(svgBox)}`);

  // 5. Inline HTML preview toggle (sandbox="allow-scripts", isolated origin, no window.step)
  const htmlFigure = page.locator('figure.chat-code').filter({ has: page.locator('header > span', { hasText: /^html$/ }) });
  await htmlFigure.getByRole('button', { name: 'แสดงตัวอย่าง' }).click();
  const htmlFrame = htmlFigure.locator('iframe.chat-html-frame');
  await expect(htmlFrame).toHaveAttribute('sandbox', 'allow-scripts');
  const htmlFrameContent = htmlFigure.frameLocator('iframe.chat-html-frame');
  await htmlFrameContent.locator('#inc').click();
  await expect(htmlFrameContent.locator('#n')).toHaveText('SAFE-OK');

  // 6. Unified diff syntax highlighting
  await expect(page.locator('.chat-code .hljs-deletion').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.chat-code .hljs-addition').first()).toBeVisible();

  // 7. Inline HTML artifact preview ("ดูในแชต")
  await page.getByRole('button', { name: 'ดูในแชต' }).click();
  const artifactFrame = page.locator('.inline-artifact-preview iframe.chat-html-frame');
  await expect(artifactFrame).toHaveAttribute('sandbox', 'allow-scripts');
  const artifactInner = page.locator('.inline-artifact-preview').frameLocator('iframe.chat-html-frame');
  await expect(artifactInner.locator('#art-title')).toHaveText('Widget Ready');
  await expect(artifactInner.locator('#iso')).toHaveText('ISOLATED');

  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join('; ')}`);
  assert.deepEqual(cspErrors, [], `Unexpected CSP violations: ${cspErrors.join('; ')}`);
  console.log('Rich chat rendering Electron smoke passed (Mermaid SVG, KaTeX, Alerts, diff, inline SVG & HTML sandbox).');
} finally {
  await app.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
