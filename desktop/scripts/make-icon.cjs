// Builds the app icon from the official STeP symbol (original colour on white, CI p.4).
// Run: npx electron scripts/make-icon.cjs
// The artwork is placed unmodified on a plain white tile with generous clear space; it is never recoloured or redrawn.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'src/assets/step-symbol-colour.svg'));
const out = join(root, 'build');
const SIZE = 1024, ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${SIZE}px;height:${SIZE}px;background:#fff;border-radius:${SIZE * 0.2}px;display:grid;place-items:center">
<img style="width:${SIZE * 0.66}px;height:auto" src="data:image/svg+xml;base64,${svg.toString('base64')}"></div></body></html>`;

function ico(pngs) {
  // PNG-compressed ICO entries (Windows Vista and later).
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8); header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map(p => p.data)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true, javascript: false } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 300));
  let image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  if (image.getSize().width !== SIZE) image = image.resize({ width: SIZE, height: SIZE, quality: 'best' });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'icon.png'), image.toPNG());
  writeFileSync(join(out, 'icon.ico'), ico(ICO_SIZES.map(size => ({ size, data: image.resize({ width: size, height: size, quality: 'best' }).toPNG() }))));
  console.log('Wrote build/icon.png and build/icon.ico');
  app.quit();
});
