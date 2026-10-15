// Run with: node --import tsx scripts/thai-docx-qa.mjs, then test/word-document-qa.ps1.
import { mkdir } from 'node:fs/promises';
import { exportDocument } from '../electron/export.ts';
import { markdownDocument, documentText } from '../src/draft.ts';

const directory = 'release/qa/thai-docx';
await mkdir(directory, { recursive: true });
const prose =
  'การดำเนินงานและจัดทำรายงานผลการประเมินโครงการเป็นส่วนหนึ่งของการพัฒนาคุณภาพบริการอย่างต่อเนื่อง ข้อมูลทั้งหมดในเอกสารนี้เป็นข้อมูลสังเคราะห์สำหรับตรวจการจัดหน้าและการแสดงผลภาษาไทย ';
const document = markdownDocument(
  '# เอกสารสังเคราะห์สำหรับตรวจการจัดหน้า\n\n## เนื้อหาภาษาไทย\n\n' +
    prose.repeat(18) +
    '\n\nข้อความ **ตัวหนา** และ *ตัวเอียง* พร้อม **หนาและ *เอียงร่วมกัน*** รหัส DOC-001\n\n| รายละเอียดกิจกรรมและขั้นตอนการดำเนินงาน | ผู้รับผิดชอบและระยะเวลาดำเนินการ |\n|---|---|\n| ' +
    prose.repeat(2) +
    ' | ทีมสังเคราะห์ |',
);
for (const preset of ['saraban', 'report', 'book'])
  await exportDocument(`${directory}/${preset}.docx`, 'docx', documentText(document), async () => Buffer.alloc(0), document, {
    presentation: { preset },
  });
console.log('Synthetic DOCX fixtures written to ' + directory);
