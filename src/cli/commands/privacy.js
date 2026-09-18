import { readFile, writeFile } from 'node:fs/promises';
import { extname, basename, dirname, join } from 'node:path';
import { evaluatePrivacyGate } from '../../modules/privacy/index.js';
import { colors } from '../../utils/colors.js';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.log']);

function riskLabel(value) {
  if (value === 'public') return 'ทั่วไป';
  if (value === 'internal') return 'ภายใน';
  if (value === 'restricted') return 'จำกัดการเข้าถึง';
  if (value === 'sensitive') return 'อ่อนไหว/ความเสี่ยงสูง';
  return value;
}

function actionLabel(value) {
  if (value === 'pass') return 'ใช้ได้ตามปกติ';
  if (value === 'auto-mask') return 'ปิดบังข้อมูลก่อนส่ง AI';
  if (value === 'human-confirm') return 'ให้ผู้ใช้ตรวจสอบก่อนส่ง';
  if (value === 'block-external') return 'หยุดการส่งไป AI ภายนอก';
  return value;
}

function redactedPath(filePath) {
  const ext = extname(filePath);
  const name = basename(filePath, ext);
  return join(dirname(filePath), `${name}.redacted${ext}`);
}

export async function runPrivacy(args) {
  const file = args.file || args.f || '';
  const inlineText = args.text || '';

  if (!file && !inlineText) {
    console.log('ใช้: step-ai privacy --file <ไฟล์ข้อความ> หรือ step-ai privacy --text "<ข้อความ>"');
    console.log('รองรับการอ่านตรง: txt, md, csv, json, yaml, yml, log');
    console.log('PDF/รูปภาพต้องผ่านตัวอ่านเอกสาร local ของ AI client ก่อน — คำสั่งนี้จะไม่ OCR อัตโนมัติ\n');
    return;
  }

  let text = inlineText;
  if (file) {
    const ext = extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) {
      console.log(colors.yellow('ไฟล์นี้ไม่ได้ถูกอ่านข้อความอัตโนมัติ เพื่อหลีกเลี่ยง OCR/processing ที่ไม่จำเป็น'));
      console.log('ให้ใช้ตัวอ่านเอกสาร local ที่ได้รับอนุญาต แล้วส่งเฉพาะข้อความที่ต้องตรวจเข้า Privacy Gate\n');
      return;
    }
    text = await readFile(file, 'utf-8');
  }

  const started = performance.now();
  const result = evaluatePrivacyGate(text);
  const elapsedMs = performance.now() - started;

  console.log(colors.bold('\nผลตรวจ Privacy Gate'));
  console.log(`  ระดับข้อมูล:      ${riskLabel(result.classification)}`);
  console.log(`  การดำเนินการ:     ${actionLabel(result.action)}`);
  console.log(`  พบข้อมูลส่วนบุคคล: ${result.containsPersonalData ? 'พบ' : 'ไม่พบ'}`);
  console.log(`  เวลาตรวจ:         ${elapsedMs.toFixed(2)} ms`);

  if (result.findings.length) {
    console.log('\n  รายการที่ตรวจพบ:');
    for (const finding of result.findings) {
      console.log(`  - ${finding.label}: ${finding.count} จุด`);
    }
  }

  if (args.redact && file && result.redactionApplied && result.action !== 'block-external') {
    const outPath = redactedPath(file);
    await writeFile(outPath, result.redactedText, 'utf-8');
    console.log(`\n  สร้างสำเนาที่ปิดบังข้อมูลแล้ว: ${outPath}`);
  }

  if (result.action === 'block-external') {
    console.log(colors.red('\n  หยุด: พบข้อมูลความเสี่ยงสูงร่วมกับตัวระบุบุคคล ห้ามส่งต้นฉบับไป AI ภายนอกโดยอัตโนมัติ'));
  }

  console.log();
}
