// Manual only (not part of npm test).
// Live check with the user's own accounts, in a separate test profile (not the real app data).
// The user signs in in the browser (and pastes the Google code into the app window) themselves.
// Usage (from desktop/): node <this file> <profile-dir> <log-file> openai|gemini ...
import { _electron as electron } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';

const [home, logFile, ...providers] = process.argv.slice(2);
mkdirSync(home, { recursive: true });
const log = (...parts) => { const line = `[${new Date().toLocaleTimeString('th-TH')}] ${parts.join(' ')}`; console.log(line); appendFileSync(logFile, line + '\n'); };
const env = { ...process.env, STEP_DESKTOP_TEST_HOME: home }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env, timeout: 60000 });
const page = await app.firstWindow();
await page.evaluate(async () => {
  window.__events = [];
  window.step.onEvent(e => { if (['connect-progress', 'auth-code', 'status', 'step'].includes(e.type)) window.__events.push(`${e.type}: ${e.text || e.state || ''}`); });
  const s = await window.step.call('snapshot');
  if (!s.settings.onboarding) await window.step.call('settings', { ...s.settings, onboarding: true });
});
const drain = async () => { for (const e of await page.evaluate(() => window.__events.splice(0))) log('  event', e); };
const pollUntil = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { await drain(); const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 2000)); } return null; };

for (const provider of providers) {
  log(`== ${provider}: connecting (sign in in the browser${provider === 'gemini' ? ', then paste the Google code in the STeP window' : ''})`);
  const snap = await page.evaluate(() => window.step.call('snapshot'));
  let c = snap.connections.find(x => x.provider === provider && x.mode === 'subscription');
  if (!c) c = await page.evaluate(p => window.step.call('connection', { provider: p, mode: 'subscription' }), provider);
  await page.evaluate(id => { window.__connect = window.step.call('connect', { id }).then(r => (window.__connected = r), e => (window.__connected = { ready: false, note: String(e) })); }, c.id);
  const connected = await pollUntil(() => page.evaluate(() => { const r = window.__connected; window.__connected = undefined; return r; }), 9 * 60_000);
  if (!connected) { log(`${provider}: connect did not finish in 9 minutes`); continue; }
  log(`${provider}: ready=${connected.ready} note=${connected.note} models=${(connected.models || []).map(m => m.id + (m.efforts?.length ? `[${m.efforts.map(e => e.id).join('/')}]` : '')).join(', ')}`);
  if (!connected.ready) continue;

  const runs = [{ label: 'default model' }];
  const other = (connected.models || []).find(m => !m.isDefault);
  if (other) runs.push({ label: `model ${other.id}`, model: other.id, effort: other.efforts?.[0]?.id || '' });
  for (const run of runs) {
    const task = await page.evaluate(({ id, run }) => window.step.call('create', { connectionId: id, project: 'live check', ...(run.model ? { model: run.model, effort: run.effort } : {}) }), { id: c.id, run });
    const text = 'ช่วยร่างข้อความสั้น 2 ประโยค แจ้งทีมว่าประชุมประจำสัปดาห์เลื่อนเป็นวันศุกร์ 10:00 น. ที่ห้องประชุมเล็ก';
    let sent = await page.evaluate(({ id, text }) => window.step.call('send', { id, text, attachments: [] }), { id: task.id, text });
    if (sent.consent) sent = await page.evaluate(({ id, text, token }) => window.step.call('send', { id, text, attachments: [], consent: token }), { id: task.id, text, token: sent.consent.token });
    log(`${provider} (${run.label}): run started=${Boolean(sent.started)}`);
    const done = await pollUntil(async () => { const s = (await page.evaluate(() => window.step.call('snapshot'))).sessions.find(x => x.id === task.id); return s && s.status !== 'running' ? s : null; }, 10 * 60_000);
    if (!done) { log(`${provider} (${run.label}): still running after 10 minutes`); continue; }
    const answer = done.proposals.at(-1)?.text || '';
    log(`${provider} (${run.label}): status=${done.status} statusMessages=${done.messages.filter(m => m.role === 'status').map(m => m.text).join(' | ')} usage=${JSON.stringify(done.usage || {})}`);
    log(`${provider} (${run.label}): answer (${answer.length} chars): ${answer.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
}
log('== done; the STeP window stays open 20 seconds');
await new Promise(r => setTimeout(r, 20000));
await Promise.race([app.close(), new Promise(r => setTimeout(r, 10000))]); app.process().kill();
