import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPublicWeb, searchUrl, parseSearchFeed } from '../electron/public-search';

const feed =
  '<rss><channel><item><title>Public &amp; synthetic</title><link>https://www.example.org/announcement</link><description><![CDATA[<p>Public announcement</p>]]></description></item><item><title>Private</title><link>http://127.0.0.1/private</link><description>Never returned</description></item></channel></rss>';
test('public search encodes Thai queries at a fixed endpoint and validates bounds', () => {
  const url = searchUrl('วันหยุด ประเทศไทย');
  assert.equal(new URL(url).hostname, 'www.bing.com');
  assert.equal(new URL(url).searchParams.get('q'), 'วันหยุด ประเทศไทย');
  for (const query of ['', 'x'.repeat(1001), '\0', 'ภาษาไทย'.repeat(300)]) assert.throws(() => searchUrl(query));
});
test('bounded search results carry actual source links, strip HTML and reject private or executable links', () => {
  const found = parseSearchFeed(feed);
  assert.deepEqual(found, [{ title: 'Public & synthetic', url: 'https://www.example.org/announcement', snippet: 'Public announcement' }]);
  assert.throws(() => parseSearchFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>'), /WEB_SEARCH_INVALID_RESPONSE/);
});
test('search needs no provider, key or model call and fails without invented evidence', async () => {
  let called = '';
  const result = await searchPublicWeb('public synthetic query', new AbortController().signal, undefined, async url => {
    called = url;
    return { url, text: feed };
  });
  assert.match(result, /\[Public & synthetic\]\(https:\/\/www\.example\.org\/announcement\)/);
  assert.equal(new URL(called).searchParams.get('format'), 'rss');
  await assert.rejects(
    searchPublicWeb('query', new AbortController().signal, undefined, async url => ({ url, text: '<html>challenge</html>' })),
    /WEB_SEARCH_INVALID_RESPONSE/,
  );
  await assert.rejects(
    searchPublicWeb('query', new AbortController().signal, undefined, async url => ({ url, text: '<rss><channel></channel></rss>' })),
    /WEB_SEARCH_NO_RESULTS/,
  );
});
