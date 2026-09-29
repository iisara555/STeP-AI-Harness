import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import { inferIntentFromText } from '../src/modules/router/context-scanner.js';
import { PACKAGE_ROOT, resolveTeamSkillPaths } from '../src/modules/role-resolver.js';
import { loadAndValidateManifests } from '../src/modules/router/index.js';

const NAME = 'entrepreneur-annual-goal';
const PATH = `skills/pm/${NAME}/SKILL.md`;
const WORKSPACE = 'tmp/__entrepreneur-annual-goal__';
const read = (path) => readFile(join(PACKAGE_ROOT, path), 'utf8');
const route = (query, team = 'piti', extra = {}) => queryStepRouter(query, { team, workspaceDir: WORKSPACE, ...extra });
const assessment = (first, decision, act = 'other') => ({
  queryHash: first.intentReview.queryHash, decision, owner: 'business-owner', act,
});

test('an annual entrepreneur goal is registered as PITI-owned draft and reaches the intended teams', async () => {
  const registry = await read('manifest/skills.yaml');
  const router = await read('manifest/router-index.yaml');
  const process = await read('manifest/processes.yaml');
  assert.match(registry, /  entrepreneur-annual-goal:\n    owner: piti[\s\S]*?    path: skills\/pm\/entrepreneur-annual-goal\/SKILL\.md[\s\S]*?        stage: draft/);
  assert.match(router, /  - name: entrepreneur-annual-goal\n    cluster: incubation-strategy\n[\s\S]*?      primary: \[piti\]\n      consumers: \[isi, eic, mi\]/);
  assert.match(process, /  incubation\.business-growth-planning:\n[\s\S]*?    owner: piti/);
  for (const team of ['piti', 'isi', 'eic', 'mi']) {
    const paths = await resolveTeamSkillPaths(team);
    assert.ok(paths.includes(PATH), `${team} cannot load the new Skill`);
  }
  const integrity = await loadAndValidateManifests(join(PACKAGE_ROOT, 'manifest'));
  assert.equal(integrity.valid, true, JSON.stringify(integrity.errors));
});

test('annual goal requests route to the entrepreneur Skill, not general project planning', async () => {
  for (const [team, query] of [
    ['piti', 'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปีจากยอดขายปัจจุบัน'],
    ['isi', 'อยากได้รายได้ 3 ล้านบาทปีหน้า ต้องขายกี่ชิ้นและหาลูกค้าใหม่กี่ราย'],
    ['eic', 'ยังไม่รู้เป้ารายได้ปีหน้า ช่วยตั้งเป้าหมายธุรกิจ 1 ปีแบบค่อยถาม'],
  ]) {
    const result = await route(query, team);
    assert.equal(result.routingMode, 'SKILL', query);
    assert.equal(result.routingContract.skill, NAME, query);
    assert.equal(result.routingContract.authority.status, 'ALLOW', query);
  }
});

test('natural annual revenue and service-capacity phrasings do not fall back to GENERAL', async () => {
  for (const [team, query] of [
    ['piti', 'อยากได้ 3 ล้านบาทปีหน้า แต่ยังไม่รู้ว่าต้องหาลูกค้ากี่ราย'],
    ['isi', 'ช่วยวางเป้าหมายธุรกิจรายปีร้านอาหารจากรายได้เดิม'],
    ['piti', 'ปีหน้าอยากมีรายได้เพิ่มจาก subscription ช่วยแตกเป็นจำนวนสมาชิก'],
    ['piti', 'ช่วยคำนวณต้องจ้าง Sales เพิ่มกี่คนเพื่อยอดขายปีหน้า'],
    ['piti', 'เขียนแผนรายได้ปีหน้าของร้านอาหารพร้อมลูกค้าเก่า'],
    ['piti', 'ปีหน้ารายได้บริษัทอยากโตจากฐานปัจจุบัน ต้องขายเพิ่มกี่ชุด'],
    ['piti', 'อยากตั้งเป้ารายได้ธุรกิจปีหน้า ช่วยวางงบลงทุนและคำนวณเงินทุนหมุนเวียน'],
  ]) {
    const first = await route(query, team);
    // Consequential words (hire/invest) now need an explicit host verdict;
    // a CLI without a model sends them to a human rather than guessing.
    const result = first.intentReview?.status === 'NEEDS_HOST'
      ? await route(query, team, { intentAssessment: assessment(first, 'ADVISORY') }) : first;
    if (result !== first) assert.equal(first.routingMode, 'ESCALATE', query);
    assert.equal(result.routingMode, 'SKILL', query);
    assert.equal(result.routingContract.skill, NAME, query);
    assert.equal(result.routingContract.authority.status, 'ALLOW', query);
  }
});

