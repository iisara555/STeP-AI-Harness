import { useMemo, useState } from 'react';
import { Check, Copy, Download, Eye, FileText, X } from './icons';
import { ChatMarkdown, useDarkTheme } from './chat-markdown';
import { t } from './i18n';
import { buildSandboxedHtmlSrc } from './inline-preview';
import type { ArtifactRef } from './types';

export type OpenedArtifact = ArtifactRef & { content: string };

const ARTIFACT_EXTENSIONS: Record<ArtifactRef['kind'], string> = {
  markdown: 'md',
  html: 'html',
  mermaid: 'mmd',
  table: 'txt',
  code: 'txt',
  json: 'json',
};

function artifactFilename(artifact: OpenedArtifact) {
  const base = (artifact.id || artifact.title || 'artifact').replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';
  if (/\.[a-z0-9]{1,8}$/i.test(base)) return base;
  if (artifact.kind === 'code') {
    const lang = detectCodeLanguage(artifact);
    if (lang && lang !== 'text') return `${base}.${lang === 'python' ? 'py' : lang}`;
  }
  return `${base}.${ARTIFACT_EXTENSIONS[artifact.kind] || 'txt'}`;
}

function downloadArtifact(artifact: OpenedArtifact) {
  const mime = artifact.kind === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
  const blob = new Blob([artifact.content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = artifactFilename(artifact);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const KIND_NAMES: Record<ArtifactRef['kind'], string> = {
  markdown: 'เอกสาร',
  html: 'หน้าเว็บ HTML',
  mermaid: 'แผนภาพ Mermaid',
  table: 'ตาราง',
  code: 'โค้ด',
  json: 'JSON',
};

/** A static preview of an HTML artifact: sandbox="" runs no scripts; the Web tab is where the page works. */
function InlineHtmlFrame({ html, title, dark }: { html: string; title: string; dark: boolean }) {
  const src = useMemo(() => buildSandboxedHtmlSrc(html, dark), [html, dark]);
  return <iframe className="chat-preview-frame chat-html-frame" title={title} sandbox="" src={src} />;
}

/** Under an answer: each working document the AI saved in this run, with a way to open it. */
export function ArtifactsList({
  artifacts,
  onOpen,
  onInlineHtml,
}: {
  artifacts: ArtifactRef[];
  onOpen: (artifact: ArtifactRef) => void;
  onInlineHtml?: (artifact: ArtifactRef) => Promise<OpenedArtifact | null>;
}) {
  const dark = useDarkTheme();
  const [inlinePreviews, setInlinePreviews] = useState<Record<string, OpenedArtifact>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const toggleInline = async (artifact: ArtifactRef) => {
    const key = `${artifact.id}@${artifact.version}`;
    if (inlinePreviews[key]) {
      setInlinePreviews(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    if (!onInlineHtml) return;
    setLoadingKey(key);
    try {
      const opened = await onInlineHtml(artifact);
      if (opened?.content) {
        setInlinePreviews(prev => ({ ...prev, [key]: opened }));
      }
    } finally {
      setLoadingKey(cur => (cur === key ? null : cur));
    }
  };

  return (
    <div className="google-changes small" role="group" aria-label={t('เอกสารทำงานของผู้ช่วย')}>
      <p className="google-changes-title">
        <strong>{t('เอกสารทำงานของผู้ช่วย')}</strong> <span className="muted">{t('{0} ชิ้น', artifacts.length)}</span>
      </p>
      <ul className="written-files">
        {artifacts.map(artifact => {
          const key = `${artifact.id}@${artifact.version}`;
          const previewing = Boolean(inlinePreviews[key]);
          return (
            <li key={artifact.id}>
              <FileText size={13} />
              <span className="google-change-title">{artifact.title}</span>
              <span className="muted">
                {t(KIND_NAMES[artifact.kind])} · {t('ฉบับที่ {0}', artifact.version)}
              </span>
              {artifact.kind === 'html' && onInlineHtml && (
                <button type="button" className="quiet small" disabled={loadingKey === key} onClick={() => void toggleInline(artifact)}>
                  <Eye size={13} /> {previewing ? t('ซ่อนตัวอย่าง') : t('ดูในแชต')}
                </button>
              )}
              <button className="quiet small" onClick={() => onOpen(artifact)}>
                <Eye size={13} /> {t('เปิดดู')}
              </button>
            </li>
          );
        })}
      </ul>
      {Object.entries(inlinePreviews).map(([key, opened]) => (
        <div key={key} className="inline-artifact-preview">
          <header>
            <strong>{opened.title}</strong>
            <span className="muted">{t('ฉบับที่ {0}', opened.version)}</span>
            <div className="chat-code-actions">
              <button type="button" className="quiet small" onClick={() => onOpen(opened)}>
                <Eye size={13} /> {t('เปิดในแท็บเว็บ')}
              </button>
              <button type="button" className="quiet small" onClick={() => downloadArtifact(opened)}>
                <Download size={13} /> {t('ดาวน์โหลดไฟล์')}
              </button>
              <button
                type="button"
                className="icon"
                aria-label={t('ปิด')}
                title={t('ปิด')}
                onClick={() =>
                  setInlinePreviews(prev => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  })
                }
              >
                <X size={13} />
              </button>
            </div>
          </header>
          <InlineHtmlFrame html={opened.content} title={opened.title} dark={dark} />
          <p className="chat-preview-note small muted">{t('ภาพนิ่ง ไม่รันสคริปต์')}</p>
        </div>
      ))}
    </div>
  );
}

function detectCodeLanguage(artifact: OpenedArtifact) {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(artifact.id || artifact.title || '')?.[1]?.toLowerCase();
  if (ext) return ext;
  const trimmed = artifact.content.trim();
  if (/^\s*\{[\s\S]*\}\s*$|^\s*\[[\s\S]*\]\s*$/.test(trimmed)) return 'json';
  if (/^\s*(?:import|export|const|let|function|interface|type)\b/m.test(trimmed)) return 'ts';
  if (/^\s*(?:def|class|from\s+\w+\s+import)\b/m.test(trimmed)) return 'python';
  if (/^\s*<(!DOCTYPE|html|svg)/i.test(trimmed)) return 'html';
  return 'text';
}

function parseDelimitedTable(content: string): string[][] | null {
  const lines = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  if (lines[0].includes('|') && /^\|?[\s:-]+\|/.test(lines[1])) return null; // Markdown table handled by ChatMarkdown.
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : '';
  if (!delimiter) return null;
  const rows = lines.map(line => line.split(delimiter).map(cell => cell.trim().replace(/^"|"$/g, '')));
  return rows[0].length >= 2 ? rows : null;
}

function fenced(code: string, lang: string) {
  const fence = code.includes('```') ? '~~~~' : '```';
  return `${fence}${lang}\n${code}\n${fence}`;
}

/**
 * The artifact's saved content. Markdown, code, JSON and tables render cleanly without raw HTML; HTML artifacts
 * work in the Web tab's isolated preview (main process). In this window they are only ever a script-free picture.
 */
export function ArtifactDialog({
  artifact,
  onLink,
  onClose,
}: {
  artifact: OpenedArtifact;
  onLink?: (url: string) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const renderBody = () => {
    if (artifact.kind === 'markdown') return <ChatMarkdown text={artifact.content} onLink={onLink} />;
    if (artifact.kind === 'json') {
      let formatted = artifact.content;
      try {
        formatted = JSON.stringify(JSON.parse(artifact.content), null, 2);
      } catch {
        /* Show raw text when malformed JSON. */
      }
      return <ChatMarkdown text={fenced(formatted, 'json')} onLink={onLink} />;
    }
    if (artifact.kind === 'code') {
      return <ChatMarkdown text={fenced(artifact.content, detectCodeLanguage(artifact))} onLink={onLink} />;
    }
    if (artifact.kind === 'table') {
      const rows = parseDelimitedTable(artifact.content);
      if (rows) {
        const [header, ...body] = rows;
        return (
          <div className="chat-table">
            <table>
              <thead>
                <tr>
                  {header.map((cell, i) => (
                    <th key={i}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r}>
                    {header.map((_, c) => (
                      <td key={c}>{row[c] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      return <ChatMarkdown text={artifact.content} onLink={onLink} />;
    }
    if (artifact.kind === 'mermaid') {
      return <ChatMarkdown text={fenced(artifact.content, 'mermaid')} onLink={onLink} />;
    }
    return <pre>{artifact.content}</pre>;
  };
  return (
    <div
      className="dialog-backdrop"
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-label={artifact.title} className="attachment-dialog artifact-dialog">
        <header>
          <h2>{artifact.title}</h2>
          <button className="icon" autoFocus onClick={onClose} title={t('ปิด')}>
            <X />
          </button>
        </header>
        <p className="small muted">
          {t(KIND_NAMES[artifact.kind])} · {t('ฉบับที่ {0}', artifact.version)} · {t('ผู้ช่วยเขียนเอกสารนี้ ตรวจก่อนนำไปใช้')}
        </p>
        <div className="tool-actions">
          <button
            className="quiet small"
            onClick={() => {
              void navigator.clipboard?.writeText(artifact.content).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => {},
              );
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? t('คัดลอกแล้ว') : t('คัดลอก')}
          </button>
          <button className="quiet small" onClick={() => downloadArtifact(artifact)}>
            <Download size={13} /> {t('ดาวน์โหลดไฟล์')}
          </button>
        </div>
        {renderBody()}
      </section>
    </div>
  );
}
