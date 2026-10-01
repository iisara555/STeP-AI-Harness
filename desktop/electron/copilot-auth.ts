/** GitHub OAuth App device flow. The client id must come from organization policy. */
export async function copilotDeviceLogin(
  clientId: string,
  signal: AbortSignal,
  show: (code: string, url: string) => Promise<void>,
  fetcher: typeof fetch = fetch,
  pause = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', stop);
        resolve();
      }, ms);
      const stop = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        reject(new Error('CANCELLED'));
      };
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
    }),
) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(clientId)) throw new Error('COPILOT_CLIENT_ID_REQUIRED');
  const post = async (path: string, values: Record<string, string>) => {
    if (signal.aborted) throw new Error('CANCELLED');
    const response = await fetcher('https://github.com/login/' + path, {
      method: 'POST',
      redirect: 'error',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error('COPILOT_LOGIN_FAILED');
    }
    const reader = response.body.getReader();
    let text = '',
      bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 16_000) throw new Error('COPILOT_LOGIN_FAILED');
        text += Buffer.from(chunk.value).toString('utf8');
      }
      return JSON.parse(text);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  };
  const device = await post('device/code', { client_id: clientId, scope: 'read:user' });
  if (
    typeof device.device_code !== 'string' ||
    device.device_code.length > 512 ||
    !/^[A-Z0-9-]{4,24}$/.test(device.user_code) ||
    device.verification_uri !== 'https://github.com/login/device' ||
    !Number.isInteger(device.expires_in) ||
    device.expires_in < 1
  )
    throw new Error('COPILOT_LOGIN_FAILED');
  const expires = Date.now() + Math.min(device.expires_in, 900) * 1000;
  await show(device.user_code, device.verification_uri);
  let interval = Math.max(5, Math.min(Number(device.interval) || 5, 60)) * 1000;
  while (Date.now() < expires) {
    await pause(interval);
    if (signal.aborted) throw new Error('CANCELLED');
    if (Date.now() >= expires) break;
    const token = await post('oauth/access_token', {
      client_id: clientId,
      device_code: device.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (token.error === 'authorization_pending') continue;
    if (token.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    if (token.error) throw new Error(token.error === 'access_denied' ? 'CANCELLED' : 'COPILOT_LOGIN_FAILED');
    if (
      token.token_type?.toLowerCase() !== 'bearer' ||
      typeof token.access_token !== 'string' ||
      !/^(?:gho_|ghu_|github_pat_)[A-Za-z0-9_]{10,500}$/.test(token.access_token)
    )
      throw new Error('COPILOT_LOGIN_FAILED');
    return token.access_token;
  }
  throw new Error('COPILOT_LOGIN_EXPIRED');
}
