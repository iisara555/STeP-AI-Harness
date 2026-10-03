// AI answers rendered the way Claude, ChatGPT and Cursor show them: full GitHub-flavoured Markdown (headings, lists,
// task lists, tables, quotes, inline code, links, strikethrough) and code blocks with syntax colours and a copy button.
// Raw HTML in an answer is dropped, never rendered; links open in the app's own browser panel rather than navigating
// this window; remote images are not loaded (a link is shown instead) so an answer cannot make the app fetch anything.
import { memo, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Check, Copy } from 'lucide-react';
import { t } from './i18n';

for (const [name, language] of Object.entries({ bash, css, javascript, json, markdown, python, sql, typescript, xml, yaml }))
  hljs.registerLanguage(name, language);
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
  const name = ALIASES[language] || language;
  // highlight.js escapes the code itself; its output only adds <span class="hljs-..."> around tokens.
  const html = name && hljs.getLanguage(name) ? hljs.highlight(code, { language: name, ignoreIllegals: true }).value : '';
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
      <pre>{html ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}</pre>
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
