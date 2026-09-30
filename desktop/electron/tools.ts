import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Connection } from '../src/types';
import type { LoopRequest } from '../src/tools';
import type { Harness } from './service';
import { Workbench } from './workbench';
import { ToolGate } from './tool-gate';
import { Approvals } from './approvals';
import { Questions } from './questions';
import type { Policy, PermissionMode } from './policy';
import type { LoopHost } from './tool-loop';
import { fetchPublic, publicUrl } from './web-fetch';
import { sheetWorker } from './sheets';
import { sensitivePath, evaluatePermission } from './permissions';

export type ToolScope = {
  cancel: () => void;
  sessionId: string;
  query: string;
  team: string;
  contract: any;
  connection: Connection;
  signal: AbortSignal;
  search: (query: string) => Promise<string>;
  activity: (text: string) => void;
};
const blocked = (c: any) => c?.authority?.status !== 'ALLOW' || ['BLOCK', 'ESCALATE', 'UNAVAILABLE', 'CLARIFY'].includes(c?.mode);
export function documentSections(text: string) {
  // Worker extraction preserves line breaks. Without headings, use bounded paragraph groups.
  const lines = text.split(/\r?\n/);
  const sections: { title: string; text: string }[] = [];
  let title = 'Document start',
    body: string[] = [],
    size = 0;
  for (const line of lines) {
    if (body.length && (/^(#{1,6}\s|\d+(\.\d+)*[.)]?\s|บทที่\s|หัวข้อ\s|\f)/.test(line) || size + line.length > 12_000)) {
      sections.push({ title, text: body.join('\n') });
      body = [];
      size = 0;
      title = line.trim().slice(0, 150) || 'Continuation';
    }
    body.push(line);
    size += line.length + 1;
  }
  if (body.length) sections.push({ title, text: body.join('\n') });
  return sections;
}
export class DesktopTools {
  constructor(
    private workbench: Workbench,
    private harness: Harness,
    private gate: ToolGate,
    private approvals: Approvals,
    private questions: Questions,
    private policy: () => Policy,
    private mode: () => PermissionMode,
    private sheetPath: string,
  ) {}
  private async context(path: string) {
    const root = await realpath(this.harness.root),
      full = resolve(root, path),
      actual = await realpath(full);
    const r = relative(root, actual);
    if (
      isAbsolute(r) ||
      r.startsWith('..') ||
      sensitivePath(full, root) ||
      sensitivePath(actual, root) ||
      (await lstat(full)).isSymbolicLink()
    )
      throw new Error('INVALID_CONTEXT_PATH');
    if (!evaluatePermission({ tool: 'reference', readOnly: true, path: actual }, this.mode(), this.policy(), { root }).allowed)
      throw new Error('PATH_RULE_DENIED');
    if ((await lstat(actual)).size > 1_000_000) throw new Error('CONTEXT_LIMIT');
    return readFile(actual, 'utf8');
  }
  async outgoing(text: string, scope: ToolScope, destination?: 'web-query' | 'web-url') {
    const review = this.harness.privacy(text);
    if (review.action === 'block-external' || typeof review.redactedText !== 'string') throw new Error('PRIVACY_REVIEW_REQUIRED');
    const rule = this.approvals.rule(
      await this.workbench.root().catch(() => ''),
      destination || 'tool-data',
      createHash('sha256').update(text).digest('hex'),
    );
    const approved = await this.approvals.request(
      rule,
      {
        title:
          destination === 'web-query'
            ? 'ส่งคำค้นให้บริการค้นเว็บ?'
            : destination === 'web-url'
              ? 'เข้าถึงเว็บปลายทางนี้?'
              : 'ส่งผลเครื่องมือให้ AI?',
        body: `ข้อมูลใหม่ ${text.length.toLocaleString('th-TH')} ตัวอักษร จะส่งให้ ${destination === 'web-query' ? scope.connection.provider + ' และบริการค้นเว็บของบัญชีนี้' : destination === 'web-url' ? 'เว็บปลายทางที่ระบุ' : scope.connection.provider}\n${(review.findings || []).map((f: any) => f.label).join(', ')}\nตรวจตัวอย่างที่ปิดบังแล้วก่อนยินยอม:\n${review.redactedText.slice(0, 1500)}`,
        privacyClass: review.classification === 'public' ? 'internal' : review.classification,
        allowRemember: false,
      },
      scope.signal,
    );
    if (scope.signal.aborted) throw new Error('CANCELLED');
    if (!approved) throw new Error('TOOL_DATA_DECLINED');
    return review.redactedText;
  }
  async host(scope: ToolScope): Promise<LoopHost> {
    const jobs = new Set<string>();
    const stopJobs = () => {
      for (const id of jobs) void this.workbench.cancel(id);
    };
    scope.signal.addEventListener('abort', stopJobs, { once: true });
    const workspace = await this.workbench.root().catch(() => ''),
      policy = this.policy(),
      mode = this.mode();
    const check = async () => {
      if (scope.signal.aborted) throw new Error('CANCELLED');
      if (blocked(scope.contract)) throw new Error('AUTHORITY_REVIEW_REQUIRED');
      if (workspace !== (await this.workbench.root().catch(() => ''))) throw new Error('WORKSPACE_CHANGED');
      if (policy !== this.policy() || mode !== this.mode()) throw new Error('POLICY_CHANGED');
      if (!this.policy().features.toolLoop) throw new Error('TOOL_LOOP_DISABLED');
    };
    return {
      cancel: scope.cancel,
      enabled: () => this.policy().features.toolLoop,
      check,
      readOnly: r => !['terminal', 'changes', 'sheet_edit', 'ask_user', 'plan', 'snapshot', 'web_search'].includes(r.tool),
      activity: t => scope.activity('กำลังใช้เครื่องมือ ' + t),
      outgoing: async text => {
        await check();
        const approved = await this.outgoing(text, scope);
        await check();
        return approved;
      },
      readPage: (r, page, signal) =>
        this.gate.run(
          { tool: 'read_remaining', readOnly: true },
          { title: '', body: '', key: r.input, sessionId: scope.sessionId },
          page,
          signal,
        ),
      execute: async r => {
        await check();
        const value = await this.execute(r, scope, check);
        if (r.tool === 'terminal' && value && typeof value === 'object' && 'id' in value) jobs.add(String(value.id));
        return value;
      },
      dispose: async () => {
        scope.signal.removeEventListener('abort', stopJobs);
        if (scope.signal.aborted) await Promise.all([...jobs].map(id => this.workbench.cancel(id)));
      },
    };
  }
  async execute(r: LoopRequest, scope: ToolScope, check: () => Promise<void> = async () => {}) {
    const a = r.args || {},
      target = r.input;
    const fileTool = ['files', 'changes', 'doc_outline', 'doc_section', 'sheet_read', 'sheet_edit'].includes(r.tool);
    const command = r.tool === 'terminal' ? target : undefined;
    if (command && this.harness.privacy(command).action === 'block-external') throw new Error('PRIVACY_REVIEW_REQUIRED');
    if (this.mode() === 'plan' && ['changes', 'sheet_edit'].includes(r.tool)) throw new Error('PLAN_MODE_BLOCKED');
    const request = {
      tool: r.tool,
      readOnly: r.tool !== 'terminal',
      ...(fileTool ? { path: target || '.' } : {}),
      ...(command ? { command, execute: true } : {}),
    };
    return this.gate.run(
      request,
      {
        title: 'รันคำสั่งจาก AI?',
        body: target + '\nคำสั่งอาจแก้ไฟล์หรือเชื่อมต่อเครือข่ายด้วยสิทธิ์ของคุณ',
        key: target,
        sessionId: scope.sessionId,
      },
      async () => {
        switch (r.tool) {
          case 'files':
            return a.action === 'list' || !target ? this.workbench.files(target) : this.workbench.readChunk(target, Number(a.offset || 0));
          case 'changes':
            if (a.action === 'diff') return this.workbench.diff();
            if (a.action === 'list') return this.workbench.changes();
            if ((a.action && a.action !== 'stage') || r.content === undefined) throw new Error('INVALID_INPUT');
            return this.workbench.stage(target, r.content).then(c => ({ id: c.id, path: c.path, status: 'staged-for-human-review' }));
          case 'terminal':
            return this.workbench.start(target);
          case 'tasks':
            return this.workbench.tasks().filter(t => !target || t.id === target);
          case 'browser':
          case 'web_fetch': {
            const url = publicUrl(target).href;
            // A URL can leak task data through its path/query even on an otherwise public host.
            if (this.harness.privacy(decodeURIComponent(url)).action !== 'pass') throw new Error('PRIVACY_REVIEW_REQUIRED');
            await this.outgoing(url, scope, 'web-url');
            await check();
            return fetchPublic(url, scope.signal, this.policy().network?.proxyUrl);
          }
          case 'web_search':
            if (!target.trim() || this.harness.privacy(target).action !== 'pass') throw new Error('PRIVACY_REVIEW_REQUIRED');
            await this.outgoing(target, scope, 'web-query');
            await check();
            return scope.search(target);
          case 'skill': {
            const entry = ((await this.harness.catalog?.()) || []).find(e => e.name === target && e.status === 'routed');
            if (!entry) throw new Error('SKILL_NOT_ROUTED');
            const route = await this.harness.route(scope.query, {
              team: scope.team,
              skill: target,
              workspaceDir: await this.workbench.root().catch(() => this.harness.root),
            });
            const c = route.routingContract;
            if (blocked(c) || c?.skill !== target) throw new Error('AUTHORITY_REVIEW_REQUIRED');
            const meta = await this.harness.skillMetadata(target);
            if (!meta?.path || meta.path !== entry.path) throw new Error('CONTEXT_UNAVAILABLE');
            const paths = [
              meta.path,
              ...(meta.mandatoryReferences || []).map((ref: any) => (typeof ref === 'string' ? ref : ref.path)).filter(Boolean),
            ];
            return { id: target, route: c, text: (await Promise.all(paths.map((p: string) => this.context(p)))).join('\n\n') };
          }
          case 'reference': {
            const ref = (await this.harness.documentMetadata?.([target]))?.[0];
            if (!ref?.path || ref.status === 'unregistered') throw new Error('REFERENCE_UNAVAILABLE');
            return { ...ref, text: await this.context(ref.path) };
          }
          case 'doc_outline':
          case 'doc_section': {
            const path = await this.workbench.path(target);
            if (!['.docx', '.pdf'].includes(extname(path).toLowerCase())) throw new Error('ATTACH_UNSUPPORTED');
            const report = await this.harness.documentPrivacy(path, { includeRedacted: true });
            if (
              report.action === 'block-external' ||
              report.extractionStatus !== 'text-extracted' ||
              typeof report.redactedText !== 'string'
            )
              throw new Error('PRIVACY_REVIEW_REQUIRED');
            const parts = documentSections(report.redactedText);
            if (r.tool === 'doc_outline')
              return { path: target, sections: parts.map((p, index) => ({ index, title: p.title, characters: p.text.length })) };
            const index = Number(a.index || 0);
            if (!Number.isSafeInteger(index) || !parts[index]) throw new Error('INVALID_INPUT');
            return { path: target, index, ...parts[index] };
          }
          case 'sheet_read':
          case 'sheet_edit': {
            if (extname(target).toLowerCase() !== '.xlsx') throw new Error('ATTACH_UNSUPPORTED');
            const bytes = await this.workbench.bytes(target),
              hash = createHash('sha256').update(bytes).digest('hex');
            const value = await sheetWorker(
              bytes,
              { sheet: a.sheet, range: a.range, ...(r.tool === 'sheet_edit' ? { edits: a.edits } : {}) },
              scope.signal,
              this.sheetPath,
            );
            if (r.tool === 'sheet_read') return value;
            if (!a.edits || !value.binary) throw new Error('INVALID_INPUT');
            await check();
            const change = await this.workbench.stageBytes(target, Buffer.from(value.binary, 'base64'), value.before, value.after, hash);
            return { ...change, status: 'staged-for-human-review' };
          }
          case 'ask_user': {
            const options = Array.isArray(a.options) ? a.options : [];
            if (!target.trim() || options.length > 6 || options.some(o => typeof o !== 'string' || !o.trim() || o.length > 200))
              throw new Error('INVALID_INPUT');
            const answer = await this.questions.ask(scope.sessionId, target, options as string[], scope.signal);
            if (answer === null) throw new Error('CANCELLED');
            return { answer };
          }
          case 'plan': {
            if (!target.trim()) throw new Error('INVALID_INPUT');
            const rule = this.approvals.rule(await this.workbench.root().catch(() => ''), 'plan', target);
            const approved = await this.approvals.request(
              rule,
              { title: 'อนุมัติแผนก่อนจัดทำร่าง?', body: target, privacyClass: 'internal', allowRemember: false },
              scope.signal,
            );
            if (!approved) throw new Error('CANCELLED');
            return { approved: true, scope: 'draft-only; business actions require separate authority' };
          }
          case 'snapshot':
            if (a.action === 'list') return this.workbench.snapshots();
            if (a.action === 'restore') {
              if (typeof a.id !== 'string') throw new Error('INVALID_INPUT');
              if (this.mode() === 'plan') throw new Error('PLAN_MODE_BLOCKED');
              return this.workbench.restoreSnapshot(a.id);
            }
            if (a.action && a.action !== 'create') throw new Error('INVALID_INPUT');
            return this.workbench.snapshot(target);
          default:
            throw new Error('UNKNOWN_OPERATION');
        }
      },
      scope.signal,
    );
  }
}
