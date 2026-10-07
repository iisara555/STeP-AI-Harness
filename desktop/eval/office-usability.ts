import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { sheetWorker } from '../electron/sheets';
// Harness evaluator is shared JavaScript.
import { buildTrialPlan, scoreUsability } from '../../src/modules/evals/tool-usability.js';
const suite = JSON.parse(await readFile(new URL('../../evals/tool-usability/office.json', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url),
  JSZip = require('jszip');
const output = resolve('release/qa/office');
await mkdir(output, { recursive: true });
const signal = new AbortController().signal;
const workerPath = resolve('electron/sheet-worker.cjs');
const run = (bytes: Buffer, args: Parameters<typeof sheetWorker>[1]) => sheetWorker(bytes, args, signal, workerPath);
const workbookSpec = {
  sheets: [
    {
      name: 'แผนงาน',
      columns: [
        { label: 'รหัส', type: 'text' },
        { label: 'ค่าใช้จ่าย', type: 'currency' },
      ],
      rows: [
        ['00123', 100],
        ['00007', 200],
      ],
      formulas: [{ cell: 'B4', formula: 'SUM(B2:B3)' }],
      source: 'ข้อมูลสังเคราะห์',
    },
  ],
};
const created = await run(Buffer.alloc(0), { operation: 'sheet_create', spec: workbookSpec });
const bytes = Buffer.from(created.binary, 'base64');
await writeFile(resolve(output, 'identifiers.xlsx'), bytes);
const zip = await JSZip.loadAsync(bytes);
zip.file('customXml/item1.xml', '<synthetic>preserve this part</synthetic>');
const preserved = await zip.generateAsync({ type: 'nodebuffer' });
const edited = await run(preserved, { edits: [{ cell: 'B2', value: 150 }] });
const editBytes = Buffer.from(edited.binary, 'base64');
await writeFile(resolve(output, 'edited.xlsx'), editBytes);
const deckSpec = {
  title: 'โครงการสังเคราะห์',
  slides: [
    {
      title: 'ความคืบหน้าโครงการ',
      bullets: ['เสร็จแล้วสองขั้นตอน', 'รอยืนยันกำหนดส่ง'],
      notes: 'ข้อมูลสังเคราะห์สำหรับทดสอบ',
      source: 'synthetic',
    },
    {
      title: 'แผนงาน',
      table: {
        headers: ['งาน', 'สถานะ'],
        rows: [
          ['ทดสอบเครื่องมือ', 'ร่าง'],
          ['ตรวจผล', 'รอยืนยัน'],
        ],
      },
    },
    { title: 'จำนวนงานสังเคราะห์', chart: { type: 'bar', categories: ['รอบแรก', 'รอบสอง'], series: [{ name: 'จำนวน', values: [2, 3] }] } },
  ],
};
const slides = await run(Buffer.alloc(0), { operation: 'slides_create', spec: deckSpec });
const deckBytes = Buffer.from(slides.binary, 'base64');
await writeFile(resolve(output, 'synthetic-deck.pptx'), deckBytes);
const book = new ExcelJS.Workbook();
await book.xlsx.load(bytes as any);
const changed = new ExcelJS.Workbook();
await changed.xlsx.load(editBytes as any);
const changedZip = await JSZip.loadAsync(editBytes),
  deckZip = await JSZip.loadAsync(deckBytes);
let preservedParts = true;
for (const path of Object.keys(zip.files).filter(p => !zip.files[p].dir && !['xl/workbook.xml', 'xl/worksheets/sheet1.xml'].includes(p)))
  if (!Buffer.from(await changedZip.file(path).async('nodebuffer')).equals(await zip.file(path).async('nodebuffer')))
    preservedParts = false;
const worksheet = book.worksheets[0];
const verifiedCreate = worksheet.getCell('A2').value === '00123' && (worksheet.getCell('B4').value as any).formula === 'SUM(B2:B3)';
const verifiedEdit = changed.worksheets[0].getCell('B2').value === 150 && preservedParts;
const verifiedSlides =
  (await deckZip.file('ppt/slides/slide1.xml').async('string')).includes('ความคืบหน้าโครงการ') &&
  Boolean(deckZip.file('ppt/charts/chart1.xml')) &&
  (await deckZip.file('ppt/slides/slide2.xml').async('string')).includes('<a:tbl>');
const read = await run(bytes, { range: 'A2' });
const evidence: Record<string, any> = {
  'sheet-read': [{ tool: 'sheet_read', result: read }],
  'sheet-create': [{ tool: 'sheet_create', result: { artifactVerified: verifiedCreate } }],
  'sheet-edit': [{ tool: 'sheet_edit', result: { artifactVerified: verifiedEdit } }],
  'slide-create': [{ tool: 'slides_create', result: { artifactVerified: verifiedSlides } }],
  'sheet-recovery': [],
};
try {
  await run(bytes, { sheet: 'missing-sheet', range: 'A2' });
} catch (e) {
  evidence['sheet-recovery'].push({ tool: 'sheet_read', error: (e as Error).message });
}
evidence['sheet-recovery'].push({ tool: 'sheet_read', result: read });
const trials = buildTrialPlan(
  suite.tasks.map((t: any) => t.id),
  42,
).map((trial: any) => ({
  ...trial,
  calls: trial.arm === 'with-tools' ? evidence[trial.taskId] : [],
  answer: trial.arm === 'without-tools' ? 'Controlled no-tool negative control; no model was called.' : undefined,
}));
const recording = { suite: suite.id, synthetic: true, kind: 'controlled-contract', seed: 42, trials };
await writeFile(resolve(output, 'recordings.json'), JSON.stringify(recording, null, 2));
const report = {
  ...scoreUsability(suite.tasks, trials, recording.kind),
  artifacts: {
    'identifiers.xlsx': createHash('sha256').update(bytes).digest('hex'),
    'edited.xlsx': createHash('sha256').update(editBytes).digest('hex'),
    'synthetic-deck.pptx': createHash('sha256').update(deckBytes).digest('hex'),
  },
  recalculation: 'not-run',
  visualReview: 'not-run',
};
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
if (!verifiedCreate || !verifiedEdit || !verifiedSlides) throw new Error('OFFICE_ARTIFACT_VERIFICATION_FAILED');
console.log(
  JSON.stringify({
    output,
    kind: recording.kind,
    verifiedArtifacts: 3,
    recovered: report.arms['with-tools'].recovered,
    modelBenefitEstablished: false,
    recalculation: report.recalculation,
    visualReview: report.visualReview,
  }),
);
