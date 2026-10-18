// Real renderer interactions and reduced-motion preferences; no provider or account calls.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const home = await mkdtemp(join(tmpdir(), 'step-motion-icons-'));
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const moving = icon =>
  icon.evaluate(el => {
    const style = getComputedStyle(el);
    return (
      !['none', '0deg'].includes(style.rotate) ||
      !['none', '1'].includes(style.scale) ||
      !['none', '0px', '0px 0px'].includes(style.translate)
    );
  });
const settled = async icon => expect.poll(() => moving(icon)).toBe(false);
// Observe before the interaction: Playwright may return from hover after a short animation finishes.
const observe = async (icon, action, shouldMove = true) => {
  await icon.evaluate(el => {
    el.motionTrace = { frames: [], stopped: false };
    const trace = el.motionTrace;
    const sample = () => {
      const style = getComputedStyle(el);
      trace.frames.push(
        !['none', '0deg'].includes(style.rotate) ||
          !['none', '1'].includes(style.scale) ||
          !['none', '0px', '0px 0px'].includes(style.translate),
      );
      if (!trace.stopped) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  try {
    await action();
    if (shouldMove) await expect.poll(() => icon.evaluate(el => el.motionTrace.frames.some(Boolean))).toBe(true);
    else {
      await expect.poll(() => icon.evaluate(el => el.motionTrace.frames.length)).toBeGreaterThan(25);
      assert.ok(await icon.evaluate(el => el.motionTrace.frames.every(frame => !frame)), 'interaction keeps the icon still');
    }
  } finally {
    await icon.evaluate(el => {
      el.motionTrace.stopped = true;
    });
  }
};
try {
  app = await electron.launch({ args: ['.'], env, timeout: 45_000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'ข้าม ตั้งค่าทีหลัง', exact: true }).click();
  const sidebar = page.locator('aside.sidebar');
  const newWork = sidebar.getByRole('button', { name: 'เริ่มงานใหม่', exact: true });
  const plus = newWork.locator('svg[data-motion-icon="Plus"]');
  await expect(plus).toBeVisible();
  const before = await newWork.boundingBox();
  await observe(plus, () => newWork.hover());
  const during = await newWork.boundingBox();
  assert.equal(during.width, before.width, 'animation preserves the button hit target');
  assert.equal(during.height, before.height);
  await page.mouse.move(1300, 900);
  await settled(plus);
  await observe(plus, () => newWork.focus());
  await settled(plus); // One bounded animation also finishes while the control keeps focus.
  await newWork.evaluate(el => el.blur());
  await plus.evaluate(el => {
    el.style.transform = 'rotate(35deg)';
  });
  const originalTransform = await plus.evaluate(el => getComputedStyle(el).transform);
  await observe(plus, () => newWork.hover());
  assert.equal(
    await plus.evaluate(el => getComputedStyle(el).transform),
    originalTransform,
    'motion preserves CSS transforms used for control state',
  );
  await settled(plus);
  assert.equal(await plus.evaluate(el => getComputedStyle(el).transform), originalTransform);
  await plus.evaluate(el => {
    el.style.removeProperty('transform');
  });
  await newWork.evaluate(el => {
    el.blur();
    el.disabled = true;
  });
  await observe(plus, () => newWork.hover({ force: true }), false);
  await newWork.evaluate(el => {
    el.disabled = false;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(1300, 900);
  await settled(plus);
  await observe(
    plus,
    async () => {
      await newWork.hover();
      await newWork.focus();
    },
    false,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const settings = sidebar.getByRole('button', { name: 'ตั้งค่าพื้นที่ทำงาน', exact: true });
  await settings.click();
  const credentials = page.getByRole('tab', { name: 'รหัสผ่านและการเชื่อมต่อ', exact: true });
  const key = credentials.locator('svg[data-motion-icon="KeyRound"]');
  await observe(key, () => credentials.hover());
  await credentials.click();
  await expect(credentials).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'ย่อแถบงาน', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const railPlus = sidebar.getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).locator('svg');
  await expect(railPlus).toHaveCount(1);
  await expect(railPlus).toHaveClass(/lucide-plus/);
  assert.equal((await railPlus.locator('g, path').count()) > 0, true);
  const stillDrawing = await railPlus.innerHTML();
  await observe(railPlus, () => sidebar.getByRole('button', { name: 'เริ่มงานใหม่', exact: true }).hover(), false);
  assert.equal(await railPlus.innerHTML(), stillDrawing, 'reduced motion also keeps rail SVG paths still');
  assert.deepEqual(errors, []);
  console.log(
    'Motion icons smoke passed: hover, keyboard focus, bounded motion, unchanged hit targets, disabled buttons, settings navigation and reduced motion in full/rail sidebars.',
  );
} finally {
  await app?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
