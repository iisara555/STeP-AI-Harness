import { googleBatch, googleExact, googleId, googleText, googleValue, googleGridValues, googleRectangleValues } from './google-validation';
import { googleMailMessage } from './google-mail';
import { randomUUID } from 'node:crypto';

type Field = { parse: (value: any) => any; optional?: boolean; note?: string };
type Fields = Record<string, Field>;
type Call = {
  url: string;
  method?: string;
  body?: object;
  payload?: string;
  contentType?: string;
  response?: 'text' | 'json';
  acknowledge?: boolean;
  timeoutMs?: number;
  preflight?: { url: string; contentHash: string; deleteFiles: string[] };
};
const field = (parse: Field['parse'], note?: string): Field => ({ parse, note });
const optional = (parse: Field['parse'], note?: string): Field => ({ parse, optional: true, note });
const str =
  (max = 20000) =>
  (v: any) =>
    googleText(v, max);
const identifier = field(googleId);
const pageToken = optional(str(2000));
const bool = (v: any) => {
  if (typeof v !== 'boolean') throw new Error('INVALID_GOOGLE_INPUT');
  return v;
};
const integer = (min: number, max: number) => (v: any) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) throw new Error('INVALID_GOOGLE_INPUT');
  return v;
};
const oneOf = (values: string[]) => (v: any) => {
  if (!values.includes(v)) throw new Error('INVALID_GOOGLE_INPUT');
  return v;
};
const list =
  (parse: (v: any) => any, max = 100) =>
  (v: any) => {
    if (!Array.isArray(v) || !v.length || v.length > max) throw new Error('INVALID_GOOGLE_INPUT');
    return v.map(parse);
  };
const parseFields = (value: any, fields: Fields) => {
  googleExact(value, Object.keys(fields));
  const result: Record<string, any> = {};
  for (const [name, f] of Object.entries(fields)) {
    if (value[name] === undefined && f.optional) continue;
    result[name] = f.parse(value[name]);
  }
  return result;
};
const define = (scopes: string[], params: Fields, body: Fields, build: (p: any, b: any) => Call) => ({
  scopes,
  params,
  body,
  invoke: (p: any, b: any) => build(parseFields(p, params), parseFields(b, body)),
});
const query = (url: string, values: Record<string, any>) => {
  const entries = Object.entries(values)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)]);
  return url + (entries.length ? '?' + new URLSearchParams(entries) : '');
};
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const FORMS = 'https://forms.googleapis.com/v1/forms';
const SCRIPT = 'https://script.googleapis.com/v1/projects';
const driveRead = ['drive.file', 'drive.readonly', 'drive'];
const driveWrite = ['drive.file', 'drive'];
const gmailRead = ['gmail.readonly', 'gmail.modify'];
const gmailDraft = ['gmail.compose', 'gmail.modify'];
const FORM = { formId: identifier };
const PROJECT = { scriptId: identifier };
const versionNumber = field(integer(1, 1_000_000));
const docsRequests = [
  'insertText',
  'deleteContentRange',
  'replaceAllText',
  'updateTextStyle',
  'updateParagraphStyle',
  'createParagraphBullets',
  'deleteParagraphBullets',
  'insertTable',
  'insertTableRow',
  'insertTableColumn',
  'deleteTableRow',
  'deleteTableColumn',
  'updateTableCellStyle',
  'updateDocumentStyle',
  'insertInlineImage',
  'insertPageBreak',
  'createHeader',
  'createFooter',
  'createNamedRange',
  'deleteNamedRange',
];
const slidesRequests = [
  'createSlide',
  'deleteObject',
  'duplicateObject',
  'updateSlidesPosition',
  'createShape',
  'insertText',
  'deleteText',
  'replaceAllText',
  'updateTextStyle',
  'updateParagraphStyle',
  'createParagraphBullets',
  'deleteParagraphBullets',
  'updatePageProperties',
  'updatePageElementTransform',
  'updateShapeProperties',
  'createImage',
  'replaceImage',
  'createTable',
  'insertTableRows',
  'insertTableColumns',
  'deleteTableRow',
  'deleteTableColumn',
  'updateTableCellProperties',
  'updateTableBorderProperties',
  'updateTableColumnProperties',
  'updateTableRowProperties',
  'mergeTableCells',
  'unmergeTableCells',
  'createSheetsChart',
  'refreshSheetsChart',
  'updateLineProperties',
];
const sheetsRequests = [
  'addSheet',
  'deleteSheet',
  'updateSheetProperties',
  'updateCells',
  'repeatCell',
  'appendCells',
  'insertDimension',
  'deleteDimension',
  'updateDimensionProperties',
  'autoResizeDimensions',
  'copyPaste',
  'cutPaste',
  'mergeCells',
  'unmergeCells',
  'setBasicFilter',
  'clearBasicFilter',
  'sortRange',
  'addConditionalFormatRule',
  'updateConditionalFormatRule',
  'deleteConditionalFormatRule',
  'setDataValidation',
  'addChart',
  'updateChartSpec',
  'deleteEmbeddedObject',
  'addNamedRange',
  'updateNamedRange',
  'deleteNamedRange',
  'updateSpreadsheetProperties',
  'findReplace',
];
const formRequests = ['updateFormInfo', 'updateSettings', 'createItem', 'moveItem', 'deleteItem', 'updateItem'];
const batchField = (allowed: string[]) =>
  field(v => googleBatch(v, allowed), 'Google API request objects; max 50; allowed: ' + allowed.join(', '));
