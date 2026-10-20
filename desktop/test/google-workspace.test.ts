import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Store } from '../electron/store';
import { Vault } from '../electron/vault';
import { GoogleWorkspace, googleAuthorize, googleIdentity, googleJson } from '../electron/google-workspace';
import { googleInvocation } from '../electron/google-operations';
import { googleScopes } from '../src/google-services';
const clientId = 'synthetic-client.apps.googleusercontent.com';
const config = { clientId, domains: ['example.test'], services: ['documents', 'gmail-send', 'calendar', 'tasks', 'chat', 'meet'] as any };
const context = { signal: new AbortController().signal, check: async () => {}, approve: async () => true };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const clientFile = (secret = 'synthetic-client-secret', id = clientId) =>
  JSON.stringify({ installed: { client_id: id, client_secret: secret } });
function fixture(settings = config) {
  const dir = mkdtempSync(join(tmpdir(), 'step-google-test-')),
    store = new Store(join(dir, 'workspace.sqlite'));
  const vault = new Vault(join(dir, 'vault.sqlite'), { wrap: s => Buffer.from(s), unwrap: b => b.toString() });
  const calls: { url: string; init?: RequestInit }[] = [];
  const transport: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return String(input).includes('/revoke')
      ? new Response(null, { status: 200 })
      : json({ documentId: 'synthetic-doc', echoed: 'synthetic-access' });
  };
  const authorize: typeof googleAuthorize = async (_config, scopes) => ({
    who: { sub: '1234', email: 'synthetic@example.test', hd: 'example.test' },
    scopes,
    tokens: { refresh: 'synthetic-refresh', access: 'synthetic-access', expires: Date.now() + 3600000 },
  });
  const google = new GoogleWorkspace(
    store,
    vault,
    () => settings,
    async () => {},
    transport,
    authorize,
  );
  return {
    dir,
    store,
    vault,
    google,
    calls,
    clean: () => {
      vault.close();
      store.close();
      assert.ok(dir.startsWith(tmpdir()));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test('connect grants stay private; fixed Google requests are account-bound and exact-action approved', async () => {
  const f = fixture();
  try {
    const connected = await f.google.connect(['documents'], context);
    assert.equal(connected.connecting, false, 'a completed connection must not remain in the browser-waiting state');
    const state = f.google.state();
    assert.equal(state.accounts.length, 1);
    assert.equal(JSON.stringify(state).includes('synthetic-refresh'), false);
    assert.equal(JSON.stringify(state).includes('synthetic@example.test'), false);
    const id = state.accounts[0].id;
    const request = { operation: 'docs.create' as const, body: { title: 'reviewed' } };
    const result = await f.google.execute(id, request, {
      ...context,
      approve: async (_title, body) => {
        assert.match(body, /reviewed/);
        request.body.title = 'changed';
        return true;
      },
    });
    assert.equal(JSON.parse(String(f.calls[0].init?.body)).title, 'reviewed');
    assert.equal(f.calls[0].init?.redirect, 'error'); // googleJson preserves redirect denial even for adapters.
    assert.equal(result.data.echoed, '[credential removed]');
    await assert.rejects(
      f.google.execute(id, { operation: 'docs.create', body: { title: 'denied' } }, { ...context, approve: async () => false }),
      /CANCELLED/,
    );
    assert.equal(f.calls.length, 1);
    await assert.rejects(
      f.google.execute(
        id,
        { operation: 'gmail.send', body: { to: ['fixture@example.test'], subject: 'test', text: 'synthetic' } },
        context,
      ),
      /GOOGLE_SCOPE_MISSING/,
    );
  } finally {
    f.clean();
  }
});

test('Workspace consent and stored grants belong to the signed-in employee subject', async () => {
  const f = fixture();
  try {
    const bound = new GoogleWorkspace(
      f.store,
      f.vault,
      () => config,
      async () => {},
      fetch,
      async (_config, scopes) => ({
        who: { sub: '1234', email: 'fixture@example.test', hd: 'example.test' },
        scopes,
        tokens: { access: 'synthetic-access', refresh: 'synthetic-refresh', expires: Date.now() + 3600000 },
      }),
      () => '9876',
    );
    await assert.rejects(bound.connect(['documents'], context), /GOOGLE_ACCOUNT_MISMATCH/);
    assert.equal(f.vault.protected(), false);
    await f.google.connect(['documents'], context);
    assert.equal(bound.state().accounts.length, 0);
    await assert.rejects(
      bound.execute(
        f.google.state().accounts[0].id,
        {
          operation: 'docs.get',
          params: { documentId: 'fixture-doc' },
        },
        context,
      ),
      /GOOGLE_ACCOUNT_MISMATCH/,
    );
    assert.equal(f.calls.length, 0);
  } finally {
    f.clean();
  }
});
test('pause or disconnect during approval cannot send a request, and handles are context-bound', async () => {
  const f = fixture();
  try {
    await f.google.connect(['documents'], context);
    const id = f.google.state().accounts[0].id;
    const [handle] = f.google.catalog('session');
    assert.throws(() => f.google.resolve(handle.handle, 'other'), /GOOGLE_ACCOUNT_CHANGED/);
    await assert.rejects(
      f.google.execute(
        id,
        { operation: 'docs.get', params: { documentId: 'doc' } },
        {
          ...context,
          approve: async () => {
            f.google.pause(id, true);
            return true;
          },
        },
      ),
      /GOOGLE_ACCOUNT_CHANGED/,
    );
    assert.equal(f.calls.length, 0);
    assert.throws(() => f.google.resolve(handle.handle, 'session'), /GOOGLE_ACCOUNT_CHANGED/);
    f.google.pause(id, false);
    await f.google.disconnect(id, false, context);
    assert.equal(f.google.state().accounts.length, 0);
    assert.ok(f.store.get('google-deleted', id));
    assert.equal(f.vault.protected(), true);
  } finally {
    f.clean();
  }
});
test('unknown write outcomes are never retried and failed revoke preserves the connection', async () => {
  const f = fixture();
  let calls = 0;
  const g = new GoogleWorkspace(
    f.store,
    f.vault,
    () => config,
    async () => {},
    async () => {
      calls++;
      throw new Error('transport-with-private-token');
    },
  );
  try {
    await f.google.connect(['documents'], context);
    const id = f.google.state().accounts[0].id;
    await assert.rejects(g.execute(id, { operation: 'docs.create', body: { title: 'draft' } }, context), /^Error: GOOGLE_OUTCOME_UNKNOWN$/);
    assert.equal(calls, 1);
    await assert.rejects(g.disconnect(id, true, context));
    assert.equal(f.google.state().accounts.length, 1);
  } finally {
    f.clean();
  }
});
test('operation validation prevents arbitrary API paths, header injection, destructive batches and mismatched sheet ranges', () => {
  for (const request of [
    { operation: 'drive.delete', params: {} },
    { operation: 'docs.get', params: { documentId: '../private' } },
    { operation: 'docs.get', params: { documentId: 'doc', url: 'https://hostile.test' } },
    { operation: 'gmail.send', body: { to: ['fixture@example.test\r\nBcc: private@example.test'], subject: 'test', text: 'test' } },
    { operation: 'sheets.values.update', params: { spreadsheetId: 'id', range: 'A1:A2' }, body: { values: [[1, 2]] } },
    { operation: 'slides.appendTextSlide', params: { presentationId: 'id' }, body: { text: 'test', requests: [{ deleteObject: {} }] } },
  ])
    assert.throws(() => googleInvocation(request as any));
  const range = googleInvocation({
    operation: 'sheets.values.update',
    params: { spreadsheetId: 'id', range: 'A1:B1' },
    body: { values: [['00123', 5]] },
  });
  assert.match(range.url, /valueInputOption=RAW/);
  assert.deepEqual(range.body, { values: [['00123', 5]] });
});
test('PKCE uses one-use state-bound loopback callback and never returns tokens to the browser', async () => {
  let auth: URL | undefined, tokenBody: URLSearchParams | undefined;
  const transport: typeof fetch = async (_url, init) => {
    tokenBody = new URLSearchParams(String(init?.body));
    return json({
      id_token: 'synthetic-id',
      refresh_token: 'synthetic-refresh',
      access_token: 'synthetic-access',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: googleScopes(['documents']).join(' '),
    });
  };
  const who: typeof googleIdentity = async (_token, audience, nonce) => {
    assert.equal(audience, clientId);
    assert.equal(nonce, auth!.searchParams.get('nonce'));
    return { sub: '123', email: 'fixture@example.test', hd: 'example.test' };
  };
  const result = await googleAuthorize(
    config,
    googleScopes(['documents']),
    async url => {
      auth = new URL(url);
      assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(auth.searchParams.get('hd'), 'example.test');
      const callback = new URL(auth.searchParams.get('redirect_uri')!);
      assert.equal(callback.hostname, '127.0.0.1');
      callback.searchParams.set('state', 'incorrect');
      callback.searchParams.set('code', 'synthetic-code');
      const invalid = await fetch(callback);
      assert.equal(invalid.status, 400);
      callback.searchParams.set('state', auth.searchParams.get('state')!);
      const ok = await fetch(callback);
      assert.equal(ok.status, 200);
      const page = await ok.text();
      assert.match(page, /ยังไม่เสร็จ|still needs to verify/);
      assert.doesNotMatch(page, /synthetic-code|synthetic-access|synthetic-refresh/);
      assert.equal((await fetch(callback)).status, 400);
    },
    context.signal,
    transport,
    who,
  );
  assert.equal(tokenBody!.get('grant_type'), 'authorization_code');
  assert.ok(tokenBody!.get('code_verifier'));
  assert.equal(tokenBody!.get('client_secret'), null);
  assert.equal(result.who.sub, '123');
});
test('Desktop client secret is sent only in the token POST, never in the browser URL or callback', async () => {
  const secret = 'synthetic-client-secret';
  const result = await googleAuthorize(
    { ...config, clientSecret: secret },
    googleScopes(['documents']),
    async url => {
      assert.doesNotMatch(url, /client_secret|synthetic-client-secret/);
      const auth = new URL(url);
      const callback = new URL(auth.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', auth.searchParams.get('state')!);
      callback.searchParams.set('code', 'synthetic-code');
      assert.doesNotMatch(await (await fetch(callback)).text(), /synthetic-client-secret/);
    },
    context.signal,
    async (url, init) => {
      assert.equal(String(url), 'https://oauth2.googleapis.com/token');
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('client_secret'), secret);
      assert.ok(body.get('code_verifier'));
      return json({
        id_token: 'synthetic-id',
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: googleScopes(['documents']).join(' '),
      });
    },
    async () => ({ sub: '1234', email: 'fixture@example.test', hd: 'example.test' }),
  );
  assert.doesNotMatch(JSON.stringify(result), /synthetic-client-secret/);
});
test('imported client credentials stay encrypted and are reused for authorization and refresh', async () => {
  const f = fixture();
  const secret = 'synthetic-client-secret';
  let refreshes = 0;
  const google = new GoogleWorkspace(
    f.store,
    f.vault,
    () => config,
    async () => {},
    async (url, init) => {
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        refreshes++;
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get('grant_type'), 'refresh_token');
        assert.equal(body.get('client_secret'), secret);
        assert.equal(body.get('client_id'), clientId);
        return json({ access_token: 'synthetic-new-access', token_type: 'Bearer', expires_in: 3600 });
      }
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-new-access');
      return json({ items: [] });
    },
    async (settings, scopes) => {
      assert.equal(settings.clientSecret, secret);
      return {
        who: { sub: '1234', email: 'fixture@example.test', hd: 'example.test' },
        scopes,
        tokens: { access: 'expired', refresh: 'synthetic-refresh', expires: 0 },
      };
    },
  );
  try {
    assert.throws(() => google.importClient(clientFile(secret, 'other-client.apps.googleusercontent.com')), /GOOGLE_CLIENT_MISMATCH/);
    assert.equal(f.vault.list().length, 0);
    assert.equal(google.importClient(clientFile()).clientSecretConfigured, true);
    assert.equal(f.vault.list().filter(v => v.kind === 'google-client').length, 1);
    assert.throws(
      () => google.importClient(JSON.stringify({ web: { client_id: clientId, client_secret: secret } })),
      /GOOGLE_CLIENT_FILE_INVALID/,
    );
    await google.connect(['calendar'], context);
    const result = await google.execute(google.state().accounts[0].id, { operation: 'calendar.list' }, context);
    assert.deepEqual(result.data.items, []);
    assert.equal(refreshes, 1);
    assert.doesNotMatch(
      JSON.stringify(google.state()) + JSON.stringify(f.store.list('google-client')) + JSON.stringify(google.catalog('session')),
      /synthetic-client-secret/,
    );
    assert.equal(readFileSync(join(f.dir, 'vault.sqlite')).includes(Buffer.from(secret)), false);
    const restored = new GoogleWorkspace(
      f.store,
      f.vault,
      () => config,
      async () => {},
    );
    assert.equal(restored.state().clientSecretConfigured, true);
    f.vault.suspend(true);
    assert.throws(() => google.importClient(clientFile()), /VAULT_SUSPENDED/);
  } finally {
    f.clean();
  }
});
test('organization-provisioned OAuth connects and refreshes without employee client-file import', async () => {
  const f = fixture();
  const bundled = 'synthetic-distribution-client-secret';
  const google = new GoogleWorkspace(
    f.store,
    f.vault,
    () => config,
    async () => {},
    async (url, init) => {
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get('client_id'), clientId);
        assert.equal(body.get('client_secret'), bundled);
        assert.equal(body.get('grant_type'), 'refresh_token');
        return json({ access_token: 'synthetic-renewed', token_type: 'Bearer', expires_in: 3600 });
      }
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-renewed');
      return json({ items: [] });
    },
    async (settings, scopes) => {
      assert.equal(settings.clientSecret, bundled);
      return {
        who: { sub: '1234', email: 'fixture@example.test', hd: 'example.test' },
        scopes,
        tokens: { access: 'expired', refresh: 'synthetic-refresh', expires: 0 },
      };
    },
    undefined,
    id => (id === clientId ? bundled : undefined),
  );
  try {
    assert.equal(google.state().clientPreconfigured, true);
    assert.equal(google.state().clientSecretConfigured, true);
    assert.equal(f.vault.protected(), false, 'bundled native app identity must not enroll employee credentials at startup');
    await google.connect(['calendar'], context);
    assert.equal(google.state().accounts.length, 1);
    assert.equal(f.store.list('google-client').length, 0);
    assert.equal(f.vault.list().length, 1, 'only the employee OAuth token is stored');
    // A new distribution rotates the shared native client value without an old local import overriding it.
    google.importClient(clientFile('synthetic-obsolete-client-secret'));
    await google.execute(google.state().accounts[0].id, { operation: 'calendar.list' }, context);
    assert.doesNotMatch(JSON.stringify(google.state()) + JSON.stringify(google.catalog('session')), /synthetic-distribution-client-secret/);
    f.vault.suspend(true);
    await assert.rejects(google.connect(['calendar'], context), /VAULT_SUSPENDED/);
  } finally {
    f.clean();
  }
});
test('OIDC signature, nonce, audience and Workspace membership are checked against signed claims', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const transport: typeof fetch = async () => json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' }] });
  const claims = {
    iss: 'https://accounts.google.com',
    aud: clientId,
    exp: Math.floor(Date.now() / 1000) + 60,
    nonce: 'nonce',
    sub: '123',
    email: 'fixture@example.test',
    email_verified: true,
    hd: 'example.test',
  };
  const jwt = (c: object) => {
    const data =
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify(c)).toString('base64url');
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
  };
  assert.equal((await googleIdentity(jwt(claims), clientId, 'nonce', transport)).sub, '123');
  for (const changed of [
    { ...claims, aud: 'other-client' },
    { ...claims, nonce: 'other' },
    { ...claims, email_verified: false },
    { ...claims, exp: 0 },
  ])
    await assert.rejects(googleIdentity(jwt(changed), clientId, 'nonce', transport), /GOOGLE_IDENTITY_INVALID/);
});
test('Google responses are bounded and upstream token-bearing error messages are withheld', async () => {
  await assert.rejects(
    googleJson('https://example.test', {}, async () => json({ text: 'x'.repeat(1000001) })),
    /GOOGLE_OUTPUT_LIMIT/,
  );
  await assert.rejects(
    googleJson('https://example.test', {}, async () => new Response('private token', { status: 403 })),
    /^Error: GOOGLE_ACCESS_DENIED$/,
  );
});
test('token failures identify configuration and expired grants without disclosing upstream diagnostics', async () => {
  for (const [error, description, grant, expected] of [
    ['invalid_client', 'private diagnostic', 'authorization_code', 'GOOGLE_CLIENT_CONFIGURATION'],
    ['invalid_request', 'client_secret is missing. private diagnostic', 'authorization_code', 'GOOGLE_CLIENT_SECRET_REQUIRED'],
    ['invalid_scope', 'private diagnostic', 'authorization_code', 'GOOGLE_CLIENT_CONFIGURATION'],
    ['invalid_grant', 'private diagnostic', 'authorization_code', 'GOOGLE_AUTH_CODE_REJECTED'],
    ['invalid_grant', 'private diagnostic', 'refresh_token', 'GOOGLE_REAUTH_REQUIRED'],
    ['unknown_error', 'private diagnostic', 'authorization_code', 'GOOGLE_REQUEST_FAILED'],
  ]) {
    await assert.rejects(
      googleJson(
        'https://oauth2.googleapis.com/token',
        { method: 'POST', body: new URLSearchParams({ grant_type: grant }) },
        async () => new Response(JSON.stringify({ error, error_description: description }), { status: 400 }),
      ),
      new RegExp(`^Error: ${expected}$`),
    );
  }
});
test('real loopback OAuth failure leaves no account, and retry verifies, stores and uses the Google account', async () => {
  const f = fixture({ ...config, services: ['documents', 'calendar-read', 'tasks'] });
  const scopes = googleScopes(['documents', 'calendar-read', 'tasks']);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let nonce = '',
    failing = true,
    opened = 0;
  const transport: typeof fetch = async (url, init) => {
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      if (failing)
        return new Response(JSON.stringify({ error: 'invalid_client', error_description: 'private diagnostic' }), { status: 401 });
      const data =
        Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url') +
        '.' +
        Buffer.from(
          JSON.stringify({
            iss: 'https://accounts.google.com',
            aud: clientId,
            nonce,
            sub: '1234',
            exp: Math.floor(Date.now() / 1000) + 3600,
            email: 'fixture@example.test',
            email_verified: true,
            hd: 'example.test',
          }),
        ).toString('base64url');
      return json({
        id_token: data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url'),
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: scopes.join(' '),
      });
    }
    if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs')
      return json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256' }] });
    assert.match(String(url), /^https:\/\/www.googleapis.com\/calendar\/v3\//);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-access');
    return json({ items: [] });
  };
  const google = new GoogleWorkspace(
    f.store,
    f.vault,
    () => ({ ...config, services: ['documents', 'calendar-read', 'tasks'] }),
    async url => {
      opened++;
      const auth = new URL(url);
      nonce = auth.searchParams.get('nonce')!;
      const callback = new URL(auth.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', auth.searchParams.get('state')!);
      callback.searchParams.set('code', 'synthetic-code');
      const response = await fetch(callback);
      assert.equal(response.status, 200);
      assert.doesNotMatch(await response.text(), /synthetic-code|synthetic-access|synthetic-refresh|private diagnostic/);
    },
    transport,
  );
  try {
    await assert.rejects(google.connect(['documents', 'calendar-read', 'tasks'], context), /^Error: GOOGLE_CLIENT_CONFIGURATION$/);
    assert.equal(google.state().connectionError, 'GOOGLE_CLIENT_CONFIGURATION');
    assert.equal(google.state().connecting, false);
    assert.equal(google.state().accounts.length, 0);
    assert.equal(f.vault.list().length, 0);
    failing = false;
    const connected = await google.connect(['documents', 'calendar-read', 'tasks'], context);
    assert.equal(connected.connecting, false);
    assert.equal(connected.connectionError, undefined);
    assert.equal(connected.accounts.length, 1);
    assert.deepEqual(connected.accounts[0].services, ['documents', 'calendar-read', 'tasks']);
    assert.doesNotMatch(JSON.stringify(connected), /synthetic-access|synthetic-refresh|fixture@example.test/);
    assert.equal(f.vault.list().length, 1);
    const result = await google.execute(connected.accounts[0].id, { operation: 'calendar.list' }, context);
    assert.deepEqual(result.data.items, []);
    assert.equal(opened, 2);
  } finally {
    f.clean();
  }
});
test('connection status retains only a fixed error code until retry, and clears it on context changes', async () => {
  const f = fixture();
  const google = new GoogleWorkspace(
    f.store,
    f.vault,
    () => config,
    async () => {},
    fetch,
    async () => {
      throw new Error('private diagnostic with synthetic-secret and fixture@example.test');
    },
  );
  try {
    await assert.rejects(google.connect(['documents'], context));
    assert.equal(google.state().connecting, false);
    assert.equal(google.state().connectionError, 'GOOGLE_CONNECTION_FAILED');
    assert.doesNotMatch(JSON.stringify(google.state()), /synthetic-secret|fixture@example.test|private diagnostic/);
    google.invalidate();
    assert.equal(google.state().connectionError, undefined);
  } finally {
    f.clean();
  }
});
test('denied Google callbacks show failure and never exchange a code', async () => {
  await assert.rejects(
    googleAuthorize(
      config,
      googleScopes(['documents']),
      async url => {
        const auth = new URL(url);
        const callback = new URL(auth.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', auth.searchParams.get('state')!);
        callback.searchParams.set('error', 'access_denied');
        const response = await fetch(callback);
        assert.match(await response.text(), /เชื่อมบัญชี Google ไม่สำเร็จ/);
      },
      context.signal,
      async () => {
        assert.fail('denied consent must not call the token endpoint');
      },
    ),
    /^Error: GOOGLE_CONSENT_DENIED$/,
  );
});
test('refresh is serialized, preserves an omitted refresh token, and sends only to the fixed token endpoint', async () => {
  const f = fixture();
  let refreshCalls = 0;
  try {
    await f.google.connect(['documents'], context);
    const id = f.google.state().accounts[0].id;
    const a = f.store.get<any>('google-account', id)!;
    const entry = f.vault.list()[0];
    f.vault.save({ ...entry, value: JSON.stringify({ access: 'expired-access', refresh: 'synthetic-refresh', expires: 0 }) });
    const transport: typeof fetch = async (input, init) => {
      if (String(input) === 'https://oauth2.googleapis.com/token') {
        refreshCalls++;
        const body = new URLSearchParams(String(init?.body));
        assert.equal(body.get('refresh_token'), 'synthetic-refresh');
        await new Promise(done => setTimeout(done, 20));
        return json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 });
      }
      assert.equal((init?.headers as any).authorization, 'Bearer new-access');
      return json({ documentId: 'doc' });
    };
    const g = new GoogleWorkspace(
      f.store,
      f.vault,
      () => config,
      async () => {},
      transport,
    );
    await Promise.all([
      g.execute(id, { operation: 'docs.get', params: { documentId: 'doc' } }, context),
      g.execute(id, { operation: 'docs.get', params: { documentId: 'doc' } }, context),
    ]);
    assert.equal(refreshCalls, 1);
    await f.vault.use(a.credentialId, 'google-oauth', `${a.clientId}:${a.subject}`, async raw => {
      assert.equal(JSON.parse(raw).refresh, 'synthetic-refresh');
    });
  } finally {
    f.clean();
  }
});
test('native authorization cancellation closes its listener without a token exchange', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    googleAuthorize(
      config,
      googleScopes(['documents']),
      async () => controller.abort(),
      controller.signal,
      async () => {
        calls++;
        return json({});
      },
    ),
    /CANCELLED/,
  );
  assert.equal(calls, 0);
});
for (const phase of ['authorization', 'commit-check'] as const)
  test(`connection cancellation during ${phase} cannot persist credentials or an account`, async () => {
    const f = fixture();
    let ready!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => {
      ready = resolve;
    });
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let checks = 0;
    const google = new GoogleWorkspace(
      f.store,
      f.vault,
      () => config,
      async () => {},
      async () => {
        throw new Error('TRANSPORT_NOT_EXPECTED');
      },
      async (_config, scopes) => {
        if (phase === 'authorization') {
          ready();
          await gate;
        }
        return {
          who: { sub: '1234', email: 'synthetic@example.test', hd: 'example.test' },
          scopes,
          tokens: { refresh: 'synthetic-refresh', access: 'synthetic-access', expires: Date.now() + 3600000 },
        };
      },
    );
    try {
      const pending = google
        .connect(['documents'], {
          ...context,
          check: async () => {
            if (++checks === 2 && phase === 'commit-check') {
              ready();
              await gate;
            }
          },
        })
        .then(
          () => null,
          error => error,
        );
      await waiting;
      google.cancel();
      release();
      const error = await pending;
      assert.equal(error?.message, 'CANCELLED');
      assert.equal(f.vault.list().length, 0);
      assert.equal(google.state().accounts.length, 0);
      await google.connect(['documents'], context);
      assert.equal(google.state().accounts.length, 1, 'a fresh connection still succeeds after cancellation');
    } finally {
      release();
      f.clean();
    }
  });

