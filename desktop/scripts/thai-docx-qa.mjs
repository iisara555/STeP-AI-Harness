// Run with: node --import tsx scripts/thai-docx-qa.mjs, then test/word-document-qa.ps1.
import { mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
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

// Synthetic chart pixels with valid CRCs; no external image, employee data or remote service.
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  let value = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  crc.writeUInt32BE((value ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(400);
ihdr.writeUInt32BE(200, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const pixels = Buffer.alloc(200 * 1201, 255);
for (let y = 0; y < 200; y++) {
  pixels[y * 1201] = 0;
  for (let x = 0; x < 400; x++) {
    const bar = x > 25 && x < 375 && y > 200 - 30 * (1 + Math.floor(x / 90));
    if (bar) pixels.set([40, 100, 160], y * 1201 + 1 + x * 3);
  }
}
const image = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
]);
const assetId = '00000000-0000-0000-0000-000000000001';
const advanced = markdownDocument(
  '# เอกสารตรวจองค์ประกอบครบชุด\n\n# บทที่หนึ่ง การจัดรูปแบบภาษาไทย\n\n' +
    prose.repeat(3) +
    '\n\n## หัวข้อระดับสอง\n\n### หัวข้อระดับสาม\n\nข้อความ **ตัวหนา** และ *ตัวเอียง* พร้อม ***หนาเอียง*** รหัส DOC-001 อีเมล synthetic@example.test URL https://example.test/abc-001\n\n> ข้อความอ้างอิงสังเคราะห์สำหรับตรวจระยะย่อหน้า\n\n3. รายการแรก\n   7. รายการย่อย\n      - รายการชั้นสาม\n4. รายการถัดไป',
);
advanced.content.push(
  { type: 'image', attrs: { assetId, widthCm: 8, alt: 'Synthetic chart' } },
  { type: 'caption', content: [{ type: 'text', text: 'ภาพที่ ๑ แผนภาพสังเคราะห์สำหรับตรวจคำบรรยาย' }] },
  { type: 'pageBreak' },
);
advanced.content.push(
  ...markdownDocument(
    '# บทที่สอง ตารางข้ามหน้า\n\n| รายละเอียดกิจกรรมและขั้นตอนการดำเนินงาน | จำนวน |\n|---|---|\n| ' +
      prose.repeat(35) +
      'จบเซลล์ยาว | 000123.45 |\n\n## ตารางหลายคอลัมน์\n\n| รายละเอียดงาน | ผู้ดำเนินการ | วันที่ดำเนินการ | จำนวน | หน่วย | หมายเหตุ |\n|---|---|---|---|---|---|\n' +
      Array.from(
        { length: 12 },
        (_, i) => '| กิจกรรมสังเคราะห์ ' + (i + 1) + ' | ทีมตัวอย่าง | 01/01/2500 | 00100.00 | รายการ | ข้อความสำหรับตรวจการจัดคอลัมน์ |',
      ).join('\n') +
      '\n\nสิ้นสุดเอกสารสังเคราะห์ครบชุด',
  ).content.map(n => (n.type === 'title' ? { ...n, type: 'heading', attrs: { level: 1 } } : n)),
);
for (const [name, preset, pageNumber, pageNumberPosition] of [
  ['complete', 'report', 'arabic-total', 'footer-right'],
  ['complete-thai', 'saraban', 'thai', 'header-right'],
])
  await exportDocument(`${directory}/${name}.docx`, 'docx', documentText(advanced), async () => Buffer.alloc(0), advanced, {
    images: new Map([[assetId, { bytes: image, mime: 'image/png', width: 400, height: 200 }]]),
    presentation: {
      preset,
      toc: true,
      pageNumber,
      pageNumberPosition,
      headerText: 'เอกสารสังเคราะห์สำหรับตรวจการจัดหน้า',
      footerText: 'ข้อมูลตัวอย่างสำหรับการทดสอบเท่านั้น',
    },
  });
console.log('Synthetic DOCX fixtures written to ' + directory);
