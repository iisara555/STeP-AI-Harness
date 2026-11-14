// AI answers rendered the way Claude, ChatGPT and Cursor show them: full GitHub-flavoured Markdown (headings, lists,
// task lists, tables, quotes, inline code, links, strikethrough) and code blocks with syntax colours and a copy button.
// Raw HTML in an answer is dropped, never rendered; links open in the app's own browser panel rather than navigating
// this window; remote images are not loaded (a link is shown instead) so an answer cannot make the app fetch anything.
import { memo, useEffect, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from './icons';
import { t } from './i18n';

type Highlight = (code: string, language: string) => string;
let highlighter: Highlight | null = null;
let highlighterLoading: Promise<Highlight> | null = null;
/** highlight.js loads the first time an answer shows a code block; until then the code shows uncoloured. */
export function loadHighlighter(): Promise<Highlight> {
  highlighterLoading ||= import('./code-highlight').then(m => (highlighter = m.highlight));
  return highlighterLoading;
}
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  html: 'xml',
  svg: 'xml',
  yml: 'yaml',
  md: 'markdown',
};

/** Tool requests the app runs itself (```step-tool) are not part of what the person reads. */
export const visibleAnswer = (text: string) =>
  text.replace(/^\s{0,3}(`{3,}|~{3,})step-tool[^\n]*\n[\s\S]*?(?:^\s{0,3}\1\s*$|(?![\s\S]))/gm, '');

const textOf = (node: ReactNode): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : node && typeof node === 'object' && 'props' in node
        ? textOf((node as any).props.children)
        : '';

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const [highlightCode, setHighlightCode] = useState(() => highlighter);
  const name = ALIASES[language] || language;
  useEffect(() => {
    if (!highlightCode && name) void loadHighlighter().then(loaded => setHighlightCode(() => loaded));
  }, [highlightCode, name]);
  const html = highlightCode && name ? highlightCode(code, name) : '';
  return (
    <figure className="chat-code">
      <header>
        <span>{language || 'text'}</span>
        <button
          type="button"
          className="quiet"
          aria-label={t('คัดลอกโค้ด')}
          onClick={() =>
            void navigator.clipboard
              .writeText(code)
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
      </header>
      <pre tabIndex={0}>{html ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}</pre>
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

function components(onLink?: (url: string) => void): Components {
  return {
    pre: ({ children }) => {
      const code = Array.isArray(children) ? children[0] : children;
      const props = (code as any)?.props || {};
      const language = /language-([\w+#.-]+)/.exec(props.className || '')?.[1]?.toLowerCase() || '';
      return <CodeBlock code={textOf(props.children).replace(/\n$/, '')} language={language} />;
    },
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

export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  className = '',
  onLink,
}: {
  text: string;
  className?: string;
  onLink?: (url: string) => void;
}) {
  return (
    <div className={'rich-text ' + className}>
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components(onLink)}>
        {visibleAnswer(text)}
      </Markdown>
    </div>
  );
});
