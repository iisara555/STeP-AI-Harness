export const GOOGLE_SERVICES = {
  documents: ['drive.file'],
  'drive-read': ['drive.readonly'],
  'gmail-read': ['gmail.readonly'],
  'gmail-draft': ['gmail.compose'],
  'gmail-send': ['gmail.send'],
  calendar: ['calendar.calendarlist.readonly', 'calendar.events'],
  tasks: ['tasks'],
  chat: ['chat.spaces.readonly', 'chat.messages.readonly', 'chat.messages.create'],
  meet: ['meetings.space.readonly'],
} as const;
export type GoogleService = keyof typeof GOOGLE_SERVICES;
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
