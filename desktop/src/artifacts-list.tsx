import { useState } from 'react';
import { Check, Copy, Download, Eye, FileText, X } from './icons';
import { ChatMarkdown } from './chat-markdown';
import { t } from './i18n';
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

function artifactFilename(artifact: ArtifactRef) {
  const base = (artifact.id || artifact.title || 'artifact').replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';
  if (/\.[a-z0-9]{1,8}$/i.test(base)) return base;
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

/** Under an answer: each working document the AI saved in this run, with a way to open it. */
export function ArtifactsList({ artifacts, onOpen }: { artifacts: ArtifactRef[]; onOpen: (artifact: ArtifactRef) => void }) {
  return (
    <div className="google-changes small" role="group" aria-label={t('เอกสารทำงานของผู้ช่วย')}>
      <p className="google-changes-title">
        <strong>{t('เอกสารทำงานของผู้ช่วย')}</strong> <span className="muted">{t('{0} ชิ้น', artifacts.length)}</span>
      </p>
      <ul className="written-files">
        {artifacts.map(artifact => (
          <li key={artifact.id}>
            <FileText size={13} />
            <span className="google-change-title">{artifact.title}</span>
            <span className="muted">
              {t(KIND_NAMES[artifact.kind])} · {t('ฉบับที่ {0}', artifact.version)}
            </span>
            <button className="quiet small" onClick={() => onOpen(artifact)}>
              <Eye size={13} /> {t('เปิดดู')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The artifact's saved content. Markdown is rendered without raw HTML; every other kind is shown as text. HTML artifacts
 * open in the Web tab's isolated preview instead (main process), never in this window.
 */
export function ArtifactDialog({ artifact, onClose }: { artifact: OpenedArtifact; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
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
        {artifact.kind === 'markdown' ? <ChatMarkdown text={artifact.content} /> : <pre>{artifact.content}</pre>}
      </section>
    </div>
  );
}
