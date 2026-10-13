import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Store } from '../../electron/store.ts';
import { Workbench } from '../../electron/workbench.ts';
import { DesktopTools } from '../../electron/tools.ts';
import { ToolGate } from '../../electron/tool-gate.ts';
import { Approvals } from '../../electron/approvals.ts';
import { Questions } from '../../electron/questions.ts';
import { defaultPolicy } from '../../electron/policy.ts';
import { evaluatePrivacyGate } from '../../../src/modules/privacy/index.js';
import { TOOLS, CONCURRENT, hash, nativeRequest } from './spec.mjs';

export async function trialHost(root, workspace, connection, signal) {
  const require = createRequire(import.meta.url);
  const documents = require('js-yaml').load(await readFile(join(root, 'manifest/documents.yaml'), 'utf8')).documents;
  const store = new Store(':memory:');
  store.put('settings', 'main', { workspace, team: 'cc' });
  store.put('connection', connection.id, connection);
  const session = store.create(connection.id, 'cc');
  const policy = defaultPolicy();
  const workbench = new Workbench(store, undefined, () => policy);
  // --live authorizes only this public/synthetic fixture, this isolated folder
  // and these reversible file edits. The real Desktop's policy is not changed.
  const approvals = new Approvals(store, r => {
    if (r) queueMicrotask(() => approvals.respond(r.id, 'once'));
  });
  const questions = new Questions(() => {});
  const gate = new ToolGate(
    () => policy,
    () => 'acceptEdits',
    () => workbench.root(),
    approvals,
    async () => ({ blocked: false, reason: '', results: [] }),
  );
  const harness = {
    root,
    privacy: evaluatePrivacyGate,
    documentMetadata: async ids =>
      ids.map(id =>
        id === 'step-public-profile' && documents[id]?.sensitivity === 'public' ? { id, ...documents[id] } : { id, status: 'unregistered' },
      ),
    documentCatalog: async () => [{ id: 'step-public-profile', ...documents['step-public-profile'] }],
  };
  const tools = new DesktopTools(
    workbench,
    harness,
    gate,
    approvals,
    questions,
    () => policy,
    () => 'acceptEdits',
    join(root, 'desktop/electron/sheet-worker.cjs'),
  );
  const original = await tools.host({
    cancel: () => {},
    sessionId: session.id,
    query: 'public synthetic parity evaluation',
    team: 'cc',
    contract: { mode: 'GENERAL', authority: { status: 'ALLOW' } },
    connection,
    signal,
    search: async () => {
      throw new Error('EVAL_TOOL_DISABLED');
    },
    activity: () => {},
  });
  const records = [];
  let busy = false,
    concurrent = false;
  let serial = Promise.resolve();
  const execute = async request => {
    const record = {
      index: records.length,
      tool: request.tool,
      input: request.input,
      args: request.args,
      content: request.content,
      ok: false,
    };
    records.push(record);
    const started = Date.now();
    try {
      await original.check();
      if (!TOOLS.includes(request.tool)) throw new Error('EVAL_TOOL_DISABLED');
      if (records.length > 20) throw new Error('EVAL_TOOL_CALL_LIMIT');
      if (request.tool === 'files' && request.input === 'recovery.md' && !busy) {
        busy = true;
        record.injected = true;
        throw new Error('FILE_BUSY_ONCE');
      }
      if (request.tool === 'patch' && request.input === 'recovery.md') {
        if (!request.args?.expectedHash) throw new Error('INVALID_INPUT');
        if (!concurrent) {
          concurrent = true;
          await writeFile(join(workspace, 'recovery.md'), (await readFile(join(workspace, 'recovery.md'), 'utf8')) + CONCURRENT);
          record.injected = true;
        }
      }
      let result = await original.execute(request, signal);
      if (request.tool === 'files' && request.input === 'recovery.md' && typeof result?.text === 'string')
        result = { ...result, hash: hash(result.text) };
      // Both transports receive the same bounded source excerpt and the same
      // approved/masked results. Preserve source metadata and mark truncation.
      if (request.tool === 'reference' && typeof result?.text === 'string' && result.text.length > 4000)
        result = { ...result, text: result.text.slice(0, 4000), partial: true };
      const approved = await original.outgoing(JSON.stringify(result), signal, request);
      record.result = JSON.parse(approved);
      record.ok = result !== null && result?.cancelled !== true;
      return record.result;
    } catch (e) {
      record.code = /^[A-Z_]+$/.test(e.message) ? e.message : 'TOOL_FAILED';
      throw new Error(record.code);
    } finally {
      record.ms = Date.now() - started;
    }
  };
  // Keep mutation order equal for native runtimes that dispatch tools in parallel.
  const ordered = request => {
    const result = serial.then(() => execute(request));
    serial = result.catch(() => {});
    return result;
  };
  return {
    records,
    host: { ...original, readOnly: () => false, execute: ordered, outgoing: async text => text, dispose: async () => {} },
    native: async value => {
      try {
        const request = nativeRequest(value);
        return { ok: true, result: await ordered(request) };
      } catch (e) {
        const code = /^[A-Z_]+$/.test(e.message) ? e.message : 'TOOL_FAILED';
        if (code === 'INVALID_TOOL_REQUEST')
          records.push({ index: records.length, tool: value?.tool || 'unknown', input: value?.input || '', ok: false, code });
        return { ok: false, code };
      }
    },
    close: async () => {
      await serial;
      await original.dispose();
      await workbench.close();
      store.close();
    },
  };
}
