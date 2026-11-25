import { computeDraftDiff } from './draft-diff';
import { t } from './i18n';

/** Renders grouped line-level additions and removals between two draft revisions. */
export function DraftDiffView({ before, after, emptyLabel }: { before: string; after: string; emptyLabel?: string }) {
  const diff = computeDraftDiff(before, after);
  if (!diff.changed) {
    return <p className="small muted draft-diff-empty">{emptyLabel || t('ไม่พบความแตกต่างจากฉบับปัจจุบัน')}</p>;
  }
  return (
    <div className="draft-diff" role="region" aria-label={t('ความแตกต่างของร่าง')}>
      {diff.hunks.map((hunk, hunkIdx) => (
        <div className="draft-diff-hunk" key={hunkIdx}>
          {hunk.skippedBefore > 0 && <div className="draft-diff-sep">{t('… ซ่อน {0} บรรทัดที่ไม่เปลี่ยนแปลง …', hunk.skippedBefore)}</div>}
          {hunk.lines.map((line, lineIdx) => (
            <div className={'draft-diff-line ' + line.kind} key={lineIdx}>
              <span className="draft-diff-marker" aria-hidden="true">
                {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}
              </span>
              <span className="draft-diff-text">{line.text || '\u00a0'}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
