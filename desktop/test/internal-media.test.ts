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

test('placeholders and external publication block copying', () => {
  assert.deepEqual(compileMedia({ topic: 'x', content: 'วันที่ [รอยืนยัน]' }).warnings, ['เนื้อหายังมีช่องรอข้อมูล กรุณาเติมก่อนใช้จริง']);
  const external = compileMedia({ topic: 'โพสต์สาธารณะ', content: 'ok' });
  assert.equal(external.ready, false);
  assert.match(external.warnings.join(), /ใช้สื่อสารภายในเท่านั้น/);
});

test('every prompt is internal, keeps the logo ban and the confirmed CI colours', () => {
  for (const type of Object.keys(MEDIA_TYPES) as (keyof typeof MEDIA_TYPES)[])
    for (const style of ['NOTION', 'VECTOR', 'COLLAGE', 'PHOTO'] as const) {
      const r = compileMedia({ ...MEDIA_EXAMPLES[type], type, style });
      assert.equal(r.ready, true, `${type}/${style} example is ready`);
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
