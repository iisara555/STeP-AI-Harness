import { CalendarDays, ExternalLink, FileText, Folder, ListChecks, Mail, MessageSquare } from './icons';
import { googleChangeLabel, type GoogleChange, type GooglePage } from './google-changes';
import { t } from './i18n';

const SERVICE_NAMES: Record<GooglePage, string> = {
  gmail: 'Gmail',
  drive: 'Drive',
  docs: 'Docs',
  sheets: 'Sheets',
  slides: 'Slides',
  calendar: 'Calendar',
  tasks: 'Tasks',
  chat: 'Chat',
  meet: 'Meet',
  contacts: 'Contacts',
  forms: 'Forms',
  scripts: 'Apps Script',
};

function ServiceIcon({ service }: { service: GooglePage }) {
  if (service === 'gmail') return <Mail size={13} />;
  if (service === 'calendar') return <CalendarDays size={13} />;
  if (service === 'tasks') return <ListChecks size={13} />;
  if (service === 'chat') return <MessageSquare size={13} />;
  if (service === 'drive') return <Folder size={13} />;
  return <FileText size={13} />;
}

/** Under an answer: each file, email, event or message the AI created or changed in Google, with a way to open it. */
export function GoogleChangesList({ changes, onOpen }: { changes: GoogleChange[]; onOpen: (change: GoogleChange) => void }) {
  return (
    <div className="google-changes small" role="group" aria-label={t('สิ่งที่ทำใน Google Workspace')}>
      <p className="google-changes-title">
        <strong>{t('สิ่งที่ทำใน Google Workspace')}</strong> <span className="muted">{t('{0} อย่าง', changes.length)}</span>
      </p>
      <ul className="written-files">
        {changes.map((change, index) => (
          <li key={index}>
            <ServiceIcon service={change.service} />
            <span>{t(googleChangeLabel(change.operation))}</span>
            {change.title && <span className="google-change-title">{change.title}</span>}
            <button className="quiet small" onClick={() => onOpen(change)}>
              <ExternalLink size={13} /> {change.url ? t('เปิดดู') : t('เปิดใน {0}', SERVICE_NAMES[change.service])}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
