import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Vault, vaultOrigin } from '../electron/vault';
import { validateToolRequest } from '../src/tool-registry';
import { defaultPolicy, parsePolicy } from '../electron/policy';
import { ToolGate } from '../electron/tool-gate';
import { Store } from '../electron/store';
import { Approvals } from '../electron/approvals';
const protection = { wrap: (s: string) => Buffer.from(s), unwrap: (b: Buffer) => b.toString() };
const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'step-vault-test-')),
    path = join(dir, 'vault.sqlite');
  const vault = new Vault(path, protection);
  const save = () =>
    vault.save({
      label: 'Work account',
      kind: 'website',
      destination: 'https://example.test',
      username: 'synthetic-user-marker',
      password: 'synthetic-password-marker',
    });
  return {
    dir,
    path,
    vault,
    save,
    clean: () => {
      vault.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
};
test('encrypted username/password survive reopening; metadata and database never contain the plaintext', async () => {
  const f = fixture();
  try {
    const saved = f.save();
    assert.equal(f.vault.protected(), true);
    assert.equal(JSON.stringify(f.vault.list()).includes('synthetic-user-marker'), false);
    f.vault.close();
    const next = new Vault(f.path, protection);
    try {
      const [entry] = next.catalog('task', 'https://example.test:443');
      const result = await next.fill(
        entry.handle,
        'task',
        'https://example.test',
        async () => true,
        async payload => {
          assert.equal(payload.username, 'synthetic-user-marker');
          assert.equal(payload.password, 'synthetic-password-marker');
          return { status: 'filled' };
        },
      );
      assert.deepEqual(result, { status: 'filled' });
      assert.equal(next.list()[0].id, saved.id);
      assert.equal(readFileSync(f.path).includes(Buffer.from('synthetic-password-marker')), false);
      await assert.rejects(
        next.fill(
          entry.handle,
          'task',
          'https://example.test',
          async () => true,
          async () => ({}),
        ),
        /VAULT_ACCESS_DENIED/,
      );
    } finally {
      next.close();
    }
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});
test('origin, session, cancellation and suspend races deny the sink', async () => {
  const f = fixture();
  let filled = 0;
  try {
    f.save();
    assert.deepEqual(f.vault.catalog('task', 'https://elsewhere.test'), []);
    const sink = async () => {
      filled++;
    };
    let [entry] = f.vault.catalog('task', 'https://example.test');
    await assert.rejects(
      f.vault.fill(entry.handle, 'other', 'https://example.test', async () => true, sink),
      /VAULT_ACCESS_DENIED/,
    );
    [entry] = f.vault.catalog('task', 'https://example.test');
    await assert.rejects(
      f.vault.fill(entry.handle, 'task', 'https://example.test', async () => false, sink),
      /CANCELLED/,
    );
    [entry] = f.vault.catalog('task', 'https://example.test');
    await assert.rejects(
      f.vault.fill(
        entry.handle,
        'task',
        'https://example.test',
        async () => {
          f.vault.suspend(true);
          return true;
        },
        sink,
      ),
      /VAULT_REVISION_CHANGED/,
    );
    assert.equal(filled, 0);
    assert.equal(f.vault.protected(), true);
    for (const url of ['http://example.test', 'https://example.test/path', 'https://user@example.test', 'https://example.test?x=y'])
      assert.throws(() => vaultOrigin(url), /VAULT_ORIGIN_INVALID/);
  } finally {
    f.clean();
  }
});
test('tampered binding is authenticated and key-store failure does not overwrite ciphertext', () => {
  const f = fixture();
  try {
    const saved = f.save();
    const db = new DatabaseSync(f.path);
    const row = db.prepare('SELECT value FROM vault_records WHERE id=?').get(saved.id)!;
    const value = JSON.parse(String(row.value));
    value.destination = 'https://hostile.test';
    db.prepare('UPDATE vault_records SET value=? WHERE id=?').run(JSON.stringify(value), saved.id);
    db.close();
    assert.throws(
      () => f.vault.save({ ...saved, destination: saved.destination, username: 'changed', password: '' }),
      /VAULT_INTEGRITY_ERROR/,
    );
    const unavailable = new Vault(f.path, {
      wrap: () => {
        throw new Error('unavailable');
      },
      unwrap: () => {
        throw new Error('unavailable');
      },
    });
    try {
      assert.throws(() => unavailable.save({ ...saved, username: 'changed', password: 'replacement' }), /VAULT_UNAVAILABLE/);
      assert.equal(unavailable.list().length, 1);
    } finally {
      unavailable.close();
    }
  } finally {
    f.clean();
  }
});
test('replacement and delete invalidate handles, keep the execution guard, and reject stale revisions', async () => {
  const f = fixture();
  try {
    const record = f.save(),
      [entry] = f.vault.catalog('task', 'https://example.test');
    const next = f.vault.save({ ...record, username: 'replacement', password: 'new-password' });
    assert.throws(() => f.vault.remove(record.id, record.revision), /VAULT_REVISION_CHANGED/);
    await assert.rejects(
      f.vault.fill(
        entry.handle,
        'task',
        'https://example.test',
        async () => true,
        async () => ({}),
      ),
      /VAULT_ACCESS_DENIED/,
    );
    f.vault.remove(next.id, next.revision);
    assert.deepEqual(f.vault.list(), []);
    assert.equal(f.vault.protected(), true);
  } finally {
    f.clean();
  }
});
test('models cannot pass a secret via browser_vault and feature/config defaults fail closed', () => {
  for (const args of [
    { action: 'fill', password: 'x' },
    { action: 'list', username: 'x' },
  ])
    assert.throws(() => validateToolRequest({ tool: 'browser_vault', input: 'tab', args }), /INVALID_INPUT/);
  assert.throws(
    () => validateToolRequest({ tool: 'browser_vault', input: 'tab', content: 'secret', args: { action: 'fill' } }),
    /INVALID_INPUT/,
  );
  assert.equal(defaultPolicy().features.vault, false);
  assert.equal(defaultPolicy().features.googleWorkspace, false);
  assert.ok(parsePolicy({ googleWorkspace: { clientId: 'invalid', domains: ['example.test'], services: ['documents'] } }).problems.length);
});
test('the host-execution guard is checked again after a pending approval', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'step-gate-vault-')),
    store = new Store(join(dir, 'store.sqlite'));
  const policy = defaultPolicy();
  let locked = false,
    ran = false;
  const approvals = new Approvals(store, request => {
    if (request) {
      locked = true;
      queueMicrotask(() => approvals.respond(request.id, 'once'));
    }
  });
  const gate = new ToolGate(
    () => policy,
    () => 'ask',
    async () => dir,
    approvals,
    async () => ({ blocked: false, reason: '', results: [] }),
    () => {
      if (locked) throw new Error('VAULT_HOST_EXECUTION_BLOCKED');
    },
  );
  try {
    await assert.rejects(
      gate.run(
        { tool: 'terminal', execute: true, command: 'echo fixture', readOnly: false },
        { title: 'fixture', body: '', key: 'fixture' },
        () => {
          ran = true;
        },
      ),
      /VAULT_HOST_EXECUTION_BLOCKED/,
    );
    assert.equal(ran, false);
  } finally {
    approvals.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('identifier-first login binds the next password fill to the same account', async () => {
  const f = fixture();
  try {
    const a = f.save();
    const b = f.vault.save({
      label: 'second',
      kind: 'website',
      destination: 'https://example.test',
      username: 'another',
      password: 'another-password',
    });
    let entries = f.vault.catalog('login', 'https://example.test');
    await f.vault.fill(
      entries.find(v => v.label === a.label)!.handle,
      'login',
      'https://example.test',
      async () => true,
      async () => ({ status: 'filled', filledFields: ['username'] }),
    );
    entries = f.vault.catalog('login', 'https://example.test');
    await assert.rejects(
      f.vault.fill(
        entries.find(v => v.label === b.label)!.handle,
        'login',
        'https://example.test',
        async () => true,
        async () => ({}),
      ),
      /VAULT_LOGIN_ATTEMPT_CHANGED/,
    );
    entries = f.vault.catalog('login', 'https://example.test');
    assert.deepEqual(
      await f.vault.fill(
        entries.find(v => v.label === a.label)!.handle,
        'login',
        'https://example.test',
        async () => true,
        async () => ({ status: 'filled', filledFields: ['password'] }),
      ),
      { status: 'filled', filledFields: ['password'] },
    );
  } finally {
    f.clean();
  }
});
