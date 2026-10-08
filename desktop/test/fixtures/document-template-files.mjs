// Synthetic agency-like forms. No organization templates or real document facts.
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer, PageOrientation } from 'docx';
export const templateDrafts = {
  memo: '# บันทึกข้อความ\n\nส่วนงาน หน่วยงานสังเคราะห์\n\nที่ [รอยืนยัน: เลขหนังสือ] วันที่ [รอยืนยัน: วันที่]\n\nเรื่อง ขอพิจารณากิจกรรมสังเคราะห์\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nเนื้อหาสังเคราะห์สำหรับงานใหม่\n\nจึงเรียนมาเพื่อโปรดพิจารณา\n\n(ลงชื่อ) ................................\n\n[รอยืนยัน: ชื่อและตำแหน่งผู้ลงนาม]',
  letter:
    'ที่ [รอยืนยัน: เลขหนังสือ]\n\nหน่วยงานสังเคราะห์\n\nวันที่ [รอยืนยัน: วันที่]\n\nเรื่อง ขอประสานกิจกรรมสังเคราะห์\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nเนื้อหาสังเคราะห์สำหรับงานใหม่\n\nจึงเรียนมาเพื่อโปรดพิจารณา\n\nขอแสดงความนับถือ\n\n(ลงชื่อ) ................................',
  project:
    '# ข้อเสนอโครงการ\n\n## 1. หลักการและเหตุผล\n\nเนื้อหาสังเคราะห์สำหรับงานใหม่\n\n## 2. วัตถุประสงค์\n\nตรวจรูปแบบ\n\n## 3. ความสอดคล้องกับยุทธศาสตร์\n\n[รอยืนยัน]\n\n## 4. ผู้ร่วมโครงการ\n\n[รอยืนยัน]\n\n## 5. วัน เวลา และสถานที่\n\n[รอยืนยัน]\n\n## 6. งบประมาณ\n\n| รายการ | จำนวน | ราคาต่อหน่วย | รวม |\n|---|---|---|---|\n| ทดสอบ | [รอยืนยัน] | [รอยืนยัน] | [รอยืนยัน] |\n\n## 7. ผลที่คาดว่าจะได้รับ\n\nร่างที่ตรวจข้อมูลและแก้ไขได้',
  minutes:
    '# รายงานการประชุมฝ่ายสังเคราะห์\n\nวันที่ [รอยืนยัน: วัน เวลา]\n\nรายชื่อผู้เข้าร่วมประชุม\n\n| ลำดับ | ชื่อ | ตำแหน่ง |\n|---|---|---|\n| 1 | [รอยืนยัน] | [รอยืนยัน] |\n\n## วาระที่ 1 แจ้งเพื่อทราบ\n\nเนื้อหาสังเคราะห์สำหรับงานใหม่\n\n## วาระที่ 2 ติดตามงาน\n\n| ลำดับ | ประเด็น | ผู้ให้ข้อมูล | รายละเอียด | แก้ไขแล้ว | ทำเพิ่ม | กำหนดเสร็จ | ผู้รับผิดชอบ |\n|---|---|---|---|---|---|---|---|\n| 1 | ทดสอบ | [รอยืนยัน] | ข้อเสนอ | [รอยืนยัน] | ตรวจข้อมูล | [รอยืนยัน] | [รอยืนยัน] |\n\n| ผู้จดรายงาน | ผู้ตรวจรายงาน |\n|---|---|\n| [รอยืนยัน] | [รอยืนยัน] |',
};
export async function createTemplate(id) {
  const p = (text, options = {}) => new Paragraph({ ...options, children: [new TextRun({ text, font: 'TH Sarabun PSK', size: 32 })] });
  const table = n =>
    new Table({
      rows: [0, 1].map(
        i =>
          new TableRow({
            children: Array.from(
              { length: n },
              (_, c) => new TableCell({ children: [p(i ? 'TEMPLATE EXAMPLE MUST NOT LEAK' : 'ช่อง ' + c)] }),
            ),
          }),
      ),
    });
  const headers = { default: new Header({ children: [p('SYNTHETIC FORM HEADER')] }) },
    footers = { default: new Footer({ children: [p('SYNTHETIC FORM V.90')] }) };
  const properties = { page: { margin: { top: 1418, left: 1701, right: 1134, bottom: 1134 } } };
  const body = [
    p(
      id === 'memo'
        ? 'บันทึกข้อความ'
        : id === 'letter'
          ? 'ที่ TEMPLATE-0007'
          : id === 'project'
            ? 'ข้อเสนอโครงการ'
            : 'รายงานการประชุมฝ่าย XX',
    ),
  ];
  if (id === 'memo' || id === 'letter')
    body.push(
      p('ส่วนงาน TEMPLATE EXAMPLE MUST NOT LEAK'),
      p('ที่ TEMPLATE-0007 วันที่ 1 มกราคม 2500'),
      p('เรื่อง TEMPLATE EXAMPLE MUST NOT LEAK'),
      p('เรียน TEMPLATE EXAMPLE MUST NOT LEAK'),
      p('ด้วย TEMPLATE EXAMPLE MUST NOT LEAK', { indent: { firstLine: 1418 } }),
      p('(TEMPLATE EXAMPLE MUST NOT LEAK)'),
    );
  else if (id === 'project')
    body.push(p('1. หลักการและเหตุผล'), p('2. วัตถุประสงค์'), p('6. งบประมาณ'), table(4), p('7. ผลที่คาดว่าจะได้รับ'));
  else body.push(p('วันที่ TEMPLATE EXAMPLE MUST NOT LEAK'), table(3), p('วาระที่ 1 แจ้งเพื่อทราบ'));
  const sections = [{ properties, headers, footers, children: body }];
  if (id === 'minutes')
    sections.push({
      properties: { ...properties, page: { ...properties.page, size: { orientation: PageOrientation.LANDSCAPE } } },
      headers,
      footers,
      children: [p('วาระที่ 2 ติดตามงาน'), table(8), table(2)],
    });
  return Packer.toBuffer(new Document({ sections, creator: 'TEMPLATE EXAMPLE MUST NOT LEAK' }));
}
