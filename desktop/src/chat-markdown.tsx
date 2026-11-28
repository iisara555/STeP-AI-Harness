// AI answers rendered to modern chat standards: GitHub-flavoured Markdown, KaTeX math (offline), GitHub-style
// callout alerts, offline Mermaid SVG diagrams, syntax-highlighted code blocks (including unified diff), and safe
// inline sandboxed previews for SVG graphics and self-contained HTML widgets.
// Raw HTML in Markdown prose is dropped (skipHtml), links open in the app's own browser panel, and remote images are
// never fetched automatically.
import { Children, isValidElement, memo, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { AlertTriangle, Check, CircleAlert, Copy, Download, Eye, Lightbulb, MessageSquareWarning, OctagonAlert } from './icons';
import { t } from './i18n';
import { buildSandboxedHtmlSrc, buildSandboxedSvgSrc, isPreviewableHtml, isPreviewableSvg, sanitizeStaticSvg } from './inline-preview';

type Highlight = (code: string, language: string) => string;
let highlighter: Highlight | null = null;
let highlighterLoading: Promise<Highlight> | null = null;
/** highlight.js loads the first time an answer shows a code block; until then the code shows uncoloured. */
export function loadHighlighter(): Promise<Highlight> {
  highlighterLoading ||= import('./code-highlight').then(m => (highlighter = m.highlight));
  return highlighterLoading;
}

type MermaidRenderer = (source: string, dark: boolean) => Promise<string | null>;
let mermaidLoading: Promise<MermaidRenderer> | null = null;
function loadMermaidRenderer(): Promise<MermaidRenderer> {
  mermaidLoading ||= import('./mermaid-render').then(m => m.renderMermaidSvg);
  return mermaidLoading;
}

const ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  ps1: 'powershell',
  pwsh: 'powershell',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  yml: 'yaml',
  md: 'markdown',
  patch: 'diff',
  docker: 'dockerfile',
  cs: 'csharp',
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  h: 'c',
  rs: 'rust',
  toml: 'ini',
  conf: 'ini',
  env: 'ini',
  txt: 'plaintext',
  text: 'plaintext',
  mmd: 'plaintext',
};

