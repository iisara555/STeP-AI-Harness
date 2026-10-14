import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_EXAMPLES, MEDIA_TYPES, compileMedia, mediaAiRequest, normalizeMedia } from '../src/internal-media';

test('unknown or missing options fall back to safe defaults', () => {
  const s = normalizeMedia({
    type: 'POSTER',
    style: 'NEON',
    ratio: '2:1',
    textMode: 'x',
    position: 'CORNER',
    font: 'Comic Sans',
    topic: 5,
  });
  assert.deepEqual(
    [s.type, s.style, s.ratio, s.textMode, s.position, s.font, s.topic],
    ['ILLUSTRATION', 'NOTION', '1:1', 'GENERATE', 'LEFT', 'LINE Seed Sans TH', ''],
  );
});

test('copying waits for the topic, on-image copy and real guide steps', () => {
  assert.deepEqual(compileMedia({}).missing, ['หัวข้อ', 'เนื้อหาที่ต้องการให้ปรากฏบนภาพ']);
  assert.deepEqual(compileMedia({ topic: 'x', type: 'GUIDE', textMode: 'SPACE' }).missing, ['ขั้นตอนใช้งานจริง']);
  assert.equal(compileMedia({ topic: 'x', textMode: 'SPACE' }).ready, true, 'reserved space needs no on-image copy');
});

test('placeholders in any prompt field block copying', () => {
  for (const field of ['topic', 'brief', 'content', 'visual', 'source'] as const) {
    for (const placeholder of ['วันที่ [รอยืนยัน]', '[ระบุหัวข้อ]', '[เติมเนื้อหา]', '[ยังไม่มี]', '[TBD]', '[ ]']) {
      const result = compileMedia({ topic: 'x', content: 'ok', [field]: placeholder });
      assert.equal(result.ready, false, `${field}: ${placeholder} must be checked`);
      assert.match(result.warnings.join(), /ยังมีช่องรอข้อมูล/);
    }
  }
});

test('completed bracketed references are usable while unresolved placeholders still block copying', () => {
  for (const field of ['topic', 'brief', 'content', 'visual', 'source'] as const) {
    for (const citation of ['[1]', '[1, 2]', '[1–3]', '[๑]', '[ฉบับแก้ไข]', '[คู่มือการใช้พื้นที่](https://example.org)'])
      assert.equal(compileMedia({ topic: 'x', content: 'ok', [field]: `รายงานประจำปี ${citation}` }).ready, true, field);
    assert.equal(compileMedia({ topic: 'x', content: 'ok', [field]: 'รายงาน [1] วันที่ [รอยืนยัน]' }).ready, false, field);
  }
});

test('external-publication intent in any prompt field blocks copying', () => {
  for (const field of ['topic', 'brief', 'content', 'visual', 'source'] as const) {
    for (const intent of [
      'ประชาสัมพันธ์ภายนอก',
      'สำหรับเผยแพร่สู่สาธารณะ',
      'ลงเพจ Facebook สาธารณะ',
      'แชร์สู่สาธารณะ',
      'เผยแพร่ต่อสาธารณชน',
      'publish this publicly',
      'share on a public website',
      'post on a public social media page',
      'external publication',
    ]) {
      const result = compileMedia({ topic: 'x', content: 'ok', [field]: intent });
      assert.equal(result.ready, false, `${field}: ${intent} must be checked`);
      assert.match(result.warnings.join(), /ใช้สื่อสารภายในเท่านั้น/);
    }
  }
});

test('internal-only disclaimers allow copying without hiding a separate public request', () => {
  for (const disclaimer of [
    'ใช้ภายในเท่านั้น ห้ามเผยแพร่ภายนอก',
    'ห้ามนำไปเผยแพร่ต่อสาธารณชน',
    'Internal use only; do not publish this publicly',
    'Never post on a public website',
    'Not for external communication',
  ])
    assert.equal(compileMedia({ topic: 'x', content: disclaimer }).ready, true, disclaimer);
  assert.equal(
    compileMedia({ topic: 'x', content: 'ห้ามเผยแพร่ภายนอก', brief: 'แชร์สู่สาธารณะ' }).ready,
    false,
    'a disclaimer does not override another field',
  );
  assert.equal(
    compileMedia({ topic: 'x', content: 'ห้ามเผยแพร่ภายนอก แต่โพสต์สาธารณะ' }).ready,
    false,
    'a disclaimer does not hide a separate affirmative request',
  );
});

test('every prompt is internal, keeps the logo ban and the confirmed CI colours', () => {
  for (const type of Object.keys(MEDIA_TYPES) as (keyof typeof MEDIA_TYPES)[])
    for (const style of ['NOTION', 'VECTOR', 'COLLAGE', 'PHOTO'] as const) {
      const r = compileMedia({ ...MEDIA_EXAMPLES[type], type, style });
      assert.equal(r.ready, true, `${type}/${style} example is ready`);
      assert.match(r.prompt, /^TASK\nCreate one (?:illustration|announcement|how-to guide|educational visual) for INTERNAL/m);
      assert.match(r.prompt, /INTERNAL communication only/);
      assert.match(r.prompt, /MANDATORY LOGO RESTRICTION\nNever generate, redraw or imitate ANY logo/);
      assert.match(r.prompt, /#FFC709/);
      assert.match(r.prompt, /#231F20/);
    }
});

test('on-image copy is quoted exactly; reserved space renders no text', () => {
  const generate = compileMedia({ topic: 'x', content: 'บรรทัด 1\nบรรทัด 2', font: 'IBM Plex Sans Thai' });
  assert.match(generate.prompt, /BEGIN EXACT COPY\nบรรทัด 1\nบรรทัด 2\nEND EXACT COPY/);
  assert.match(generate.prompt, /Use IBM Plex Sans Thai for every Thai heading/);
  const space = compileMedia({ topic: 'x', content: 'guide only', textMode: 'SPACE', position: 'TOP', ratio: '16:9' });
  assert.match(space.prompt, /Keep the upper third completely clean and empty/);
  assert.match(space.prompt, /NOT lettering to render:\nguide only/);
  assert.doesNotMatch(space.prompt, /BEGIN EXACT COPY/);
  assert.match(space.prompt, /aspect ratio 16:9/);
});

test('the AI drafting request forbids invented facts and logos', () => {
  const guide = mediaAiRequest({ type: 'GUIDE', topic: 'ตู้ประชุม' });
  assert.match(guide, /^ช่วยร่างคู่มือใช้งาน/);
  assert.match(guide, /ห้ามเดาปุ่ม/);
  assert.match(guide, /ห้ามสร้างหรือเสนอให้สร้างโลโก้/);
  assert.match(mediaAiRequest({ type: 'ANNOUNCEMENT' }), /หัวข้อ: \[ระบุหัวข้อ\]/);
  assert.match(mediaAiRequest({ type: 'ANNOUNCEMENT' }), /ห้ามแต่งวันที่ เวลา สถานที่/);
});
