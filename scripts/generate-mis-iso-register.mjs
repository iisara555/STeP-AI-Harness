#!/usr/bin/env node
// Generates docs/knowledge/mis-iso-document-register.md from a private STeP MIS extract of the quality-system document
// registers (เอกสารระบบคุณภาพ (ISO): Master List, QM, QP, WI, FM, SD). The extract holds metadata only (number, REV,
// effective date, title, team, file links). The links and the extract itself stay out of this public repository; the
// generated file keeps the metadata and drops every URL.
//
//   node scripts/generate-mis-iso-register.mjs <extract.json> --captured YYYY-MM-DD [--out <file>] [--check]
//
// Extract shape: { mslist|isoqm|isoqp|isowi|isoform|isosd: { head: [...], n, rows: [{ cells: [...], links: [...] }] } }.
// Output is deterministic: rows are sorted, nothing depends on the clock or the extract order. --check compares
// instead of writing and exits 1 when the file is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'docs', 'knowledge', 'mis-iso-document-register.md');

/** MIS register keys in display order, with the type code and Thai heading used in the generated file. */
const REGISTERS = [
  { key: 'mslist', type: 'Master List', label: 'Master List' },
  { key: 'isoqm', type: 'QM', label: 'คู่มือคุณภาพ (QM)' },
  { key: 'isoqp', type: 'QP', label: 'ขั้นตอนการดำเนินงาน (QP)' },
  { key: 'isowi', type: 'WI', label: 'วิธีปฏิบัติงาน (WI)' },
  { key: 'isoform', type: 'FM', label: 'แบบฟอร์ม (FM)' },
  { key: 'isosd', type: 'SD', label: 'เอกสารสนับสนุน (SD)' },
];
/**
 * Largest generated section, in characters. The Desktop knowledge search gives the model at most 4,000 characters of a
 * matched section and indexes at most 20,000; staying under the smaller keeps every row of a matched section visible.
 */
export const SECTION_LIMIT = 3800;
const CANCELLED = '(ยกเลิกการใช้งาน)';
const COLUMNS = ['เลขที่เอกสาร', 'REV.', 'วันที่บังคับใช้', 'ชื่อเอกสาร', 'ทีม'];
const TABLE_HEAD = '| เลขที่ | ประเภท | REV | วันที่บังคับใช้ | ชื่อ | สถานะ |\n| --- | --- | --- | --- | --- | --- |';

const URL = /(?:https?:\/\/|www\.)\S*/gi;
/** One table cell: no URLs, no pipes or line breaks, single spaces. */
const cell = (value) =>
  String(value ?? '')
    .replace(URL, '')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim() || '-';
const teamCode = (team) => /\(([^()]+)\)\s*$/.exec(team)?.[1]?.trim() || team;
/** Natural order for document numbers (FM-AF-2 before FM-AF-10); Master Lists (no number) sort by title. */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const byNumber = (a, b) => collator.compare(a.number, b.number) || collator.compare(a.title, b.title);
const fmt = (n) => n.toLocaleString('en-US');

function readRows(extract) {
  const rows = [];
  for (const { key, type } of REGISTERS) {
    const register = extract?.[key];
    if (!register || !Array.isArray(register.rows)) throw new Error(`extract has no ${key} register`);
    if (Number.isInteger(register.n) && register.n !== register.rows.length)
      throw new Error(`${key}: MIS shows ${register.n} documents but the extract has ${register.rows.length} rows`);
    const head = (register.head || []).map((h) => String(h).trim());
    const index = COLUMNS.map((name) => head.indexOf(name));
    if (index.some((i) => i < 0)) throw new Error(`${key}: missing column ${COLUMNS[index.findIndex((i) => i < 0)]}`);
    for (const { cells = [] } of register.rows) {
      const [number, rev, date, rawTitle, rawTeam] = index.map((i) => cells[i]);
      const cancelled = String(rawTitle ?? '').includes(CANCELLED);
      const team = cell(rawTeam);
      const num = cell(number);
      const prefix = /^([A-Z]{2})-/.exec(num)?.[1];
      rows.push({
        register: type,
        // MIS occasionally files a document under another register (an SD listed with the QPs). Keep the register MIS
        // shows and say what the number says, rather than silently re-filing it.
        type: prefix && type !== 'Master List' && prefix !== type ? `${type} (ทะเบียน ${type} ใน MIS · เลขขึ้นต้น ${prefix})` : type,
        number: num,
        rev: cell(rev),
        date: cell(date),
        title: cell(String(rawTitle ?? '').split(CANCELLED).join(' ')),
        status: cancelled ? 'ยกเลิก' : 'ใช้อยู่',
        team,
        code: teamCode(team),
      });
    }
  }
  return rows;
}

