import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, generateKeyPairSync, sign, createHash } from 'node:crypto';
import {
  EmployeeLogin,
  authorizeEmployee,
  employeeLoginConfig,
  EMPLOYEE_DOMAIN,
  type EmployeeLoginConfig,
} from '../electron/employee-login';
import { googleIdentity } from '../electron/google-oauth';
import { defaultPolicy, parsePolicy } from '../electron/policy';

const identity = { sub: '123456789', email: 'fixture@step.cmu.ac.th', hd: EMPLOYEE_DOMAIN, name: 'Fixture Employee' };
const clientId = 'synthetic-client.apps.googleusercontent.com';
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'step-employee-login-'));
  let clock = Date.now(),
    config: EmployeeLoginConfig = { required: true, clientId, sessionHours: 12 };
  const key = randomBytes(32);
  const protection = {
    wrap: (text: string) => {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    unwrap: (value: Buffer) => {
      const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      cipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8');
    },
  };
  const create = (authorize = async () => identity) =>
    new EmployeeLogin(
      directory,
      () => config,
      protection,
      authorize,
      () => clock,
    );
  return {
    directory,
    create,
    config: (value: EmployeeLoginConfig) => {
      config = value;
    },
    clock: (value: number) => {
      clock = value;
    },
    now: () => clock,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('verified identity opens the gate, persists with encryption and does not enroll Vault or Workspace', async () => {
  const f = fixture();
  try {
    const login = f.create();
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    const result = await login.login();
    assert.equal(result.phase, 'authenticated', JSON.stringify(result));
    login.assert();
    assert.equal(login.subject(), identity.sub);
    const bytes = readFileSync(login.path);
    for (const privateText of [identity.email, identity.name, identity.sub]) assert.equal(bytes.includes(Buffer.from(privateText)), false);
    assert.equal(existsSync(join(f.directory, 'vault')), false);
    assert.equal(existsSync(join(f.directory, 'workspace.sqlite')), false);
    f.create().assert();
    f.clock(f.now() + 12 * 3600000);
    assert.throws(() => f.create().assert(), /AUTH_REQUIRED/);
    assert.equal(f.create().state().ownerLabel, 'fi••••@step.cmu.ac.th');
  } finally {
    f.cleanup();
  }
});

test('logout keeps the owner and work; another subject cannot enter the same OS profile', async () => {
  const f = fixture();
  try {
    const login = f.create();
    await login.login();
    writeFileSync(join(f.directory, 'workspace.sqlite'), 'synthetic-existing-work');
    login.logout();
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    const other = f.create(async () => ({ ...identity, sub: '987654321' }));
    assert.equal((await other.login()).error, 'AUTH_OWNER_MISMATCH');
    assert.throws(() => other.assert(), /AUTH_REQUIRED/);
    assert.equal(readFileSync(join(f.directory, 'workspace.sqlite'), 'utf8'), 'synthetic-existing-work');
    assert.equal((await f.create().login()).phase, 'authenticated');
  } finally {
    f.cleanup();
  }
});

test('legacy work is inaccessible until its verified first owner confirms adoption', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.directory, 'workspace.sqlite'), 'synthetic-legacy');
    const login = f.create();
    assert.equal((await login.login()).phase, 'adopt');
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    assert.equal(existsSync(login.path), false);
    login.cancel();
    assert.equal(login.state().phase, 'signed-out');
    await login.login();
    assert.equal(login.adopt().phase, 'authenticated');
    assert.equal(readFileSync(join(f.directory, 'workspace.sqlite'), 'utf8'), 'synthetic-legacy');
  } finally {
    f.cleanup();
  }
});

test('strict hosted domain rejects email-only membership and never creates a session', async () => {
  const f = fixture();
  try {
    for (const hd of ['', 'example.test', 'step.cmu.ac.th.evil.test']) {
      const login = f.create(async () => ({ ...identity, hd }));
      assert.equal((await login.login()).error, 'GOOGLE_ORGANIZATION_DENIED');
      assert.throws(() => login.assert(), /AUTH_REQUIRED/);
      assert.equal(existsSync(login.path), false);
    }
  } finally {
    f.cleanup();
  }
});

