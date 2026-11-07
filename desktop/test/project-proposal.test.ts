import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { projectProposalReview } from '../src/project-proposal';
import { documentRequest, documentTool } from '../src/document-tools';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { queryStepRouter, loadSkillContextMetadata, loadDocumentContextMetadata } from '../../src/modules/router/service.js';
import { evaluatePrivacyGate } from '../../src/modules/privacy/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('projectProposalReview flags vague objective verbs and recommends measurable action verbs', () => {
  const draft = [
    '# ร่างเพื่อพิจารณา — โครงการพัฒนาทักษะดิจิทัล',
    '',
    '## ๑. หลักการและเหตุผล',
    'เนื่องจากบุคลากรจำเป็นต้องใช้ระบบสารสนเทศในการจัดการเอกสารของหน่วยงานและลดความซ้ำซ้อนของขั้นตอนการทำงาน',
    '',
    'เพื่อให้การดำเนินงานเป็นไปอย่างมีประสิทธิภาพ จึงกำหนดแนวทางฝึกปฏิบัติการใช้งานระบบจริงอย่างเป็นขั้นตอน',
    '',
    'ดังนั้น หน่วยงานจึงได้จัดทำโครงการพัฒนาทักษะดิจิทัลขึ้น โดยมุ่งหวังให้บุคลากรปฏิบัติงานได้อย่างถูกต้องและรวดเร็ว',
    '',
    '## ๒. วัตถุประสงค์',
    '๑. เพื่อให้ผู้เข้าร่วมเข้าใจถึงขั้นตอนการจัดทำเอกสารดิจิทัล',
    '๒. เพื่อซาบซึ้งในความสำคัญของมาตรฐานงานสารบรรณ',
  ].join('\n');

  const notes = projectProposalReview(draft);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /เพื่อเข้าใจถึง/);
  assert.match(notes[0], /เพื่อซาบซึ้งใน/);
  assert.match(notes[0], /คำกริยาเชิงพฤติกรรม/);
});

test('projectProposalReview passes measurable objective verbs and 3-paragraph rationale without warnings', () => {
  const draft = [
    '# ร่างเพื่อพิจารณา — โครงการพัฒนาทักษะดิจิทัล',
    '',
    '## ๑. หลักการและเหตุผล',
    'เนื่องจากบุคลากรจำเป็นต้องใช้ระบบสารสนเทศในการจัดการเอกสารของหน่วยงานและลดความซ้ำซ้อนของขั้นตอนการทำงานในปัจจุบัน',
    '',
    'เพื่อให้การดำเนินงานเป็นไปอย่างมีประสิทธิภาพ จึงกำหนดแนวทางฝึกปฏิบัติการใช้งานระบบจริงอย่างเป็นขั้นตอนตามวงจร PDCA',
    '',
    'ดังนั้น หน่วยงานจึงได้จัดทำโครงการพัฒนาทักษะดิจิทัลขึ้น โดยมุ่งหวังให้บุคลากรสามารถจัดทำเอกสารดิจิทัลได้อย่างถูกต้อง',
    '',
    '## ๒. วัตถุประสงค์',
    '๑. เพื่อพัฒนาศักยภาพการจัดทำเอกสารดิจิทัลของบุคลากร',
    '๒. เพื่อประเมินผลสัมฤทธิ์จากการฝึกปฏิบัติเทียบกับเกณฑ์มาตรฐาน',
    '',
    '## ๓. กลุ่มเป้าหมาย',
    '- ผู้เข้าร่วมโครงการ: 40 คน',
    '- คณะผู้ดำเนินงาน: 10 คน',
    '- รวมจำนวนทั้งสิ้น: 50 คน',
    '',
    '## ๖. งบประมาณและแหล่งงบประมาณ',
    '| รายการ | รายละเอียดการคำนวณ | รวมเป็นเงิน |',
    '|---|---|---|',
    '| ค่าอาหารกลางวัน | 120 บาท × 50 คน × 1 มื้อ | 6,000 |',
    '| ค่าวัสดุฝึกอบรม | 100 บาท × 40 คน | 4,000 |',
  ].join('\n');

  assert.deepEqual(projectProposalReview(draft), []);
});

