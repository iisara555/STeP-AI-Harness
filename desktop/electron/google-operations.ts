import { createHash, randomUUID } from 'node:crypto';
import { googleId as id, googleText as text, googleExact as exact } from './google-validation';
import { EXTENDED_GOOGLE_OPERATIONS, extendedGoogleCatalog, type ExtendedGoogleOperation } from './google-extended-operations';
import type { GoogleService } from '../src/google-services';
import { googleMailMessage } from './google-mail';
const scope = (name: string) => 'https://www.googleapis.com/auth/' + name;
export const GOOGLE_OPERATIONS = [
  'drive.list',
  'docs.get',
  'docs.create',
  'docs.appendText',
  'sheets.get',
  'sheets.values.get',
  'sheets.create',
  'sheets.values.update',
  'slides.get',
  'slides.create',
  'slides.appendTextSlide',
  'gmail.list',
  'gmail.get',
  'gmail.draft',
  'gmail.send',
  'calendar.list',
  'calendar.events',
  'calendar.createEvent',
  'tasks.lists',
  'tasks.list',
  'tasks.create',
  'tasks.complete',
  'chat.spaces',
  'chat.messages',
  'chat.send',
  'meet.get',
  ...(Object.keys(EXTENDED_GOOGLE_OPERATIONS) as ExtendedGoogleOperation[]),
] as const;
export type GoogleOperation = (typeof GOOGLE_OPERATIONS)[number];
/** Discovery gives models the actual bounded contract instead of asking them to invent API arguments. */
const legacyGoogleCatalog: [string, string[], string[]][] = [
  ['drive.list', ['query?', 'pageToken?'], []],
  ['docs.get', ['documentId'], []],
  ['docs.create', [], ['title']],
  ['docs.appendText', ['documentId'], ['text', 'requiredRevisionId']],
  ['sheets.get', ['spreadsheetId'], []],
  ['sheets.values.get', ['spreadsheetId', 'range'], []],
  ['sheets.create', [], ['title']],
  [
    'sheets.values.update',
    ['spreadsheetId', 'range (explicit A1:B2 rectangle)'],
    ['values (RAW, at most 500 scalar cells matching the rectangle)'],
  ],
  ['slides.get', ['presentationId'], []],
  ['slides.create', [], ['title']],
  ['slides.appendTextSlide', ['presentationId'], ['text', 'requiredRevisionId']],
  ['gmail.list', ['query?', 'pageToken?'], []],
  ['gmail.get', ['messageId'], []],
  ['gmail.draft', [], ['to (email array)', 'subject', 'text', 'cc?', 'bcc?', 'threadId?', 'inReplyTo?']],
  ['gmail.send', [], ['to (email array)', 'subject', 'text', 'cc?', 'bcc?', 'threadId?', 'inReplyTo?']],
  ['calendar.list', ['pageToken?'], []],
  ['calendar.events', ['calendarId', 'timeMin (RFC3339)', 'timeMax (RFC3339)', 'pageToken?'], []],
  [
    'calendar.createEvent',
    ['calendarId'],
    ['summary', 'text?', 'start (RFC3339 with offset)', 'end (RFC3339 with offset)', 'attendees? (email array)'],
  ],
  ['tasks.lists', ['pageToken?'], []],
  ['tasks.list', ['tasklistId', 'pageToken?'], []],
  ['tasks.create', ['tasklistId'], ['title', 'text?']],
  ['tasks.complete', ['tasklistId', 'taskId'], []],
  ['chat.spaces', ['pageToken?'], []],
  ['chat.messages', ['spaceId', 'pageToken?'], []],
  ['chat.send', ['spaceId'], ['text']],
  ['meet.get', ['spaceId'], []],
];
export const googleOperationCatalog = legacyGoogleCatalog
  .map(([operation, params, body]) => ({ operation, params, body }))
  .concat(extendedGoogleCatalog);
