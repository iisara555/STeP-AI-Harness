import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
import { en } from '../src/locales/en';
import { localized, setLanguage, t, teamName } from '../src/i18n';
import { startersFor, starterTag, starterText } from '../src/starters';

const TH = /[฀-๿]/;

test('t() keeps Thai by default, translates in English and fills placeholders', () => {
  setLanguage('th');
  assert.equal(t('เริ่มงานใหม่'), 'เริ่มงานใหม่');
  assert.equal(t('สวัสดีครับ คุณ{0}', 'ต้น'), 'สวัสดีครับ คุณต้น');
  setLanguage('en');
  assert.equal(t('เริ่มงานใหม่'), 'New task');
  assert.equal(t('สวัสดีครับ คุณ{0}', 'Ton'), 'Hello, Ton');
  assert.equal(t('ข้อความที่ยังไม่มีคำแปล'), 'ข้อความที่ยังไม่มีคำแปล', 'unknown text falls back to Thai');
  const table = localized({ idle: 'พร้อมเริ่ม' });
  assert.equal(table.idle, 'Ready to start', 'tables translate when read, not when the module loads');
  assert.equal(teamName({ name: 'ระบบคุณภาพ', nameEn: 'Quality System' }), 'Quality System');
  setLanguage('xx');
  assert.equal(table.idle, 'พร้อมเริ่ม', 'anything but "en" means Thai');
});

test('every Thai text passed to t() or tm() has an English entry with the same placeholders', async () => {
  const files = [
    ...(await readdir(new URL('../src/', import.meta.url)))
      .filter(f => /\.tsx?$/.test(f))
      .map(f => new URL('../src/' + f, import.meta.url)),
    ...(await readdir(new URL('../electron/', import.meta.url)))
      .filter(f => /\.ts$/.test(f))
      .map(f => new URL('../electron/' + f, import.meta.url)),
  ];
  const missing: string[] = [];
  const placeholders = (text: string) => (text.match(/\{\d+\}/g) || []).sort().join();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const sf = ts.createSourceFile(
      file.pathname,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.pathname.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'tm'].includes(node.expression.text)) {
        const arg = node.arguments[0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && TH.test(arg.text)) {
          const english = en[arg.text];
          if (english === undefined) missing.push(`${file.pathname.split('/').slice(-2).join('/')}: ${arg.text}`);
          else assert.equal(placeholders(english), placeholders(arg.text), arg.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  assert.deepEqual(missing, [], 'add these to src/locales/en.ts');
  for (const [thai, english] of Object.entries(en)) assert.ok(!TH.test(english), `English text still contains Thai: ${thai}`);
});

test('welcome starters exist for every team in both languages and never ask the AI to approve or pay', async () => {
  const manifest = await readFile(new URL('../../manifest/teams.yaml', import.meta.url), 'utf8');
  const teams = [...manifest.matchAll(/^ {6}- id: (\S+)/gm)].map(m => m[1]);
  assert.ok(teams.length >= 20);
  for (const team of ['', ...teams]) {
    const starters = startersFor(team);
    assert.equal(starters.length, 3, team);
    for (const starter of starters) {
      assert.ok(TH.test(starter.th) && !TH.test(starter.en), team);
      assert.doesNotMatch(starter.th, /อนุมัติ(?!และ)|เบิกจ่าย|โอนเงิน|ลงนามแทน/, team);
    }
  }
  setLanguage('en');
  assert.equal(starterTag(startersFor('qs')[0]), 'Quality');
  assert.match(starterText(startersFor('qs')[0]), /ISO 9001/);
  setLanguage('th');
  assert.match(starterText(startersFor('qs')[0]), /ตรวจติดตามคุณภาพภายใน ISO 9001/);
});

test('every tour step has English text', async () => {
  const { tourChapters, tourSteps } = await import('../src/tour');
  const texts = [...tourChapters, ...tourSteps.flatMap(s => [s.title, s.body, ...(s.tip ? [s.tip] : [])])];
  assert.deepEqual(
    texts.filter(text => en[text] === undefined),
    [],
    'add these to src/locales/en.ts',
  );
});
