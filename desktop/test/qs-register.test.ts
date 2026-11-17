// Controlled forms against the STeP MIS register (QP-DC-001: the controlled original lives in MIS). The app must not
// print an old revision of a form it builds, name a cancelled form as evidence, or let an outdated attached form pass
// without a warning. Synthetic files only; the register is the generated snapshot in docs/knowledge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AlignmentType, Document, Footer, Packer, Paragraph, TextRun } from 'docx';
import { formReference, formRevisionCheck, parseRegister } from '../src/qs-register';
import { templateControlText } from '../electron/document-template';
import { RECEIPT_VOUCHER_FOOTER } from '../electron/receipt-voucher';

const register = parseRegister(await readFile(join(import.meta.dirname, '../../docs/knowledge/mis-iso-document-register.md'), 'utf8'));
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${THAI_MONTHS[month - 1]} ${year + 543}`;
};

test('the register reads revision, effective date and status for every form row', () => {
  assert.ok(register.size > 1000, `${register.size} rows`);
  assert.deepEqual(register.get('FM-AF-014'), {
    code: 'FM-AF-014',
    rev: 2,
    revLabel: 'V.02',
    effective: '2025-06-01',
    title: 'ใบสำคัญรับเงิน',
    active: true,
  });
  assert.equal(register.get('FM-AF-010')?.active, false);
  assert.equal(register.get('FM-AF-010')?.rev, undefined);
});

test('a form number and revision are read in both QP-DC-001 footer styles', () => {
  assert.deepEqual(formReference('FM-QM-001 V.00 วันที่บังคับใช้เอกสาร 1 ต.ค. 65 (อายุการจัดเก็บเอกสาร 2 ปี)'), {
    code: 'FM-QM-001',
    rev: 0,
  });
  assert.deepEqual(formReference('ชื่อเรื่อง: การควบคุมเอกสาร Doc. No.: QP-DC-001 / REV.: 06 / EFT. Date: 1 Apr 69'), {
    code: 'QP-DC-001',
    rev: 6,
  });
  assert.deepEqual(formReference('FM-AF-002 V.๐๓'), { code: 'FM-AF-002', rev: 3 });
  assert.deepEqual(formReference('แบบ FM-AF-002'), { code: 'FM-AF-002' });
  assert.equal(formReference('บันทึกข้อความ ไม่มีรหัส'), undefined);
});

test('an outdated, cancelled or unregistered form is reported; the current revision is not', () => {
  assert.deepEqual(formRevisionCheck('FM-AF-002 V.02 วันที่บังคับใช้เอกสาร 1 มิ.ย. 2568', register), {
    code: 'form-revision',
    form: 'FM-AF-002',
    status: 'outdated',
    used: 'V.02',
    current: 'V.03',
    effective: '2026-09-01',
  });
  assert.equal(formRevisionCheck('FM-AF-002 V.03', register), undefined);
  assert.deepEqual(formRevisionCheck('FM-AF-010 V.01', register), {
    code: 'form-revision',
    form: 'FM-AF-010',
    status: 'cancelled',
    effective: '2024-10-16',
  });
  assert.equal(formRevisionCheck('FM-ZZ-999 V.01', register)?.status, 'unregistered');
  assert.equal(formRevisionCheck('เนื้อหาทั่วไป', register), undefined);
});

test('the receipt voucher prints the current FM-AF-014 revision and effective date', () => {
  const entry = register.get('FM-AF-014')!;
  assert.equal(formRevisionCheck(RECEIPT_VOUCHER_FOOTER, register), undefined);
  assert.ok(RECEIPT_VOUCHER_FOOTER.startsWith(`FM-AF-014 ${entry.revLabel} `), RECEIPT_VOUCHER_FOOTER);
  assert.ok(RECEIPT_VOUCHER_FOOTER.includes(thaiDate(entry.effective)), `${RECEIPT_VOUCHER_FOOTER} vs ${entry.effective}`);
});

test('every controlled form the app names is in use in the register', async () => {
  const codes = new Map<string, string>();
  for (const folder of ['src', 'electron'])
    for (const name of await readdir(join(import.meta.dirname, '..', folder))) {
      if (!/\.(?:ts|tsx)$/.test(name)) continue;
      const source = await readFile(join(import.meta.dirname, '..', folder, name), 'utf8');
      for (const [code] of source.matchAll(/\bFM-[A-Z]{2}-\d{3}\b/g)) codes.set(code, `${folder}/${name}`);
    }
  assert.ok(codes.size >= 8, [...codes.keys()].join(', '));
  for (const [code, file] of codes) assert.equal(register.get(code)?.active, true, `${code} in ${file} is not in use in the MIS register`);
});

test('an attached form is read from its footer before its body', async () => {
  const docx = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun('FM-AF-002 V.02 วันที่บังคับใช้เอกสาร 1 มิ.ย. 2568')],
              }),
            ],
          }),
        },
        children: [new Paragraph('ใบขออนุมัติสังเคราะห์ อ้างถึง FM-AF-001')],
      },
    ],
  });
  const text = await templateControlText(await Packer.toBuffer(docx));
  assert.equal(formRevisionCheck(text, register)?.status, 'outdated');
  assert.equal(formRevisionCheck(text, register)?.form, 'FM-AF-002');
});
