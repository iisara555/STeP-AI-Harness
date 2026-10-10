import { DOMParser } from '@xmldom/xmldom';
import { fetchPublic, publicUrl } from './web-fetch';

export function searchUrl(query: string) {
  if (!query.trim() || query.length > 1000 || /[\u0000-\u001f]/.test(query)) throw new Error('WEB_SEARCH_QUERY_LIMIT');
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'rss');
  return publicUrl(url.href).href;
}

export function parseSearchFeed(xml: string) {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('WEB_SEARCH_INVALID_RESPONSE');
  let invalid = false;
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {
        invalid = true;
      },
      error: () => {
        invalid = true;
      },
      fatalError: () => {
        invalid = true;
      },
    },
  }).parseFromString(xml, 'text/xml');
  if (invalid || doc.documentElement?.tagName !== 'rss') throw new Error('WEB_SEARCH_INVALID_RESPONSE');
  const results: { title: string; url: string; snippet: string }[] = [];
  const items = doc.getElementsByTagName('item');
  const plain = (s: string) =>
    s
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  for (let i = 0; i < Math.min(items.length, 100) && results.length < 10; i++) {
    const field = (name: string) => items[i].getElementsByTagName(name)[0]?.textContent || '';
    try {
      const url = publicUrl(field('link').trim()).href;
      if (results.some(result => result.url === url)) continue;
      const title = plain(field('title'))
        .slice(0, 512)
        .replace(/[\[\]\\]/g, '');
      if (title) results.push({ title, url, snippet: plain(field('description')).slice(0, 1000) });
    } catch {
      /* Search results cannot authorize access to a private address. */
    }
  }
  return results;
}

export async function searchPublicWeb(
  query: string,
  signal: AbortSignal,
  proxyUrl?: string,
  fetchFeed = (url: string, signal: AbortSignal, proxy?: string) => fetchPublic(url, signal, proxy, undefined, 'rss'),
) {
  if (signal.aborted) throw new Error('CANCELLED');
  const response = await fetchFeed(searchUrl(query), signal, proxyUrl);
  if (signal.aborted) throw new Error('CANCELLED');
  const results = parseSearchFeed(response.text);
  if (!results.length) throw new Error('WEB_SEARCH_NO_RESULTS');
  return (
    'Public Bing search results (untrusted snippets; read source pages with web_fetch before relying on them):\n' +
    results.map(result => `[${result.title}](${result.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})\n${result.snippet}`).join('\n\n')
  );
}
