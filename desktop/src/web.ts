export type WebSource = { title: string; url: string };
// Source links are inert until clicked. Never turn model text into script/file URLs.
export function publicSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    const host = url.hostname.toLowerCase();
    if (
      !host.includes('.') ||
      /^[\d.]+$/.test(host) ||
      host.includes(':') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
    )
      return '';
    if (value.length > 2000) return '';
    return url.href;
  } catch {
    return '';
  }
}
export function webSources(text: string, keep: (url: string) => boolean = () => true): WebSource[] {
  const sources: WebSource[] = [];
  for (const match of text.slice(0, 200000).matchAll(/\[([^\]\n]{1,250})\]\((https?:\/\/[^\s)]+)\)/g)) {
    const url = publicSourceUrl(match[2]);
    if (url && keep(url) && !sources.some(s => s.url === url)) sources.push({ title: match[1], url });
    if (sources.length === 12) break;
  }
  return sources;
}

// The key two links share when they name the same page: no fragment, no trailing slash, host without "www.".
function sourceKey(value: string) {
  const href = publicSourceUrl(value);
  if (!href) return '';
  const url = new URL(href);
  url.hash = '';
  url.hostname = url.hostname.replace(/^www\./, '');
  return url.href.replace(/\/+$/, '');
}
// A web_search result list holds every hit the search engine returned, related or not. Only the hits the answer
// cites, or pages the AI opened with a web tool, are the answer's sources.
export function usedWebSources(results: string, answer: string, opened: Iterable<string> = []): WebSource[] {
  const used = new Set<string>();
  for (const link of [...(answer.slice(0, 200000).match(/https?:\/\/[^\s<>"'\])]+/g) || []), ...opened]) {
    const key = sourceKey(link.replace(/[.,;:!?]+$/, ''));
    if (key) used.add(key);
  }
  return used.size ? webSources(results, url => used.has(sourceKey(url))) : [];
}
