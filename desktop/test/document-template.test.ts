import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { inspectDocumentTemplate, renderDocumentTemplate } from '../electron/document-template';
import { markdownDocument, type DraftNode } from '../src/draft';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const p = (text: string, extra = '') =>
  `<w:p><w:pPr>${extra}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="TH SarabunIT๙" w:cs="TH SarabunIT๙"/><w:sz w:val="32"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
const table = (columns: number) =>
  `<w:tbl><w:tblPr><w:tblW w:w="7777" w:type="dxa"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="1111"/>'.repeat(columns)}</w:tblGrid>${[0, 1].map(i => `<w:tr>${Array.from({ length: columns }, (_, c) => `<w:tc><w:tcPr><w:tcW w:w="1111" w:type="dxa"/></w:tcPr>${p(i ? 'FILLED EXAMPLE' : 'ช่อง' + c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
const section = (landscape = false) =>
  `<w:sectPr><w:footerReference w:type="default" r:id="footer"/><w:pgSz w:w="${landscape ? 16838 : 11906}" w:h="${landscape ? 11906 : 16838}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="1418" w:left="1701" w:right="1134" w:bottom="1134"/></w:sectPr>`;
export async function syntheticTemplate(id: string) {
  const zip = new JSZip();
  const parts =
    id === 'memo'
      ? [
          p('บันทึกข้อความ', '<w:jc w:val="left"/><w:spacing w:before="720"/>'),
          p('ส่วนงาน FILLED EXAMPLE'),
          p('ที่ EXAMPLE-0007 วันที่ 1 มกราคม 2500', '<w:tabs><w:tab w:val="left" w:pos="4500"/></w:tabs>'),
          p('เรื่อง FILLED EXAMPLE'),
          p('เรียน FILLED EXAMPLE'),
          p('ด้วย FILLED EXAMPLE', '<w:ind w:firstLine="1418"/><w:jc w:val="both"/>'),
          p('(FILLED EXAMPLE)', '<w:jc w:val="center"/>'),
        ]
      : id === 'letter'
        ? [
            p('ที่ FILLED EXAMPLE'),
            p('เรื่อง FILLED EXAMPLE'),
            p('เรียน FILLED EXAMPLE'),
            p('ด้วย FILLED EXAMPLE', '<w:ind w:firstLine="1418"/>'),
            p('ขอแสดงความนับถือ', '<w:jc w:val="center"/>'),
          ]
        : id === 'project'
          ? [
              p('ข้อเสนอโครงการ'),
              p('1. หลักการและเหตุผล'),
              p('FILLED EXAMPLE'),
              p('2. วัตถุประสงค์'),
              p('6. งบประมาณ'),
              table(4),
              p('7. ผลที่คาดว่าจะได้รับ'),
            ]
          : [
              p('รายงานการประชุมฝ่าย XX'),
              p('วันที่ EXAMPLE'),
              p('รายชื่อผู้เข้าร่วมประชุม'),
              table(3),
              p('วาระที่ 1 แจ้งเพื่อทราบ'),
              p('FILLED EXAMPLE', section()),
              p('วาระที่ 2 ติดตาม'),
              table(8),
              table(2),
            ];
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${parts.join('')}${section(id === 'minutes')}</w:body></w:document>`,
  );
  zip.file(
    'word/styles.xml',
    `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="TH SarabunIT๙"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
  );
  zip.file('word/footer1.xml', `<w:ftr xmlns:w="${W}">${p('SYNTHETIC FORM V.01')}${p('', '<w:jc w:val="center"/>')}</w:ftr>`);
  zip.file(
    'word/_rels/document.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="footer" Type="${R}/footer" Target="footer1.xml"/><Relationship Id="styles" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file('docProps/core.xml', '<properties>FILLED EXAMPLE AUTHOR</properties>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('native memo uses current editor content and keeps the agency font, tabs, margins and footer', async () => {
  const bytes = await syntheticTemplate('memo');
  const info = await inspectDocumentTemplate(bytes, 'memo');
  assert.equal(info.font, 'TH SarabunIT๙');
  assert.ok(!info.context.includes('FILLED EXAMPLE') && !info.context.includes('EXAMPLE-0007'));
  const draft = markdownDocument(
    '# บันทึกข้อความ\n\nส่วนงาน หน่วยงานสังเคราะห์\n\nที่ [รอยืนยัน: เลขหนังสือ] วันที่ [รอยืนยัน: วันที่]\n\nเรื่อง ทดสอบ\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nเนื้อหาที่เจ้าของแก้ไข & <ทดสอบ>\n\n(ผู้เสนอสมมติ)',
  );
  const zip = await JSZip.loadAsync(await renderDocumentTemplate(bytes, 'memo', draft));
  const xml = await zip.file('word/document.xml')!.async('string');
  assert.match(xml, /เนื้อหาที่เจ้าของแก้ไข &amp; &lt;ทดสอบ&gt;/);
  assert.match(xml, /w:ascii="TH SarabunIT๙"/);
  assert.match(xml, /w:pos="4500"/);
  assert.match(xml, /<w:tab\/>/);
  assert.match(xml, /w:left="1701"/);
  assert.match(xml, /w:firstLine="1418"/);
  assert.ok(!xml.includes('FILLED EXAMPLE') && !xml.includes('EXAMPLE-0007'));
  assert.equal(
    await zip.file('word/footer1.xml')!.async('string'),
    await (await JSZip.loadAsync(bytes)).file('word/footer1.xml')!.async('string'),
  );
  assert.equal(zip.file('docProps/core.xml'), null);
});

test('native fields keep manual line breaks and tabs and Word does not expand their short lines', async () => {
  const bytes = await syntheticTemplate('memo');
  const draft: DraftNode = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'บันทึกข้อความ' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'เรื่อง ข้อความ  สังเคราะห์' },
          { type: 'hardBreak' },
          { type: 'text', text: 'รหัส\t0007\nรอยืนยัน' },
          { type: 'hardBreak' },
        ],
      },
    ],
  };
  const zip = await JSZip.loadAsync(await renderDocumentTemplate(bytes, 'memo', draft));
  const xml = await zip.file('word/document.xml')!.async('string');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  assert.equal(dom.getElementsByTagNameNS(W, 'br').length, 3);
  assert.equal(dom.getElementsByTagNameNS(W, 'tab').length, 1);
  assert.ok(xml.includes('ข้อความ  สังเคราะห์'));
  assert.match(await zip.file('word/settings.xml')!.async('string'), /<w:doNotExpandShiftReturn\/>/);
  assert.match(await zip.file('word/_rels/document.xml.rels')!.async('string'), /Target="settings.xml"/);
  assert.match(await zip.file('[Content_Types].xml')!.async('string'), /PartName="\/word\/settings.xml"/);
});

