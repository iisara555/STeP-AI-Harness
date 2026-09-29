// Turns ink-on-paper illustrations into transparent PNGs: darkness becomes alpha, ink stays black.
// The UI then shows them on any surface, and dark mode only inverts the ink.
// Run: npx electron scripts/prepare-illustrations.cjs <source-dir> <name=file.jpg>...
const { app, nativeImage } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const WIDTH = 640, PAPER = 238, INK = 24; // values at or above PAPER are paper; at or below INK are solid ink
const out = join(__dirname, '../src/assets/illustrations');
const [source, ...pairs] = process.argv.slice(2);

app.whenReady().then(() => {
  mkdirSync(out, { recursive: true });
  for (const pair of pairs) {
    const [name, file] = pair.split('=');
    const image = nativeImage.createFromPath(join(source, file)).resize({ width: WIDTH, quality: 'best' });
    const { width, height } = image.getSize(), pixels = image.toBitmap(); // BGRA
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = 0.114 * pixels[i] + 0.587 * pixels[i + 1] + 0.299 * pixels[i + 2];
      const alpha = Math.round(255 * Math.min(1, Math.max(0, (PAPER - lum) / (PAPER - INK))));
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0; pixels[i + 3] = alpha;
    }
    writeFileSync(join(out, name + '.png'), nativeImage.createFromBitmap(pixels, { width, height }).toPNG());
    console.log(name + '.png', width + 'x' + height);
  }
  app.quit();
});