/** Tool requests the app runs itself (```step-tool) are not part of what the person reads. */
export const visibleAnswer = (text: string) =>
  text
    .replace(/^\s{0,3}(`{3,}|~{3,})step-tool[^\n]*\n[\s\S]*?(?:^\s{0,3}\1\s*$|(?![\s\S]))/gm, '')
    .replace(/```step-tool[ \t]*\r?\n[\s\S]*?(?:```|$)/g, '')
    // Blank lines are kept as written: Markdown already folds them in prose, and code (copied or shown) needs them.
    .trim();

/** Protects ordinary currency prices (e.g. "$100 ถึง $200") from being parsed as inline KaTeX math. */
function escapeCurrencyDollars(segment: string): string {
  // Split around display math ($$...$$) so block formulas are untouched.
  const parts = segment.split(/(\$\$[\s\S]*?\$\$)/g);
  return parts
    .map((part, idx) => {
      if (idx % 2 === 1) return part;
      let out = '';
      let i = 0;
      while (i < part.length) {
        const ch = part[i];
        if (ch === '\\' && part[i + 1] === '$') {
          out += '\\$';
          i += 2;
          continue;
        }
        if (ch === '$' && part[i + 1] !== '$') {
          // Find closing single '$' on the same line (not escaped, not part of '$$').
          let j = i + 1;
          while (j < part.length && part[j] !== '\n') {
            if (part[j] === '\\' && part[j + 1] === '$') {
              j += 2;
              continue;
            }
            if (part[j] === '$' && part[j + 1] !== '$') break;
            j++;
          }
          if (j < part.length && part[j] === '$') {
            const inner = part.slice(i + 1, j);
            const afterChar = part[j + 1] || '';
            const startsWithPrice = /^\d[\d,.]*(?:\s|$|[^\w^_\\=])/.test(inner);
            const hasBareThai = /[\u0E00-\u0E7F]/.test(inner) && !inner.includes('\\');
            const looksLikeCurrency = (startsWithPrice && /\d/.test(afterChar)) || hasBareThai;
            if (looksLikeCurrency) {
              // Escape the opening '$' and resume from the closing '$' so chained prices ("$100, $200, $300") are checked too.
              out += '\\$' + inner;
              i = j;
              continue;
            }
            out += '$' + inner + '$';
            i = j + 1;
            continue;
          }
        }
        out += ch;
        i++;
      }
      return out;
    })
    .join('');
}

/**
 * Normalizes LaTeX delimiters (`\[...\]` and `\(...\)`) into remark-math syntax (`$$...$$` and `$...$`) outside code
 * fences and inline code spans, while protecting ordinary currency amounts such as "$100 ถึง $200".
 */
export function normalizeMarkdownMath(text: string): string {
  // Preserve fenced code blocks and inline code spans untouched.
  const codePattern = /(^\s{0,3}(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\s{0,3}(?:`{3,}|~{3,})\s*$|(?![\s\S]))|`[^`\n]+`)/gm;
  let result = '';
  let last = 0;
  for (const match of text.matchAll(codePattern)) {
    const start = match.index ?? 0;
    if (start > last) result += normalizeMathSegment(text.slice(last, start));
    result += match[0];
    last = start + match[0].length;
  }
  if (last < text.length) result += normalizeMathSegment(text.slice(last));
  return result;
}

function normalizeMathSegment(segment: string): string {
  const withDelimiters = segment
    .replace(/(^|[^\\])\\\[([\s\S]+?)\\\]/g, (_m, lead: string, body: string) => `${lead}\n$$\n${body.trim()}\n$$\n`)
    .replace(/(^|[^\\])\\\(([^\n]+?)\\\)/g, (_m, lead: string, body: string) => `${lead}$${body.trim()}$`);
  return escapeCurrencyDollars(withDelimiters);
}

export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

/** Detects GitHub-style callout alert markers (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`). */
export function parseAlertTag(text: string): { kind: AlertKind; rest: string } | null {
  const match = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]*\r?\n|[ \t]+|$)([\s\S]*)$/i.exec(text);
  if (!match) return null;
  return { kind: match[1].toLowerCase() as AlertKind, rest: match[2] };
}

const ALERT_META: Record<AlertKind, { label: string; Icon: typeof CircleAlert }> = {
  note: { label: 'หมายเหตุ', Icon: CircleAlert },
  tip: { label: 'คำแนะนำ', Icon: Lightbulb },
  important: { label: 'ข้อมูลสำคัญ', Icon: MessageSquareWarning },
  warning: { label: 'ข้อควรระวัง', Icon: AlertTriangle },
  caution: { label: 'คำเตือนสำคัญ', Icon: OctagonAlert },
};

function currentDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  const setting = document.documentElement.dataset.theme;
  if (setting === 'dark') return true;
  if (setting === 'light') return false;
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

/** Tracks whether the app is currently displaying the dark theme (explicit or system). */
export function useDarkTheme(): boolean {
  const [dark, setDark] = useState(currentDarkTheme);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => setDark(currentDarkTheme());
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', sync);
    return () => {
      observer.disconnect();
      mq?.removeEventListener?.('change', sync);
    };
  }, []);
  return dark;
}

