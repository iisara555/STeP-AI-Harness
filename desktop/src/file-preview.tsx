import { ExternalLink } from './icons';
import { t } from './i18n';
import { OPEN_EXTERNALLY, fileExtension } from './file-kinds';

type PreviewBlock =
  { kind: 'heading' | 'paragraph'; text: string } | { kind: 'table'; rows: string[][] } | { kind: 'section'; title: string };
export type FilePreviewData =
  { kind: 'document' | 'sheet' | 'slides'; blocks: PreviewBlock[]; truncated: boolean } | { kind: 'image'; url: string } | null;

/** The preview as plain text, for "ใช้เนื้อหาใน Chat". */
export function previewText(data: FilePreviewData) {
  if (!data || data.kind === 'image') return '';
  return data.blocks
    .map(b =>
      b.kind === 'table'
        ? b.rows.map(r => r.join('\t')).join('\n')
        : b.kind === 'section'
          ? `## ${data.kind === 'slides' ? t('สไลด์ที่ {0}', b.title) : b.title}`
          : b.text,
    )
    .join('\n\n');
}

/**
 * Read-only view of a workspace file the Files tab cannot edit as text: Word, Excel and PowerPoint as structured text,
 * pictures as images, and anything else as a button to open it in the computer's own app (documents and media only).
 */
export function FilePreview({
  path,
  data,
  busy,
  onOpen,
  onSource,
}: {
  path: string;
  data: FilePreviewData;
  busy: boolean;
  onOpen: () => void;
  onSource: (text: string) => void;
}) {
  const name = path.split(/[/\\]/).pop() || path;
  const canOpen = OPEN_EXTERNALLY.has(fileExtension(path));
  const text = previewText(data);
  return (
    <section className="file-preview" aria-label={t('ดูไฟล์ {0}', name)}>
      <header>
        <strong title={path}>{name}</strong>
        <div className="tool-actions">
          {text && (
            <button className="quiet" disabled={busy} onClick={() => onSource(`File: ${path}\n\n${text}`)}>
              {t('ใช้เนื้อหาใน Chat')}
            </button>
          )}
          {canOpen && (
            <button className="quiet" disabled={busy} onClick={onOpen}>
              <ExternalLink size={14} />
              {t('เปิดด้วยโปรแกรมในเครื่อง')}
            </button>
          )}
        </div>
      </header>
      {!data ? (
        <p className="muted small">
          {canOpen ? t('ไฟล์ชนิดนี้ยังแสดงในแอปไม่ได้ เปิดด้วยโปรแกรมในเครื่องแทนได้') : t('ไฟล์ชนิดนี้เปิดในแอปไม่ได้')}
        </p>
      ) : data.kind === 'image' ? (
        <img className="file-preview-image" src={data.url} alt={name} />
      ) : (
        <div className={`file-preview-body ${data.kind}`}>
          <p className="muted small">{t('ดูอย่างเดียว ตัวอักษร สี และรูปภาพในไฟล์อาจไม่แสดงตรงกับโปรแกรมต้นฉบับ')}</p>
          {data.blocks.length === 0 && <p className="muted small">{t('ไม่พบข้อความในไฟล์นี้')}</p>}
          {data.blocks.map((block, index) =>
            block.kind === 'section' ? (
              <h4 key={index}>{data.kind === 'slides' ? t('สไลด์ที่ {0}', block.title) : t('ชีต {0}', block.title)}</h4>
            ) : block.kind !== 'table' ? (
              block.kind === 'heading' ? (
                <h5 key={index}>{block.text}</h5>
              ) : (
                <p key={index}>{block.text}</p>
              )
            ) : (
              <div key={index} className="file-preview-table">
                <table>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          )}
          {data.truncated && <p className="muted small">{t('ไฟล์ยาว แสดงเฉพาะส่วนต้น เปิดด้วยโปรแกรมในเครื่องเพื่อดูทั้งหมด')}</p>}
        </div>
      )}
    </section>
  );
}