test('a native memo reference on separate lines stays separate and existing settings are preserved', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('memo'));
  zip.file(
    'word/local-settings.xml',
    `<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/><w:compat><w:doNotExpandShiftReturn w:val="0"/><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`,
  );
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  zip.file(
    'word/_rels/document.xml.rels',
    rels.replace('</Relationships>', `<Relationship Id="settings" Type="${R}/settings" Target="local-settings.xml"/></Relationships>`),
  );
  const draft = markdownDocument('# บันทึกข้อความ\n\nที่ 0007<br>วันที่ [รอยืนยัน]');
  const out = await JSZip.loadAsync(await renderDocumentTemplate(await zip.generateAsync({ type: 'nodebuffer' }), 'memo', draft));
  const dom = new DOMParser().parseFromString(await out.file('word/document.xml')!.async('string'), 'application/xml');
  assert.equal(dom.getElementsByTagNameNS(W, 'br').length, 1);
  assert.equal(Array.from(dom.getElementsByTagNameNS(W, 'tab')).filter(tab => tab.parentNode?.nodeName === 'w:r').length, 0);
  const settings = await out.file('word/local-settings.xml')!.async('string');
  assert.match(settings, /<w:defaultTabStop w:val="720"\/>/);
  assert.match(settings, /<w:doNotExpandShiftReturn\/>/);
  assert.match(settings, /w:name="compatibilityMode"[^>]*w:val="15"/);
  assert.equal(out.file('word/settings.xml'), null);
});

