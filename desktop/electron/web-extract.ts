import { DOMParser } from '@xmldom/xmldom';
import { publicUrl } from './web-fetch';

/** Inert, bounded HTML extraction. Page content is evidence, never instructions or executable code. */
export function extractWeb(html: string, source: string) {
  if (html.length > 2_000_000) throw new Error('TOOL_OUTPUT_LIMIT');
  if (/<!ENTITY\b|<!DOCTYPE[^>]*\[/i.test(html)) throw new Error('WEB_EXTRACT_INVALID');
  // Bound depth before xmldom's recursive traversal, including deliberately malformed HTML.
  const stack: string[] = [];
  let tags = 0;
  for (const token of html.matchAll(/<(\/?)([a-z][\w:-]*)\b[^>]*>/gi)) {
    if (++tags > 10000) throw new Error('TOOL_OUTPUT_LIMIT');
    const name = token[2].toLowerCase();
    if (token[1]) {
      const index = stack.lastIndexOf(name);
      if (index >= 0) stack.length = index;
    } else if (
      !/\/$/.test(token[0].slice(0, -1)) &&
      !['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(name)
    ) {
      if (['p', 'li', 'tr', 'td', 'th'].includes(name) && stack.at(-1) === name) stack.pop();
      stack.push(name);
      if (stack.length > 128) throw new Error('TOOL_OUTPUT_LIMIT');
    }
  }
  const url = publicUrl(source).href;
  const doc = new DOMParser({
    errorHandler: {
      warning() {},
      error() {},
      fatalError() {
        throw new Error('WEB_EXTRACT_INVALID');
      },
    },
  }).parseFromString(
    html.replace(/<!doctype[^>]*>/gi, '').replace(/<(script|style|noscript|iframe|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''),
    'text/html',
  );
  const elements = Array.from(doc.getElementsByTagName('*'));
  if (elements.length > 50000) throw new Error('TOOL_OUTPUT_LIMIT');
  for (const el of elements)
    if (['nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe', 'svg', 'template'].includes(el.tagName.toLowerCase()))
      el.parentNode?.removeChild(el);
  const root =
    doc.getElementsByTagName('main')[0] ||
    doc.getElementsByTagName('article')[0] ||
    doc.getElementsByTagName('body')[0] ||
    doc.documentElement;
  if (!root) throw new Error('WEB_EXTRACT_INVALID');
  const clean = (text: string | null) => (text || '').replace(/\s+/g, ' ').trim();
  for (const el of Array.from(root.getElementsByTagName('*')))
    if (/^(p|div|section|article|h[1-6]|li|tr|br)$/i.test(el.tagName)) el.appendChild(doc.createTextNode('\n'));
  const full = (root.textContent || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/ *\r?\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const headingElements = Array.from(root.getElementsByTagName('*')).filter(e => /^h[1-6]$/i.test(e.tagName));
  const headings = headingElements.slice(0, 100).map(e => ({ level: Number(e.tagName[1]), text: clean(e.textContent).slice(0, 500) }));
  const tableElements = Array.from(root.getElementsByTagName('table'));
  let clipped =
    full.length > 30000 ||
    tableElements.length > 10 ||
    headingElements.length > 100 ||
    headingElements.some(e => clean(e.textContent).length > 500);
  const tables = tableElements.slice(0, 10).map(table => {
    const rows = Array.from(table.getElementsByTagName('tr'));
    if (rows.length > 100) clipped = true;
    return rows.slice(0, 100).map(row => {
      const cells = Array.from(row.childNodes).filter(n => n.nodeType === 1 && /^(td|th)$/i.test(n.nodeName));
      if (cells.length > 30) clipped = true;
      return cells.slice(0, 30).map(c => {
        const value = clean(c.textContent);
        if (value.length > 500) clipped = true;
        return value.slice(0, 500);
      });
    });
  });
  const links: { text: string; url: string }[] = [];
  for (const a of Array.from(root.getElementsByTagName('a'))) {
    if (links.length >= 100) {
      clipped = true;
      break;
    }
    try {
      const raw = a.getAttribute('href');
      if (!raw) continue;
      const href = publicUrl(new URL(raw, url).href).href;
      if (!links.some(l => l.url === href)) links.push({ text: clean(a.textContent).slice(0, 200), url: href });
    } catch {
      /* unsafe links are withheld */
    }
  }
  const result = {
    url,
    title: clean(doc.getElementsByTagName('title')[0]?.textContent || '').slice(0, 500),
    text: full.slice(0, 30000),
    headings,
    tables,
    links,
    truncated: clipped,
    provenance: 'external-untrusted',
    fetchedAt: new Date().toISOString(),
  };
  if (JSON.stringify(result).length > 200000) throw new Error('TOOL_OUTPUT_LIMIT');
  return result;
}
