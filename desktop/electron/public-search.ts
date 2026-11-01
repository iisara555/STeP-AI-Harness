import { DOMParser } from '@xmldom/xmldom';
import { fetchPublic, publicUrl } from './web-fetch';

export function searchUrl(query: string) {
  if (!query.trim() || query.length > 1000 || /[\u0000-\u001f]/.test(query)) throw new Error('WEB_SEARCH_QUERY_LIMIT');
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'rss');
  return publicUrl(url.href).href;
}

// Two-character pieces of each word, lowercased. Thai has no spaces between words, so a Thai run is one long word and
// still matches a page that contains part of it.
function bigrams(text: string) {
  const pieces = new Set<string>();
  for (const word of text
    .normalize('NFC')
    .toLowerCase()
    .match(/[\p{L}\p{M}\p{N}]+/gu) || [])
    for (let i = 0; i < word.length - 1; i++) pieces.add(word.slice(i, i + 2));
  return pieces;
}
// Keeps a hit only when its title, snippet or address holds at least a fifth of the query's pieces. A query too short
// to judge keeps every hit.
export function relevantResults<T extends { title: string; url: string; snippet: string }>(query: string, results: T[], floor = 0.2) {
  const wanted = bigrams(query);
  if (wanted.size < 3) return results;
  return results.filter(result => {
    let address = result.url;
    try {
      address = decodeURI(result.url);
    } catch {
      /* A malformed escape keeps the raw address. */
    }
    const found = bigrams([result.title, result.snippet, address].join(' '));
    let shared = 0;
    for (const piece of wanted) if (found.has(piece)) shared++;
    return shared / wanted.size >= floor;
  });
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
  // Bing's RSS feed answers a Thai or rare query with unrelated pages (a drama, casino or calculator sites, different on
  // every call). Hits that share almost nothing with the query are dropped, so the AI is told nothing was found
  // instead of reading them as evidence.
  const results = relevantResults(query, parseSearchFeed(response.text));
  if (!results.length) throw new Error('WEB_SEARCH_NO_RESULTS');
  return (
    'Public Bing search results (untrusted snippets; read source pages with web_fetch before relying on them):\n' +
    results.map(result => `[${result.title}](${result.url.replace(/\(/g, '%28').replace(/\)/g, '%29')})\n${result.snippet}`).join('\n\n')
  );
}