test('workspace services require a complete configured audience and storage cannot connect while paused', async () => {
  const f = fixture();
  try {
    await assert.rejects(f.google.connect(['unknown' as any], context), /GOOGLE_SERVICE_DISABLED/);
    f.vault.suspend(true);
    await assert.rejects(f.google.connect(['documents'], context), /VAULT_SUSPENDED/);
  } finally {
    f.clean();
  }
});
test('Gmail MIME is decoded locally and binary/HTML attachment payloads are withheld before privacy review', async () => {
  const f = fixture();
  try {
    const accountScopes = googleScopes(['gmail-read']);
    const auth: typeof googleAuthorize = async () => ({
      who: { sub: '1234', email: 'fixture@example.test', hd: 'example.test' },
      scopes: accountScopes,
      tokens: { refresh: 'synthetic-refresh', access: 'synthetic-access', expires: Date.now() + 3600000 },
    });
    const g = new GoogleWorkspace(
      f.store,
      f.vault,
      () => ({ ...config, services: ['gmail-read'] }),
      async () => {},
      async () =>
        json({
          id: 'mail',
          payload: {
            mimeType: 'multipart/mixed',
            headers: [{ name: 'Subject', value: 'Fixture' }],
            parts: [
              { mimeType: 'text/plain', body: { data: Buffer.from('Private identifier 1234567890123').toString('base64url') } },
              { mimeType: 'application/pdf', body: { data: 'should-not-leave-host', attachmentId: 'private' } },
              { mimeType: 'text/html', body: { data: 'encoded-html' } },
            ],
          },
        }),
      auth,
    );
    await g.connect(['gmail-read'], context);
    const result = await g.execute(g.state().accounts[0].id, { operation: 'gmail.get', params: { messageId: 'mail' } }, context);
    assert.match(result.data.text, /1234567890123/);
    assert.doesNotMatch(JSON.stringify(result), /should-not-leave-host|encoded-html/);
    assert.deepEqual(result.data.attachments, [{ attachmentId: 'private', filename: '', mimeType: 'application/pdf' }]);
  } finally {
    f.clean();
  }
});
test('read-only Calendar reads events but cannot create them', async () => {
  const f = fixture({ ...config, services: ['calendar-read'] as any });
  try {
    await f.google.connect(['calendar-read'], context);
    const state = f.google.state();
    assert.deepEqual(state.accounts[0].services, ['calendar-read']);
    const id = state.accounts[0].id;
    await f.google.execute(id, { operation: 'calendar.list', params: {} }, context);
    await f.google.execute(
      id,
      {
        operation: 'calendar.events',
        params: { calendarId: 'primary', timeMin: '2026-10-17T00:00:00+07:00', timeMax: '2026-10-18T00:00:00+07:00' },
      },
      context,
    );
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => (call.init?.method || 'GET') === 'GET'));
    await assert.rejects(
      f.google.execute(
        id,
        {
          operation: 'calendar.createEvent',
          params: { calendarId: 'primary' },
          body: { summary: 'synthetic', start: '2026-10-17T09:00:00+07:00', end: '2026-10-17T10:00:00+07:00' },
        },
        context,
      ),
      /GOOGLE_SCOPE_MISSING/,
    );
    assert.equal(f.calls.length, 2);
  } finally {
    f.clean();
  }
});

test('OCR-only sign-in requests identity scopes, keeps its token private and obeys pause', async () => {
  const f = fixture();
  let granted: string[] = [];
  const google = new GoogleWorkspace(
    f.store,
    f.vault,
    () => config,
    async () => {},
    undefined,
    async (_config, scopes) => {
      granted = scopes;
      return {
        who: { sub: '1234', email: 'synthetic@example.test', hd: 'example.test' },
        scopes,
        tokens: { refresh: 'synthetic-refresh', access: 'synthetic-access', identity: 'synthetic-id-token', expires: Date.now() + 3600000 },
      };
    },
  );
  try {
    await google.connect([], context, undefined, true);
    assert.deepEqual(granted, ['openid', 'email']);
    const state = google.state();
    assert.ok(!JSON.stringify(state).includes('synthetic-id-token'));
    const id = state.accounts[0].id;
    assert.equal(await google.receiptIdentity(id, context.signal), 'synthetic-id-token');
    assert.deepEqual(state.accounts[0].services, []);
    google.pause(id, true);
    await assert.rejects(google.receiptIdentity(id, context.signal), /GOOGLE_ACCESS_DENIED/);
  } finally {
    f.clean();
  }
});
