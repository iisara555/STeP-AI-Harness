import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const LIMIT = 1000000;
const operations = {
  'drive.list': { argv: ['drive', 'files', 'list'], params: ['q', 'pageSize', 'pageToken', 'fields'] },
  'docs.get': { argv: ['docs', 'documents', 'get'], params: ['documentId'] },
  'sheets.get': { argv: ['sheets', 'spreadsheets', 'get'], params: ['spreadsheetId'], defaults: { includeGridData: false } },
  'sheets.values.get': { argv: ['sheets', 'spreadsheets', 'values', 'get'], params: ['spreadsheetId', 'range'] },
  'docs.create': { argv: ['docs', 'documents', 'create'], params: [], write: true },
  'sheets.create': { argv: ['sheets', 'spreadsheets', 'create'], params: [], write: true },
  'sheets.values.update': { argv: ['sheets', 'spreadsheets', 'values', 'update'], params: ['spreadsheetId', 'range'], defaults: { valueInputOption: 'RAW' }, write: true },
  'docs.appendText': { argv: ['docs', 'documents', 'batchUpdate'], params: ['documentId'], write: true },
};
const error = code => { throw new Error(code); };
const object = v => v && typeof v === 'object' && !Array.isArray(v);
function validate(request) {
  if (!object(request) || Object.keys(request).some(k => !['operation', 'params', 'body'].includes(k))) error('INVALID_WORKSPACE_INPUT');
  if (typeof request.operation !== 'string' || !Object.hasOwn(operations, request.operation)) error('WORKSPACE_OPERATION_UNSUPPORTED');
  const op = operations[request.operation];
  const params = request.params ?? {};
  if (!object(params) || Object.keys(params).some(k => !op.params.includes(k))) error('INVALID_WORKSPACE_INPUT');
  for (const [key, value] of Object.entries(params)) {
    if (key === 'pageSize') {
      if (!Number.isInteger(value) || value < 1 || value > 100) error('INVALID_WORKSPACE_INPUT');
    } else if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /[\x00-\x1f]/.test(value)) error('INVALID_WORKSPACE_INPUT');
  }
  for (const key of ['documentId', 'spreadsheetId'].filter(k => op.params.includes(k)))
    if (typeof params[key] !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(params[key])) error('INVALID_WORKSPACE_INPUT');
  if (request.operation.startsWith('sheets.values.') && typeof params.range !== 'string') error('INVALID_WORKSPACE_INPUT');
  if (op.write) {
    const body = request.body;
    if (!object(body)) error('INVALID_WORKSPACE_INPUT');
    if (request.operation === 'sheets.values.update') {
      if (Object.keys(body).some(k => k !== 'values') || !Array.isArray(body.values) || !body.values.length || body.values.length > 100 || body.values.some(row => !Array.isArray(row) || !row.length || row.length > 30 || row.length !== body.values[0].length || row.some(v => !(v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 5000))))) error('INVALID_WORKSPACE_INPUT');
      if (body.values.length * body.values[0].length > 500) error('INVALID_WORKSPACE_INPUT');
      const range = /^(?:(?:'(?:[^']|'')+'|[^!\[\]\x00-\x1f]{1,100})!)?([A-Z]{1,3})([1-9]\d{0,6})(?::([A-Z]{1,3})([1-9]\d{0,6}))?$/.exec(params.range);
      if (!range) error('INVALID_WORKSPACE_INPUT');
      const col = s => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
      const from = { col: col(range[1]), row: Number(range[2]) }, to = { col: col(range[3] || range[1]), row: Number(range[4] || range[2]) };
      if (from.col > 16384 || to.col > 16384 || from.row > 1048576 || to.row > 1048576 || to.row - from.row + 1 !== body.values.length || to.col - from.col + 1 !== body.values[0].length) error('INVALID_WORKSPACE_INPUT');
    } else if (request.operation === 'docs.appendText') {
      if (Object.keys(body).some(k => !['text', 'requiredRevisionId'].includes(k)) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 20000 || typeof body.requiredRevisionId !== 'string' || !body.requiredRevisionId.trim() || body.requiredRevisionId.length > 2000) error('INVALID_WORKSPACE_INPUT');
    } else {
    const title = request.operation === 'docs.create' ? body.title : body.properties?.title;
    if (typeof title !== 'string' || !title.trim() || title.length > 200 || /[\x00-\x1f]/.test(title)) error('INVALID_WORKSPACE_INPUT');
    if (request.operation === 'docs.create' && Object.keys(body).some(k => k !== 'title')) error('INVALID_WORKSPACE_INPUT');
    if (request.operation === 'sheets.create' && (Object.keys(body).some(k => k !== 'properties') || !object(body.properties) || Object.keys(body.properties).some(k => k !== 'title'))) error('INVALID_WORKSPACE_INPUT');
    }
  } else if (request.body !== undefined) error('INVALID_WORKSPACE_INPUT');
  return op;
}

