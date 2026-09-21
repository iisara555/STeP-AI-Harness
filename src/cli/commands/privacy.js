import { writeFile } from 'node:fs/promises';
import { extname, basename, dirname, join } from 'node:path';
import { evaluatePrivacyGate } from '../../modules/privacy/index.js';
import { evaluateDocumentPrivacy, unavailableDocument, DOCUMENT_LIMITS } from '../../modules/privacy/document.js';
import { colors } from '../../utils/colors.js';

function riskLabel(value) {
  if (value === 'public') return 'ทั่วไป';
  if (value === 'internal') return 'ภายใน';
  if (value === 'restricted') return 'จำกัดการเข้าถึง';
  if (value === 'sensitive') return 'อ่อนไหว/ความเสี่ยงสูง';
  return value;
}

function actionLabel(value) {
  if (value === 'pass') return 'ไม่พบรูปแบบที่เฝ้าระวัง — ใช้สิทธิ์ของเอกสารต้นทางประกอบ';
  if (value === 'auto-mask') return 'ปิดบังรูปแบบที่ตรวจพบแล้ว — ต้องตรวจสำเนาและสิทธิ์ก่อนส่ง';
  if (value === 'human-confirm') return 'ให้ผู้ใช้ตรวจสอบก่อนส่ง';
  if (value === 'block-external') return 'หยุดการส่งไป AI ภายนอก';
  return value;
}

function redactedPath(filePath) {
  const ext = extname(filePath);
  const name = basename(filePath, ext);
  return join(dirname(filePath), `${name}.redacted.txt`);
}

export async function runPrivacy(args) {
  const file = args.file || args.f || '';
  const inlineText = args.text || '';

  if (!file && !inlineText) {
    console.log('ใช้บนเครื่องก่อนแนบไฟล์: step-ai privacy --file <ไฟล์> [--json] [--redact]');
    console.log('รองรับ UTF-8 txt/md/csv/tsv/json/yaml/yml/log, PDF text layer และ DOCX');
    console.log('อ่าน local ไม่มี OCR; รูปภาพ/ไฟล์อ่านไม่ได้ต้องตรวจด้วยคน ผลสแกนไม่ใช่สิทธิ์ส่งออก\n');
    process.exitCode = 2;
    return;
  }
  const started = performance.now();
  const result = args.ocr ? unavailableDocument('ocr-not-supported')
    : file ? await evaluateDocumentPrivacy(file, { includeRedacted: Boolean(args.redact) })
    : String(inlineText).length > DOCUMENT_LIMITS.characters ? unavailableDocument('text-size-limit')
    : evaluatePrivacyGate(inlineText);
  const elapsedMs = performance.now() - started;
  // Exit 0 means only "no known patterns in text"; it never authorizes upload.
  process.exitCode = result.action === 'pass' ? 0 : result.action === 'block-external' ? 3 : 2;
  let exportStatus = args.redact ? 'withheld' : 'not-requested';
  if (args.redact && file && typeof result.redactedText === 'string') {
    try {
      await writeFile(redactedPath(file), result.redactedText, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      exportStatus = 'written-for-review';
    } catch {
      exportStatus = 'write-failed-or-exists';
      if (process.exitCode === 0) process.exitCode = 2;
    }
  }
  if (args.json) {
    const { redactedText, hash, logSafeMetadata, ...metadata } = result;
    console.log(JSON.stringify({ ...metadata, sourceHash: result.sourceHash ?? hash ?? null, exportStatus }));
    return;
  }

  console.log(colors.bold('\nผลตรวจ Privacy Gate'));
  console.log(`  ระดับข้อมูล:      ${riskLabel(result.classification)}`);
  console.log(`  การดำเนินการ:     ${actionLabel(result.action)}`);
  console.log(`  พบข้อมูลส่วนบุคคล: ${result.containsPersonalData === null ? 'ยังตรวจไม่ได้' : result.containsPersonalData ? 'พบรูปแบบที่ต้องตรวจ' : 'ไม่พบจากรูปแบบที่ตรวจ'}`);
  console.log('  ขอบเขต: ตรวจรูปแบบข้อความ ไม่ใช่การรับรองว่าเอกสารเผยแพร่ได้');
  console.log('  สิทธิ์ส่งออก: ไม่ได้อนุญาต — ต้องตรวจเนื้อหาและสิทธิ์ของต้นทางก่อนแนบ');
  if (result.extractionStatus) console.log(`  การอ่านข้อความ: ${result.extractionStatus}`);
  if (result.reviewReasons?.length) console.log(`  ข้อจำกัด: ${result.reviewReasons.join(', ')}`);
  console.log(`  เวลาตรวจ:         ${elapsedMs.toFixed(2)} ms`);

  if (result.findings.length) {
    console.log('\n  รายการที่ตรวจพบ:');
    for (const finding of result.findings) {
      console.log(`  - ${finding.label}: ${finding.count} จุด`);
    }
  }

  if (exportStatus === 'written-for-review') console.log('\n  สร้างไฟล์ .redacted.txt ข้างต้นฉบับสำหรับตรวจด้วยคนแล้ว ต้นฉบับ PDF/DOCX ไม่ได้ถูกแก้ไข');
  else if (args.redact) console.log(`\n  ไม่สร้างสำเนา: ${exportStatus} — ตรวจต้นฉบับบนเครื่องด้วยคน`);

  if (result.action === 'block-external') {
    console.log(colors.red('\n  หยุด: พบข้อมูลความเสี่ยงสูงหรือข้อมูลรับรองตัวตน ห้ามส่งต้นฉบับไป AI ภายนอกโดยอัตโนมัติ'));
  }

  console.log();
}
