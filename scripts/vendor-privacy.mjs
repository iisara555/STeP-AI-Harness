// Rebuild offline parsers: npm ci --prefix scripts/privacy-vendor --ignore-scripts --omit=optional
// then: node scripts/vendor-privacy.mjs
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || join(root, 'scripts/privacy-vendor/node_modules'));
const target = join(root, 'src/vendor/privacy');
await mkdir(target, { recursive: true });
const files = {
  'pdfjs-dist/legacy/build/pdf.min.mjs': 'pdf.mjs',
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs': 'pdf.worker.mjs',
  'fflate/esm/browser.js': 'fflate.mjs',
  'fast-xml-parser/lib/fxp.cjs': 'fxp.cjs',
};
// Character maps and standard fonts are local assets used by PDF text extraction.
for (const directory of ['cmaps', 'standard_fonts']) {
  await mkdir(join(target, directory), { recursive: true });
  for (const name of await readdir(join(source, 'pdfjs-dist', directory))) {
    files[`pdfjs-dist/${directory}/${name}`] = `${directory}/${name}`;
  }
}
const manifest = { packages: {}, files: {} };
for (const name of ['pdfjs-dist', 'fflate', 'fast-xml-parser', '@nodable/entities', 'fast-xml-builder', 'is-unsafe', 'path-expression-matcher', 'strnum', 'xml-naming']) {
  const pkg = JSON.parse(await readFile(join(source, name, 'package.json'), 'utf8'));
  manifest.packages[name] = { version: pkg.version, license: pkg.license };
  const licenses = (await readdir(join(source, name))).filter((f) => /^(?:license|notice)(?:\.|$)/i.test(f));
  if (!licenses.length && name !== '@nodable/entities') throw new Error(`Missing license: ${name}`);
  for (const license of licenses) files[`${name}/${license}`] = `${name.replace(/[@/]/g, '_')}-${license}`;
}
const entityLicense = 'nodable-entities-LICENSE';
await copyFile(join(root, 'scripts/privacy-vendor', entityLicense), join(target, entityLicense));
manifest.files[entityLicense] = createHash('sha256').update(await readFile(join(target, entityLicense))).digest('hex');
for (const [from, to] of Object.entries(files)) {
  await copyFile(join(source, from), join(target, to));
  manifest.files[to] = createHash('sha256').update(await readFile(join(target, to))).digest('hex');
}
await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Vendored ${Object.keys(files).length} runtime/license files; no native renderer or network assets.`);