test('projectProposalReview warns when substantive rationale has fewer than 3 paragraphs or budget headcounts mismatch target group', () => {
  const draft = [
    '# ร่างเพื่อพิจารณา — โครงการอบรมเชิงปฏิบัติการ',
    '',
    '## ๑. หลักการและเหตุผล',
    'เนื่องจากหน่วยงานมีความจำเป็นต้องยกระดับทักษะการวิเคราะห์ข้อมูลของบุคลากรให้รองรับการให้บริการผู้ประกอบการในพื้นที่ภาคเหนือ จึงต้องจัดโครงการอบรมเชิงปฏิบัติการอย่างเข้มข้นเพื่อแก้ปัญหาดังกล่าวทันที',
    '',
    '## ๒. วัตถุประสงค์',
    '๑. เพื่อส่งเสริมทักษะการวิเคราะห์ข้อมูลของบุคลากร',
    '',
    '## ๓. กลุ่มเป้าหมาย',
    '- ผู้เข้าร่วมโครงการภายใน: ๓๐ คน',
    '- คณะผู้ดำเนินงาน: ๕ คน',
    '',
    '## ๖. งบประมาณและแหล่งงบประมาณ',
    '- ค่าอาหารว่างและเครื่องดื่ม (50 บาท × 45 คน × 2 มื้อ = 4,500 บาท)',
    '- ค่าอาหารกลางวัน (120 บาท × 35 คน × 1 มื้อ = 4,200 บาท)',
  ].join('\n');

  const notes = projectProposalReview(draft);
  assert.equal(notes.length, 2);
  assert.match(notes[0], /หลักการและเหตุผลมี 1 ย่อหน้า/);
  assert.match(notes[1], /ค่าอาหารว่างและเครื่องดื่ม \(45 คน\)/);
  assert.match(notes[1], /30 หรือ 35 คน/);
});

test('project tool exposes subtypes, loads project-writing-guide, and appends consistency review outside the draft', async () => {
  const project = documentTool('project')!;
  assert.ok(project.references.includes('skills/pm/project-plan/references/project-writing-guide.md'));
  assert.deepEqual(
    project.variants.map(v => v.id),
    ['proposal', 'policy', 'problem', 'innovation', 'logframe'],
  );
  const logframeReq = documentRequest('project', { title: 'โครงการสังเคราะห์' }, 'logframe');
  const parsed = JSON.parse(logframeReq.sourceText);
  assert.equal(parsed.variant, 'ข้อเสนอโครงการแบบตารางเหตุผลต่อเนื่อง (Logframe 4×4)');

  const store = new Store(':memory:');
  try {
    store.put('connection', 'test', { id: 'test', provider: 'openai', model: 'synthetic', ready: true });
    const session = store.create('test', 'pm');
    const harness: Harness = {
      root,
      route: (text, options) => queryStepRouter(text, { ...options, workspaceDir: root }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: evaluatePrivacyGate,
      skillMetadata: async id => {
        const meta = await loadSkillContextMetadata(id);
        return { ...meta, mandatoryReferences: await loadDocumentContextMetadata(meta?.mandatory || []) };
      },
      documentPrivacy: async () => null,
      nextOutput: async () => null,
    };
    const draftBody = [
      '# ร่างเพื่อพิจารณา — โครงการสังเคราะห์',
      '',
      '## ๑. หลักการและเหตุผล',
      'เนื่องจากหน่วยงานต้องพัฒนาทักษะการวิเคราะห์ข้อมูลของบุคลากรอย่างเป็นระบบเพื่อให้สอดคล้องกับแผนปฏิบัติการประจำปีและลดข้อผิดพลาดในการทำงาน',
      '',
      '## ๒. วัตถุประสงค์',
      '๑. เพื่อให้ผู้เข้าร่วมเข้าใจถึงหลักการวิเคราะห์ข้อมูลเบื้องต้น',
      '',
      '## ๓. กลุ่มเป้าหมาย',
      '- ผู้เข้าร่วมโครงการ: 25 คน',
      '',
      '## ๖. งบประมาณและแหล่งงบประมาณ',
      '- ค่าอาหารกลางวัน (120 บาท × 30 คน × 1 มื้อ = 3,600 บาท)',
      '',
      '## ๘. ผลที่คาดว่าจะได้รับ',
      '[รอยืนยัน: ผลที่คาดว่าจะได้รับ]',
    ].join('\n');
    let systemSeen = '';
    const service = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: root, env: {} },
        adapter: {
          run: async (_prompt, _connection, context) => {
            systemSeen = context.system || '';
            return `<document_draft>${draftBody}</document_draft><document_review>ตรวจต้นฉบับก่อนเสนอ</document_review>`;
          },
        },
      }),
      () => {},
    );
    await service.run(session.id, logframeReq.text, logframeReq.sourceText, true, undefined, 'draft', undefined, [], {
      documentTool: 'project',
      documentVariant: 'logframe',
    });
    const done = store.session(session.id);
    assert.equal(done.documentVariant, 'logframe');
    assert.ok(done.proposals[0].sources.includes('skills/pm/project-plan/references/project-writing-guide.md'));
    assert.match(systemSeen, /คู่มือการเขียนข้อเสนอโครงการ/);
    assert.match(done.proposals[0].review!, /เพื่อเข้าใจถึง/);
    assert.match(done.proposals[0].review!, /หลักการและเหตุผลมี 1 ย่อหน้า/);
    assert.match(done.proposals[0].review!, /ค่าอาหารกลางวัน \(30 คน\)/);
    assert.equal(done.proposals[0].text, draftBody, 'review warnings must not alter the editable draft');
  } finally {
    store.close();
  }
});
