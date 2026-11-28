// Safe inline sandboxed HTML and SVG preview builders for chat code blocks and HTML artifacts.
// Rendered inside an isolated opaque-origin iframe (no allow-same-origin, no preload bridge, no network egress).

export const HTML_IFRAME_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none';";
const SVG_IFRAME_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none';";

/** True when an HTML block looks like a self-contained page or visual widget rather than a small syntax snippet. */
export function isPreviewableHtml(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length < 30 || trimmed.length > 200_000) return false;
  if (/<!doctype\s+html|<html\b/i.test(trimmed)) return true;
  const hasInteractiveOrVisual = /<(?:style|canvas|svg|table|form|button|input|select|details|figure)\b/i.test(trimmed);
  const hasClosingTag = /<\/[a-z][a-z0-9-]*>/i.test(trimmed);
  return hasInteractiveOrVisual && hasClosingTag;
}

/** True when a code block contains a complete SVG document. */
export function isPreviewableSvg(code: string): boolean {
  const trimmed = code.trim();
  return trimmed.length <= 200_000 && /<svg\b[\s\S]*<\/svg>/i.test(trimmed);
}

/** Strips any script tags or inline event handlers before embedding static SVG. */
export function sanitizeStaticSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

/** Wraps an HTML snippet or document with strict offline CSP and matching theme defaults. */
export function buildSandboxedHtmlDoc(html: string, dark: boolean): string {
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${HTML_IFRAME_CSP}">`;
  const baseStyle = `<style>html{color-scheme:${dark ? 'dark' : 'light'}}body{margin:12px;font-family:system-ui,-apple-system,sans-serif;color:${dark ? '#f4f1ea' : '#231f20'};background:${dark ? '#231f20' : '#ffffff'}}</style>`;
  let doc = html.trim();
  if (/<head\b[^>]*>/i.test(doc)) {
    doc = doc.replace(/<head\b[^>]*>/i, match => `${match}\n${cspTag}`);
  } else if (/<html\b[^>]*>/i.test(doc)) {
    doc = doc.replace(/<html\b[^>]*>/i, match => `${match}\n<head>${cspTag}</head>`);
  } else {
    doc = `<!doctype html><html><head><meta charset="utf-8">${cspTag}${baseStyle}</head><body>${doc}</body></html>`;
  }
  return doc;
}

/** Builds a self-contained, offline-CSP data URL fallback for environments without the Electron sandbox protocol. */
export function buildSandboxedHtmlSrc(html: string, dark: boolean): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildSandboxedHtmlDoc(html, dark))}`;
}

/**
 * Registers an HTML widget with Electron's isolated `step-sandbox:` protocol (own offline CSP header, opaque origin)
 * so interactive scripts work inside `<iframe sandbox="allow-scripts">` while keeping the main window's `script-src 'self'`.
 */
export async function resolveSandboxedHtmlSrc(html: string, dark: boolean): Promise<string> {
  const bridge = typeof window !== 'undefined' ? (window as any).step : undefined;
  if (bridge?.call) {
    try {
      const res = (await bridge.call('sandboxHtml', { html, dark })) as { url?: string } | null;
      if (res?.url && res.url.startsWith('step-sandbox://widget/')) return res.url;
    } catch {
      /* Fall back to static data URL below when unavailable. */
    }
  }
  return buildSandboxedHtmlSrc(html, dark);
}

/** Builds a script-free data URL for rendering an SVG diagram safely inside a sandbox="" iframe. */
export function buildSandboxedSvgSrc(svg: string, dark: boolean): string {
  const clean = sanitizeStaticSvg(svg.trim());
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SVG_IFRAME_CSP}"><style>html,body{margin:0;padding:12px;width:100%;height:100%;box-sizing:border-box;display:grid;place-items:center;overflow:hidden;background:${dark ? '#231f20' : '#ffffff'};color:${dark ? '#f4f1ea' : '#231f20'}}svg{width:100%;height:100%;max-width:100%;max-height:100%;display:block}</style></head><body>${clean}</body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`;
}