const rowLine = (r) => `| ${r.number} | ${r.type} | ${r.rev} | ${r.date} | ${r.title} | ${r.status} |`;
const typeOrder = (r) => REGISTERS.findIndex((x) => x.type === r.register);
const sortRows = (rows) => [...rows].sort((a, b) => typeOrder(a) - typeOrder(b) || byNumber(a, b));
const tally = (rows) => {
  const active = rows.filter((r) => r.status === 'ใช้อยู่').length;
  return `ใช้อยู่ ${fmt(active)} · ยกเลิก ${fmt(rows.length - active)}`;
};
// The full MIS team name sits in the body, not the heading: headings count more in the Desktop search, and long Thai
// team names ("ห้องปฏิบัติการและเครื่องมือ") made unrelated questions about labs or equipment land on form lists.
const section = (heading, rows, team) =>
  `## ${heading}\n\n${team} · ${tally(rows)}\n\n${TABLE_HEAD}\n${rows.map(rowLine).join('\n')}\n`;

/** Rows split greedily into parts whose rendered section stays under SECTION_LIMIT. */
function parts(rows, headingFor, team) {
  const out = [];
  let current = [];
  for (const row of rows) {
    const next = [...current, row];
    if (current.length && section(headingFor(next), next, team).length > SECTION_LIMIT) {
      out.push(current);
      current = [row];
    } else current = next;
  }
  if (current.length) out.push(current);
  return out;
}

function teamSections(teamRows) {
  const { code, team } = teamRows[0];
  const rows = sortRows(teamRows);
  const types = REGISTERS.filter((r) => rows.some((x) => x.register === r.type)).map((r) => r.label);
  const whole = section(`ทีม ${code} · ${types.join(', ')}`, rows, team);
  if (whole.length <= SECTION_LIMIT) return [whole];
  const out = [];
  for (const register of REGISTERS) {
    const ofType = rows.filter((r) => r.register === register.type);
    if (!ofType.length) continue;
    // Number ranges let a question that names a document number land on the right part; Master Lists have none.
    const heading = (chunk) =>
      register.type === 'Master List'
        ? `ทีม ${code} · Master List ของทีม`
        : `ทีม ${code} · ${register.label} ${chunk[0].number} ถึง ${chunk[chunk.length - 1].number}`;
    for (const chunk of parts(ofType, heading, team)) out.push(section(heading(chunk), chunk, team));
  }
  return out;
}

function overviewSections(rows) {
  const picked = sortRows(rows.filter((r) => r.register === 'QM' || r.register === 'Master List'));
  // Team first, so a document number still finds its row in the team section (lines starting with "| <number> |").
  const line = (r) => `| ${r.code} ${rowLine(r)}`;
  const head = `| ทีม ${TABLE_HEAD.replace('\n', '\n| --- ')}`;
  const render = (chunk, label) =>
    `## คู่มือคุณภาพ (QM) และ Master List ของทุกทีม${label}\n\n` +
    'คู่มือคุณภาพ (Quality Manual) และ Master List ของแต่ละทีมมีอยู่ใน STeP MIS ไฟล์นี้มีเฉพาะรายการ เปิดเนื้อหาจาก MIS\n\n' +
    `${head}\n${chunk.map(line).join('\n')}\n`;
  const out = [];
  let current = [];
  for (const row of picked) {
    if (current.length && render([...current, row], ' (ต่อ)').length > SECTION_LIMIT) {
      out.push(current);
      current = [row];
    } else current.push(row);
  }
  if (current.length) out.push(current);
  return out.map((chunk, i) => render(chunk, out.length > 1 ? ` (ส่วนที่ ${i + 1}/${out.length})` : ''));
}