export type GoogleRequest = { operation: GoogleOperation; params?: Record<string, any>; body?: Record<string, any> };
export function googleOperationServices(operation: string, write: boolean): GoogleService[] {
  const [service] = operation.split('.');
  if (service === 'gmail') {
    if (operation === 'gmail.send') return ['gmail-send'];
    if (operation === 'gmail.draft' || operation === 'gmail.drafts.delete' || operation === 'gmail.drafts.update') return ['gmail-draft'];
    if (operation.startsWith('gmail.drafts.')) return ['gmail-read', 'gmail-draft'];
    if (write) return ['gmail-manage'];
    return ['gmail-read'];
  }
  if (service === 'drive') return write ? ['drive'] : ['documents', 'drive-read', 'drive'];
  if (service === 'docs' || service === 'sheets' || service === 'slides')
    return write ? ['documents', service, 'drive'] : ['documents', service, 'drive-read', 'drive'];
  if (service === 'calendar') return write ? ['calendar'] : ['calendar-read', 'calendar'];
  if (['tasks', 'chat', 'meet', 'forms', 'appscript'].includes(service)) return [service as GoogleService];
  throw new Error('GOOGLE_OPERATION_UNSUPPORTED');
}
export function googleInvocation(request: GoogleRequest) {
  exact(request, ['operation', 'params', 'body']);
  if (!GOOGLE_OPERATIONS.includes(request.operation)) throw new Error('GOOGLE_OPERATION_UNSUPPORTED');
  const p = request.params || {},
    b = request.body || {};
  if (Object.hasOwn(EXTENDED_GOOGLE_OPERATIONS, request.operation)) {
    const definition = EXTENDED_GOOGLE_OPERATIONS[request.operation as ExtendedGoogleOperation];
    const call = definition.invoke(p, b);
    const method = call.method || 'GET';
    return {
      ...call,
      method,
      operation: request.operation,
      scopes: definition.scopes.map(scope),
      services: googleOperationServices(request.operation, method !== 'GET'),
      write: method !== 'GET',
      digest: createHash('sha256')
        .update(JSON.stringify([request.operation, call.url, method, call.body, call.payload, call.preflight]))
        .digest('hex'),
      preview: JSON.stringify(request),
    };
  }
  let url = '',
    method = 'GET',
    body: object | undefined;
  let scopes: string[] = [];
  const docRead = ['drive.file', 'drive.readonly', 'drive'];
  const page = () => {
    if (p.pageToken !== undefined) return text(p.pageToken, 2000);
    return '';
  };
  switch (request.operation) {
    case 'drive.list':
      exact(p, ['query', 'pageToken']);
      exact(b, []);
      url =
        'https://www.googleapis.com/drive/v3/files?' +
        new URLSearchParams({
          pageSize: '20',
          fields: 'nextPageToken,files(id,name,mimeType,webViewLink,capabilities)',
          q: p.query ? text(p.query, 500) : 'trashed = false',
          pageToken: page(),
        });
      scopes = docRead;
      break;
    case 'docs.get':
      exact(p, ['documentId']);
      exact(b, []);
      url = 'https://docs.googleapis.com/v1/documents/' + id(p.documentId);
      scopes = [...docRead, 'documents', 'documents.readonly'];
      break;
    case 'docs.create':
      exact(p, []);
      exact(b, ['title']);
      url = 'https://docs.googleapis.com/v1/documents';
      method = 'POST';
      body = { title: text(b.title, 200) };
      scopes = ['drive.file', 'documents', 'drive'];
      break;
    case 'docs.appendText':
      exact(p, ['documentId']);
      exact(b, ['text', 'requiredRevisionId']);
      url = 'https://docs.googleapis.com/v1/documents/' + id(p.documentId) + ':batchUpdate';
      method = 'POST';
      body = {
        writeControl: { requiredRevisionId: text(b.requiredRevisionId, 2000) },
        requests: [{ insertText: { endOfSegmentLocation: {}, text: text(b.text) } }],
      };
      scopes = ['drive.file', 'documents', 'drive'];
      break;
    case 'sheets.get':
      exact(p, ['spreadsheetId']);
      exact(b, []);
      url = 'https://sheets.googleapis.com/v4/spreadsheets/' + id(p.spreadsheetId) + '?includeGridData=false';
      scopes = [...docRead, 'spreadsheets', 'spreadsheets.readonly'];
      break;
    case 'sheets.values.get':
      exact(p, ['spreadsheetId', 'range']);
      exact(b, []);
      url = 'https://sheets.googleapis.com/v4/spreadsheets/' + id(p.spreadsheetId) + '/values/' + encodeURIComponent(text(p.range, 200));
      scopes = [...docRead, 'spreadsheets', 'spreadsheets.readonly'];
      break;
    case 'sheets.create':
      exact(p, []);
      exact(b, ['title']);
      url = 'https://sheets.googleapis.com/v4/spreadsheets';
      method = 'POST';
      body = { properties: { title: text(b.title, 200) } };
      scopes = ['drive.file', 'spreadsheets', 'drive'];
      break;
    case 'sheets.values.update': {
      exact(p, ['spreadsheetId', 'range']);
      exact(b, ['values']);
      if (
        !Array.isArray(b.values) ||
        !b.values.length ||
        b.values.length > 100 ||
        b.values.some(
          (row: any) =>
            !Array.isArray(row) ||
            !row.length ||
            row.length !== b.values[0].length ||
            row.some(
              (v: any) =>
                !(
                  v === null ||
                  typeof v === 'boolean' ||
                  (typeof v === 'number' && Number.isFinite(v)) ||
                  (typeof v === 'string' && v.length <= 5000)
                ),
            ),
        )
      )
        throw new Error('INVALID_GOOGLE_INPUT');
      if (b.values.length * b.values[0].length > 500) throw new Error('INVALID_GOOGLE_INPUT');
      const range = /^(?:(?:'(?:[^']|'')+'|[^!\[\]\x00-\x1f]{1,100})!)?([A-Z]{1,3})([1-9]\d{0,6}):([A-Z]{1,3})([1-9]\d{0,6})$/.exec(
        text(p.range, 200),
      );
      const col = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      if (!range || Number(range[4]) - Number(range[2]) + 1 !== b.values.length || col(range[3]) - col(range[1]) + 1 !== b.values[0].length)
        throw new Error('INVALID_GOOGLE_INPUT');
      url =
        'https://sheets.googleapis.com/v4/spreadsheets/' +
        id(p.spreadsheetId) +
        '/values/' +
        encodeURIComponent(p.range) +
        '?valueInputOption=RAW';
      method = 'PUT';
      body = { values: b.values };
      scopes = ['drive.file', 'spreadsheets', 'drive'];
      break;
    }
    case 'slides.get':
      exact(p, ['presentationId']);
      exact(b, []);
      url = 'https://slides.googleapis.com/v1/presentations/' + id(p.presentationId);
      scopes = [...docRead, 'presentations', 'presentations.readonly'];
      break;
    case 'slides.create':
      exact(p, []);
      exact(b, ['title']);
      url = 'https://slides.googleapis.com/v1/presentations';
      method = 'POST';
      body = { title: text(b.title, 200) };
      scopes = ['drive.file', 'presentations', 'drive'];
      break;
    case 'slides.appendTextSlide': {
      exact(p, ['presentationId']);
      exact(b, ['text', 'requiredRevisionId']);
      const slide = 'step_' + randomUUID().replaceAll('-', ''),
        box = 'step_' + randomUUID().replaceAll('-', '');
      url = 'https://slides.googleapis.com/v1/presentations/' + id(p.presentationId) + ':batchUpdate';
      method = 'POST';
      scopes = ['drive.file', 'presentations', 'drive'];
      body = {
        writeControl: { requiredRevisionId: text(b.requiredRevisionId, 2000) },
        requests: [
          { createSlide: { objectId: slide, slideLayoutReference: { predefinedLayout: 'BLANK' } } },
          {
            createShape: {
              objectId: box,
              shapeType: 'TEXT_BOX',
              elementProperties: {
                pageObjectId: slide,
                size: { width: { magnitude: 600, unit: 'PT' }, height: { magnitude: 300, unit: 'PT' } },
                transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 30, unit: 'PT' },
              },
            },
          },
          { insertText: { objectId: box, text: text(b.text) } },
        ],
      };
      break;
    }
    case 'gmail.list':
      exact(p, ['query', 'pageToken']);
      exact(b, []);
      url =
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?' +
        new URLSearchParams({ maxResults: '20', q: p.query ? text(p.query, 500) : '', pageToken: page() });
      scopes = ['gmail.readonly', 'gmail.modify'];
      break;
    case 'gmail.get':
      exact(p, ['messageId']);
      exact(b, []);
      url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id(p.messageId) + '?format=full';
      scopes = ['gmail.readonly', 'gmail.modify'];
      break;
    case 'gmail.draft':
    case 'gmail.send': {
      exact(p, []);
      const message = googleMailMessage(b);
      method = 'POST';
      const draft = request.operation === 'gmail.draft';
      url = 'https://gmail.googleapis.com/gmail/v1/users/me/' + (draft ? 'drafts' : 'messages/send');
      body = draft ? { message } : message;
      scopes = draft ? ['gmail.compose', 'gmail.modify'] : ['gmail.send', 'gmail.compose', 'gmail.modify'];
      break;
    }
    case 'calendar.list':
      exact(p, ['pageToken']);
      exact(b, []);
      url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList?' + new URLSearchParams({ maxResults: '20', pageToken: page() });
      scopes = ['calendar.calendarlist.readonly'];
      break;
    case 'calendar.events':
      exact(p, ['calendarId', 'timeMin', 'timeMax', 'pageToken']);
      exact(b, []);
      url =
        'https://www.googleapis.com/calendar/v3/calendars/' +
        encodeURIComponent(text(p.calendarId, 254)) +
        '/events?' +
        new URLSearchParams({
          maxResults: '20',
          singleEvents: 'true',
          timeMin: text(p.timeMin, 50),
          timeMax: text(p.timeMax, 50),
          pageToken: page(),
        });
      scopes = ['calendar.events', 'calendar.events.readonly'];
      break;
    case 'calendar.createEvent': {
      exact(p, ['calendarId']);
      exact(b, ['summary', 'text', 'start', 'end', 'attendees']);
      if (
        !Number.isFinite(Date.parse(b.start)) ||
        !Number.isFinite(Date.parse(b.end)) ||
        Date.parse(b.end) <= Date.parse(b.start) ||
        !/(Z|[+-]\d{2}:\d{2})$/.test(b.start) ||
        !/(Z|[+-]\d{2}:\d{2})$/.test(b.end)
      )
        throw new Error('INVALID_GOOGLE_INPUT');
      if (
        b.attendees !== undefined &&
        (!Array.isArray(b.attendees) ||
          b.attendees.length > 20 ||
          b.attendees.some((v: any) => typeof v !== 'string' || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v)))
      )
        throw new Error('INVALID_GOOGLE_INPUT');
      url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(text(p.calendarId, 254)) + '/events?sendUpdates=all';
      method = 'POST';
      scopes = ['calendar.events'];
      body = {
        summary: text(b.summary, 200),
        ...(b.text ? { description: text(b.text) } : {}),
        start: { dateTime: b.start },
        end: { dateTime: b.end },
        ...(b.attendees ? { attendees: b.attendees.map((email: string) => ({ email })) } : {}),
      };
      break;
    }
    case 'tasks.lists':
      exact(p, ['pageToken']);
      exact(b, []);
      url = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?' + new URLSearchParams({ maxResults: '20', pageToken: page() });
      scopes = ['tasks'];
      break;
    case 'tasks.list':
      exact(p, ['tasklistId', 'pageToken']);
      exact(b, []);
      url =
        'https://tasks.googleapis.com/tasks/v1/lists/' +
        id(p.tasklistId) +
        '/tasks?' +
        new URLSearchParams({ maxResults: '20', pageToken: page() });
      scopes = ['tasks'];
      break;
    case 'tasks.create':
      exact(p, ['tasklistId']);
      exact(b, ['title', 'text']);
      url = 'https://tasks.googleapis.com/tasks/v1/lists/' + id(p.tasklistId) + '/tasks';
      method = 'POST';
      body = { title: text(b.title, 200), ...(b.text ? { notes: text(b.text) } : {}) };
      scopes = ['tasks'];
      break;
    case 'tasks.complete':
      exact(p, ['tasklistId', 'taskId']);
      exact(b, []);
      url = 'https://tasks.googleapis.com/tasks/v1/lists/' + id(p.tasklistId) + '/tasks/' + id(p.taskId);
      method = 'PATCH';
      body = { status: 'completed' };
      scopes = ['tasks'];
      break;
    case 'chat.spaces':
      exact(p, ['pageToken']);
      exact(b, []);
      url = 'https://chat.googleapis.com/v1/spaces?' + new URLSearchParams({ pageSize: '20', pageToken: page() });
      scopes = ['chat.spaces.readonly'];
      break;
    case 'chat.messages':
      exact(p, ['spaceId', 'pageToken']);
      exact(b, []);
      url =
        'https://chat.googleapis.com/v1/spaces/' +
        id(p.spaceId) +
        '/messages?' +
        new URLSearchParams({ pageSize: '20', pageToken: page() });
      scopes = ['chat.messages.readonly'];
      break;
    case 'chat.send':
      exact(p, ['spaceId']);
      exact(b, ['text']);
      url = 'https://chat.googleapis.com/v1/spaces/' + id(p.spaceId) + '/messages?requestId=' + randomUUID();
      method = 'POST';
      body = { text: text(b.text, 4000) };
      scopes = ['chat.messages.create'];
      break;
    case 'meet.get':
      exact(p, ['spaceId']);
      exact(b, []);
      url = 'https://meet.googleapis.com/v2/spaces/' + id(p.spaceId);
      scopes = ['meetings.space.readonly'];
      break;
  }
  const digest = createHash('sha256')
    .update(JSON.stringify([request.operation, url, method, body]))
    .digest('hex');
  return {
    operation: request.operation,
    url,
    method,
    body,
    scopes: scopes.map(scope),
    services: googleOperationServices(request.operation, method !== 'GET'),
    acknowledge: false,
    payload: undefined as string | undefined,
    contentType: undefined as string | undefined,
    response: 'json' as 'json' | 'text',
    timeoutMs: undefined as number | undefined,
    preflight: undefined as { url: string; contentHash: string; deleteFiles: string[] } | undefined,
    write: method !== 'GET',
    digest,
    preview: JSON.stringify(request),
  };
}