const values = googleGridValues;
const rangedValues = (v: any) => {
  if (!Array.isArray(v) || !v.length || v.length > 20) throw new Error('INVALID_GOOGLE_INPUT');
  const result = v.map(item => {
    googleExact(item, ['range', 'values']);
    return { range: googleText(item.range, 200), values: googleRectangleValues(item.range, item.values) };
  });
  if (result.reduce((sum, item) => sum + item.values.reduce((n: number, row: any[]) => n + row.length, 0), 0) > 500)
    throw new Error('INVALID_GOOGLE_INPUT');
  return result;
};

/** Named, bounded API operations. No arbitrary HTTP endpoint, method, shell, token or raw MIME input. */
export const EXTENDED_GOOGLE_OPERATIONS = {
  'drive.get': define(driveRead, { fileId: identifier }, {}, p => ({
    url: `${DRIVE}/${p.fileId}?fields=id,name,mimeType,size,parents,webViewLink,modifiedTime,capabilities&supportsAllDrives=true`,
  })),
  'drive.createFolder': define(driveWrite, {}, { name: field(str(200)), parentId: optional(googleId) }, (_p, b) => ({
    url: `${DRIVE}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
    method: 'POST',
    body: { name: b.name, mimeType: 'application/vnd.google-apps.folder', ...(b.parentId ? { parents: [b.parentId] } : {}) },
  })),
  'drive.copy': define(driveWrite, { fileId: identifier }, { name: field(str(200)), parentId: optional(googleId) }, (p, b) => ({
    url: `${DRIVE}/${p.fileId}/copy?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
    method: 'POST',
    body: { name: b.name, ...(b.parentId ? { parents: [b.parentId] } : {}) },
  })),
  'drive.update': define(
    driveWrite,
    { fileId: identifier, addParent: optional(googleId), removeParent: optional(googleId) },
    { name: optional(str(200)), description: optional(str()), trashed: optional(bool) },
    (p, b) => {
      if (!Object.keys(b).length && !p.addParent && !p.removeParent) throw new Error('INVALID_GOOGLE_INPUT');
      return {
        url: query(`${DRIVE}/${p.fileId}`, {
          fields: 'id,name,parents,trashed,webViewLink',
          supportsAllDrives: true,
          addParents: p.addParent,
          removeParents: p.removeParent,
        }),
        method: 'PATCH',
        body: b,
      };
    },
  ),
  'drive.exportText': define(
    driveRead,
    { fileId: identifier, mimeType: field(oneOf(['text/plain', 'text/csv', 'text/tab-separated-values', 'text/markdown'])) },
    {},
    p => ({ url: query(`${DRIVE}/${p.fileId}/export`, { mimeType: p.mimeType }), response: 'text' }),
  ),
  'drive.getText': define(driveRead, { fileId: identifier }, {}, p => ({
    url: `${DRIVE}/${p.fileId}?alt=media&supportsAllDrives=true`,
    response: 'text',
  })),
  'drive.uploadText': define(
    driveWrite,
    {},
    {
      name: field(str(200)),
      mimeType: field(oneOf(['text/plain', 'text/csv', 'text/tab-separated-values', 'text/markdown', 'application/json'])),
      text: field(str(50000)),
      parentId: optional(googleId),
    },
    (_p, b) => {
      const boundary = 'step_' + randomUUID().replaceAll('-', '');
      const metadata = { name: b.name, mimeType: b.mimeType, ...(b.parentId ? { parents: [b.parentId] } : {}) };
      return {
        url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink&supportsAllDrives=true',
        method: 'POST',
        contentType: 'multipart/related; boundary=' + boundary,
        payload: `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${b.mimeType}; charset=UTF-8\r\n\r\n${b.text}\r\n--${boundary}--\r\n`,
      };
    },
  ),
  'drive.permissions.list': define(driveRead, { fileId: identifier, pageToken }, {}, p => ({
    url: query(`${DRIVE}/${p.fileId}/permissions`, {
      pageSize: 100,
      pageToken: p.pageToken,
      fields: 'nextPageToken,permissions(id,type,role,emailAddress,domain,allowFileDiscovery)',
      supportsAllDrives: true,
    }),
  })),
  'drive.permissions.create': define(
    driveWrite,
    { fileId: identifier },
    {
      type: field(oneOf(['user', 'group', 'domain', 'anyone'])),
      role: field(oneOf(['reader', 'commenter', 'writer'])),
      emailAddress: optional(str(254)),
      domain: optional(str(254)),
    },
    (p, b) => {
      if (
        ['user', 'group'].includes(b.type)
          ? !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(b.emailAddress || '') || b.domain
          : b.type === 'domain'
            ? !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(b.domain || '') || b.emailAddress
            : b.emailAddress || b.domain
      )
        throw new Error('INVALID_GOOGLE_INPUT');
      return {
        url: `${DRIVE}/${p.fileId}/permissions?fields=id,type,role,emailAddress,domain&supportsAllDrives=true&sendNotificationEmail=false`,
        method: 'POST',
        body: { ...b, ...(b.type === 'anyone' || b.type === 'domain' ? { allowFileDiscovery: false } : {}) },
      };
    },
  ),
  'drive.permissions.delete': define(driveWrite, { fileId: identifier, permissionId: identifier }, {}, p => ({
    url: `${DRIVE}/${p.fileId}/permissions/${p.permissionId}?supportsAllDrives=true`,
    method: 'DELETE',
    acknowledge: true,
  })),
  'docs.batchUpdate': define(
    ['drive.file', 'documents', 'drive'],
    { documentId: identifier },
    { requests: batchField(docsRequests), requiredRevisionId: field(str(2000)) },
    (p, b) => ({
      url: `https://docs.googleapis.com/v1/documents/${p.documentId}:batchUpdate`,
      method: 'POST',
      body: { requests: b.requests, writeControl: { requiredRevisionId: b.requiredRevisionId } },
    }),
  ),
  'slides.batchUpdate': define(
    ['drive.file', 'presentations', 'drive'],
    { presentationId: identifier },
    { requests: batchField(slidesRequests), requiredRevisionId: field(str(2000)) },
    (p, b) => ({
      url: `https://slides.googleapis.com/v1/presentations/${p.presentationId}:batchUpdate`,
      method: 'POST',
      body: { requests: b.requests, writeControl: { requiredRevisionId: b.requiredRevisionId } },
    }),
  ),
  'slides.pages.get': define(
    ['drive.file', 'drive.readonly', 'presentations', 'presentations.readonly', 'drive'],
    { presentationId: identifier, pageId: identifier },
    {},
    p => ({ url: `https://slides.googleapis.com/v1/presentations/${p.presentationId}/pages/${p.pageId}` }),
  ),
  'sheets.batchUpdate': define(
    ['drive.file', 'spreadsheets', 'drive'],
    { spreadsheetId: identifier },
    { requests: batchField(sheetsRequests) },
    (p, b) => ({ url: `https://sheets.googleapis.com/v4/spreadsheets/${p.spreadsheetId}:batchUpdate`, method: 'POST', body: b }),
  ),
  'sheets.values.batchGet': define(
    ['drive.file', 'drive.readonly', 'spreadsheets', 'spreadsheets.readonly', 'drive'],
    {
      spreadsheetId: identifier,
      ranges: field(list(str(200), 20)),
      valueRenderOption: optional(oneOf(['FORMATTED_VALUE', 'UNFORMATTED_VALUE', 'FORMULA'])),
    },
    {},
    p => {
      const q = new URLSearchParams({ valueRenderOption: p.valueRenderOption || 'FORMATTED_VALUE' });
      for (const range of p.ranges) q.append('ranges', range);
      return { url: `https://sheets.googleapis.com/v4/spreadsheets/${p.spreadsheetId}/values:batchGet?${q}` };
    },
  ),
  'sheets.values.batchUpdate': define(
    ['drive.file', 'spreadsheets', 'drive'],
    { spreadsheetId: identifier },
    { data: field(rangedValues), valueInputOption: optional(oneOf(['RAW', 'USER_ENTERED'])) },
    (p, b) => ({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${p.spreadsheetId}/values:batchUpdate`,
      method: 'POST',
      body: { data: b.data, valueInputOption: b.valueInputOption || 'RAW' },
    }),
  ),
  'sheets.values.append': define(
    ['drive.file', 'spreadsheets', 'drive'],
    { spreadsheetId: identifier, range: field(str(200)) },
    { values: field(values), valueInputOption: optional(oneOf(['RAW', 'USER_ENTERED'])) },
    (p, b) => ({
      url: query(`https://sheets.googleapis.com/v4/spreadsheets/${p.spreadsheetId}/values/${encodeURIComponent(p.range)}:append`, {
        valueInputOption: b.valueInputOption || 'RAW',
        insertDataOption: 'INSERT_ROWS',
      }),
      method: 'POST',
      body: { values: b.values },
    }),
  ),
  'sheets.values.clear': define(['drive.file', 'spreadsheets', 'drive'], { spreadsheetId: identifier, range: field(str(200)) }, {}, p => ({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${p.spreadsheetId}/values/${encodeURIComponent(p.range)}:clear`,
    method: 'POST',
    body: {},
    acknowledge: true,
  })),
  'gmail.threads.list': define(gmailRead, { query: optional(str(500)), pageToken }, {}, p => ({
    url: query(`${GMAIL}/threads`, { q: p.query, pageToken: p.pageToken, maxResults: 20 }),
  })),
  'gmail.threads.get': define(gmailRead, { threadId: identifier }, {}, p => ({ url: `${GMAIL}/threads/${p.threadId}?format=full` })),
  'gmail.labels.list': define(gmailRead, {}, {}, () => ({ url: `${GMAIL}/labels` })),
  'gmail.labels.create': define(['gmail.modify'], {}, { name: field(str(225)) }, (_p, b) => ({
    url: `${GMAIL}/labels`,
    method: 'POST',
    body: b,
  })),
  'gmail.modify': define(
    ['gmail.modify'],
    { messageId: identifier },
    { addLabelIds: optional(list(googleId, 20)), removeLabelIds: optional(list(googleId, 20)) },
    (p, b) => {
      if (!b.addLabelIds?.length && !b.removeLabelIds?.length) throw new Error('INVALID_GOOGLE_INPUT');
      return { url: `${GMAIL}/messages/${p.messageId}/modify`, method: 'POST', body: b };
    },
  ),
  'gmail.trash': define(['gmail.modify'], { messageId: identifier }, {}, p => ({
    url: `${GMAIL}/messages/${p.messageId}/trash`,
    method: 'POST',
    body: {},
  })),
  'gmail.untrash': define(['gmail.modify'], { messageId: identifier }, {}, p => ({
    url: `${GMAIL}/messages/${p.messageId}/untrash`,
    method: 'POST',
    body: {},
  })),
  'gmail.drafts.list': define([...gmailRead, ...gmailDraft], { pageToken }, {}, p => ({
    url: query(`${GMAIL}/drafts`, { pageToken: p.pageToken, maxResults: 20 }),
  })),
  'gmail.drafts.get': define([...gmailRead, ...gmailDraft], { draftId: identifier }, {}, p => ({
    url: `${GMAIL}/drafts/${p.draftId}?format=full`,
  })),
  'gmail.drafts.update': define(
    gmailDraft,
    { draftId: identifier },
    {
      to: field(list(str(254), 10)),
      subject: field(str(200)),
      text: field(str()),
      cc: optional(list(str(254), 10)),
      bcc: optional(list(str(254), 10)),
      threadId: optional(googleId),
      inReplyTo: optional(str(500)),
    },
    (p, b) => ({ url: `${GMAIL}/drafts/${p.draftId}`, method: 'PUT', body: { message: googleMailMessage(b) } }),
  ),
  'gmail.drafts.delete': define(gmailDraft, { draftId: identifier }, {}, p => ({
    url: `${GMAIL}/drafts/${p.draftId}`,
    method: 'DELETE',
    acknowledge: true,
  })),
  'gmail.attachments.getText': define(gmailRead, { messageId: identifier, attachmentId: field(str(2000)) }, {}, p => ({
    url: `${GMAIL}/messages/${p.messageId}/attachments/${encodeURIComponent(p.attachmentId)}`,
  })),
  'forms.create': define(['forms.body', ...driveWrite], {}, { title: field(str(200)), documentTitle: optional(str(200)) }, (_p, b) => ({
    url: FORMS,
    method: 'POST',
    body: { info: b },
  })),
  'forms.get': define(['forms.body', 'forms.body.readonly', ...driveRead], FORM, {}, p => ({ url: `${FORMS}/${p.formId}` })),
  'forms.batchUpdate': define(
    ['forms.body', ...driveWrite],
    FORM,
    { requests: batchField(formRequests), requiredRevisionId: field(str(2000)) },
    (p, b) => ({
      url: `${FORMS}/${p.formId}:batchUpdate`,
      method: 'POST',
      body: { requests: b.requests, writeControl: { requiredRevisionId: b.requiredRevisionId }, includeFormInResponse: true },
      acknowledge: true,
    }),
  ),
  'forms.responses.list': define(
    ['forms.responses.readonly', ...driveWrite],
    { ...FORM, pageToken, filter: optional(str(500)) },
    {},
    p => ({
      url: query(`${FORMS}/${p.formId}/responses`, { pageSize: 20, pageToken: p.pageToken, filter: p.filter }),
    }),
  ),
  'forms.responses.get': define(['forms.responses.readonly', ...driveWrite], { ...FORM, responseId: identifier }, {}, p => ({
    url: `${FORMS}/${p.formId}/responses/${p.responseId}`,
  })),
  'forms.setPublishSettings': define(
    ['forms.body', ...driveWrite],
    FORM,
    { isPublished: field(bool), isAcceptingResponses: field(bool) },
    (p, b) => {
      if (b.isAcceptingResponses && !b.isPublished) throw new Error('INVALID_GOOGLE_INPUT');
      return {
        url: `${FORMS}/${p.formId}:setPublishSettings`,
        method: 'POST',
        body: { publishSettings: { publishState: b } },
        acknowledge: true,
      };
    },
  ),
  'appscript.projects.create': define(['script.projects'], {}, { title: field(str(200)), parentId: optional(googleId) }, (_p, b) => ({
    url: SCRIPT,
    method: 'POST',
    body: b,
  })),
  'appscript.projects.get': define(['script.projects', 'script.projects.readonly'], PROJECT, {}, p => ({ url: `${SCRIPT}/${p.scriptId}` })),
  'appscript.projects.getContent': define(
    ['script.projects', 'script.projects.readonly'],
    { ...PROJECT, versionNumber: optional(integer(1, 1_000_000)) },
    {},
    p => ({ url: query(`${SCRIPT}/${p.scriptId}/content`, { versionNumber: p.versionNumber }) }),
  ),
  'appscript.projects.updateContent': define(
    ['script.projects'],
    PROJECT,
    {
      files: field(v => {
        if (!Array.isArray(v) || v.length > 50) throw new Error('INVALID_GOOGLE_INPUT');
        const files = v.map(file => {
          googleExact(file, ['name', 'type', 'source']);
          if (typeof file.source !== 'string' || file.source.length > 50000 || file.source.includes('\0'))
            throw new Error('INVALID_GOOGLE_INPUT');
          if (/\[credential(?:-redacted| removed)\]/i.test(file.source)) throw new Error('GOOGLE_REDACTED_SOURCE');
          return { name: googleText(file.name, 200), type: oneOf(['SERVER_JS', 'HTML', 'JSON'])(file.type), source: file.source };
        });
        if (new Set(files.map(file => file.name)).size !== files.length) throw new Error('INVALID_GOOGLE_INPUT');
        return googleValue(files);
      }, 'changed or new files only; other files preserved; max 50'),
      deleteFiles: optional(list(str(200), 50), 'explicit names to remove; cannot remove appsscript manifest'),
      expectedContentHash: field(v => {
        if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) throw new Error('INVALID_GOOGLE_INPUT');
        return v;
      }, 'contentHash from appscript.projects.getContent'),
    },
    (p, b) => {
      if (
        (!b.files.length && !b.deleteFiles?.length) ||
        b.deleteFiles?.some((name: string) => name === 'appsscript' || b.files.some((file: any) => file.name === name))
      )
        throw new Error('INVALID_GOOGLE_INPUT');
      return {
        url: `${SCRIPT}/${p.scriptId}/content`,
        method: 'PUT',
        body: { files: b.files },
        acknowledge: true,
        preflight: { url: `${SCRIPT}/${p.scriptId}/content`, contentHash: b.expectedContentHash, deleteFiles: b.deleteFiles || [] },
      };
    },
  ),
  'appscript.versions.list': define(['script.projects', 'script.projects.readonly'], { ...PROJECT, pageToken }, {}, p => ({
    url: query(`${SCRIPT}/${p.scriptId}/versions`, { pageSize: 20, pageToken: p.pageToken }),
  })),
  'appscript.versions.get': define(['script.projects', 'script.projects.readonly'], { ...PROJECT, versionNumber }, {}, p => ({
    url: `${SCRIPT}/${p.scriptId}/versions/${p.versionNumber}`,
  })),
  'appscript.versions.create': define(['script.projects'], PROJECT, { description: optional(str(500)) }, (p, b) => ({
    url: `${SCRIPT}/${p.scriptId}/versions`,
    method: 'POST',
    body: b,
  })),
  'appscript.deployments.list': define(['script.deployments', 'script.deployments.readonly'], { ...PROJECT, pageToken }, {}, p => ({
    url: query(`${SCRIPT}/${p.scriptId}/deployments`, { pageSize: 20, pageToken: p.pageToken }),
  })),
  'appscript.deployments.get': define(
    ['script.deployments', 'script.deployments.readonly'],
    { ...PROJECT, deploymentId: identifier },
    {},
    p => ({ url: `${SCRIPT}/${p.scriptId}/deployments/${p.deploymentId}` }),
  ),
  'appscript.deployments.create': define(
    ['script.deployments'],
    PROJECT,
    { versionNumber, manifestFileName: field(str(200)), description: optional(str(500)) },
    (p, b) => ({ url: `${SCRIPT}/${p.scriptId}/deployments`, method: 'POST', body: b }),
  ),
  'appscript.deployments.update': define(
    ['script.deployments'],
    { ...PROJECT, deploymentId: identifier },
    { versionNumber, manifestFileName: field(str(200)), description: optional(str(500)) },
    (p, b) => ({ url: `${SCRIPT}/${p.scriptId}/deployments/${p.deploymentId}`, method: 'PUT', body: { deploymentConfig: b } }),
  ),
  'appscript.deployments.delete': define(['script.deployments'], { ...PROJECT, deploymentId: identifier }, {}, p => ({
    url: `${SCRIPT}/${p.scriptId}/deployments/${p.deploymentId}`,
    method: 'DELETE',
    acknowledge: true,
  })),
  'appscript.processes.list': define(['script.processes'], { pageToken, scriptId: optional(googleId) }, {}, p => ({
    url: query('https://script.googleapis.com/v1/processes', {
      pageSize: 20,
      pageToken: p.pageToken,
      'userProcessFilter.scriptId': p.scriptId,
    }),
  })),
  'appscript.run': define(
    ['userinfo.email', 'documents', 'spreadsheets', 'drive'],
    { deploymentId: identifier },
    {
      function: field(v => {
        if (typeof v !== 'string' || !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/.test(v) || v.length > 200)
          throw new Error('INVALID_GOOGLE_INPUT');
        return v;
      }),
      parameters: optional(v => {
        if (!Array.isArray(v) || v.length > 50) throw new Error('INVALID_GOOGLE_INPUT');
        return googleValue(v);
      }),
    },
    (p, b) => ({
      url: `https://script.googleapis.com/v1/scripts/${p.deploymentId}:run`,
      method: 'POST',
      body: { ...b, devMode: false },
      acknowledge: true,
      timeoutMs: 365000,
    }),
  ),
};

export type ExtendedGoogleOperation = keyof typeof EXTENDED_GOOGLE_OPERATIONS;
export const extendedGoogleCatalog = Object.entries(EXTENDED_GOOGLE_OPERATIONS).map(([operation, definition]) => ({
  operation,
  params: Object.entries(definition.params).map(([key, f]) => key + (f.optional ? '?' : '') + (f.note ? ' (' + f.note + ')' : '')),
  body: Object.entries(definition.body).map(([key, f]) => key + (f.optional ? '?' : '') + (f.note ? ' (' + f.note + ')' : '')),
}));