test('native signature spacing fills only the missing template space and keeps explicit blank lines plain', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('memo'));
  let xml = await zip.file('word/document.xml')!.async('string');
  xml = xml.replace(p('(FILLED EXAMPLE)', '<w:jc w:val="center"/>'), p('') + p('') + p('(FILLED EXAMPLE)', '<w:jc w:val="center"/>'));
  xml = xml.replace('<w:ind w:firstLine="1418"/>', '<w:spacing w:before="240"/><w:ind w:firstLine="1418"/>');
  zip.file('word/document.xml', xml);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  for (const count of [0, 1, 2, 3]) {
    const draft = markdownDocument('# บันทึกข้อความ\n\nด้วยเนื้อหาสังเคราะห์\n\n(ผู้เสนอสมมติ)');
    draft.content!.splice(2, 0, ...Array.from({ length: count }, () => ({ type: 'paragraph' })));
    const out = await JSZip.loadAsync(await renderDocumentTemplate(bytes, 'memo', draft));
    const dom = new DOMParser().parseFromString(await out.file('word/document.xml')!.async('string'), 'application/xml');
    const paragraphs = Array.from(dom.getElementsByTagNameNS(W, 'body')[0].childNodes).filter(n => n.nodeName === 'w:p') as Element[];
    const blank = paragraphs.filter(n => !n.getElementsByTagNameNS(W, 't').length);
    assert.equal(blank.length, Math.max(2, count), `explicit blanks: ${count}`);
    for (const paragraph of blank) assert.equal(paragraph.getElementsByTagNameNS(W, 'spacing').length, 0);
  }
});

test('native template indentation is not prepended a second time to an explicitly indented paragraph', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('memo'));
  let xml = await zip.file('word/document.xml')!.async('string');
  xml = xml.replace('<w:t>ด้วย FILLED EXAMPLE</w:t>', '<w:tab/><w:t>ด้วย FILLED EXAMPLE</w:t>');
  zip.file('word/document.xml', xml);
  const draft = markdownDocument('# บันทึกข้อความ\n\n\tด้วยข้อความ  สังเคราะห์');
  const out = await JSZip.loadAsync(await renderDocumentTemplate(await zip.generateAsync({ type: 'nodebuffer' }), 'memo', draft));
  const dom = new DOMParser().parseFromString(await out.file('word/document.xml')!.async('string'), 'application/xml');
  assert.equal(dom.getElementsByTagNameNS(W, 'tab').length, 1);
  assert.ok(!Array.from(dom.getElementsByTagNameNS(W, 't')).some(t => t.textContent?.includes('\t')));
});

test('project and minutes retain native table grids/cell widths and every portrait/landscape section', async () => {
  for (const id of ['project', 'minutes'] as const) {
    const bytes = await syntheticTemplate(id);
    const widths = id === 'project' ? [4] : [3, 8, 2];
    const md =
      '# ร่างสังเคราะห์\n\n' +
      widths
        .map(
          (width, i) =>
            `## ${i + 1}. หัวข้อ\n\n|${Array.from({ length: width }, (_, c) => 'ช่อง' + c).join('|')}|\n|${Array(width).fill('---').join('|')}|\n|${Array(width).fill('[รอยืนยัน: ข้อมูล]').join('|')}|`,
        )
        .join('\n\n');
    const out = await JSZip.loadAsync(await renderDocumentTemplate(bytes, id, markdownDocument(md)));
    const xml = await out.file('word/document.xml')!.async('string');
    assert.equal((xml.match(/<w:tblGrid>/g) || []).length, widths.length);
    assert.equal((xml.match(/<w:sectPr>/g) || []).length, id === 'minutes' ? 2 : 1);
    assert.match(xml, /w:w="7777"/);
    assert.ok(!xml.includes('FILLED EXAMPLE'));
    if (id === 'minutes') assert.match(xml, /w:orient="landscape"/);
  }
});

