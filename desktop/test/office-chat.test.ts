import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { Workbench } from '../electron/workbench';
import { DesktopTools } from '../electron/tools';
import { Approvals } from '../electron/approvals';
import { Questions } from '../electron/questions';
import { ToolGate } from '../electron/tool-gate';
import { defaultPolicy } from '../electron/policy';
import type { Connection } from '../src/types';
const privacy: any = await import('../../src/modules/privacy/index.js');

test('Excel follow-up creates an actual workbook through chat, with accurate staged/applied status', async () => {
  for (const mode of ['ask', 'acceptEdits'] as const) {
    const root = await mkdtemp(join(tmpdir(), 'step-office-chat-'));
    const store = new Store(':memory:');
    const policy = defaultPolicy();
    const connection = { id: 'c', provider: 'openai', mode: 'api', model: 'synthetic', ready: true } as Connection;
    store.put('connection', 'c', connection);
    store.put('settings', 'main', { workspace: root, team: 'cc' });
    const session = store.create('c', 'cc');
    session.messages.push(
      { role: 'user', text: 'จัดตารางงานจากข้อมูลสังเคราะห์', at: '2026-10-01T00:00:00Z' },
      { role: 'assistant', text: '| รหัส | งาน | เวลา |\n|---|---|---|\n| 00123 | เตรียมพื้นที่ | รอยืนยัน |', at: '2026-10-01T00:00:01Z' },
    );
    store.save(session);
    const workbench = new Workbench(store, undefined, () => policy);
    const approvals = new Approvals(store, request => {
      if (request) queueMicrotask(() => approvals.respond(request.id, 'once'));
    });
    const gate = new ToolGate(
      () => policy,
      () => mode,
      () => workbench.root(),
      approvals,
      async () => ({ blocked: false, reason: '', results: [] }),
    );
    let tools: DesktopTools;
    const harness: Harness = {
      root,
      route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
      contextPolicy: () => ({ history: 'relevant-only', carryover: true }),
      privacy: privacy.evaluatePrivacyGate,
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
      toolLoop: () => true,
      permissionMode: () => mode,
      tools: scope => tools.host(scope),
    };
    tools = new DesktopTools(
      workbench,
      harness,
      gate,
      approvals,
      new Questions(() => {}),
      () => policy,
      () => mode,
      resolve(import.meta.dirname, '../electron/sheet-worker.cjs'),
    );
    let calls = 0,
      firstSystem = '';
    const service = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: root, env: {} },
        adapter: {
          run: async (prompt, _connection, context) => {
            calls++;
            if (calls === 1) {
              firstSystem = context.system || '';
              assert.match(prompt, /00123/);
              return (
                '```step-tool\n' +
                JSON.stringify({
                  tool: 'sheet_create',
                  input: 'synthetic-schedule.xlsx',
                  args: {
                    spec: {
                      sheets: [
                        {
                          name: 'ตารางงาน',
                          columns: [{ label: 'รหัส', type: 'text' }, { label: 'งาน' }, { label: 'เวลา' }],
                          rows: [['00123', 'เตรียมพื้นที่', 'รอยืนยัน']],
                          source: 'ข้อมูลสังเคราะห์ที่ผู้ใช้ให้',
                        },
                      ],
                    },
                  },
                }) +
                '\n```'
              );
            }
            assert.match(prompt, /<tool_results>/);
            assert.match(prompt, new RegExp(mode === 'ask' ? 'staged-for-human-review' : 'applied'));
            return mode === 'ask'
              ? 'เตรียม XLSX แล้ว กรุณาตรวจและนำไปใช้ใน Changes'
              : 'สร้างไฟล์ synthetic-schedule.xlsx แล้ว เวลาในตารางยังรอยืนยัน';
          },
        },
      }),
      () => {},
    );
    try {
      await service.run(session.id, 'ส่งออกตารางก่อนหน้าเป็น Excel', '', false, undefined, 'chat');
      assert.match(firstSystem, /When the user asks for Excel/);
      assert.match(firstSystem, /CSV/);
      assert.equal(store.session(session.id).status, 'review');
      assert.equal(calls, 2);
      if (mode === 'ask') {
        await assert.rejects(access(join(root, 'synthetic-schedule.xlsx')), /ENOENT/);
        const changes = store.list<any>('change');
        assert.equal(changes.length, 1);
        await workbench.apply(changes[0].id);
      }
      const book = new ExcelJS.Workbook();
      await book.xlsx.load((await readFile(join(root, 'synthetic-schedule.xlsx'))) as any);
      const sheet = book.getWorksheet('ตารางงาน')!;
      assert.equal(sheet.getCell('A2').value, '00123');
      assert.equal(sheet.getCell('B2').value, 'เตรียมพื้นที่');
      assert.equal(sheet.getCell('C2').value, 'รอยืนยัน');
      assert.ok(!store.session(session.id).messages.at(-1)?.text.includes('step-tool'));
    } finally {
      approvals.close();
      store.close();
      await rm(root, { recursive: true, force: true });
    }
  }
});
