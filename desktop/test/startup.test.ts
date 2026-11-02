import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Startup, STARTUP_ITEM_NAME } from '../electron/startup';
import type { App } from 'electron';

function fixture(platform: NodeJS.Platform = 'win32', packaged = true, isolated = false) {
  let registered = false,
    approved = true,
    fail = false;
  const writes: any[] = [];
  const reads: any[] = [];
  const executable = 'C:\\Program Files\\STeP Desktop\\STeP Desktop.exe';
  const app = {
    getLoginItemSettings: (options: any) => {
      reads.push(options);
      return { openAtLogin: registered, executableWillLaunchAtLogin: registered && approved };
    },
    setLoginItemSettings: (settings: any) => {
      writes.push(settings);
      if (!fail) {
        registered = settings.openAtLogin;
        approved = settings.enabled;
      }
    },
  } as Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings'>;
  return {
    startup: new Startup(app, platform, packaged, executable, isolated),
    writes,
    reads,
    executable,
    deny: () => {
      fail = true;
    },
    disableInWindows: () => {
      approved = false;
    },
  };
}

test('startup uses the installed executable, verifies changes and observes Windows disabling the entry', () => {
  const f = fixture();
  assert.deepEqual(f.startup.state(), { supported: true, enabled: false });
  assert.deepEqual(f.startup.set(true), { supported: true, enabled: true });
  assert.deepEqual(f.writes[0], { name: STARTUP_ITEM_NAME, path: f.executable, args: [], openAtLogin: true, enabled: true });
  assert.deepEqual(f.reads[0], { path: `"${f.executable}"`, args: [] });
  f.disableInWindows();
  assert.equal(f.startup.state().enabled, false);
  assert.equal(f.startup.set(true).enabled, true);
  assert.equal(f.startup.set(false).enabled, false);
});

test('denied and malformed changes never claim success', () => {
  const f = fixture();
  f.deny();
  assert.throws(() => f.startup.set(true), /STARTUP_UPDATE_FAILED/);
  assert.equal(f.startup.state().enabled, false);
  assert.throws(() => f.startup.set('true'), /INVALID_SETTINGS/);
  assert.equal(f.writes.length, 1);
});

test('development, isolated test profiles and unsupported platforms never touch OS login items', () => {
  for (const f of [fixture('win32', false), fixture('win32', true, true), fixture('darwin'), fixture('linux')]) {
    assert.deepEqual(f.startup.state(), { supported: false, enabled: false });
    assert.throws(() => f.startup.set(true), /STARTUP_UNAVAILABLE/);
    assert.equal(f.reads.length, 0);
    assert.equal(f.writes.length, 0);
  }
});
