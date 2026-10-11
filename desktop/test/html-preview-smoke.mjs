// Real HTML previews and native view geometry; synthetic files only, no account or network calls.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-html-layout-'));
const workspace = join(home, 'workspace');
await mkdir(workspace);
const responsive = `<!doctype html><html><head><title>Responsive fixture</title><style>
body{margin:0;font:18px sans-serif}.cards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cards>div{min-width:0;background:#eee;padding:10px}@media(max-width:450px){.cards{grid-template-columns:1fr}}
</style></head><body><main class="cards"><div>Thai report fixture</div><div>Second card</div></main>
<p style="margin-top:1400px" id="last">End of report</p></body></html>`;
const deck = `<!doctype html><html><head><title>Fixed slide fixture</title><style>
html,body{margin:0;height:100%;overflow:hidden}body{display:grid;place-items:center;background:#eee}
#slide{width:960px;height:540px;background:#fff;display:flex;flex-direction:column;justify-content:space-between}
</style></head><body><main id="slide"><h1>Top of synthetic slide</h1><p>Bottom of synthetic slide</p></main></body></html>`;
await writeFile(join(workspace, 'responsive.html'), responsive);
await writeFile(join(workspace, 'deck.html'), deck);
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let phase = 'launch';
const checkpoint = name => {
  phase = name;
  console.log(`HTML preview phase: ${name}`);
};
// Electron evaluate has no default deadline. Keep a stalled native operation red and report its phase.
const deadline = setTimeout(() => {
  console.error(`HTML preview timed out during ${phase}`);
  process.exitCode = 1;
  app?.process().kill();
}, 90_000);
deadline.unref();
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45_000 });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง' }).click();
  await app.evaluate(({ dialog }, workspace) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
  }, workspace);
  await page.evaluate(() => window.step.call('workspace'));
  await page.setViewportSize({ width: 1440, height: 900 });
  const probe = () =>
    app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const view = window.contentView.children.find(v => v.webContents?.getURL().includes('step-preview-'));
      if (!view) return null;
      const metrics = await view.webContents.executeJavaScriptInIsolatedWorld(1041, [
        {
          code: `(() => {
      const slide=document.getElementById('slide'),r=slide?.getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,zoom:devicePixelRatio,origin:performance.timeOrigin,ready:document.readyState,
        fullscreen:!!document.fullscreenElement,rootZoom:getComputedStyle(document.documentElement).zoom,columns:document.querySelector('.cards')?getComputedStyle(document.querySelector('.cards')).gridTemplateColumns:null,
        slide:r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null,
        scrollHeight:document.documentElement.scrollHeight};
    })()`,
        },
      ]);
      return {
        bounds: view.getBounds(),
        visible: view.getVisible(),
        hostZoom: window.webContents.getZoomFactor(),
        previewZoom: view.webContents.getZoomFactor(),
        ...metrics,
      };
    });
  const open = async path => {
    await page.evaluate(path => window.step.call('previewHtml', { path }), path);
    await expect(page.locator('.browser-tab.active')).toBeVisible();
    await expect.poll(async () => (await probe())?.visible).toBe(true);
  };
  const close = async () => {
    await page.getByRole('button', { name: 'ปิดเว็บนี้' }).click();
    await expect(page.locator('.browser-tab')).toHaveCount(0);
  };
  const aligned = async () => {
    const [box, pane, guest] = await Promise.all([
      page.locator('.browser-host').boundingBox(),
      page.locator('.artifact-pane').boundingBox(),
      probe(),
    ]);
    if (!box || !pane || !guest?.visible) return false;
    if (box.y + box.height > pane.y + pane.height + 2) return false;
    return ['x', 'y', 'width', 'height'].every(k => Math.abs(box[k] * guest.hostZoom - guest.bounds[k]) <= 4);
  };
  const fits = async () => {
    const guest = await probe(),
      r = guest?.slide;
    return !!r && r.left >= -2 && r.top >= -2 && r.right <= guest.width + 2 && r.bottom <= guest.height + 2;
  };
  const failures = [];
  checkpoint('responsive preview and app zoom');
  await open('responsive.html');
  await page.evaluate(() => window.step.call('windowControl', { action: 'zoomIn' }));
  try {
    await expect.poll(aligned, { timeout: 10_000 }).toBe(true);
  } catch {
    failures.push({
      problem: 'native preview must follow the app zoom',
      guest: await probe(),
      box: await page.locator('.browser-host').boundingBox(),
    });
  }
  await page.evaluate(() => window.step.call('windowControl', { action: 'zoomReset' }));
  await close();
  await open('deck.html');
  checkpoint('fixed slide fit');
  try {
    await expect.poll(fits, { timeout: 10_000 }).toBe(true);
  } catch {
    failures.push({ problem: 'a fixed slide must fit without cropping', guest: await probe() });
  }
  assert.deepEqual(failures, [], 'preview layout regressions');

  // Resizing a docked slide fits both dimensions, including a short window; original HTML is unchanged.
  checkpoint('short and narrow window resize');
  for (const size of [
    { width: 1280, height: 800 },
    { width: 800, height: 600 },
    { width: 1000, height: 450 },
  ]) {
    const previousWidth = await page.evaluate(() => innerWidth);
    await page.setViewportSize(size);
    // The existing responsive shell collapses the panel when crossing 1100px. Wait for that commit before reopening.
    if (size.width < 1100 && previousWidth >= 1100) await expect(page.locator('.artifact-pane')).toBeHidden();
    if (!(await page.locator('.browser-host').isVisible())) await page.getByRole('button', { name: 'เปิดร่าง', exact: true }).click();
    await expect(page.locator('.browser-host')).toBeVisible();
    await expect.poll(aligned).toBe(true);
    await expect.poll(fits).toBe(true);
  }
  const actual = page.getByRole('button', { name: 'ขนาดจริง', exact: true });
  checkpoint('actual size and fit');
  const fit = page.getByRole('button', { name: 'พอดีพื้นที่', exact: true });
  await actual.click();
  await expect(actual).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(fits).toBe(false);
  await fit.click();
  await expect(fit).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(fits).toBe(true);
  // Native fullscreen restores the authored scale, then fitting resumes on return to the panel.
  const fullscreen = async enter =>
    app.evaluate(async ({ BrowserWindow }, enter) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().includes('step-preview-'));
      await view.webContents.executeJavaScript(enter ? 'document.documentElement.requestFullscreen()' : 'document.exitFullscreen()', true);
    }, enter);
  checkpoint('enter native fullscreen');
  await fullscreen(true);
  await expect
    .poll(async () => {
      const g = await probe();
      return g?.fullscreen && g.previewZoom === 1 && g.rootZoom === '1';
    })
    .toBe(true);
  checkpoint('leave native fullscreen');
  await fullscreen(false);
  await expect.poll(async () => !(await probe())?.fullscreen).toBe(true);
  if (!(await page.locator('.browser-host').isVisible())) await page.getByRole('button', { name: 'เปิดร่าง', exact: true }).click();
  await expect.poll(aligned).toBe(true);
  await expect.poll(fits).toBe(true);
  // Reload also recomputes the fit instead of retaining a scale from a previous document.
  checkpoint('reload fit');
  const beforeReload = (await probe()).origin;
  await page.getByRole('button', { name: 'โหลดใหม่', exact: true }).click();
  await expect
    .poll(async () => {
      const g = await probe();
      return g && g.origin !== beforeReload && g.ready === 'complete';
    })
    .toBe(true);
  await expect.poll(fits).toBe(true);
  if (process.env.STEP_HTML_QA_DIR) {
    await mkdir(process.env.STEP_HTML_QA_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.STEP_HTML_QA_DIR, 'html-panel.png') });
    const image = await app.evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().includes('step-preview-'));
      return (await view.webContents.capturePage()).toPNG().toString('base64');
    });
    await writeFile(join(process.env.STEP_HTML_QA_DIR, 'html-guest.png'), Buffer.from(image, 'base64'));
  }
  assert.equal(await readFile(join(workspace, 'deck.html'), 'utf8'), deck);
  await close();

  // A responsive document retains its media query and normal vertical scrolling, rather than becoming a tiny page.
  checkpoint('responsive scrolling');
  await page.setViewportSize({ width: 800, height: 600 });
  await open('responsive.html');
  await expect.poll(async () => (await probe())?.columns?.trim().split(/\s+/).length).toBe(1);
  await expect
    .poll(async () => {
      const g = await probe();
      return g && Math.abs(g.width - g.bounds.width) <= 4 && g.scrollHeight > g.height;
    })
    .toBe(true);
  await app.evaluate(async ({ BrowserWindow }) => {
    const v = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().includes('step-preview-'));
    await v.webContents.executeJavaScript("document.getElementById('last').scrollIntoView()");
  });
  await expect
    .poll(async () =>
      app.evaluate(async ({ BrowserWindow }) => {
        const v = BrowserWindow.getAllWindows()[0].contentView.children.find(v => v.webContents?.getURL().includes('step-preview-'));
        return v.webContents.executeJavaScript("document.getElementById('last').getBoundingClientRect().bottom<=innerHeight+2");
      }),
    )
    .toBe(true);
  await close();
  console.log(
    'HTML preview smoke passed: zoom-aligned native bounds, fixed slides fit, short/narrow resize, actual-size/reload/fullscreen recovery and responsive document scrolling; synthetic files only.',
  );
} finally {
  checkpoint('close application');
  await app?.close();
  clearTimeout(deadline);
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
