import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { publicUrl, publicAddress, resolvePublic, fetchPublic } from '../electron/web-fetch';
test('SSRF blocks private, mapped, non-public addresses and mixed DNS answers', async () => {
  for (const address of [
    '127.0.0.1',
    '10.2.3.4',
    '169.254.169.254',
    '172.20.1.2',
    '192.168.0.1',
    '100.64.1.1',
    '0.0.0.0',
    '224.0.0.1',
    '198.18.0.1',
    '::1',
    '::ffff:8.8.8.8',
    'fc00::1',
    '2001:db8::1',
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(publicAddress('2001:4860:4860::8888'), true);
  assert.equal(publicAddress('2001:0db8::1'), false);
  assert.equal(publicAddress('2001:0000:123::1'), false);
  assert.equal(publicAddress('3fff:0000::1'), false);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  for (const url of [
    'file:///a',
    'http://localhost/a',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::ffff:127.0.0.1]',
    'https://user:pass@public.example',
    'https://public.example:9999',
  ])
    assert.throws(() => publicUrl(url));
  await assert.rejects(
    resolvePublic(publicUrl('https://public.example'), async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]),
    /WEB_ADDRESS_BLOCKED/,
  );
});
test('organization proxy receives a pinned public CONNECT address, strips scripts, blocks private redirects', async () => {
  let redirect = false;
  const connects: string[] = [];
  const proxy = createServer();
  proxy.on('connect', (req, socket) => {
    connects.push(req.url!);
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.once('data', () => {
      const body = '<h1>public</h1><script>injected()</script><p>content</p>';
      socket.end(
        redirect
          ? 'HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1/secret\r\nContent-Length: 0\r\n\r\n'
          : `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
      );
    });
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const url = `http://127.0.0.1:${(proxy.address() as any).port}`;
  try {
    const resolver = async () => [{ address: '8.8.8.8', family: 4 }];
    const result = await fetchPublic('http://public.example', new AbortController().signal, url, resolver);
    assert.equal(result.text, 'public content');
    assert.deepEqual(connects, ['8.8.8.8:80']);
    const html = await fetchPublic('http://public.example', new AbortController().signal, url, resolver, 'html');
    assert.match(html.text, /<h1>public<\/h1>/);
    assert.match(html.text, /<script>injected\(\)<\/script>/);
    // The extraction layer, not transport, strips executable content from this inert HTML.
    assert.deepEqual(connects, ['8.8.8.8:80', '8.8.8.8:80']);
    redirect = true;
    await assert.rejects(fetchPublic('http://public.example', new AbortController().signal, url, resolver), /WEB_ADDRESS_BLOCKED/);
    assert.equal(connects.length, 3);
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  }
});
test('RSS uses the same pinned public transport and is unsupported in ordinary web fetch', async () => {
  const feed = '<rss><channel><item><title>synthetic</title></item></channel></rss>';
  const proxy = createServer();
  proxy.on('connect', (req, socket) => {
    assert.equal(req.url, '8.8.8.8:80');
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.once('data', () =>
      socket.end(
        `HTTP/1.1 200 OK\r\nContent-Type: application/rss+xml\r\nContent-Length: ${Buffer.byteLength(feed)}\r\nConnection: close\r\n\r\n${feed}`,
      ),
    );
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const proxyUrl = `http://127.0.0.1:${(proxy.address() as any).port}`;
  const resolver = async () => [{ address: '8.8.8.8', family: 4 }];
  try {
    assert.equal((await fetchPublic('http://public.example', new AbortController().signal, proxyUrl, resolver, 'rss')).text, feed);
    await assert.rejects(fetchPublic('http://public.example', new AbortController().signal, proxyUrl, resolver), /WEB_CONTENT_UNSUPPORTED/);
    const cancelled = AbortSignal.abort();
    await assert.rejects(fetchPublic('http://public.example', cancelled, proxyUrl, resolver, 'rss'), /CANCELLED/);
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>(done => proxy.close(() => done()));
  }
});
