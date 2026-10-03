import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Updater, RELEASES_URL, type UpdateState } from '../electron/updater';
// @ts-expect-error a plain ES module script without types
import { mergeMacUpdateInfo } from '../scripts/merge-mac-update-info.mjs';

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  allowDowngrade = true;
  checks = 0;
  installed: unknown[] = [];
  next: (fake: FakeUpdater) => void = () => {};
  async checkForUpdates() {
    this.checks++;
    this.next(this);
  }
  quitAndInstall(...args: unknown[]) {
    this.installed = args;
  }
}
const make = (platform: NodeJS.Platform = 'win32', disabledReason = '') => {
  const fake = new FakeUpdater();
  const states: UpdateState[] = [];
  const updater = new Updater(fake, { current: '0.5.5', platform, disabledReason, emit: s => states.push(s) });
  return { fake, states, updater };
};

test('a newer version downloads in the background and waits behind "restart to update"', async () => {
  const { fake, states, updater } = make();
  assert.equal(fake.autoDownload, true);
  assert.equal(fake.autoInstallOnAppQuit, true, 'a downloaded update also installs when the app quits');
  assert.equal(fake.allowPrerelease, false);
  assert.equal(fake.allowDowngrade, false);
  fake.next = f => {
    f.emit('checking-for-update');
    f.emit('update-available', { version: '0.5.6' });
    f.emit('download-progress', { percent: 42.4 });
  };
  await updater.check();
  assert.deepEqual(
    states.map(s => s.status),
    ['checking', 'checking', 'downloading', 'downloading'],
  );
  assert.equal(updater.snapshot.percent, 42);
  assert.throws(() => updater.install(), /UPDATE_NOT_READY/);
  fake.emit('update-downloaded', { version: '0.5.6' });
  assert.deepEqual(updater.snapshot, { status: 'ready', current: '0.5.5', version: '0.5.6' });
  await updater.check();
  assert.equal(fake.checks, 1, 'a downloaded update is not checked or downloaded again');
  updater.install();
  assert.deepEqual(fake.installed, [true, true], 'silent install, then the app opens again');
});

test('no update, offline and errors are quiet; the next round tries again', async () => {
  const { fake, updater } = make();
  fake.next = f => f.emit('update-not-available', { version: '0.5.5' });
  assert.equal((await updater.check()).status, 'none');
  fake.next = () => {
    throw new Error('getaddrinfo ENOTFOUND github.com');
  };
  const offline = await updater.check();
  assert.equal(offline.status, 'error');
  assert.equal(offline.reason, 'UPDATE_OFFLINE');
  fake.next = f => f.emit('error', new Error('HttpError: 404 ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'));
  assert.equal((await updater.check()).reason, 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND');
  assert.equal(fake.checks, 3);
});

test('a Mac build that cannot install the update points to the download page', async () => {
  const { fake, updater } = make('darwin');
  fake.next = f => {
    f.emit('update-available', { version: '0.5.6' });
    f.emit('error', new Error('Code signature at URL file:///… did not pass validation'));
  };
  await updater.check();
  assert.deepEqual(updater.snapshot, {
    status: 'manual',
    current: '0.5.5',
    version: '0.5.6',
    reason: 'UPDATE_NEEDS_SIGNED_BUILD',
    url: RELEASES_URL,
  });
});

test('development builds and a policy that turns updates off never check', async () => {
  for (const reason of ['UPDATE_DEV_BUILD', 'UPDATE_POLICY_OFF']) {
    const { fake, updater } = make('win32', reason);
    assert.deepEqual(await updater.check(), { status: 'disabled', current: '0.5.5', reason });
    updater.start(0);
    assert.equal(fake.checks, 0);
  }
  const none = new Updater(undefined, { current: '0.5.5', platform: 'linux', disabledReason: '', emit: () => {} });
  assert.equal(none.snapshot.status, 'disabled');
});

test('the two Mac builds merge into one feed that lists a zip for each processor', () => {
  const arm = {
    version: '0.5.6',
    files: [
      { url: 'STeP-Desktop-0.5.6-arm64.zip', sha512: 'a', size: 1 },
      { url: 'STeP-Desktop-0.5.6-arm64.dmg', sha512: 'b', size: 2 },
    ],
    path: 'STeP-Desktop-0.5.6-arm64.zip',
    sha512: 'a',
    releaseDate: '2026-10-03T00:00:00.000Z',
  };
  const intel = {
    version: '0.5.6',
    files: [
      { url: 'STeP-Desktop-0.5.6-x64.zip', sha512: 'c', size: 3 },
      { url: 'STeP-Desktop-0.5.6-x64.dmg', sha512: 'd', size: 4 },
    ],
    path: 'STeP-Desktop-0.5.6-x64.zip',
    sha512: 'c',
  };
  const merged = mergeMacUpdateInfo(arm, intel);
  assert.equal(merged.files.length, 4);
  assert.equal(merged.path, 'STeP-Desktop-0.5.6-x64.zip');
  assert.equal(merged.sha512, 'c');
  assert.throws(() => mergeMacUpdateInfo(arm, { ...intel, version: '0.5.5' }), /same version/);
  assert.throws(() => mergeMacUpdateInfo(arm, arm), /same file/);
});
