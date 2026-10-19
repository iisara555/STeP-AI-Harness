import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault } from '../electron/vault';
import { VaultBroker } from '../electron/vault-broker';
import { VaultManagers, findManagerCli } from '../electron/vault-managers';
import { VaultRedaction } from '../electron/vault-redaction';
import { VaultPrompts } from '../electron/vault-prompts';
import { totp } from '../electron/vault-otp';
import { defaultPolicy, parsePolicy } from '../electron/policy';

const base32 = (text: string) => {
  let bits = 0,
    value = 0,
    result = '';
  for (const byte of Buffer.from(text)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value >>> bits) & 31];
    }
  }
  if (bits) result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value << (5 - bits)) & 31];
  return result;
};
test('RFC6238 independent vectors cover SHA1/256/512, eight digits and URI parameters', () => {
  const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  const rows: [string, string, string[]][] = [
    ['SHA1', '12345678901234567890', ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130']],
    ['SHA256', '12345678901234567890123456789012', ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706']],
    [
      'SHA512',
      '1234567890123456789012345678901234567890123456789012345678901234',
      ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'],
    ],
  ];
  for (const [algorithm, secret, codes] of rows)
    for (const [index, time] of times.entries())
      assert.equal(
        totp(`otpauth://totp/test?secret=${base32(secret)}&algorithm=${algorithm}&digits=8&period=30`, time * 1000),
        codes[index],
      );
  for (const invalid of ['otpauth://hotp/test?secret=AAAAAAAAAAAAAAAA', 'bad', 'AAAAAAAAAAAAAAAA|99|0|MD5'])
    assert.throws(() => totp(invalid), /VAULT_OTP_INVALID/);
});
const fixture = () => {
  const home = mkdtempSync(join(tmpdir(), 'step-vault-parity-'));
  const path = join(home, 'vault.sqlite');
  const vault = new Vault(path, { wrap: value => Buffer.from(value), unwrap: bytes => bytes.toString() });
  const redaction = new VaultRedaction();
  const managers = new VaultManagers(
    () => true,
    async () => {
      throw new Error('not installed');
    },
    () => undefined,
  );
  const broker = new VaultBroker(vault, managers, redaction);
  return {
    home,
    path,
    vault,
    redaction,
    broker,
    close: () => {
      vault.close();
      rmSync(home, { recursive: true, force: true });
    },
  };
};
test('saved login handle continues into OTP, wrong-origin OTP is denied before resolution, values are redacted', async () => {
  const f = fixture();
  try {
    f.vault.save({
      kind: 'website',
      label: 'Work',
      destination: 'https://example.test',
      username: 'employee',
      password: 'synthetic-password',
      otpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    });
    const {
      entries: [entry],
    } = await f.broker.list('session', 'https://example.test');
    assert.equal(entry.identifier, 'employee');
    assert.equal(entry.twoFactor, true);
    assert.doesNotMatch(JSON.stringify(entry), /synthetic-password|GEZDGNB/);
    let count = 0;
    await f.broker.use(
      entry.handle,
      'session',
      'https://example.test',
      false,
      async () => true,
      async payload => {
        count++;
        assert.equal(payload.password, 'synthetic-password');
        return { filledFields: ['username', 'password'] };
      },
    );
    await assert.rejects(
      f.broker.use(
        entry.handle,
        'session',
        'https://hostile.test',
        true,
        async () => true,
        async () => {
          throw new Error('must not resolve');
        },
      ),
      /VAULT_ACCESS_DENIED/,
    );
    await assert.rejects(
      f.broker.use(
        entry.handle,
        'other',
        'https://example.test',
        true,
        async () => true,
        async () => ({}),
      ),
      /VAULT_ACCESS_DENIED/,
    );
    await f.broker.use(
      entry.handle,
      'session',
      'https://example.test',
      true,
      async () => true,
      async payload => {
        assert.match(payload.code!, /^\d{6}$/);
        assert.equal(f.redaction.mask(payload.code!), '[credential-redacted]');
        return { filledFields: ['code'] };
      },
    );
    assert.equal(count, 1);
    assert.equal(f.redaction.mask('synthetic-password'), '[credential-redacted]');
  } finally {
    f.close();
  }
});
test('payment/address payloads remain encrypted and declining card consent never reaches browser', async () => {
  const f = fixture();
  try {
    f.vault.save({
      kind: 'payment',
      label: 'Card',
      destination: 'https://example.test',
      fields: { card_number: '4111111111111111', exp_month: '12', exp_year: '2030', cvc: '123' },
    });
    f.vault.save({
      kind: 'address',
      label: 'Address',
      destination: 'https://example.test',
      fields: { address_line1: 'Synthetic street marker', city: 'Test', postal_code: '00000', country: 'TH', address_line2: '' },
    });
    const { entries } = await f.broker.list('session', 'https://example.test');
    await assert.rejects(
      f.broker.use(
        entries.find(entry => entry.kind === 'payment')!.handle,
        'session',
        'https://example.test',
        false,
        async () => false,
        async () => {
          throw new Error('must not fill');
        },
      ),
      /CANCELLED/,
    );
    await f.broker.use(
      entries.find(entry => entry.kind === 'address')!.handle,
      'session',
      'https://example.test',
      false,
      async () => true,
      async payload => {
        assert.equal(payload.fields?.country, 'TH');
        return {};
      },
    );
    assert.equal(readFileSync(f.path).includes(Buffer.from('Synthetic street marker')), false);
    assert.doesNotMatch(JSON.stringify(f.vault.list()), /4111111111111111|Synthetic street/);
  } finally {
    f.close();
  }
});
test('save, suspend and pending approvals invalidate reusable broker handles', async () => {
  const f = fixture();
  try {
    const saved = f.vault.save({
      kind: 'website',
      label: 'Work',
      destination: 'https://example.test',
      username: 'user',
      password: 'secret',
    });
    const {
      entries: [entry],
    } = await f.broker.list('session', 'https://example.test');
    await assert.rejects(
      f.broker.use(
        entry.handle,
        'session',
        'https://example.test',
        false,
        async () => {
          f.vault.suspend(true);
          return true;
        },
        async () => ({}),
      ),
      /VAULT_REVISION_CHANGED/,
    );
    f.vault.suspend(false);
    await assert.rejects(
      f.broker.use(
        entry.handle,
        'session',
        'https://example.test',
        false,
        async () => true,
        async () => ({}),
      ),
      /VAULT_ACCESS_DENIED/,
    );
    const {
      entries: [fresh],
    } = await f.broker.list('session', 'https://example.test');
    f.vault.save({ ...saved, username: 'user', password: 'replacement' });
    await assert.rejects(
      f.broker.use(
        fresh.handle,
        'session',
        'https://example.test',
        false,
        async () => true,
        async () => ({}),
      ),
      /VAULT_ACCESS_DENIED/,
    );
  } finally {
    f.close();
  }
});
test('manager secrets use child stdin/environment, Never URLs are excluded, lock cancels a pending unlock', async () => {
  const calls: { args: string[]; env: NodeJS.ProcessEnv; input?: string }[] = [];
  let finish: ((value: string) => void) | undefined;
  const manager = new VaultManagers(
    () => true,
    async (_file, args, env, input) => {
      calls.push({ args, env: { ...env }, input });
      if (args[0] === 'unlock') return 'synthetic-session';
      if (args[0] === 'signin') return new Promise<string>(resolve => (finish = resolve));
      if (args[0] === 'list')
        return JSON.stringify([
          {
            id: 'a-valid-id',
            type: 1,
            name: 'Work',
            login: {
              username: 'worker',
              totp: 'not-returned',
              password: 'not-returned',
              uris: [{ uri: 'https://example.test/login' }, { uri: 'https://never.test', match: 5 }],
            },
          },
        ]);
      if (args[0] === 'get')
        return JSON.stringify({
          id: 'a-valid-id',
          type: 1,
          login: { username: 'worker', password: 'synthetic-password', uris: [{ uri: 'https://example.test/login' }] },
        });
      return '[]';
    },
    name => '/fixed/' + name,
  );
  await manager.unlock('bitwarden', 'synthetic-master');
  const unlocked = calls[0];
  assert.equal(unlocked.env.STEP_VAULT_MASTER, 'synthetic-master');
  assert.doesNotMatch(JSON.stringify(unlocked.args), /synthetic-master/);
  const { items } = await manager.list();
  assert.deepEqual(items[0].origins, ['https://example.test']);
  const payload = await manager.resolve(items[0]);
  assert.equal(payload.password, 'synthetic-password');
  assert.equal(calls.at(-1)?.env.STEP_VAULT_MASTER, undefined);
  assert.equal(calls.at(-1)?.env.BW_SESSION, 'synthetic-session');
  manager.lock('bitwarden');
  const before = calls.filter(call => call.args[0] === 'list').length;
  const locked = await manager.list();
  assert.deepEqual(locked.items, []);
  assert.ok(locked.locked.includes('bitwarden'));
  assert.equal(calls.filter(call => call.args[0] === 'list').length, before);
  const pending = manager.unlock('onepassword', 'other-master');
  manager.lock('onepassword');
  finish!('late-session');
  await assert.rejects(pending, /VAULT_ACCESS_DENIED/);
  assert.equal(manager.state().find(source => source.source === 'onepassword')?.unlocked, false);
});
test('repeated lists keep a stable session handle without exhausting inner Vault grants', async () => {
  const f = fixture();
  try {
    for (let index = 0; index < 60; index++)
      f.vault.save({
        kind: 'website',
        label: 'Account ' + index,
        destination: 'https://example.test',
        username: 'user' + index,
        password: 'synthetic',
      });
    const {
      entries: [first],
    } = await f.broker.list('session', 'https://example.test');
    for (let index = 0; index < 20; index++) {
      const {
        entries: [entry],
      } = await f.broker.list('session', 'https://example.test');
      assert.equal(entry.handle, first.handle);
      await f.broker.use(
        entry.handle,
        'session',
        'https://example.test',
        false,
        async () => true,
        async () => ({}),
      );
    }
  } finally {
    f.close();
  }
});
test('external item origin edits invalidate a handle before replacement secrets are released', async () => {
  let changed = false;
  const manager = new VaultManagers(
    () => true,
    async (_file, args) => {
      const row = {
        id: 'item-id',
        type: 1,
        name: 'Work',
        login: { username: 'worker', password: 'synthetic', uris: [{ uri: changed ? 'https://new.test' : 'https://old.test' }] },
      };
      return JSON.stringify(args[0] === 'list' ? [row] : row);
    },
    name => (name === 'bw' ? '/fixed/bw' : undefined),
  );
  const {
    items: [item],
  } = await manager.list();
  changed = true;
  await assert.rejects(manager.resolve(item), /VAULT_REVISION_CHANGED/);
});
test('secure prompts have no chat persistence, abort closes them and stale responses are refused', async () => {
  const events: any[] = [];
  const prompts = new VaultPrompts((prompt, closed) => events.push({ prompt, closed }));
  const pending = prompts.ask({ sessionId: 'owner', kind: 'login', origin: 'https://example.test' });
  const id = events[0].prompt.id;
  assert.throws(() => prompts.respond(id, { password: 'x', unexpected: 'x' }), /INVALID_INPUT/);
  prompts.respond(id, { username: 'employee', password: 'synthetic-secret' });
  assert.equal((await pending)?.password, 'synthetic-secret');
  assert.doesNotMatch(JSON.stringify(events), /synthetic-secret/);
  assert.throws(() => prompts.respond(id), /VAULT_PROMPT_EXPIRED/);
  const controller = new AbortController();
  const cancelled = prompts.ask({ sessionId: 'owner', kind: 'code', origin: 'https://example.test' }, controller.signal);
  controller.abort();
  assert.equal(await cancelled, undefined);
});
test('Hermes-style Vault is enabled by default; managed execution hardening and fail-closed policy remain available', () => {
  assert.equal(defaultPolicy().features.vault, true);
  assert.equal(Boolean(defaultPolicy().credentialStorage?.blockHostExecution), false);
  assert.equal(parsePolicy({ credentialStorage: { blockHostExecution: true } }).policy.credentialStorage?.blockHostExecution, true);
  assert.equal(parsePolicy({ credentialStorage: { blockHostExecution: 'true' } }).policy.features.vault, false);
});
test('registered secrets are scrubbed in JSON while only trusted host identifiers retain short-field collisions', () => {
  const redaction = new VaultRedaction();
  redaction.register('123', 'synthetic-password');
  const handle = '12345678-aaaa-bbbb-cccc-123456789abc';
  const input = JSON.stringify({ handle, filledFields: 3, text: '123 synthetic-password', nested: { id: 'synthetic-password' } });
  const safe = JSON.parse(redaction.mask(input, true));
  assert.equal(safe.handle, handle);
  assert.equal(safe.filledFields, 3);
  assert.equal(safe.text, '[credential-redacted] [credential-redacted]');
  assert.equal(safe.nested.id, '[credential-redacted]');
  assert.notEqual(JSON.parse(redaction.mask(input)).handle, handle);
  const uuidSecret = 'ffffffff-aaaa-bbbb-cccc-123456789abc';
  redaction.register(uuidSecret);
  assert.equal(JSON.parse(redaction.mask(JSON.stringify({ id: uuidSecret }))).id, '[credential-redacted]');
});
test('1Password uses vault selectors, exposes only identifier metadata and honors local lock with a service account', async () => {
  const calls: string[][] = [];
  const manager = new VaultManagers(
    () => true,
    async (_file, args, env) => {
      calls.push(args);
      assert.equal(env.OP_SERVICE_ACCOUNT_TOKEN, 'synthetic-service-token');
      if (args.includes('list'))
        return JSON.stringify([
          {
            id: 'item-id',
            title: 'บัญชีทดสอบ',
            additional_information: 'worker@example.test',
            vault: { id: 'vault-id' },
            urls: [{ href: 'https://example.test/login' }],
          },
        ]);
      assert.ok(args.includes('--vault'));
      assert.ok(args.includes('vault-id'));
      if (args.includes('--otp')) return '654321\n';
      return JSON.stringify({
        id: 'item-id',
        urls: [{ href: 'https://example.test/login' }],
        fields: [
          { id: 'username', value: 'worker@example.test' },
          { id: 'password', value: 'synthetic-password' },
        ],
      });
    },
    name => (name === 'op' ? '/fixed/op' : undefined),
    () => ({ OP_SERVICE_ACCOUNT_TOKEN: 'synthetic-service-token' }),
  );
  const {
    items: [item],
  } = await manager.list();
  assert.equal(item.identifier, 'worker@example.test');
  assert.equal((await manager.resolve(item)).password, 'synthetic-password');
  assert.equal((await manager.resolve(item, true)).code, '654321');
  const before = calls.length;
  manager.lock('onepassword');
  assert.equal(manager.state()[0].unlocked, false);
  assert.ok((await manager.list()).locked.includes('onepassword'));
  assert.equal(calls.length, before);
  await manager.unlock('onepassword', '');
  assert.equal(manager.state()[0].unlocked, true);
  assert.equal((await manager.list()).items.length, 1);
  assert.doesNotMatch(JSON.stringify(calls), /synthetic-password|synthetic-service-token/);
});
test('Windows npm Bitwarden uses its fixed JS entry with a real no-shell child and intact UTF8 output', async () => {
  const home = mkdtempSync(join(tmpdir(), 'step-vault-cli-'));
  try {
    const dir = join(home, 'node_modules', '@bitwarden', 'cli', 'build');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'bw.js');
    writeFileSync(
      file,
      `const args=process.argv.slice(2);if(args.some(arg=>arg.includes('synthetic-master')))process.exit(2);if(args[0]==='unlock'){if(process.env.STEP_VAULT_MASTER!=='synthetic-master')process.exit(3);process.stdout.write('synthetic-session');}else{const row={id:'item-id',type:1,name:'ทดสอบ',login:{username:'พนักงาน',password:'synthetic-password',uris:[{uri:'https://example.test'}]}};const bytes=Buffer.from(JSON.stringify(args[0]==='list'?[row]:row));for(const byte of bytes)process.stdout.write(Buffer.from([byte]));}`,
    );
    assert.equal(findManagerCli('bw', home, 'win32'), file);
    const manager = new VaultManagers(
      () => true,
      undefined,
      name => (name === 'bw' ? file : undefined),
      () => ({ SystemRoot: process.env.SystemRoot }),
    );
    await manager.unlock('bitwarden', 'synthetic-master');
    const {
      items: [item],
    } = await manager.list();
    assert.equal(item.identifier, 'พนักงาน');
    assert.equal(item.label, 'ทดสอบ');
    assert.equal((await manager.resolve(item)).password, 'synthetic-password');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