test('native export refuses silent table loss or changed column meaning', async () => {
  const bytes = await syntheticTemplate('project');
  await assert.rejects(renderDocumentTemplate(bytes, 'project', markdownDocument('# ร่างไม่มีตาราง')), /DOCUMENT_TEMPLATE_TABLE_MISMATCH/);
  await assert.rejects(
    renderDocumentTemplate(bytes, 'project', markdownDocument('|A|B|\n|---|---|\n|1|2|')),
    /DOCUMENT_TEMPLATE_TABLE_MISMATCH/,
  );
});
test('same-width budget columns cannot exchange quantity and money', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('project'));
  let xml = await zip.file('word/document.xml')!.async('string');
  for (const [index, name] of ['รายการ', 'จำนวน', 'ราคาต่อหน่วย', 'รวมเป็นเงิน'].entries()) xml = xml.replace('ช่อง' + index, name);
  zip.file('word/document.xml', xml);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    renderDocumentTemplate(
      bytes,
      'project',
      markdownDocument('| รายการ | ราคาต่อหน่วย | จำนวน | รวม |\n|---|---|---|---|\n| ทดสอบ | 100 | 2 | 200 |'),
    ),
    /DOCUMENT_TEMPLATE_TABLE_MISMATCH/,
  );
});
test('a sender block cannot give the letter body its right-column indentation', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('letter'));
  let xml = await zip.file('word/document.xml')!.async('string');
  xml = xml.replace(p('เรื่อง FILLED EXAMPLE'), p('หน่วยงาน FILLED EXAMPLE', '<w:ind w:left="5040"/>') + p('เรื่อง FILLED EXAMPLE'));
  zip.file('word/document.xml', xml);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const rendered = await JSZip.loadAsync(
    await renderDocumentTemplate(
      bytes,
      'letter',
      markdownDocument('ที่ [รอยืนยัน]\n\nหน่วยงานสังเคราะห์\n\nเรื่อง ทดสอบ\n\nเรียน [รอยืนยัน]\n\nเนื้อหางานใหม่'),
    ),
  );
  const result = await rendered.file('word/document.xml')!.async('string');
  const body = result.match(/<w:p>(?:(?!<w:p>).)*เนื้อหางานใหม่[\s\S]*?<\/w:p>/)?.[0];
  assert.ok(body);
  assert.ok(!body.includes('w:left="5040"'));
  assert.ok(body.includes('w:firstLine="1418"'));
});
test('a four-field budget keeps five grid columns and merged category/total rows', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('project'));
  let xml = await zip.file('word/document.xml')!.async('string');
  const budget = `<w:tbl><w:tblPr/><w:tblGrid>${'<w:gridCol w:w="1000"/>'.repeat(5)}</w:tblGrid><w:tr>${[0, 1, 2, 3].map((_, i) => `<w:tc><w:tcPr>${i === 0 ? '<w:gridSpan w:val="2"/>' : ''}</w:tcPr>${p('ช่อง' + i)}</w:tc>`).join('')}</w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="5"/></w:tcPr>${p('รายจ่าย')}</w:tc></w:tr><w:tr>${[0, 1, 2, 3].map((_, i) => `<w:tc><w:tcPr>${i === 0 ? '<w:gridSpan w:val="2"/>' : ''}</w:tcPr>${p('FILLED EXAMPLE')}</w:tc>`).join('')}</w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="4"/></w:tcPr>${p('รวมรายจ่าย')}</w:tc><w:tc><w:tcPr/>${p('EXAMPLE TOTAL')}</w:tc></w:tr></w:tbl>`;
  xml = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, budget);
  zip.file('word/document.xml', xml);
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  assert.deepEqual((await inspectDocumentTemplate(bytes, 'project')).tables, [4]);
  const draft = markdownDocument(
    '| รายการ | จำนวน | หน่วยละ | รวม |\n|---|---|---|---|\n| ทดสอบ | [รอยืนยัน] | [รอยืนยัน] | [รอยืนยัน] |\n| รวมรายจ่าย | | | [รอยืนยัน: งบ] |',
  );
  const result = await JSZip.loadAsync(await renderDocumentTemplate(bytes, 'project', draft));
  const rendered = await result.file('word/document.xml')!.async('string');
  for (const span of [2, 4, 5]) assert.ok(rendered.includes(`w:gridSpan w:val="${span}"`));
  assert.ok(rendered.includes('[รอยืนยัน: งบ]') && !rendered.includes('EXAMPLE TOTAL'));
});

