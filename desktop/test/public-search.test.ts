import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevantResults, searchPublicWeb, searchUrl, parseSearchFeed } from '../electron/public-search';

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
test('search hits that share almost nothing with the query are dropped, Thai included', async () => {
  const hit = (title: string, url: string, snippet = '') => ({ title, url, snippet });
  // Real Bing RSS replies seen on 2026-11-01 for a Thai shop-name query: a drama, a dictionary word, casino pages.
  const noise = [
    hit('Royal Betrothal (พากย์ไทย) ฝ่าบาททรงพระเจริญหมื่นปี', 'https://www.viu.com/ott/th/th/vod/1/'),
    hit('ฝ่าบาททรงพระเจริญหมื่นปี EP01', 'https://www.youtube.com/watch?v=x'),
    hit('BUKY888 บาคาร่า สล็อต', 'https://example.com/casino'),
  ];
  assert.deepEqual(relevantResults('หัวมุมศิลป์ หลัง มช.', noise), []);
  // Only the first word "วิธี" matches, which is not the request.
  assert.deepEqual(
    relevantResults('วิธีเขียนโพสต์ประชาสัมพันธ์ให้น่าสนใจ', [hit('วิธี - วิกิพจนานุกรม', 'https://th.wiktionary.org/wiki/วิธี')]),
    [],
  );
  const relevant = [
    hit('เทคนิคเขียนโพสต์ประชาสัมพันธ์ให้คนอยากอ่าน', 'https://www.example.org/pr-post'),
    hit('ประกาศวันหยุดราชการ ปี 2570', 'https://www.thaigov.go.th/news/1', 'คณะรัฐมนตรีมีมติวันหยุดราชการประจำปี 2570'),
    hit('Public holidays in Thailand 2027', 'https://www.example.com/thailand-holidays-2027'),
  ];
  assert.deepEqual(relevantResults('วิธีเขียนโพสต์ประชาสัมพันธ์ให้น่าสนใจ', relevant), [relevant[0]]);
  assert.deepEqual(relevantResults('วันหยุดราชการ 2570', relevant), [relevant[1]]);
  assert.deepEqual(relevantResults('thailand public holidays 2027', relevant), [relevant[2]]);
  // Too short to judge: every hit stays.
  assert.deepEqual(relevantResults('AI', noise), noise);
  const drama =
    '<rss><channel><item><title>ฝ่าบาททรงพระเจริญหมื่นปี EP01</title><link>https://www.youtube.com/watch?v=x</link><description>ซีรีส์จีน</description></item></channel></rss>';
  await assert.rejects(
    searchPublicWeb('หัวมุมศิลป์ เชียงใหม่', new AbortController().signal, undefined, async url => ({ url, text: drama })),
    /WEB_SEARCH_NO_RESULTS/,
  );
});