test('cancellation and policy changes reject late results and cannot replace a newer attempt', async () => {
  const f = fixture();
  try {
    let finish: (value: typeof identity) => void = () => {};
    const login = f.create(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const old = login.login();
    assert.equal(login.state().phase, 'browser');
    login.cancel();
    finish(identity);
    await old;
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    assert.equal(existsSync(login.path), false);
    const policyRun = login.login();
    f.config({ required: true, clientId: 'changed.apps.googleusercontent.com', sessionHours: 12 });
    finish(identity);
    assert.equal((await policyRun).error, 'POLICY_CHANGED');
    assert.equal(existsSync(login.path), false);
  } finally {
    f.cleanup();
  }
});

test('clock rollback, shortened policy lifetime and client changes invalidate a saved session', async () => {
  const f = fixture();
  try {
    const login = f.create(),
      started = f.now();
    await login.login();
    f.clock(started - 120000);
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    f.clock(started + 2 * 3600000);
    f.config({ required: true, clientId, sessionHours: 1 });
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    f.clock(started + 1000);
    f.config({ required: true, clientId: 'changed.apps.googleusercontent.com', sessionHours: 12 });
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
  } finally {
    f.cleanup();
  }
});

test('plaintext, corrupted storage and hard-linked files never erase an owner binding or unlock work', async () => {
  const f = fixture();
  try {
    const path = join(f.directory, 'employee-session.bin');
    writeFileSync(path, JSON.stringify({ email: identity.email, authenticated: true }));
    const damaged = f.create();
    assert.equal(damaged.state().phase, 'locked');
    await assert.rejects(damaged.login(), /AUTH_SESSION_INVALID/);
    assert.throws(() => damaged.assert(), /AUTH_REQUIRED/);
    const before = readFileSync(path);
    assert.deepEqual(readFileSync(path), before);
    rmSync(path);
    const login = f.create();
    await login.login();
    linkSync(path, join(f.directory, 'alias'));
    const aliased = f.create();
    assert.equal(aliased.state().phase, 'locked');
    assert.throws(() => aliased.assert(), /AUTH_REQUIRED/);
  } finally {
    f.cleanup();
  }
});

test('identity-only OAuth uses online PKCE and discards all access grants after signed verification', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let url: URL | undefined,
    exchanges = 0;
  const transport: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/certs'))
      return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' }] });
    assert.equal(String(input), 'https://oauth2.googleapis.com/token');
    exchanges++;
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('code'), 'synthetic-code');
    assert.equal(body.has('client_secret'), false);
    assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'), url!.searchParams.get('code_challenge'));
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        ...identity,
        iss: 'https://accounts.google.com',
        aud: clientId,
        nonce: url!.searchParams.get('nonce'),
        email_verified: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const data = header + '.' + payload;
    return Response.json({
      id_token: data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url'),
      access_token: 'synthetic-access',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid email profile',
    });
  };
  const authorize = authorizeEmployee(async value => {
    url = new URL(value);
    assert.equal(url.searchParams.get('scope'), 'openid email profile');
    assert.equal(url.searchParams.get('access_type'), 'online');
    assert.equal(url.searchParams.get('prompt'), 'select_account');
    assert.equal(url.searchParams.get('hd'), EMPLOYEE_DOMAIN);
    assert.equal(url.searchParams.has('include_granted_scopes'), false);
    const callback = new URL(url.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', url.searchParams.get('state')!);
    callback.searchParams.set('code', 'synthetic-code');
    assert.equal((await fetch(callback)).status, 200);
  }, transport);
  const result = await authorize({ required: true, clientId, sessionHours: 12 }, new AbortController().signal);
  assert.deepEqual(result, identity);
  assert.equal(exchanges, 1);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-access|refresh/);
});

test('signature tampering cannot produce an employee identity', async () => {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(
    googleIdentity('eyJhbGciOiJSUzI1NiIsImtpZCI6ImZpeHR1cmUifQ.e30.invalid', clientId, 'nonce', async () =>
      Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' }] }),
    ),
    /GOOGLE_IDENTITY_INVALID/,
  );
});

test('managed login policy fails closed and packaged apps cannot bypass it through smoke environment variables', () => {
  const config = defaultPolicy().appLogin;
  assert.equal(config.required, true);
  assert.equal(config.sessionHours, 12);
  assert.equal(employeeLoginConfig(config, true, { STEP_DESKTOP_TEST_HOME: '/synthetic' }).required, true);
  assert.equal(employeeLoginConfig(config, false, { STEP_DESKTOP_TEST_HOME: '/synthetic' }).required, false);
  assert.equal(employeeLoginConfig(config, false, { STEP_DESKTOP_TEST_HOME: '/synthetic', STEP_DESKTOP_TEST_LOGIN: '1' }).required, true);
  assert.equal(parsePolicy({ appLogin: { required: false } }).policy.appLogin.required, false);
  for (const appLogin of [
    null,
    { required: 'false' },
    { sessionHours: 0 },
    { sessionHours: 25 },
    { clientId: 'hostile.test' },
    { domain: 'other.test' },
  ]) {
    const parsed = parsePolicy({ appLogin });
    assert.ok(parsed.problems.length);
    assert.equal(parsed.policy.appLogin.required, true);
  }
});

test('a declared shared profile cannot reuse a cached employee identity or create a new session', async () => {
  const f = fixture();
  try {
    const login = f.create();
    await login.login();
    f.config({ required: true, clientId, sessionHours: 12, sharedDevice: true });
    assert.equal(login.state().phase, 'locked');
    assert.equal(login.state().error, 'AUTH_SHARED_DEVICE');
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    await assert.rejects(login.login(), /AUTH_SHARED_DEVICE/);
    assert.equal(employeeLoginConfig(defaultPolicy().appLogin, true, {}, true).sharedDevice, true);
    f.config({ required: true, clientId, sessionHours: 12, policyInvalid: true });
    assert.equal(login.state().phase, 'locked');
    assert.equal(login.state().error, 'AUTH_POLICY_INVALID');
    assert.throws(() => login.assert(), /AUTH_REQUIRED/);
    await assert.rejects(login.login(), /AUTH_POLICY_INVALID/);
  } finally {
    f.cleanup();
  }
});
