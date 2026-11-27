/**
 * Live check of coordinated drafting: the same request drafted once as a plain draft and once split across workers,
 * on a real provider, so a reviewer can compare the two drafts side by side. Synthetic, public requests only.
 * Needs STEP_EVAL_APPROVE_LIVE=1 and a provider (see eval/runtime.ts); writes eval-results/<date>-coordinator/.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../electron/store';
import { WorkService } from '../electron/service';
import { Coordinator, type Subtask } from '../electron/coordinator';
import { defaultPolicy } from '../electron/policy';
import { evaluationHarness } from './golden';
import { evaluationRuntime } from './runtime';

const SCENARIOS = [
  {
    id: 'training-project',
    request:
      'ร่างโครงการอบรมเชิงปฏิบัติการ "การใช้ AI ช่วยงานเอกสารสำหรับบุคลากร" 1 วัน ผู้เข้าอบรม 40 คน ประกอบด้วย หลักการและเหตุผล วัตถุประสงค์ กลุ่มเป้าหมาย กำหนดการ งบประมาณแยกรายการ ตัวชี้วัด และผลที่คาดว่าจะได้รับ',
    source:
      'ข้อมูลประกอบ (สังเคราะห์): จัดวันที่ 15 มกราคม 2570 ห้องประชุมใหญ่ ชั้น 3 วิทยากรภายนอก 1 คน ค่าตอบแทนวิทยากรชั่วโมงละ 1,200 บาท 6 ชั่วโมง อาหารกลางวันคนละ 120 บาท อาหารว่าง 2 มื้อ มื้อละ 35 บาท วัสดุอุปกรณ์รวม 3,000 บาท',
  },
  {
    id: 'purchase-memo',
    request:
      'ร่างบันทึกข้อความขออนุมัติจัดซื้อคอมพิวเตอร์โน้ตบุ๊ก 5 เครื่องสำหรับฝ่ายสื่อสารองค์กร ให้มีเหตุผลความจำเป็น รายละเอียดคุณลักษณะ ราคากลางและแหล่งที่มา วิธีจัดซื้อ และข้อเสนอเพื่อพิจารณา',
    source:
      'ข้อมูลประกอบ (สังเคราะห์): เครื่องเดิมใช้งานมา 7 ปี ซ่อมบ่อย ราคาสืบจาก 3 ร้าน เฉลี่ยเครื่องละ 32,500 บาท รวม 162,500 บาท ใช้เงินงบประมาณประจำปี 2570 หมวดครุภัณฑ์',
  },
];

async function main() {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url))),
    harness = await evaluationHarness(root);
  const prepared = await evaluationRuntime();
  const only = (process.env.STEP_EVAL_ONLY || '').split(',').filter(Boolean);
  const date = new Date().toISOString();
  const folder = resolve('eval-results', date.replace(/[:.]/g, '-') + '-coordinator');
  await mkdir(folder, { recursive: true });
  const report: string[] = [`# Coordinated drafting, live (${prepared.connection.provider} ${prepared.connection.model || 'default'})`, ''];
  const summary: any[] = [];
  try {
    for (const scenario of SCENARIOS.filter(s => !only.length || only.includes(s.id))) {
      const store = new Store(':memory:'),
        policy = defaultPolicy();
      policy.features.coordinator = true;
      store.put('connection', prepared.connection.id, prepared.connection);
      store.put('settings', 'main', { workspace: tmpdir(), team: 'cc', assistant: 'eval' });
      const service = new WorkService(
        store,
        harness,
        async () => prepared.runtime(),
        () => {},
      );
      let plan: Subtask[] = [];
      const coordinator = new Coordinator(
        store,
        service,
        () => policy,
        () => 'stable',
        async (_id, tasks) => {
          plan = tasks;
          return true;
        },
        (query, team) => harness.route(query, { team }),
        () => {},
      );
      try {
        // Plain draft: the baseline the split must not fall below.
        const plain = store.create(prepared.connection.id, 'cc');
        let started = Date.now();
        await service.run(plain.id, scenario.request, scenario.source, true, undefined, 'draft', undefined, [], {});
        const plainMs = Date.now() - started;
        const plainSession = store.session(plain.id);
        const plainDraft = plainSession.proposals.at(-1)?.text || plainSession.draft || '';
        // Coordinated draft of the same request.
        const split = store.create(prepared.connection.id, 'cc');
        started = Date.now();
        let error = '';
        await coordinator
          .run(split.id, scenario.request, scenario.source, { text: scenario.request, files: [], onAccepted: () => {} })
          .catch(e => (error = e instanceof Error ? e.message : String(e)));
        const splitMs = Date.now() - started;
        const splitSession = store.session(split.id);
        const splitDraft = splitSession.proposals.at(-1)?.text || '';
        const parts = coordinator.children(split.id).map(child => child.proposals.at(-1)?.text || child.draft || '');
        summary.push({
          id: scenario.id,
          plain: { status: plainSession.status, ms: plainMs, chars: plainDraft.length },
          split: { status: splitSession.status, ms: splitMs, chars: splitDraft.length, subtasks: plan.length, error },
        });
        report.push(
          `## ${scenario.id}`,
          '',
          `Plain: ${plainSession.status}, ${Math.round(plainMs / 1000)} s, ${plainDraft.length} chars. Split: ${splitSession.status}${error ? ' ' + error : ''}, ${Math.round(splitMs / 1000)} s, ${splitDraft.length} chars, ${plan.length} subtasks.`,
          '',
          '### Plan',
          '',
          ...plan.map((t, i) => `${i + 1}. ${t.query}${t.dependsOn.length ? ` (after ${t.dependsOn.join(', ')})` : ''}`),
          '',
          '### Plain draft',
          '',
          plainDraft,
          '',
          '### Split draft (merged)',
          '',
          splitDraft || splitSession.messages.filter(m => m.role === 'status').at(-1)?.text || '',
          '',
          '### Parts',
          '',
          ...parts.flatMap((p, i) => [`#### Part ${i + 1}`, '', p, '']),
        );
      } finally {
        await coordinator.closeAndWait();
        await service.closeAndWait();
        store.close();
      }
    }
    await writeFile(join(folder, 'results.json'), JSON.stringify({ date, ...prepared.stats(), summary }, null, 2));
    await writeFile(join(folder, 'report.md'), report.join('\n'));
    console.log(JSON.stringify({ ...prepared.stats(), summary }));
    console.log(`Report: ${join(folder, 'report.md')}`);
  } finally {
    await prepared.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main().catch(error => {
    console.error(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'EVAL_FAILED');
    process.exitCode = 1;
  });
