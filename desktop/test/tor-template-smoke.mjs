// Native synthetic export check; no provider, real employee document, network or Office installation is required.
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const home = await mkdtemp(join(tmpdir(), 'step-tor-layout-'));
const output = process.env.STEP_TOR_LAYOUT_QA || join(home, 'output');
let app;
const watchdog = setTimeout(() => {
  console.error('TOR template smoke exceeded 120 seconds');
  process.exit(1);
}, 120000);
try {
  await mkdir(output, { recursive: true });
  const bundle = join(home, 'exports.cjs');
  await build({
    stdin: {
      contents: `export {exportDocument,PDF_MARGINS} from './electron/export';export {markdownDocument,documentText} from './src/draft';export {torLayoutCases} from './test/fixtures/tor-layout-cases';`,
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
  const report = await app.evaluate(
    async ({ BrowserWindow }, data) => {
      const q = globalThis.qa,
        reports = [];
      const reader = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      try {
        await reader.loadURL(data.vendor);
        for (const [name, markdown] of Object.entries(q.torLayoutCases)) {
          const document = q.markdownDocument(markdown);
          const path = data.output + '/' + name;
          await q.exportDocument(path + '.docx', 'docx', q.documentText(document), async () => Buffer.alloc(0), document, {
            documentTool: 'tor',
          });
          let bytes;
          await q.exportDocument(
            path + '.pdf',
            'pdf',
            q.documentText(document),
            async (html, settings) => {
              const window = new BrowserWindow({
                show: false,
                webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
              });
              try {
                await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
                bytes = await window.webContents.printToPDF({
                  printBackground: true,
                  pageSize: 'A4',
                  margins: q.PDF_MARGINS,
                  preferCSSPageSize: true,
                  ...settings,
                });
                return bytes;
              } finally {
                window.destroy();
              }
            },
            document,
            { documentTool: 'tor' },
          );
          const rendered = await reader.webContents.executeJavaScript(
            `(async()=>{ const pdfjs=await import('./pdf.mjs'); globalThis.pdfjsWorker=await import('./pdf.worker.mjs'); const pdf=await pdfjs.getDocument({data:Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0)),isEvalSupported:false}).promise; const pages=[],images=[]; for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();pages.push(content.items.map(item=>item.str).join(''));const ops=await page.getOperatorList();images.push(ops.fnArray.filter(op=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject].includes(op)).length);} await pdf.destroy();return {pages,images};})()`,
          );
          reports.push({ name, ...rendered });
        }
      } finally {
        reader.destroy();
      }
      return reports;
    },
    { output: resolve(output), vendor: pathToFileURL(resolve('../src/vendor/privacy/manifest.json')).href },
  );
  for (const { name, pages, images } of report) {
    assert.ok(pages.length >= 2, name + ': exercises pagination');
    for (const [index, page] of pages.entries()) {
      assert.ok(images[index] > 0, name + ': wordmark image on every page');
      assert.ok(page.replace(/\s/g, '').includes('อุทยานวิทยา'), name + ': letterhead on every page');
      assert.ok(page.replace(/\s/g, '').includes(`${index + 1}/${pages.length}`), name + ': correct live page counter');
    }
    if (name === 'purchase') for (let n = 1; n <= 22; n++) assert.ok(pages.join('').includes(`P-${String(n).padStart(2, '0')}`));
    if (name === 'service') assert.ok(pages.join('').includes('00123') && pages.join('').includes('S-01'));
    assert.ok((await readFile(join(output, name + '.pdf'))).subarray(0, 5).equals(Buffer.from('%PDF-')));
  }
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      { synthetic: true, nativePdf: true, nativeWord: false, cases: report.map(r => ({ name: r.name, pages: r.pages.length })) },
      null,
      2,
    ),
  );
  console.log(`PASS: native STeP TOR letterhead, page counters and complete service/purchase exports (${output})`);
} finally {
  clearTimeout(watchdog);
  await app?.close();
  assert.ok(resolve(home).startsWith(resolve(tmpdir()) + sep) && basename(home).startsWith('step-tor-layout-'));
  await rm(home, { recursive: true, force: true });
}
