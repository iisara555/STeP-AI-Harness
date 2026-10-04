// Visual check of the document exports: renders synthetic drafts (test/fixtures/export-cases.ts) to every format,
// then to PNG pages a person can look through — the PDF as STeP Desktop prints it, and Word, Excel and PowerPoint
// through LibreOffice when it is installed. Output: release/qa/export-visual/<case>.<format> and img/*.png.
//   node scripts/export-qa.mjs            (Linux needs xvfb-run; LibreOffice and pdftoppm are optional)
// LibreOffice stands in for Office here, so a page that looks right still needs a final look in Word or Excel.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'release/qa/export-visual');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'img'), { recursive: true });

const entry = `
import { app, BrowserWindow } from 'electron';
import { documentText, markdownDocument } from './src/draft';
import { exportDocument, PDF_MARGINS } from './electron/export';
import { cases } from './test/fixtures/export-cases';
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  for (const [name, markdown] of Object.entries(cases)) {
    const doc = markdownDocument(markdown);
    for (const format of ['md', 'docx', 'pdf', 'xlsx', 'pptx'])
      await exportDocument(${JSON.stringify(out)} + '/' + name + '.' + format, format, documentText(doc), async html => {
        const page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
        try {
          await page.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
          return await page.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: PDF_MARGINS });
        } finally {
          page.destroy();
        }
      }, doc);
  }
  app.quit();
});`;
const bundle = join(out, 'export-qa.cjs');
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true,
  platform: 'node',
  external: ['electron'],
  outfile: bundle,
  logLevel: 'error',
});
const electron = createRequire(import.meta.url)('electron');
const has = command => spawnSync('sh', ['-c', `command -v ${command}`]).status === 0;
const run = (command, args, cwd = root) => spawnSync(command, args, { cwd, stdio: 'inherit' });
const linux = process.platform === 'linux';
if (linux && has('xvfb-run')) run('xvfb-run', ['-a', electron, '--no-sandbox', bundle]);
else run(electron, linux ? ['--no-sandbox', bundle] : [bundle]);

const office = ['soffice', 'libreoffice'].find(has);
if (office)
  for (const format of ['docx', 'xlsx', 'pptx']) {
    const files = readdirSync(out).filter(file => file.endsWith('.' + format));
    run(office, ['--headless', '--convert-to', 'pdf', '--outdir', join(out, format), ...files], out);
  }
else console.log('LibreOffice not found: Word, Excel and PowerPoint files are written but not rendered.');
if (has('pdftoppm')) {
  const render = (pdf, prefix) => run('pdftoppm', ['-r', '60', '-png', pdf, join(out, 'img', prefix)]);
  for (const file of readdirSync(out).filter(file => file.endsWith('.pdf'))) render(join(out, file), 'pdf-' + file.slice(0, -4));
  for (const format of ['docx', 'xlsx', 'pptx'])
    for (const file of office ? readdirSync(join(out, format)).filter(file => file.endsWith('.pdf')) : [])
      render(join(out, format, file), `${format}-${file.slice(0, -4)}`);
  console.log(`Export pages: ${join(out, 'img')} (${readdirSync(join(out, 'img')).length} images)`);
} else console.log(`Exports written to ${out}; install poppler (pdftoppm) to render pages.`);