test('template classification rejects a wrong profile and TOR keeps the existing template path', async () => {
  await assert.rejects(inspectDocumentTemplate(await syntheticTemplate('memo'), 'project'), /DOCUMENT_TEMPLATE_MISMATCH/);
  await assert.rejects(inspectDocumentTemplate(await syntheticTemplate('memo'), 'tor'), /DOCUMENT_TEMPLATE_UNSUPPORTED/);
});

test('DOCX security blocks external resources, active fields, DTDs, embedded objects and oversized packages', async () => {
  const bytes = await syntheticTemplate('memo');
  for (const [file, value] of [
    [
      'word/_rels/document.xml.rels',
      `<Relationships><Relationship Id="bad" Type="${R}/attachedTemplate" Target="https://example.invalid/private" TargetMode="External"/></Relationships>`,
    ],
    [
      'word/document.xml',
      `<w:document xmlns:w="${W}"><w:body>${p('บันทึกข้อความ')}<w:fldSimple w:instr="DDEAUTO secret"/>${section()}</w:body></w:document>`,
    ],
    ['word/document.xml', `<!DOCTYPE data [<!ENTITY leak SYSTEM "file:///private">]><w:document xmlns:w="${W}"><w:body/></w:document>`],
    ['word/embeddings/object.bin', 'unsafe'],
    ['word/vbaProject.bin', 'unsafe'],
    [
      'word/_rels/document.xml.rels',
      `<Relationships><Relationship Id="bad" Type="${R}/image" Target="file:///private/secret.png"/></Relationships>`,
    ],
  ]) {
    const zip = await JSZip.loadAsync(bytes);
    zip.file(file, value);
    await assert.rejects(inspectDocumentTemplate(await zip.generateAsync({ type: 'nodebuffer' }), 'memo'), /DOCUMENT_TEMPLATE_UNSAFE/);
  }
  await assert.rejects(inspectDocumentTemplate(Buffer.alloc(8_000_001), 'memo'), /DOCUMENT_TEMPLATE_LIMIT/);
});

test('external hyperlinks are removed instead of surviving in a new draft', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('letter'));
  zip.file(
    'word/_rels/document.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link" Type="${R}/hyperlink" Target="mailto:example@example.invalid" TargetMode="External"/></Relationships>`,
  );
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const out = await JSZip.loadAsync(
    await renderDocumentTemplate(
      bytes,
      'letter',
      markdownDocument('ที่ [รอยืนยัน: เลขหนังสือ]\n\nเรื่อง สังเคราะห์\n\nเรียน [รอยืนยัน: ผู้รับ]\n\nเนื้อหาใหม่'),
    ),
  );
  assert.ok(!(await out.file('word/_rels/document.xml.rels')!.async('string')).includes('mailto:'));
});
test('an old signature image and its hidden media bytes are excluded from the new document', async () => {
  const zip = await JSZip.loadAsync(await syntheticTemplate('memo'));
  const drawing =
    '<w:r><w:drawing><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:blip r:embed="oldSign"/></a:graphic></w:drawing></w:r>';
  let xml = await zip.file('word/document.xml')!.async('string');
  xml = xml.replace(
    p('(FILLED EXAMPLE)', '<w:jc w:val="center"/>'),
    p('(FILLED EXAMPLE)', '<w:jc w:val="center"/>').replace('</w:p>', drawing + '</w:p>'),
  );
  zip.file('word/document.xml', xml);
  let rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  rels = rels.replace(
    '</Relationships>',
    `<Relationship Id="oldSign" Type="${R}/image" Target="media/old-signature.png"/></Relationships>`,
  );
  zip.file('word/_rels/document.xml.rels', rels);
  zip.file('word/media/old-signature.png', 'SYNTHETIC OLD SIGNATURE');
  const result = await JSZip.loadAsync(
    await renderDocumentTemplate(
      await zip.generateAsync({ type: 'nodebuffer' }),
      'memo',
      markdownDocument('# บันทึกข้อความ\n\nเรียน [รอยืนยัน]\n\nเนื้อหางานใหม่\n\n(ลงชื่อ) ................................'),
    ),
  );
  assert.equal(result.file('word/media/old-signature.png'), null);
  assert.ok(!(await result.file('word/document.xml')!.async('string')).includes('oldSign'));
});
