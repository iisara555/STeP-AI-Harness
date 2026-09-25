import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRouterIndex, queryStepRouter } from '../src/cli/commands/ask.js';

/**
 * Routing regression scoreboard: original pilot plus synthetic coverage.
 *
 * One file, one table, one number to compare before and after a routing change.
 * The original 20 prompts retain their documented 2026-09-20 manual-pilot
 * provenance. Additional prompts are synthetic employee-style examples,
 * not evidence of real employee testing. Keep these sources separate.
 *
 * Each case pins the whole outcome an employee sees: routing mode, playbook,
 * skill, confidence tier and scope decision. A tier that drifts in either
 * direction fails, because a lost HIGH and an unearned HIGH are both routing
 * regressions.
 *
 * Baseline at the time of writing: 17 HIGH, 2 PLAYBOOK, 1 authority BLOCK.
 */

const WORKSPACE = 'tmp/__pilot-20-routing-regression__';

const PILOT_CASES = [
  {
    id: 1,
    team: 'cc',
    name: 'poster artwork completeness check before the printer deadline',
    prompt: 'พรุ่งนี้ต้องส่งแบบโปสเตอร์ให้โรงพิมพ์ ช่วยเช็คให้หน่อยว่าข้อมูลครบยัง',
    expect: { mode: 'SKILL', skill: 'designer-brief', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 2,
    team: 'afp',
    name: 'meeting catering receipt reimbursement eligibility',
    prompt: 'ใบเสร็จค่าอาหารจัดประชุม 12 คน เบิกได้มั้ยครับ ต้องแนบอะไรเพิ่ม',
    expect: { mode: 'SKILL', skill: 'receipt-audit', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 3,
    team: 'qs',
    name: 'ISO surveillance audit evidence preparation',
    prompt: 'ปีนี้จะมี surveillance audit ช่วยเตรียมหลักฐานให้หน่อย',
    expect: { mode: 'SKILL', skill: 'iso9001-audit-readiness', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 4,
    team: 'ga',
    name: 'meeting notes split into owners and due dates',
    prompt: 'จดประชุมเมื่อเช้าไว้แล้ว ช่วยแยกว่าใครต้องทำอะไรบ้าง ภายในเมื่อไหร่',
    expect: { mode: 'SKILL', skill: 'meeting-summary', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 5,
    team: 'les',
    name: 'test result and request form unit mismatch',
    prompt: 'ผลทดสอบตัวอย่างกับใบคำขอ หน่วยวัดไม่ตรงกัน ทำไงดี',
    expect: { mode: 'SKILL', skill: 'lab-result-review', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 6,
    team: 'afp',
    name: 'government TOR drafting for a video production contract',
    prompt: 'ร่าง TOR จ้างทำสื่อวิดีโอประชาสัมพันธ์ งบประมาณ 300000 บาท',
    expect: { mode: 'SKILL', skill: 'tor-government-writing', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 7,
    team: 'mi',
    name: 'will this product sell, how to market test',
    prompt: 'อยากรู้ว่าสินค้าตัวนี้จะขายได้ไหม ควรทดสอบตลาดยังไง',
    expect: { mode: 'SKILL', skill: 'market-signal-radar', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 8,
    team: 'cc',
    name: 'booth key visual image prompt for an external tool',
    prompt: 'ขอ prompt ทำภาพ key visual บูธ ผมใช้ ComfyUI',
    expect: { mode: 'SKILL', skill: 'step-image-prompt', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 9,
    team: 'sit',
    name: 'executive portfolio status by Friday',
    prompt: 'ผู้บริหารขอสรุปสถานะโครงการทุกตัวภายในศุกร์นี้',
    expect: { mode: 'SKILL', skill: 'executive-status-update', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 10,
    team: 'hd',
    name: 'new hire arriving next month',
    prompt: 'น้องใหม่เข้ามาเดือนหน้า ต้องเตรียมอะไรให้เขาบ้าง',
    expect: { mode: 'SKILL', skill: 'learning-designer', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 11,
    team: 'piti',
    name: 'go/no-go assessment of a professor technology',
    prompt: 'มีเทคโนโลยีจากอาจารย์ตัวนึง อยากประเมินว่าไปต่อได้ไหม',
    expect: { mode: 'SKILL', skill: 'startup-discovery', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 12,
    team: 'crm',
    name: 'how to answer a customer asking about lab services',
    prompt: 'ลูกค้าถามเรื่องบริการห้องแล็บ ควรตอบยังไงดี',
    expect: { mode: 'SKILL', skill: 'customer-support-faq-triage', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 13,
    team: 'qs',
    name: 'nonconforming product found in the process',
    prompt: 'เจอของไม่ได้มาตรฐานในกระบวนการ ต้องเปิดเอกสารอะไร',
    expect: { mode: 'SKILL', skill: 'ncr-capa', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 14,
    team: 'ga',
    name: 'board meeting invitation letter',
    prompt: 'ช่วยร่างหนังสือเชิญประชุมคณะกรรมการหน่อย',
    expect: { mode: 'SKILL', skill: 'thai-official-documents', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 15,
    team: 'cc',
    name: 'Facebook caption — the writing verb beats the seminar noun',
    prompt: 'เขียนแคปชั่นเฟซบุ๊กโปรโมทงานสัมมนาให้หน่อย',
    expect: { mode: 'SKILL', skill: 'step-writing', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 16,
    team: '',
    name: 'national ID in a document — PII beats the customer noun',
    prompt: 'เอกสารนี้มีเลขบัตรประชาชนลูกค้าอยู่ ส่งต่อได้ไหม',
    expect: { mode: 'SKILL', skill: 'data-privacy-compliance', tier: 'HIGH', scope: 'ALLOW' },
  },
  {
    id: 17,
    team: 'afp',
    name: 'TOR broken into milestones and a gantt chart',
    prompt: 'เอา TOR ฉบับนี้มาแตกเป็นแผนงาน milestone แล้วทำเป็น gantt',
    expect: { mode: 'PLAYBOOK', playbook: 'tor-to-project-plan' },
  },
  {
    id: 18,
    team: 'qs',
    name: 'adding a new Skill for our own team',
    prompt: 'อยากเพิ่ม skill ใหม่สำหรับงานของทีมเรา เริ่มยังไง',
    expect: { mode: 'PLAYBOOK', playbook: 'skill-to-pilot', skill: 'step-skill-authoring' },
  },
  {
    id: 19,
    team: 'afp',
    name: 'contractor payment approval is human-only',
    prompt: 'อนุมัติจ่ายเงินให้ผู้รับจ้างรายนี้เลย',
    // Authority preflight must fire before Skill matching, so a routing miss
    // can never turn a human-only approval into a generic AI answer.
    expect: {
      authorityPreflight: {
        status: 'BLOCK',
        authority: 'budget-allocation',
        targetRole: 'afp-finance-head',
      },
      scope: 'BLOCK',
    },
  },
  {
    id: 20,
    team: 'ga',
    name: 'procurement website form submit needs a confirmation gate',
    prompt: 'ล็อกอินเว็บจัดซื้อแล้วกดส่งแบบฟอร์มให้เลย',
    expect: {
      // A confirmation gate is not an activated Skill: the contract reports
      // ESCALATE so the host resolves the gate before any Skill context loads.
      mode: 'ESCALATE',
      skill: 'browser-form-assistant',
      tier: 'HIGH',
      scope: 'ESCALATE',
      targetSkill: 'browser-form-assistant',
    },
  },
];

// Two independently worded requests per previously uncovered router entry.
// Keep prompts free of skill IDs; test phrases employees could actually use.
const SYNTHETIC_SKILLS = [
  ['tor-review', 'afp',
    'ช่วยเช็คขอบเขตงานจ้างฉบับนี้หน่อยว่าคนรับงานจะเข้าใจตรงกันไหม',
    'ตรวจทีโออาร์ให้หน่อย กลัวเขียนเกณฑ์รับงานไม่ชัด'],
  ['document-review', 'ga',
    'ช่วยเช็คเอกสารฉบับนี้หน่อย มีช่องไหนยังเว้นว่างหรือวันที่ไม่ตรงกันไหม',
    'ช่วยดูร่างเอกสารทั่วไปให้หน่อย ยังมีจุดไหนตกหล่นบ้าง'],
  ['project-plan', 'pm',
    'วางแผนแบ่งงานโครงการนี้ให้หน่อยว่าอะไรต้องทำก่อนหลัง',
    'ช่วยกะเวลางานโครงการให้หน่อย แต่ละช่วงควรเสร็จเมื่อไหร่'],
  ['project-pre-mortem', 'pm',
    'ช่วยดูหน่อยว่าโครงการนี้อาจพังตรงไหนก่อนจะเริ่มทำ',
    'วางแผนกันโครงการล้มเหลวล่วงหน้าให้หน่อย จะได้เตรียมทางรับมือ'],
  ['innovation-okr-mapping', 'sit',
    'วางแผนแปลงเป้าหมายองค์กรมาเป็นเป้าทีมไตรมาสหน้าให้หน่อย',
    'ช่วยทบทวนเป้าทีมไตรมาสหน้าว่าสอดคล้องกับยุทธศาสตร์ไหม'],
  ['event-concept', 'cc',
    'ช่วยคิด concept งานเปิดบ้านให้หน่อย อยากให้คนเดินชมทั่วงาน',
    'ช่วยออกแบบกิจกรรมในงานเปิดบ้านให้คนอยากเข้าร่วมหน่อย'],
  ['presentation-design', 'cc',
    'ช่วยทำสไลด์เล่าโครงการให้ผู้บริหารฟังในสิบนาทีหน่อย',
    'ช่วยออกแบบหน้าแต่ละหน้าของงานนำเสนอให้เล่าเรื่องต่อกัน'],
  ['coding-git-workflow', 'developer',
    'ช่วยรีวิวโค้ดก่อนรวมเข้ากิ่งหลักให้หน่อย กลัวทำของเดิมพัง',
    'ช่วยตรวจโค้ดที่แก้รอบนี้ก่อนส่งให้เพื่อนรวมงานหน่อย'],
  ['github-workflow', 'developer',
    'วางแผนจัดบอร์ดงานบนกิตฮับให้หน่อย จะได้รู้ว่าใครทำอะไรอยู่',
    'ช่วยสร้างรายการงานบน GitHub แยกคนรับผิดชอบและป้ายกำกับให้หน่อย'],
  ['vercel-deploy', 'developer',
    'ช่วยขึ้นระบบเว็บบนเวอร์เซลให้ลองเปิดดูก่อนใช้จริงหน่อย',
    'ช่วยตรวจค่าตั้งต้นเว็บบนเวอร์เซลก่อนเอาขึ้นใช้งานหน่อย'],
  ['brand-tone-of-voice', 'cc',
    'ช่วยเช็คน้ำเสียงแบรนด์ในข้อความนี้หน่อยว่าเป็นทางการเกินไปไหม',
    'ช่วยดูภาษาที่สื่อสารในนามองค์กรหน่อยว่าเข้ากับบุคลิกแบรนด์ไหม'],
  ['sop-authoring', 'qs',
    'ช่วยเขียนวิธีทำงานทีละขั้นให้คนอื่นทำตามได้หน่อย',
    'ช่วยร่างขั้นตอนงานประจำให้คนมารับงานต่ออ่านแล้วทำได้เลย'],
  ['team-weekly-review', 'sit',
    'ช่วยสรุปงานทีมอาทิตย์นี้หน่อย ว่าเสร็จอะไร ค้างอะไรบ้าง',
    'ช่วยทบทวนงานทีมรอบสัปดาห์นี้แล้วแยกสิ่งที่ต้องทำต่อ'],
  ['step-brand', 'cc',
    'ช่วยเช็คตราอุทยานบนป้ายนี้ว่าเว้นระยะถูกตามคู่มือแบรนด์ไหม',
    'ช่วยดูสีและตัวอักษรเทียบกับคู่มือแบรนด์ของอุทยานให้หน่อย'],
  ['creative-art-director', 'cc',
    'ช่วยดูทิศทางภาพรวมงานออกแบบหน่อย ตอนนี้หน้าตาเหมือนงานทั่วไปมาก',
    'ช่วยคิด concept ภาพให้มีเอกลักษณ์หน่อย ยังไม่ต้องทำชิ้นงานจริง'],
  ['evidence-before-approval', 'qs',
    'ช่วยตรวจหลักฐานก่อนปิดงานหน่อย ว่ามีอะไรที่ยังยืนยันไม่ได้',
    'ช่วยเช็คว่ามีหลักฐานรองรับครบก่อนบอกว่างานเสร็จหรือยัง'],
  ['assumption-challenger', 'piti',
    'ช่วยทบทวนไอเดียนี้หน่อย มีอะไรที่เราคิดไปเองโดยยังไม่ได้พิสูจน์บ้าง',
    'ช่วยประเมินสิ่งที่เราเชื่อแต่ยังไม่มีหลักฐานในไอเดียนี้หน่อย'],
  ['decision-memo', 'imo',
    'ช่วยเปรียบเทียบทางเลือกให้หัวหน้าตัดสินใจหน่อย ขอข้อดีข้อเสียแต่ละทาง',
    'ช่วยประเมินสองทางเลือกนี้แล้วทำข้อมูลประกอบการตัดสินใจให้หัวหน้า'],
  ['industry-problem-discovery', 'linc',
    'ช่วยสรุปโจทย์จากที่คุยกับโรงงานหน่อย ว่าปัญหาจริงอยู่ตรงไหน',
    'ช่วยทบทวนปัญหาหน้างานโรงงานก่อนเสนอเทคโนโลยีให้เขาหน่อย'],
  ['expert-resource-matching', 'linc',
    'วางแผนหาคนช่วยแก้ปัญหาโรงงานหน่อย ต้องใช้อาจารย์ด้านไหน',
    'วางแผนหาเครื่องมือทดสอบให้ตรงกับโจทย์นี้หน่อย มีที่ไหนเหมาะบ้าง'],
  ['voice-of-customer', 'crm',
    'ช่วยสรุปว่าลูกค้าบ่นเรื่องอะไรบ่อยจากข้อความชุดนี้หน่อย',
    'ช่วยจัดกลุ่มความเห็นลูกค้าให้หน่อย อยากรู้ว่าควรแก้เรื่องไหนก่อน'],
  ['audit-evidence-matrix', 'qs',
    'ช่วยทำตารางว่าผู้ตรวจจะขอหลักฐานอะไร อยู่ที่ใคร อยู่ที่ไหน',
    'ช่วยรวบรวมรายการหลักฐานให้ผู้ตรวจแล้วจับคู่กับข้อกำหนดหน่อย'],
  ['document-record-control', 'qs',
    'ช่วยเช็คเอกสารในระบบคุณภาพหน่อยว่าฉบับไหนล่าสุด ฉบับไหนเลิกใช้แล้ว',
    'ช่วยตรวจทะเบียนเอกสารว่ามีฉบับเก่าหลงเหลือให้คนหยิบใช้ไหม'],
  ['audit-interview-coach', 'qs',
    'ช่วยซ้อมตอบผู้ตรวจให้หน่อย กลัวตอบไม่ตรงกับงานที่ทำจริง',
    'ช่วยซ้อมสัมภาษณ์ตอนตรวจระบบคุณภาพให้ทีมหน่อย'],
  ['qms-risk-opportunity-review', 'qs',
    'ช่วยทบทวนความเสี่ยงของระบบคุณภาพกับโอกาสปรับปรุงรอบนี้หน่อย',
    'ช่วยประเมินทะเบียนความเสี่ยงระบบคุณภาพว่ายังมีเรื่องไหนตกหล่น'],
  ['quality-objective-kpi-review', 'qs',
    'ช่วยดูตัวชี้วัดคุณภาพหน่อยว่าเป้าที่ตั้งไว้วัดผลได้จริงไหม',
    'ช่วยทบทวนเป้าด้านคุณภาพที่ทำไม่ถึงหน่อย ต้องดูข้อมูลอะไรเพิ่ม'],
  ['management-review-prep', 'qs',
    'ช่วยรวบรวมข้อมูลเข้าประชุมทบทวนฝ่ายบริหารให้หน่อย',
    'ช่วยจัดทำชุดข้อมูลให้ผู้บริหารทบทวนระบบคุณภาพรอบปีนี้หน่อย'],
  // Appended last on purpose: AMBIGUOUS_BY_DESIGN keys are positional.
  ['event-run-of-show', 'cc',
    'ช่วยจัดทำรันคิวเวทีจากกำหนดการนี้ แยกคิวจอ คิวเสียง และคนรับผิดชอบแต่ละคิว',
    'ช่วยตรวจ sequence เวทีนี้ว่าเวลารวมไม่ตรงตรงไหน คิวไหนยังไม่มีคนรับผิดชอบ'],
  ['hr-policy-lookup', 'hd',
    'ลาพักผ่อนได้ปีละกี่วัน แล้วสะสมข้ามปีได้ไหม',
    'ไปราชการต่างจังหวัดเบิกค่าที่พักได้คืนละเท่าไหร่'],
  ['afp-operations-lookup', 'afp',
    'ขอออกใบเสร็จรับเงินใช้เวลากี่วันทำการ',
    'จ้างเหมารถตู้ไปจัดกิจกรรมลงหมวดค่าใช้จ่ายอะไร'],
  ['stakeholder-questionnaire', 'qs',
    'ทำลิสต์คำถามไปถามเจ้าของเอกสาร SOP ที่ยังรอยืนยัน',
    'ช่วยร่างคำถามส่งให้หัวหน้า เพื่อขอคำยืนยันขอบเขตงานก่อนเริ่มโครงการ'],
];

/**
 * Prompts where the top two candidates each matched exactly one trigger of
 * comparable precision, so no evidence rule can separate them without
 * reintroducing a length bias. Asking one question is the documented behaviour
 * for that tier. Narrowing the competing trigger in manifest/router-index.yaml
 * is a governance decision, not a scorer change, so the expectation records it.
 */
const AMBIGUOUS_BY_DESIGN = {
  // meeting-summary matches the generic "ประชุม" against "ทบทวนฝ่ายบริหาร".
  'synthetic-27-1': 'meeting-summary matches ประชุม',
};

const CASES = [
  ...PILOT_CASES.map(item => ({ ...item, source: 'manual-pilot-2026-09-20' })),
  ...SYNTHETIC_SKILLS.flatMap(([skill, team, ...prompts], index) => prompts.map((prompt, variant) => {
    const id = `synthetic-${index + 1}-${variant + 1}`;
    const ambiguous = AMBIGUOUS_BY_DESIGN[id];
    return {
      id,
      name: `${skill} colloquial variant ${variant + 1}${ambiguous ? ` (clarifies: ${ambiguous})` : ''}`,
      source: 'synthetic-2026-09-20',
      team,
      prompt,
      expect: ambiguous
        ? { mode: 'CLARIFY', skill, tier: 'AMBIGUOUS', scope: 'ALLOW' }
        : { mode: 'SKILL', skill, tier: 'HIGH', scope: 'ALLOW' },
    };
  })),
  ...[
    ['afp', 'ร่าง TOR จ้างจัดกิจกรรมในงานเปิดบ้านให้หน่อย', 'tor-government-writing'],
    ['cc', 'ช่วยเขียนแคปชั่นชวนคนมางานเปิดบ้านหน่อย', 'step-writing'],
    ['ga', 'ช่วยร่างหนังสือเชิญเข้าประชุมทบทวนฝ่ายบริหารหน่อย', 'thai-official-documents'],
    ['qs', 'ช่วยตรวจทะเบียนเอกสารที่มีเลขบัตรประชาชนก่อนส่งต่อหน่อย', 'data-privacy-compliance'],
    ['cc', 'ช่วยออกแบบคอนเซ็ปต์งานนิทรรศการและผังบูธสำหรับงานเปิดบ้าน', 'event-concept'],
  ].map(([team, prompt, skill], index) => ({
    id: `boundary-${index + 1}`,
    name: `colloquial topic must preserve ${skill}`,
    source: 'synthetic-boundary-2026-09-20',
    team,
    prompt,
    expect: { mode: 'SKILL', skill, tier: 'HIGH', scope: 'ALLOW' },
  })),
  // First-day prompts from an employee with no team set yet: the words people
  // type before they know the system. Before 2026-09-25, 32 of 40 such prompts
  // asked a question first; these pin the ones that now route or help directly.
  ...[
    ['ตรวจคำผิดให้หน่อย', 'step-writing'],
    ['ทำ timeline โครงการ', 'project-plan'],
    ['เตรียมตัวสัมภาษณ์ตรวจ ISO', 'audit-interview-coach'],
    ['ทำ brief ให้ดีไซเนอร์', 'designer-brief'],
    ['ทำ TOR ซื้อคอมพิวเตอร์', 'tor-government-writing'],
    ['ทำ prompt รูปโปสเตอร์', 'step-image-prompt'],
    ['ลาป่วยต้องมีใบรับรองแพทย์ไหม', 'hr-policy-lookup'],
    ['ช่วยแปลเป็นภาษาอังกฤษ', null],
    ['ช่วยเขียนอีเมลถึงลูกค้าหน่อย', null],
    ['ช่วยทำ excel สรุปยอด', null],
    ['สรุป PDF นี้เป็นข้อ ๆ', null],
    ['ขอไอเดียกิจกรรม team building', null],
  ].map(([prompt, skill], index) => ({
    id: `first-day-${index + 1}`,
    name: skill ? `first-day wording routes to ${skill}` : 'first-day general task gets help without questions',
    source: 'synthetic-first-day-2026-09-25',
    team: '',
    prompt,
    expect: skill
      ? { mode: 'SKILL', skill, tier: 'HIGH', scope: 'ALLOW' }
      : { mode: 'GENERAL', tier: 'FALLBACK', scope: 'ALLOW' },
  })),
];

test('Pilot and synthetic routing regression', async (t) => {
  const failures = [];

  for (const item of CASES) {
    await t.test(`Case ${item.id} [${item.team || 'no team'}]: ${item.name}`, async () => {
      const result = await queryStepRouter(item.prompt, {
        team: item.team || undefined,
        workspaceDir: WORKSPACE,
      });

      const actual = {
        mode: result.routingMode,
        playbook: result.selectedPlaybook?.id,
        skill: result.selectedSkill?.name,
        tier: result.routingConfidence?.tier,
        scope: result.scopeResult?.status,
      };

      try {
        const { expect } = item;

        if (expect.mode) assert.equal(actual.mode, expect.mode, 'routing mode');
        if (expect.playbook) assert.equal(actual.playbook, expect.playbook, 'playbook');
        if (expect.skill) assert.equal(actual.skill, expect.skill, 'skill');
        if (expect.tier) assert.equal(actual.tier, expect.tier, 'confidence tier');
        if (expect.scope) assert.equal(actual.scope, expect.scope, 'scope decision');
        if (expect.targetSkill) {
          assert.equal(result.scopeResult?.targetSkill, expect.targetSkill, 'escalation target');
        }

        if (expect.authorityPreflight) {
          for (const [key, value] of Object.entries(expect.authorityPreflight)) {
            assert.equal(result.authorityPreflight?.[key], value, `authority preflight ${key}`);
          }
          assert.equal(result.routingContract?.authority?.status, 'BLOCK', 'routing contract authority');
        }
      } catch (error) {
        failures.push({ id: item.id, name: item.name, actual, message: error.message });
        throw error;
      }
    });
  }

  await t.test('scoreboard', () => {
    if (failures.length > 0) {
      const lines = failures.map(
        (f) => `  Case ${f.id} (${f.name}): ${f.message}\n    actual: ${JSON.stringify(f.actual)}`
      );
      assert.fail(`${failures.length}/${CASES.length} pilot routing cases regressed:\n${lines.join('\n')}`);
    }
  });

  await t.test('confidence coverage does not slip below the current baseline', () => {
    const openGaps = CASES.filter((item) => item.openGap);
    assert.equal(
      openGaps.length,
      0,
      `open routing gaps reappeared: ${openGaps.map((g) => `case ${g.id} (${g.openGap})`).join('; ')}`
    );

    const highTierCases = CASES.filter((item) => item.expect.tier === 'HIGH');
    assert.ok(
      highTierCases.length >= 17,
      `expected at least 17 HIGH-confidence pilot cases, table now pins ${highTierCases.length}`
    );
  });

  await t.test('every router entry has an expected route and prompts have provenance', async () => {
    const catalog = await loadRouterIndex();
    const covered = new Set(CASES.map(item => item.expect.skill).filter(Boolean));
    assert.deepEqual([...covered].sort(), catalog.map(skill => skill.name).sort());
    assert.equal(new Set(CASES.map(item => item.prompt)).size, CASES.length);
    assert.equal(new Set(CASES.map(item => item.id)).size, CASES.length);
    assert.equal(CASES.filter(item => item.source === 'manual-pilot-2026-09-20').length, 20);
    assert.ok(CASES.every(item => item.source));
  });

  await t.test('generic fallback never invites governance bypass', async () => {
    const askSource = await readFile('src/cli/commands/ask.js', 'utf-8');
    assert.ok(
      !askSource.includes('คุณสามารถถามกับ AI ได้โดยตรงในฐานะผู้ช่วยทั่วไป'),
      'fallback must not invite the employee to bypass Authority and Guardrails'
    );
    assert.ok(askSource.includes('ระบบจะยังคงตรวจ Authority และ Guardrails ก่อนดำเนินการ'));
  });
});
