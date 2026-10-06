import { Sparkles } from 'lucide-react';
import { t } from './i18n';
import type { ReleaseNote } from './whats-new';

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
        <header>
          <h2>
            <Sparkles size={18} /> {t('มีอะไรใหม่')}
          </h2>
        </header>
        {notes.map(note => (
          <div key={note.version}>
            <h3>{t('STeP Desktop รุ่น {0}', note.version)}</h3>
            <ul>
              {note.items().map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="proposal-actions">
          <button autoFocus onClick={onClose}>
            {t('รับทราบ')}
          </button>
        </div>
      </section>
    </div>
  );
}