/** Optional connector; never installs the CLI, logs in, shares files, or joins the Desktop tool loop automatically. */
export class GoogleWorkspaceConnector {
  constructor({ run = async (args, options) => (await exec('gws', args, { ...options, shell: false, windowsHide: true })).stdout } = {}) {
    this.run = run;
  }
  async execute(request, { authorize, dryRun = false, signal } = {}) {
    if (signal?.aborted) error('CANCELLED');
    const op = validate(request);
    const params = { ...(op.defaults || {}), ...(request.params || {}) };
    if (request.operation === 'drive.list' && !params.pageSize) params.pageSize = 20;
    const args = [...op.argv, '--params', JSON.stringify(params), '--format', 'json'];
    if (request.body) {
      const body = request.operation === 'docs.appendText'
        ? { requests: [{ insertText: { endOfSegmentLocation: {}, text: request.body.text } }], writeControl: { requiredRevisionId: request.body.requiredRevisionId } }
        : request.body;
      args.push('--json', JSON.stringify(body));
    }
    // Bind approval and invocation to an immutable snapshot: the caller cannot change the request while awaiting consent.
    const snapshot = JSON.parse(JSON.stringify(request));
    const digest = createHash('sha256').update(JSON.stringify(args)).digest('hex');
    const effect = snapshot.operation.endsWith('.create') ? 'create-draft-in-google-account' : op.write ? 'update-existing-content' : 'read';
    if (dryRun) return { status: 'dry-run', operation: snapshot.operation, effect, digest };
    if (op.write && (typeof authorize !== 'function' || await authorize({ operation: snapshot.operation, request: snapshot, digest, effect }) !== true)) error('WORKSPACE_WRITE_AUTHORIZATION_REQUIRED');
    if (signal?.aborted) error('CANCELLED');
    let raw;
    try { raw = await this.run(args, { timeout: 20000, maxBuffer: LIMIT, signal }); }
    catch (e) {
      if (signal?.aborted || e.name === 'AbortError') error('CANCELLED');
      if (e.code === 'ENOENT') error('WORKSPACE_CLI_UNAVAILABLE');
      error('WORKSPACE_CLI_FAILED'); // Never expose stderr, tokens or account diagnostics to a model or log.
    }
    if (typeof raw !== 'string' || raw.length > LIMIT) error('WORKSPACE_RESPONSE_INVALID');
    let data;
    try { data = JSON.parse(raw); } catch { error('WORKSPACE_RESPONSE_INVALID'); }
    if (!object(data) || data.error) error('WORKSPACE_RESPONSE_INVALID');
    const reference = data.documentId || data.spreadsheetId;
    if (op.write && (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(reference))) error('WORKSPACE_RESPONSE_INVALID');
    return { operation: snapshot.operation, status: 'completed', trust: 'untrusted-data', provenance: 'EXTRACTED_UNVERIFIED',
      retrievedAt: new Date().toISOString(), ...(reference ? { reference } : {}), data };
  }
}
export const googleWorkspaceOperations = Object.freeze(Object.keys(operations));
