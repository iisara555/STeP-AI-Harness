import { readFile, realpath, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, dirname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { Connection, Workflow, WorkTask } from '../src/types';
import { parsePlan } from './workflows';
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
import { sensitivePath, evaluatePermission, deniedPath } from './permissions';
import { RunTransmission, type TransmissionSource } from './transmission';
import { documentSection } from './knowledge';
import { mainLocale, tm } from './i18n';

// What the employee reads on the status line while a tool runs, in plain words instead of the tool's name.
const TOOL_ACTIVITY: Record<string, string> = {
  ask_user: 'รอคำตอบจากคุณ',
  plan: 'ส่งแผนให้คุณอนุมัติ',
  plan_update: 'บันทึกความคืบหน้าของแผน',
  browser_control: 'กำลังทำงานบนเว็บ',
  web_search: 'กำลังค้นเว็บ',
  web_fetch: 'กำลังอ่านเว็บไซต์',
  files: 'กำลังอ่านไฟล์งาน',
  changes: 'กำลังเตรียมการแก้ไขไฟล์',
};
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
  /** The native workflow of this run (electron/workflows.ts), if the employee picked one. */
  workflow?: Workflow;
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
  external?: (request: LoopRequest, scope: ToolScope, check: () => Promise<void>) => Promise<unknown>;
  closeBrowser?: (sessionId: string) => void;
  private sourceClean = new WeakMap<LoopRequest, boolean>();
  private transmissions = new Map<RunTransmission, () => void>();
  transmissionGrants() {
    return [...this.transmissions.keys()].flatMap(t => t.list());
  }
  revokeTransmission(id: string) {
    for (const [run, cancel] of this.transmissions)
      if (run.has(id)) {
        run.close();
        cancel();
        return;
      }
    throw new Error('APPROVAL_EXPIRED');
  }
  constructor(
    private workbench: Workbench,
    private harness: Harness,
    private gate: ToolGate,
    private approvals: Approvals,
    private questions: Questions,
    private policy: () => Policy,
    private mode: () => PermissionMode,
    private sheetPath: string,
    private notify: () => void = () => {},
    private identity: (sessionId: string) => string = () => '',
  ) {}
  private async context(path: string) {
    const root = await realpath(this.harness.root),
      full = resolve(root, path),
      actual = await realpath(full);
    const r = relative(root, actual);
    // Only the part inside the harness is checked against the sensitive-path patterns: the app is installed under a
    // folder named "STeP Desktop" on Windows, which those patterns protect where it holds the app's own data.
    const inside = (path: string) => '/harness/' + relative(root, path).split(sep).join('/');
    if (
      isAbsolute(r) ||
      r.startsWith('..') ||
      sensitivePath(inside(full), '/') ||
      sensitivePath(inside(actual), '/') ||
      (await lstat(full)).isSymbolicLink()
    )
      throw new Error('INVALID_CONTEXT_PATH');
    if (deniedPath(actual, this.policy().permission.pathRules, root)) throw new Error('PATH_RULE_DENIED');
    if ((await lstat(actual)).size > 1_000_000) throw new Error('CONTEXT_LIMIT');
    return readFile(actual, 'utf8');
  }
  async outgoing(
    text: string,
    scope: ToolScope,
    destination?: 'web-query' | 'web-url',
    transmission?: RunTransmission,
    source?: TransmissionSource,
  ) {
    // Asking before data leaves for the AI or a web service is a privacy check: off unless policy checks.privacy is on.
    if (!this.policy().checks.privacy) return text;
    const review = this.harness.privacy(text);
    if (review.action === 'block-external' || typeof review.redactedText !== 'string') throw new Error('PRIVACY_REVIEW_REQUIRED');
    const rule = this.approvals.rule(
      await this.workbench.root().catch(() => ''),
      destination || 'tool-data',
      createHash('sha256').update(text).digest('hex'),
    );
    const detail = {
      title:
        destination === 'web-query'
          ? tm('ส่งคำค้นให้บริการค้นเว็บ?')
          : destination === 'web-url'
            ? tm('เข้าถึงเว็บปลายทางนี้?')
            : tm('ส่งผลเครื่องมือให้ AI?'),
      body: tm(
        'ข้อมูลใหม่ {0} ตัวอักษร จะส่งให้ {1}\n{2}\nตรวจตัวอย่างที่ปิดบังแล้วก่อนยินยอม:\n{3}',
        text.length.toLocaleString(mainLocale()),
        destination === 'web-query'
          ? scope.connection.provider + tm(' และบริการค้นเว็บของบัญชีนี้')
          : destination === 'web-url'
            ? tm('เว็บปลายทางที่ระบุ')
            : scope.connection.provider,
        (review.findings || []).map((f: any) => f.label).join(', '),
        review.redactedText.slice(0, 1500),
      ),
      privacyClass: review.classification === 'public' ? 'internal' : review.classification,
      allowRemember: false,
      sessionId: scope.sessionId,
    };
    if (transmission && !destination) {
      const clean =
        review.action === 'pass' && review.classification === 'public' && !review.findings?.length && review.redactedText === text;
      await transmission.authorize(text.length, clean ? source : undefined, runScope =>
        this.approvals.choose(rule, { ...detail, runScope, runDefault: Boolean(runScope && this.policy().pilot) }, scope.signal),
      );
      return review.redactedText;
    }
    const approved = await this.approvals.request(rule, detail, scope.signal);
    if (scope.signal.aborted) throw new Error('CANCELLED');
    if (!approved) throw new Error('TOOL_DATA_DECLINED');
    return review.redactedText;
  }
  /** Asks the employee to approve the plan, then keeps it on the task as goal and tasks for the execute workflow. */
  private async approveWorkPlan(text: string, scope: ToolScope) {
    const parsed = parsePlan(text);
    if (!parsed.tasks.length) throw new Error('PLAN_NO_TASKS');
    const rule = this.approvals.rule(await this.workbench.root().catch(() => ''), 'plan', text);
    const approved = await this.approvals.request(
      rule,
      {
        title: tm('อนุมัติแผนงานนี้?'),
        body: text + tm('\nหลังอนุมัติ กด "ลงมือทำตามแผน" ให้ผู้ช่วยทำทีละขั้น งานที่ต้องอนุมัติ ลงนาม หรือส่งจริง ยังเป็นของผู้มีอำนาจ'),
        privacyClass: 'internal',
        allowRemember: false,
        sessionId: scope.sessionId,
      },
      scope.signal,
    );
    if (scope.signal.aborted) throw new Error('CANCELLED');
    if (!approved) return { approved: false, status: 'revise-the-plan-with-the-employee' };
    this.workbench.setWorkPlan(scope.sessionId, { ...parsed, approvedAt: new Date().toISOString() }, text);
    this.notify();
    return { approved: true, tasks: parsed.tasks.length, next: 'tell the employee to press ลงมือทำตามแผน' };
  }
  // Sites the employee let the AI read in each task (session), by host.
  private sites = new Map<string, Set<string>>();
  /**
   * The AI reads a website only after the employee allows that site once in the task, in every permission mode, as
   * Claude Code asks per domain. A page or file with hidden instructions could otherwise make the AI send task data to
   * any address in a URL without anyone seeing it. The full URL is shown, so data carried in it is visible.
   */
  private async siteConsent(url: string, scope: ToolScope) {
    const host = new URL(url).host;
    const allowed = this.sites.get(scope.sessionId) || new Set<string>();
    if (allowed.has(host)) return;
    const rule = this.approvals.rule(await this.workbench.root().catch(() => ''), 'web_fetch', host);
    const approved = await this.approvals.request(
      rule,
      {
        title: tm('ให้ AI อ่านเว็บไซต์นี้?'),
        body: url + tm('\nอนุญาตครั้งเดียวต่อเว็บไซต์ในงานนี้ ตรวจว่าที่อยู่ไม่มีข้อมูลของงานแฝงอยู่'),
        privacyClass: 'internal',
        allowRemember: false,
        sessionId: scope.sessionId,
      },
      scope.signal,
    );
    if (scope.signal.aborted) throw new Error('CANCELLED');
    if (!approved) throw new Error('WEB_SITE_DECLINED');
    allowed.add(host);
    this.sites.set(scope.sessionId, allowed);
  }
  async host(scope: ToolScope): Promise<LoopHost> {
    const jobs = new Set<string>();
    const stopJobs = () => {
      for (const id of jobs) void this.workbench.cancel(id);
      this.closeBrowser?.(scope.sessionId);
    };
    scope.signal.addEventListener('abort', stopJobs, { once: true });
    const workspace = await this.workbench.root().catch(() => ''),
      policy = this.policy(),
      mode = this.mode();
    const connectionIdentity = JSON.stringify(scope.connection),
      team = scope.team,
      hostIdentity = this.identity(scope.sessionId);
    const check = async () => {
      if (scope.signal.aborted) throw new Error('CANCELLED');
      if (blocked(scope.contract)) throw new Error('AUTHORITY_REVIEW_REQUIRED');
      if (workspace !== (await this.workbench.root().catch(() => ''))) throw new Error('WORKSPACE_CHANGED');
      if (policy !== this.policy() || mode !== this.mode()) throw new Error('POLICY_CHANGED');
      if (connectionIdentity !== JSON.stringify(scope.connection) || team !== scope.team) throw new Error('DESTINATION_CHANGED');
      if (hostIdentity !== this.identity(scope.sessionId)) throw new Error('DESTINATION_CHANGED');
      if (!this.policy().features.toolLoop) throw new Error('TOOL_LOOP_DISABLED');
    };
    const transmission = new RunTransmission(
      scope.sessionId,
      `${scope.connection.provider} (${scope.connection.id.slice(0, 8)}) / ${scope.connection.model || 'default'}${scope.connection.baseUrl ? ' / ' + scope.connection.baseUrl : ''}`,
      check,
      this.notify,
    );
    const consentStop = new AbortController();
    const transmissionScope = { ...scope, signal: AbortSignal.any([scope.signal, consentStop.signal]) };
    this.transmissions.set(transmission, () => {
      consentStop.abort();
      scope.cancel();
    });
    // Pilot mode: one answer covers every clean result in this run. Results with findings still ask each time.
    const sourceFor = async (r?: LoopRequest): Promise<TransmissionSource | undefined> => {
      const source = await sourceOf(r);
      if (!source || !this.policy().pilot) return source;
      return { key: 'pilot-run', label: tm('ผลการอ่านในงานนี้ที่ตรวจแล้วไม่พบข้อมูลส่วนบุคคล (ไฟล์ เว็บ และสถานะร่าง)') };
    };
    const sourceOf = async (r?: LoopRequest): Promise<TransmissionSource | undefined> => {
      if (!r || this.policy().transmissionConsent?.allowRunScope === false) return;
      if (
        r.tool === 'ask_user' ||
        r.tool === 'plan' ||
        r.tool === 'plan_update' ||
        (r.tool === 'changes' && !r.args?.action && typeof r.content === 'string')
      )
        return {
          key: 'draft-progress',
          label: tm('คำตอบที่คุณส่งให้ผู้ช่วยและสถานะการเตรียมร่างในงานนี้ (ไม่รวมเนื้อหาไฟล์หรือการส่งงานจริง)'),
        };
      if (r.tool === 'files') {
        if (this.sourceClean.get(r) === false) return;
        const folder =
          r.args?.action === 'list' || !r.input ? await this.workbench.path(r.input || '.') : dirname(await this.workbench.path(r.input));
        return { key: `files:${folder}`, label: tm('ไฟล์ข้อความในโฟลเดอร์ {0} (ไม่รวมโฟลเดอร์ย่อย)', relative(workspace, folder) || '.') };
      }
      if (['browser', 'web_fetch'].includes(r.tool)) {
        const origin = publicUrl(r.input).origin;
        return { key: `web:${origin}`, label: tm('ผลการอ่านเว็บ {0}', origin) };
      }
      if (['skill', 'reference'].includes(r.tool)) return { key: `${r.tool}:${r.input}`, label: `${r.tool}: ${r.input}` };
    };
    return {
      cancel: scope.cancel,
      enabled: () => this.policy().features.toolLoop,
      check,
      readOnly: r =>
        ![
          'terminal',
          'changes',
          'sheet_edit',
          'ask_user',
          'plan',
          'snapshot',
          'web_search',
          'mcp_call',
          'mcp_search',
          'sandbox',
          'browser_control',
        ].includes(r.tool),
      activity: t =>
        scope.activity(
          t.startsWith('skill ')
            ? tm('กำลังอ่าน Skill {0}', t.slice(6))
            : t.startsWith('reference ')
              ? tm('กำลังอ่านเอกสาร {0}', t.slice(10))
              : TOOL_ACTIVITY[t]
                ? tm(TOOL_ACTIVITY[t])
                : tm('กำลังใช้เครื่องมือ ') + t,
        ),
      outgoing: async (text, _signal, r) => {
        await check();
        const approved = await this.outgoing(text, transmissionScope, undefined, transmission, await sourceFor(r));
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
        consentStop.abort();
        transmission.close();
        this.transmissions.delete(transmission);
        scope.signal.removeEventListener('abort', stopJobs);
        if (scope.signal.aborted) await Promise.all([...jobs].map(id => this.workbench.cancel(id)));
      },
    };
  }
  /**
   * Accept edits and full auto apply a staged AI edit right away, through the same gate (path rules, hooks) and with a
   * snapshot to undo it. Ask mode, or any decision that still needs a person, leaves it staged for review.
   */
  private async settle<T extends { id: string; path: string }>(change: T, scope: ToolScope) {
    const request = { tool: 'write', readOnly: false, path: change.path };
    const root = await this.workbench.root().catch(() => '');
    const decision = evaluatePermission(request, this.mode(), this.policy(), { root });
    if (!decision.allowed || decision.requiresConfirmation) return { ...change, status: 'staged-for-human-review' };
    const applied = await this.gate.run(
      request,
      { title: tm('เขียนไฟล์ที่ตรวจแล้ว?'), body: change.path, key: change.path, sessionId: scope.sessionId },
      () => this.workbench.apply(change.id),
      scope.signal,
    );
    return applied ? { ...change, status: 'applied', snapshotId: applied.snapshotId } : { ...change, status: 'staged-for-human-review' };
  }
  async execute(r: LoopRequest, scope: ToolScope, check: () => Promise<void> = async () => {}) {
    const a = r.args || {},
      target = r.input;
    if (r.tool === 'browser_control' && this.mode() === 'plan' && a.action !== 'read') throw new Error('PLAN_MODE_BLOCKED');
    const fileTool = ['files', 'changes', 'doc_outline', 'doc_section', 'sheet_read', 'sheet_edit'].includes(r.tool);
    const command = r.tool === 'terminal' || r.tool === 'sandbox' ? target : undefined;
    if (command && this.harness.privacy(command).action === 'block-external') throw new Error('PRIVACY_REVIEW_REQUIRED');
    if (this.mode() === 'plan' && ['changes', 'sheet_edit'].includes(r.tool)) throw new Error('PLAN_MODE_BLOCKED');
    const request = {
      tool: r.tool,
      readOnly: !['terminal', 'sandbox', 'mcp_call', 'mcp_search'].includes(r.tool),
      ...(fileTool ? { path: target || '.' } : {}),
      ...(command ? { command, execute: true } : {}),
    };
    return this.gate.run(
      request,
      {
        title: tm('รันคำสั่งจาก AI?'),
        body: target + tm('\nคำสั่งอาจแก้ไฟล์หรือเชื่อมต่อเครือข่ายด้วยสิทธิ์ของคุณ'),
        key: target,
        sessionId: scope.sessionId,
      },
      async () => {
        switch (r.tool) {
          case 'mcp_search':
          case 'mcp_call':
          case 'sandbox':
          case 'browser_control':
            if (!this.external) throw new Error('TOOL_UNAVAILABLE');
            return this.external(r, scope, check);
          case 'files':
            if (a.action === 'list' || !target) return this.workbench.files(target);
            {
              const bytes = await this.workbench.bytes(target),
                text = bytes.toString('utf8');
              if (bytes.includes(0) || !Buffer.from(text).equals(bytes)) throw new Error('FILE_BINARY');
              // Scan the complete bounded file first, so a chunk boundary cannot split a credential pattern.
              const review = this.harness.privacy(text);
              this.sourceClean.set(
                r,
                review.action === 'pass' && review.classification === 'public' && !review.findings?.length && review.redactedText === text,
              );
              if (review.action === 'block-external' || typeof review.redactedText !== 'string') throw new Error('PRIVACY_REVIEW_REQUIRED');
              const offset = Number(a.offset || 0),
                safe = review.redactedText;
              if (!Number.isSafeInteger(offset) || offset < 0 || offset > safe.length) throw new Error('INVALID_INPUT');
              const end = Math.min(safe.length, offset + 40_000);
              return {
                path: target,
                text: safe.slice(offset, end),
                offset,
                total: safe.length,
                redactionApplied: review.redactionApplied,
                sourcePrivacyClass: review.classification,
                ...(end < safe.length ? { nextOffset: end } : {}),
              };
            }
          case 'changes':
            if (a.action === 'diff') return this.workbench.diff();
            if (a.action === 'list') return this.workbench.changes();
            if ((a.action && a.action !== 'stage') || r.content === undefined) throw new Error('INVALID_INPUT');
            return this.workbench.stage(target, r.content).then(c => this.settle({ id: c.id, path: c.path }, scope));
          case 'terminal':
            return this.workbench.start(target);
          case 'tasks':
            return this.workbench.tasks().filter(t => !target || t.id === target);
          case 'browser':
          case 'web_fetch': {
            const url = publicUrl(target).href;
            // A URL can leak task data through its path/query even on an otherwise public host.
            if (this.harness.privacy(decodeURIComponent(url)).action !== 'pass') throw new Error('PRIVACY_REVIEW_REQUIRED');
            await this.siteConsent(url, scope);
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
            let ref = (await this.harness.documentMetadata?.([target]))?.[0];
            // The AI sometimes names a document by its path or title instead of its ID; resolve those to the registered ID.
            if (!ref?.path || ref.status === 'unregistered') {
              const named = ((await this.harness.documentCatalog?.().catch(() => [])) || []).find(
                (e: any) => e.path === target || e.title === target || target.endsWith('/' + e.path),
              );
              if (named) ref = (await this.harness.documentMetadata?.([named.id]))?.[0];
            }
            if (!ref?.path || ref.status === 'unregistered') throw new Error('REFERENCE_UNAVAILABLE');
            const text = await this.context(ref.path);
            const part = typeof a.section === 'string' && a.section.trim() ? documentSection(text, a.section) : undefined;
            return part ? { ...ref, section: a.section, text: part } : { ...ref, text };
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
            return this.settle(change, scope);
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
            // The native plan workflow always asks: the employee approves the plan that "execute" will follow.
            if (scope.workflow === 'plan') return this.approveWorkPlan(target, scope);
            // A plan grants nothing beyond drafting; each side-effect tool still asks on its own. Pilot mode skips this dialog.
            // Nobody reviewed it, so it is not stored as an approved plan.
            if (this.policy().pilot)
              return {
                approved: false,
                status: 'noted-continue-drafting',
                scope: 'draft-only; business actions require separate authority',
              };
            const rule = this.approvals.rule(await this.workbench.root().catch(() => ''), 'plan', target);
            const approved = await this.approvals.request(
              rule,
              {
                title: tm('อนุมัติแผนก่อนจัดทำร่าง?'),
                body: target,
                privacyClass: 'internal',
                allowRemember: false,
                sessionId: scope.sessionId,
              },
              scope.signal,
            );
            if (!approved) throw new Error('CANCELLED');
            this.workbench.rememberPlan(scope.sessionId, target);
            return { approved: true, scope: 'draft-only; business actions require separate authority' };
          }
          case 'plan_update': {
            const status = String(a.status || '');
            if (!['todo', 'doing', 'done', 'blocked'].includes(status)) throw new Error('INVALID_INPUT');
            const note = typeof r.content === 'string' ? r.content.trim().slice(0, 300) : '';
            const remaining = this.workbench.updateWorkTask(scope.sessionId, Number(target), status as WorkTask['status'], note);
            this.notify();
            return { task: Number(target), status, remaining };
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
