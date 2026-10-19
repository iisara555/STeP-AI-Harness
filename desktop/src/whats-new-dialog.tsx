import { Sparkles } from './icons';
import { t } from './i18n';
import type { ReleaseNote } from './whats-new';
import { ThaiText } from './thai-text';

function Note({ note }: { note: ReleaseNote }) {
  return (
    <div>
      <h3>{t('STeP Desktop รุ่น {0}', note.version)}</h3>
      <ul>
        {note.items().map(item => (
          <li key={item}>
            <ThaiText text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "What's new" after an update: the notes of each version since the one the person last saw. */
export function WhatsNewDialog({ notes, onClose }: { notes: ReleaseNote[]; onClose: () => void }) {
  return (
    <div
      className="dialog-backdrop"
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-label={t('มีอะไรใหม่')} className="attachment-dialog whats-new">
        <h2>
          <Sparkles size={18} /> {t('มีอะไรใหม่')}
        </h2>
        <div className="whats-new-notes" tabIndex={0} aria-label={t('รายการที่เปลี่ยน')}>
          {/* The newest version open; older ones folded, so a long history does not bury what changed now. */}
          {notes.slice(0, 1).map(note => (
            <Note key={note.version} note={note} />
          ))}
          {notes.length > 1 && (
            <details className="whats-new-older">
              <summary>{t('รุ่นก่อนหน้า ({0} รุ่น)', notes.length - 1)}</summary>
              {notes.slice(1).map(note => (
                <Note key={note.version} note={note} />
              ))}
            </details>
          )}
        </div>
        <div className="proposal-actions">
          <button autoFocus onClick={onClose}>
            {t('รับทราบ')}
          </button>
        </div>
      </section>
    </div>
  );
}
