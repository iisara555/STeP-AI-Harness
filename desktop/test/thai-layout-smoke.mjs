// Offline synthetic typography/print check with the app's bundled Thai UI font, not agency-font/Word acceptance.
import { _electron as electron } from '@playwright/test';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const home = await mkdtemp(join(tmpdir(), 'step-thai-layout-'));
const output = process.env.STEP_THAI_LAYOUT_QA || join(home, 'output');
const longThai = 'การพิจารณารายละเอียดกิจกรรมและขั้นตอนการดำเนินงานเพื่อส่งเสริมการพัฒนาศักยภาพของผู้เข้าร่วมโครงการ';
const code = 'https://example.test/' + 'reference'.repeat(35);
const source = `# ร่างสังเคราะห์\n\n## หัวข้อภาษาไทย\n\n${longThai.repeat(3)}\n\nภาษาไทยผสม English รหัส 00123 สระและวรรณยุกต์: กิ่ กี้ กึ๊ กื๋ น้ำ\n\n${code}\n\n| รายละเอียดกิจกรรมและขั้นตอนการดำเนินงาน | ผู้รับผิดชอบและระยะเวลาดำเนินการ |\n|---|---|\n| ${longThai} | ทีมสังเคราะห์ |`;
let app;
const watchdog = setTimeout(() => {
  console.error('Thai layout smoke exceeded 120 seconds');
  process.exit(1);
}, 120000);
try {
  await mkdir(output, { recursive: true });
  const fontDir = resolve('node_modules/@fontsource/ibm-plex-sans-thai');
  let fontCss = await readFile(join(fontDir, '400.css'), 'utf8');
  for (const match of [...fontCss.matchAll(/url\(([^)]+)\)/g)]) {
    const bytes = await readFile(resolve(fontDir, match[1]));
    fontCss = fontCss.replace(match[0], `url(data:font/woff2;base64,${bytes.toString('base64')})`);
  }
  const bundle = join(home, 'export.cjs');
  await build({
    stdin: {
      contents: `export {exportDocument,pdfHtml,PDF_MARGINS} from './electron/export';export {markdownDocument,documentText} from './src/draft';export {resolveDocumentLayout} from './src/document-layout';`,
      resolveDir: resolve('.'),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    outfile: bundle,
    logLevel: 'error',
  });
  const entry = join(home, 'main.cjs');
  await writeFile(
    entry,
    `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(home)});globalThis.qa=require(${JSON.stringify(bundle)});app.whenReady().then(()=>new BrowserWindow({show:false,webPreferences:{sandbox:true}}).loadURL('about:blank'));`,
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), entry], env, timeout: 45000 });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 794, height: 1123 });
  const reports = [];
  for (const profile of [undefined, 'tor', 'memo', 'letter', 'project', 'minutes']) {
    const name = profile || 'generic';
    const html = await app.evaluate(
      async (_electron, data) => {
        const q = globalThis.qa;
        const document = q.markdownDocument(data.source);
        await q.exportDocument(data.path, 'docx', q.documentText(document), async () => Buffer.alloc(0), document, {
          documentTool: data.profile,
        });
        return q.pdfHtml(document, q.resolveDocumentLayout(data.profile));
      },
      { source, profile, path: join(output, `${name}.docx`) },
    );
    await page.setContent(html.replace('</style>', `${fontCss}body{font-family:"IBM Plex Sans Thai",sans-serif}body{width:16cm}</style>`));
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const overflow = [];
      const detachedMarks = [];
      const graphemes = new Intl.Segmenter('th', { granularity: 'grapheme' });
      for (const element of document.querySelectorAll('p,th,td')) {
        const bound = element.getBoundingClientRect();
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let text;
        while ((text = walker.nextNode())) {
          const range = document.createRange();
          // pre-wrap intentionally retains hanging spaces. Check visible graphemes, not their invisible advance.
          for (const part of graphemes.segment(text.data)) {
            if (!part.segment.trim()) continue;
            range.setStart(text, part.index);
            range.setEnd(text, part.index + part.segment.length);
            for (const rect of range.getClientRects())
              if (rect.width && rect.right > bound.right + 2) overflow.push({ text: part.segment, excess: rect.right - bound.right });
          }
          for (let i = 1; i < text.length; i++) {
            if (!/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(text.data[i])) continue;
            range.setStart(text, i - 1);
            range.setEnd(text, i);
            const before = range.getBoundingClientRect();
            range.setStart(text, i);
            range.setEnd(text, i + 1);
            if (Math.abs(before.top - range.getBoundingClientRect().top) > 1) detachedMarks.push(text.data.slice(i - 1, i + 1));
          }
        }
      }
      return {
        overflow,
        detachedMarks,
        tableFont: getComputedStyle(document.querySelector('th')).fontSize,
        text: document.body.textContent,
      };
    });
    assert.deepEqual(result.overflow, [], name + ': no text outside its paragraph/cell');
    assert.deepEqual(result.detachedMarks, [], name + ': vowel/tone marks stay on the base line');
    assert.ok(result.text.includes(longThai) && result.text.includes(code) && result.text.includes('00123'));
    assert.doesNotMatch(result.text, /[\u200B\u00AD]/);
    assert.ok(Number.parseFloat(result.tableFont) > 20, name + ': table remains 16pt');
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
    const pdf = await app.evaluate(async ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: globalThis.qa.PDF_MARGINS,
      }),
    );
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
    await writeFile(join(output, `${name}.pdf`), Buffer.from(pdf));
    reports.push({ profile: name, ...result, text: undefined });
  }
  await writeFile(
    join(output, 'summary.json'),
    JSON.stringify({ font: 'Bundled IBM Plex Sans Thai (synthetic QA only)', wordLayoutVerified: false, reports }, null, 2),
  );
  console.log(`PASS: Thai wrapping, combining marks, unmodified identifiers and six DOCX/PDF exports (${output})`);
} finally {
  clearTimeout(watchdog);
  await app?.close();
  // An explicit output folder retains only synthetic review artifacts.
  await rm(home, { recursive: true, force: true });
}