function downloadSvg(svg: string, filename = 'diagram.svg') {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const textOf = (node: ReactNode): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : node && typeof node === 'object' && 'props' in node
        ? textOf((node as any).props.children)
        : '';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="quiet"
      aria-label={t('คัดลอกโค้ด')}
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => setCopied(false))
      }
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? t('คัดลอกแล้ว') : t('คัดลอกโค้ด')}
    </button>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const dark = useDarkTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    let alive = true;
    setRendering(true);
    const timer = setTimeout(() => {
      void loadMermaidRenderer()
        .then(render => render(code, dark))
        .then(rendered => {
          if (!alive) return;
          setSvg(rendered);
          setRendering(false);
        })
        .catch(() => {
          if (!alive) return;
          setSvg(null);
          setRendering(false);
        });
    }, 160);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [code, dark]);

  const showingDiagram = Boolean(svg) && !showCode;

  return (
    <figure className="chat-code chat-diagram">
      <header>
        <span>mermaid</span>
        {rendering && !svg && <span className="chat-code-status">{t('กำลังวาดแผนภาพ…')}</span>}
        <div className="chat-code-actions">
          {svg && (
            <button type="button" className="quiet" onClick={() => setShowCode(v => !v)}>
              <Eye size={13} />
              {showCode ? t('ดูแผนภาพ') : t('ดูโค้ด')}
            </button>
          )}
          {svg && (
            <button type="button" className="quiet" onClick={() => downloadSvg(svg, 'diagram.svg')}>
              <Download size={13} />
              {t('ดาวน์โหลด SVG')}
            </button>
          )}
          <CopyButton text={code} />
        </div>
      </header>
      {showingDiagram ? (
        <div className="chat-diagram-canvas" dangerouslySetInnerHTML={{ __html: svg! }} />
      ) : (
        <pre tabIndex={0}>
          <code>{code}</code>
        </pre>
      )}
    </figure>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const dark = useDarkTheme();
  const [highlightCode, setHighlightCode] = useState(() => highlighter);
  const canPreviewSvg = language === 'svg' && isPreviewableSvg(code);
  const canPreviewHtml = (language === 'html' || language === 'htm') && isPreviewableHtml(code);
  // SVG graphics render visually by default; interactive HTML previews open on click so small snippets stay calm.
  const [preview, setPreview] = useState(canPreviewSvg);
  useEffect(() => {
    setPreview(canPreviewSvg);
  }, [language, canPreviewSvg]);
  const name = ALIASES[language] || language;

  useEffect(() => {
    if (!highlightCode && name) void loadHighlighter().then(loaded => setHighlightCode(() => loaded));
  }, [highlightCode, name]);

  const html = !preview && highlightCode && name ? highlightCode(code, name) : '';
  const svgSrc = useMemo(() => (preview && canPreviewSvg ? buildSandboxedSvgSrc(code, dark) : ''), [preview, canPreviewSvg, code, dark]);
  // HTML previews are static (sandbox=""): AI-written scripts never run in the app window.
  const htmlSrc = useMemo(
    () => (preview && canPreviewHtml ? buildSandboxedHtmlSrc(code, dark) : ''),
    [preview, canPreviewHtml, code, dark],
  );
  const previewSrc = canPreviewSvg ? svgSrc : htmlSrc;

  return (
    <figure className="chat-code">
      <header>
        <span>{language || 'text'}</span>
        <div className="chat-code-actions">
          {(canPreviewSvg || canPreviewHtml) && (
            <button type="button" className="quiet" onClick={() => setPreview(v => !v)}>
              <Eye size={13} />
              {preview ? t('ดูโค้ด') : canPreviewSvg ? t('ดูภาพ') : t('แสดงตัวอย่าง')}
            </button>
          )}
          {canPreviewSvg && (
            <button type="button" className="quiet" onClick={() => downloadSvg(sanitizeStaticSvg(code.trim()), 'graphic.svg')}>
              <Download size={13} />
              {t('ดาวน์โหลด SVG')}
            </button>
          )}
          <CopyButton text={code} />
        </div>
      </header>
      {preview && previewSrc ? (
        <div className="chat-preview-wrap">
          <iframe
            className={`chat-preview-frame ${canPreviewSvg ? 'chat-svg-frame' : 'chat-html-frame'}`}
            title={canPreviewSvg ? t('ตัวอย่างภาพ SVG') : t('ตัวอย่างหน้าเว็บ HTML')}
            sandbox=""
            src={previewSrc}
          />
          {canPreviewHtml && <p className="chat-preview-note small muted">{t('ภาพนิ่ง ไม่รันสคริปต์')}</p>}
        </div>
      ) : (
        <pre tabIndex={0}>{html ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}</pre>
      )}
    </figure>
  );
}

