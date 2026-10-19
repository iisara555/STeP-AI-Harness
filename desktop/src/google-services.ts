export const GOOGLE_SERVICES = {
  documents: ['drive.file'],
  'drive-read': ['drive.readonly'],
  'gmail-read': ['gmail.readonly'],
  'gmail-draft': ['gmail.compose'],
  'gmail-send': ['gmail.send'],
  // Read-only Calendar is the release default; `calendar` adds event creation for cohorts an administrator approves.
  'calendar-read': ['calendar.calendarlist.readonly', 'calendar.events.readonly'],
  calendar: ['calendar.calendarlist.readonly', 'calendar.events'],
  tasks: ['tasks'],
  chat: ['chat.spaces.readonly', 'chat.messages.readonly', 'chat.messages.create'],
  meet: ['meetings.space.readonly'],
  // Separate service intent is retained alongside OAuth scopes: Gmail compose/modify can also send at Google.
  'gmail-manage': ['gmail.modify'],
  drive: ['drive'],
  docs: ['documents'],
  sheets: ['spreadsheets'],
  slides: ['presentations'],
  forms: ['forms.body', 'forms.responses.readonly'],
  appscript: ['script.projects', 'script.deployments', 'script.processes'],
} as const;
export type GoogleService = keyof typeof GOOGLE_SERVICES;
export const LEGACY_GOOGLE_SERVICES: GoogleService[] = [
  'documents',
  'drive-read',
  'gmail-read',
  'gmail-draft',
  'gmail-send',
  'calendar-read',
  'calendar',
  'tasks',
  'chat',
  'meet',
];
export const DEFAULT_GOOGLE_SERVICES: GoogleService[] = [
  'documents',
  'docs',
  'sheets',
  'slides',
  'drive-read',
  'drive',
  'gmail-read',
  'gmail-draft',
  'gmail-send',
  'gmail-manage',
  'forms',
  'appscript',
  'calendar-read',
  'tasks',
];

const broaderScopes: Record<string, string[]> = {
  'drive.file': ['drive'],
  'drive.readonly': ['drive'],
  'documents.readonly': ['documents'],
  'spreadsheets.readonly': ['spreadsheets'],
  'presentations.readonly': ['presentations'],
  'gmail.readonly': ['gmail.modify'],
  'gmail.compose': ['gmail.modify'],
  'gmail.send': ['gmail.compose', 'gmail.modify'],
  'calendar.events.readonly': ['calendar.events'],
  'forms.body.readonly': ['forms.body'],
  'script.projects.readonly': ['script.projects'],
  'script.deployments.readonly': ['script.deployments'],
};
export const hasGoogleScope = (granted: string[], required: string) => {
  const name = required.replace('https://www.googleapis.com/auth/', '');
  if (name === 'userinfo.email' && granted.includes('email')) return true;
  return [name, ...(broaderScopes[name] || [])].some(s => granted.includes('https://www.googleapis.com/auth/' + s));
};
export const googleScopes = (services: GoogleService[]) => [
  'openid',
  'email',
  ...new Set(services.flatMap(service => GOOGLE_SERVICES[service].map(scope => 'https://www.googleapis.com/auth/' + scope))),
];
export const GOOGLE_PAGES = {
  gmail: 'https://mail.google.com/',
  drive: 'https://drive.google.com/',
  docs: 'https://docs.google.com/document/',
  sheets: 'https://docs.google.com/spreadsheets/',
  slides: 'https://docs.google.com/presentation/',
  calendar: 'https://calendar.google.com/',
  tasks: 'https://tasks.google.com/',
  chat: 'https://chat.google.com/',
  meet: 'https://meet.google.com/',
  contacts: 'https://contacts.google.com/',
  forms: 'https://docs.google.com/forms/',
  scripts: 'https://script.google.com/',
} as const;
