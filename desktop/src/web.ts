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
export function webSources(text: string): WebSource[] {
  const sources: WebSource[] = [];
  for (const match of text.slice(0, 60000).matchAll(/\[([^\]\n]{1,250})\]\((https?:\/\/[^\s)]+)\)/g)) {
    const url = publicSourceUrl(match[2]);
    if (url && !sources.some(s => s.url === url)) sources.push({ title: match[1], url });
    if (sources.length === 12) break;
  }
  return sources;
}