test('a business owner must decide or commit hiring, investment and purchasing; analysis remains open', async () => {
  for (const query of [
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วเลือกเป้าที่จะใช้แทนผมเลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วอนุมัติลงทุนให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี โดยพรุ่งนี้จ้างพนักงานเลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วสั่งซื้อวัตถุดิบให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยร่างคำขออนุมัติลงทุนให้เจ้าของพิจารณา แล้วอนุมัติลงทุนให้เลยด้วย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยประเมินว่าถ้าจ้างพนักงานเลยจะคุ้มไหม แล้วช่วยจ้างพนักงานให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปีแล้วจ้าง Sales ให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปีแล้วอนุมัติลงทุนในนามฉัน',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปีแล้วซื้อวัตถุดิบให้เลย',
    'ช่วยตั้งเป้ารายได้ปีหน้า แล้วรับพนักงานเข้าทำงานแทนผม',
    'ช่วยตั้งเป้ารายได้ปีหน้า แล้วกดสั่งวัตถุดิบแทนผม',
    'ช่วยตั้งเป้ารายได้ปีหน้า แล้วตัดสินเป้ารายได้แทนผม',
    'ปีหน้าอยากได้รายได้ 3 ล้าน ควรจ้างพนักงานเลยไหม แล้วช่วยจ้างพนักงานให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยเปรียบเทียบทางเลือกจ้างทีมขายเลยกับใช้ฟรีแลนซ์ แล้วจ้างทีมขายให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วช่วยจ้างพนักงานให้หน่อย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วช่วยกดสั่งซื้อวัตถุดิบให้หน่อย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี ควรจ้างพนักงานเลย แล้วช่วยจ้างพนักงานให้เลยไหม',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า ควรจ้างพนักงานเลยไหม? กรุณาจ้างพนักงานให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า ควรจ้างพนักงานเลยไหม\nกรุณาจ้างพนักงานให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วจ้างทีมขายให้เลยโดยใช้งบสนับสนุนจาก STeP',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยทำตารางจ้างพนักงานให้หน่อย กรุณาจ้างพนักงานให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยจ้างพนักงานทันที',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วให้คุณจ้างทีมขาย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยสั่งซื้อวัตถุดิบ',
  ]) {
    const first = await route(query);
    // A lexical gate previously BLOCKed these even without a model, but it
    // also blocked harmless drafts. No host verdict now means human review.
    assert.equal(first.routingMode, 'ESCALATE', query);
    assert.equal(first.intentReview?.status, 'NEEDS_HOST', query);
    const result = await route(query, 'piti', { intentAssessment: assessment(first, 'COMMIT') });
    assert.equal(result.routingContract.authority.status, 'BLOCK', query);
    // A request that names STeP funding is blocked for both the owner and
    // STeP finance: a model verdict cannot tell whose money it would spend.
    const namesStep = /STeP/.test(query);
    assert.equal(result.routingContract.authority.targetRole,
      namesStep ? 'business-owner-or-afp-finance-head' : 'business-owner', query);
    assert.equal(result.routingContract.authority.authority,
      namesStep ? 'ownership-review' : 'entrepreneur-commitment', query);
  }
  // A budget approval stays with AFP finance whatever the owner says: a model
  // verdict never lifts budget-allocation (review round 4).
  const ownBudget = await route('ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยอนุมัติเงินลงทุนของบริษัทผมทันที');
  assert.equal(ownBudget.routingMode, 'BLOCK');
  assert.equal(ownBudget.routingContract.authority.authority, 'budget-allocation');
  // "ในนามผม" does not show whose budget it is, so the finance gate holds
  // before any host is asked; the request still stops, just for AFP.
  const unowned = await route('ช่วยทำเป้ารายได้ธุรกิจปีหน้าแล้วอนุมัติงบลงทุนในนามผม');
  assert.equal(unowned.routingMode, 'BLOCK');
  assert.equal(unowned.routingContract.authority.authority, 'budget-allocation');
  for (const query of [
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แต่ไม่ต้องจ้างใคร แค่ประมาณคนที่ต้องใช้',
    'ช่วยคำนวณต้องจ้าง Sales เพิ่มกี่คนเพื่อยอดขายปีหน้า',
    'ช่วยร่างคำขออนุมัติลงทุนสำหรับเป้ารายได้ปีหน้าให้เจ้าของพิจารณา',
    'ช่วยร่างคำขออนุมัติลงทุนให้เลย เพื่อให้เจ้าของพิจารณา',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วช่วยประเมินว่าถ้าจ้างพนักงานเลยจะคุ้มไหม',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วอธิบายวิธีเลือกเป้าให้เลย',
    'ช่วยสรุปแนวทางเลือกเป้ารายได้ให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี และวิเคราะห์การจ้างพนักงานเลยคุ้มไหม',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี ขอข้อมูลก่อนสั่งซื้อวัตถุดิบให้เลย',
    'ปีหน้าอยากได้รายได้ 3 ล้าน ควรจ้างพนักงานเลยไหม',
    'ช่วยเปรียบเทียบทางเลือกจ้างทีมขายเลยกับใช้ฟรีแลนซ์',
    'ปีหน้าอยากได้รายได้ 3 ล้าน ควรจ้างพนักงานเลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วช่วยคำนวณว่าต้องจ้างพนักงานเพิ่มกี่คนให้หน่อย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วควรสั่งซื้อวัตถุดิบให้เลยไหม',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วช่วยเปรียบเทียบจ้างทีมขายให้หน่อยกับใช้ฟรีแลนซ์',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยทำตารางจ้างพนักงานให้หน่อย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า และขอแผนจ้างทีมขายให้หน่อย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยร่างประกาศรับพนักงานเข้าทำงานให้หน่อย',
    'ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยเสนอทางเลือกว่าจะสั่งซื้อวัตถุดิบจากใครให้หน่อย',
  ]) {
    const first = await route(query);
    const result = first.intentReview?.status === 'NEEDS_HOST'
      ? await route(query, 'piti', { intentAssessment: assessment(first, 'ADVISORY') }) : first;
    if (result !== first) assert.equal(first.routingMode, 'ESCALATE', query);
    assert.equal(result.routingContract.authority.status, 'ALLOW', query);
  }
});