/** The register as Markdown. `captured` is the date the extract was taken (YYYY-MM-DD); required for determinism. */
export function renderRegister(extract, { captured } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(captured || ''))) throw new Error('captured date (YYYY-MM-DD) is required');
  const rows = readRows(extract);
  const count = (type) => fmt(rows.filter((r) => r.register === type).length);
  const header = [
    '# ทะเบียนเอกสารระบบคุณภาพ ISO ของ STeP (จาก STeP MIS)',
    '',
    'รายการเลขที่ REV และวันที่บังคับใช้ของเอกสารระบบคุณภาพทุกทีม ดึงจาก STeP MIS เมนู เอกสารระบบคุณภาพ (ISO) ให้ AI ตอบได้ว่าแบบฟอร์มหรือเอกสารใดเป็นรุ่นใด ใช้อยู่หรือยกเลิกแล้ว',
    '',
    '**แหล่งข้อมูล:** STeP MIS → เอกสารระบบคุณภาพ (ISO) (ทะเบียน Master List, QM, QP, WI, FM, SD) — เป็นแหล่งจริงของเลขที่ REV และวันที่บังคับใช้',
    `**ดึงข้อมูลเมื่อ:** ${captured}`,
    `**จำนวน:** Master List ${count('Master List')} · QM ${count('QM')} · QP ${count('QP')} · WI ${count('WI')} · FM ${count('FM')} · SD ${count('SD')} · รวม ${fmt(rows.length)} รายการ (${tally(rows)})`,
    '**ทะเบียน:** [`manifest/documents.yaml`](../../manifest/documents.yaml) → `mis-iso-document-register`',
    '**สร้างโดย:** `scripts/generate-mis-iso-register.mjs` จากข้อมูลที่ดึงจาก MIS ห้ามแก้ไฟล์นี้ด้วยมือ ให้ดึงใหม่แล้วสร้างใหม่',
    '',
    '## วิธีใช้ทะเบียนนี้',
    '',
    '- **STeP MIS คือฉบับจริง** ถ้า REV หรือวันที่ใน MIS ต่างจากไฟล์นี้ ให้ยึด MIS ไฟล์นี้เป็นภาพ ณ วันที่ดึงข้อมูลข้างบน',
    '- **เปิดหรือดาวน์โหลดแบบฟอร์มและเอกสารจาก STeP MIS เท่านั้น** ไฟล์นี้มีแต่รายการ ไม่มีเนื้อหาเอกสารและไม่มีลิงก์ ห้าม AI สร้างแบบฟอร์มขึ้นเอง',
    '- AI ตอบเลขที่ REV วันที่บังคับใช้ และสถานะจากตารางได้ โดยบอกว่าเป็นข้อมูลจาก STeP MIS ณ วันที่ดึง ส่วนขั้นตอน เงื่อนไข หรือวงเงินในเนื้อเอกสาร ไม่มีในไฟล์นี้ ห้ามเดา',
    '- สถานะ **ยกเลิก** คือรายการที่ MIS ระบุว่า (ยกเลิกการใช้งาน) ห้ามแนะนำให้ใช้ เอกสารที่ไม่อยู่ในทะเบียนนี้ให้ตอบว่าไม่พบ และให้ตรวจใน MIS',
    '- การประกาศใช้ แก้ไข หรือยกเลิกเอกสารควบคุมเป็นอำนาจของ QS และผู้มีอำนาจตาม `iso-enactment` เท่านั้น AI ไม่รับรองสถานะแทน QS',
    '- วันที่เป็นปี ค.ศ. ตามที่ MIS แสดง (2026 = พ.ศ. 2569) ช่อง REV ที่เป็น - คือ MIS ไม่แสดงเลข REV',
    '',
  ].join('\n');
  const teams = new Map();
  for (const row of rows) {
    if (!teams.has(row.code)) teams.set(row.code, []);
    teams.get(row.code).push(row);
  }
  const codes = [...teams.keys()].sort((a, b) => collator.compare(a, b));
  const body = [...overviewSections(rows), ...codes.flatMap((code) => teamSections(teams.get(code)))];
  const md = `${header}\n${body.join('\n')}`;
  if (/https?:\/\/|www\./i.test(md)) throw new Error('generated register contains a URL');
  return md;
}

function main(argv) {
  const args = [...argv];
  const option = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const [, value] = args.splice(i, 2);
    return value;
  };
  const check = args.includes('--check');
  if (check) args.splice(args.indexOf('--check'), 1);
  const out = resolve(option('--out') || DEFAULT_OUT);
  const captured = option('--captured');
  const input = args[0];
  if (!input) {
    console.error('usage: generate-mis-iso-register.mjs <extract.json> --captured YYYY-MM-DD [--out file] [--check]');
    return 2;
  }
  const extract = JSON.parse(readFileSync(resolve(input), 'utf8'));
  const md = renderRegister(extract, { captured: captured || extract.capturedAt });
  if (check) {
    let current = '';
    try {
      current = readFileSync(out, 'utf8');
    } catch {}
    if (current !== md) {
      console.error(`${out} is out of date; rerun without --check`);
      return 1;
    }
    console.log(`${out} is up to date`);
    return 0;
  }
  writeFileSync(out, md);
  console.log(`wrote ${out}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