const isWebUrl = (href?: string) => {
  try {
    return Boolean(href) && ['http:', 'https:'].includes(new URL(href!).protocol);
  } catch {
    return false;
  }
};

function renderAlertBlockquote(children: ReactNode): ReactNode {
  const list = Children.toArray(children);
  const firstIdx = list.findIndex(node => !(typeof node === 'string' && !node.trim()));
  if (firstIdx < 0) return <blockquote>{children}</blockquote>;
  const firstNode = list[firstIdx];
  if (!isValidElement<{ children?: ReactNode }>(firstNode) || firstNode.type !== 'p') {
    return <blockquote>{children}</blockquote>;
  }
  const pChildren = Children.toArray(firstNode.props.children);
  if (!pChildren.length || typeof pChildren[0] !== 'string') {
    return <blockquote>{children}</blockquote>;
  }
  const parsed = parseAlertTag(pChildren[0]);
  if (!parsed) return <blockquote>{children}</blockquote>;

  const restPChildren: ReactNode[] = [];
  if (parsed.rest) restPChildren.push(parsed.rest);
  for (let i = 1; i < pChildren.length; i++) {
    const child = pChildren[i];
    if (!restPChildren.length && isValidElement(child) && child.type === 'br') continue;
    if (!restPChildren.length && typeof child === 'string' && !child.trim()) continue;
    restPChildren.push(child);
  }

  const body: ReactNode[] = [];
  if (restPChildren.length) body.push(<p key="alert-lead">{restPChildren}</p>);
  for (let i = firstIdx + 1; i < list.length; i++) {
    body.push(list[i]);
  }
  const { label, Icon } = ALERT_META[parsed.kind];
  return (
    <aside className={`chat-alert alert-${parsed.kind}`} role="note">
      <div className="chat-alert-title">
        <Icon size={15} aria-hidden="true" />
        <span>{t(label)}</span>
      </div>
      {body.length > 0 && <div className="chat-alert-body">{body}</div>}
    </aside>
  );
}

function components(onLink?: (url: string) => void): Components {
  return {
    pre: ({ children }) => {
      const code = Array.isArray(children) ? children[0] : children;
      const props = (code as ReactElement<{ className?: string; children?: ReactNode }>)?.props || {};
      const language = /language-([\w+#.-]+)/.exec(props.className || '')?.[1]?.toLowerCase() || '';
      const raw = textOf(props.children).replace(/\n$/, '');
      if (language === 'mermaid') return <MermaidBlock code={raw} />;
      return <CodeBlock code={raw} language={language} />;
    },
    blockquote: ({ children }) => renderAlertBlockquote(children),
    a: ({ href, children }) =>
      isWebUrl(href) ? (
        <a
          href={href}
          title={href}
          onClick={event => {
            event.preventDefault();
            onLink?.(href!);
          }}
        >
          {children}
        </a>
      ) : (
        <span>{children}</span>
      ),
    img: ({ src, alt }) =>
      isWebUrl(typeof src === 'string' ? src : '') ? (
        <a
          href={src as string}
          onClick={event => {
            event.preventDefault();
            onLink?.(src as string);
          }}
        >
          {t('รูปภาพ')}: {alt || (src as string)}
        </a>
      ) : (
        <span>{alt}</span>
      ),
    table: ({ children }) => (
      <div className="chat-table">
        <table>{children}</table>
      </div>
    ),
    input: ({ checked, type }) => (type === 'checkbox' ? <input type="checkbox" checked={Boolean(checked)} readOnly disabled /> : null),
  };
}

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: [typeof rehypeKatex, Record<string, unknown>][] = [
  [rehypeKatex, { strict: false, throwOnError: false, trust: false }],
];

export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  className = '',
  onLink,
}: {
  text: string;
  className?: string;
  onLink?: (url: string) => void;
}) {
  const markdownComponents = useMemo(() => components(onLink), [onLink]);
  const prepared = useMemo(() => normalizeMarkdownMath(visibleAnswer(text)), [text]);
  return (
    <div className={'rich-text ' + className}>
      <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} skipHtml components={markdownComponents}>
        {prepared}
      </Markdown>
    </div>
  );
});