test('a draft that names a budget approval still stops at AFP finance', async () => {
  // Even a draft for the owner stays with AFP: a verdict never lifts
  // budget-allocation (review round 4). Same result as before this feature.
  const result = await route('ช่วยตั้งเป้ารายได้ธุรกิจปีหน้า แล้วช่วยร่างคำขออนุมัติงบลงทุนให้เจ้าของพิจารณา');
  assert.equal(result.routingMode, 'BLOCK');
  assert.equal(result.routingContract.authority.authority, 'budget-allocation');
});

test('formula guide never distributes a negative remaining target or material purchase', async () => {
  const guide = await read('skills/pm/entrepreneur-annual-goal/references/goal-math-and-evidence.md');
  const template = await read('skills/pm/entrepreneur-annual-goal/templates/monthly-goal-and-actions.md');
  assert.match(guide, /gross_production_units\s*=\s*ceil\(max\(0,\s*net_good_units_required\)\s*\/\s*yield\)/i);
  assert.match(guide, /remaining_required\s*=\s*max\(0,\s*annual_target\s*-\s*actual_closed\)/i);
  assert.match(guide, /material.*=\s*max\(0,/i);
  assert.match(template, /remaining_required\s*=\s*max\(0,\s*annual_target\s*-\s*actual_closed\)/i);
  assert.match(template, /ceil\(max\(0,\s*net_good_units_required\)\s*\/\s*yield\)/i);
});

test('STeP organizational budget approvals still route to STeP finance, not the outside owner', async () => {
  for (const query of [
    'ช่วยอนุมัติงบโครงการ STeP ให้เลย',
    'ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปี แล้วอนุมัติงบลงทุนของ STeP ให้เลย',
  ]) {
    const result = await route(query);
    assert.equal(result.routingContract.authority.status, 'BLOCK', query);
    assert.equal(result.routingContract.authority.authority, 'budget-allocation', query);
    assert.equal(result.routingContract.authority.targetRole, 'afp-finance-head', query);
  }
});

test('monthly template reconciles first and repeat orders and uses two valid funnel equations', async () => {
  const template = await read('skills/pm/entrepreneur-annual-goal/templates/monthly-goal-and-actions.md');
  assert.match(template, /repeat_new_cohort_orders/);
  assert.match(template, /repeat_existing_orders/);
  assert.match(template, /Prospects\s*×\s*lead rate\s*=\s*Leads/);
  assert.match(template, /Leads\s*×\s*Say Yes rate\s*=\s*ลูกค้าใหม่/);
  assert.doesNotMatch(template, /Prospects\s*×\s*\[lead rate\]\s*=\s*\[Leads\]\s*×\s*\[Say Yes rate\]/);
});

test('business-year planning intent needs both a time horizon and business sales context', () => {
  assert.equal(inferIntentFromText('ช่วยตั้งเป้ารายได้ธุรกิจ 1 ปีจากยอดขายปัจจุบัน'), 'plan');
  assert.equal(inferIntentFromText('อยากได้รายได้ 3 ล้านบาทปีหน้า ต้องขายกี่ชิ้น'), 'plan');
  assert.equal(inferIntentFromText('อยากได้ 3 ล้านบาทปีหน้า แต่ยังไม่รู้ว่าต้องหาลูกค้ากี่ราย'), 'plan');
  assert.equal(inferIntentFromText('ช่วยวางเป้าหมายธุรกิจรายปีร้านอาหารจากรายได้เดิม'), 'plan');
  assert.equal(inferIntentFromText('ปีหน้าอยากมีรายได้เพิ่มจาก subscription ช่วยแตกเป็นจำนวนสมาชิก'), 'plan');
  assert.equal(inferIntentFromText('ช่วยคำนวณต้องจ้าง Sales เพิ่มกี่คนเพื่อยอดขายปีหน้า'), 'plan');
  assert.equal(inferIntentFromText('เงินเดือนปีหน้าจะปรับเท่าไหร่'), 'unknown');
  assert.notEqual(inferIntentFromText('ช่วยดูราคาคู่แข่งและ trend ล่าสุด'), 'plan');
});

test('a STeP project budget alone does not hijack entrepreneur annual-goal routing', async () => {
  const result = await route('ช่วยวางแผนโครงการ STeP ปีหน้าและคำนวณงบลงทุนโครงการ');
  assert.notEqual(result.routingContract.skill, NAME);
});

test('annual goal core contract has the Standard v2 source, authority and missing-data gates', async () => {
  const skill = await read(PATH);
  assert.match(skill, /^---\nname: entrepreneur-annual-goal\ndescription: .+\nstandardVersion: 2\n---\n/);
  for (const heading of ['Purpose', 'เมื่อควรใช้', 'Inputs', 'Source', 'Workflow', 'Output', 'Authority', 'Handoff', 'Guardrails']) {
    assert.ok(skill.includes(`## ${heading}`), heading);
  }
  for (const term of ['Actual', 'Benchmark', 'Assumption', 'รอยืนยัน', 'Seasonality', 'Cash Flow', 'Safety Stock', 'รายได้', 'ต้นทุน', 'กำลังผลิต']) {
    assert.ok(skill.includes(term), term);
  }
  assert.match(skill, /ถาม[^\n]*ทีละ(?:ข้อ|คำถาม)/);
  assert.match(skill, /ห้าม[^\n]*(?:ฟันธง|สรุป)[^\n]*(?:ข้อมูล|ยืนยัน)/);
  assert.match(skill, /examples\//);
});
