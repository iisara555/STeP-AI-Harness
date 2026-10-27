import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OrganizationKnowledge, type CatalogEntry } from '../electron/knowledge';
const routing: any = await import('../../src/modules/router/service.js');

const registered = () => new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);

test('team-duty questions retrieve the role description instead of form registers', async () => {
  const knowledge = registered();
  for (const [q, code] of [
    ['ทีม HD ทำหน้าที่อะไร', 'HD'],
    ['HD ดูแลงานอะไร', 'HD'],
    ['ทีม CC มีหน้าที่อะไร', 'CC'],
    ['AFP รับผิดชอบอะไร', 'AFP'],
    ['Tech Up ทำอะไร', 'Tech Up'],
  ]) {
    const found = await knowledge.search(q);
    assert.equal(found[0]?.id, 'step-teams-directory', q);
    assert.ok(found[0].text.includes(`**${code}**`), 'the returned excerpt must contain the requested team');
    assert.match(found[0].text, /หน้าที่หลักและขอบเขตบริการ/);
  }
});

// Staff say "ลางาน" rather than the document's "การลา"; a time word such as "ปีหน้า" must not hide the topic.
test('everyday leave questions retrieve the personnel rules', async () => {
  const knowledge = registered();
  for (const q of ['ปีหน้าลางานได้กี่วัน', 'ลางานได้กี่วัน', 'ปีนี้ลางานได้กี่วัน']) {
    const found = await knowledge.search(q);
    assert.equal(found[0]?.id, 'hr-personnel-welfare-2569', q);
  }
});

test('a shared province name does not make unrelated public questions organization knowledge', async () => {
  const knowledge = registered();
  for (const q of ['แนะนำร้านกาแฟในเชียงใหม่', 'แนะนำร้านอาหารในเชียงใหม่', 'ร้านกาแฟเชียงใหม่เปิดกี่โมง']) {
    assert.deepEqual(await knowledge.search(q), [], q);
  }
});

async function synthetic(run: (knowledge: OrganizationKnowledge) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'step-knowledge-relevance-'));
  const entries: CatalogEntry[] = [
    { id: 'forms', title: 'ทีม HX ทะเบียนฟอร์มและหน้าที่', path: 'forms.md' },
    { id: 'roles', title: 'รายชื่อทีม', path: 'roles.md' },
    { id: 'private', title: 'หน้าที่ทีม HX', path: 'private.md', status: 'restricted' },
  ];
  try {
    await writeFile(
      join(root, 'forms.md'),
      '# ทีม HX ทะเบียนฟอร์ม\n\n| รหัส | ชื่อ |\n|---|---|\n| FM-HX-001 | รายงานการปฏิบัติหน้าที่ ทีม HX |\n',
    );
    await writeFile(
      join(root, 'roles.md'),
      '# รายชื่อทีม\n\n| Team | หน้าที่หลักและขอบเขตบริการ |\n|---|---|\n| **HX** | จัดการคลังสินค้าสังเคราะห์ |\n| **HXX** | ตรวจเครื่องจักรสังเคราะห์ |\n',
    );
    await writeFile(join(root, 'private.md'), '# หน้าที่ทีม HX\nข้อมูลสังเคราะห์ที่ห้ามใช้\n');
    await run(new OrganizationKnowledge(root, async () => entries));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('role retrieval uses table evidence, respects exact team codes and excludes restricted documents', async () => {
  await synthetic(async knowledge => {
    const role = await knowledge.search('ทีม HX มีหน้าที่อะไร');
    assert.equal(role[0]?.id, 'roles');
    assert.ok(role.every(s => s.id !== 'private'));
    assert.match(role[0].text, /จัดการคลังสินค้าสังเคราะห์/);
    const unknown = await knowledge.search('team HXY ทำหน้าที่อะไร');
    assert.deepEqual(unknown, [], 'a header or partial code match cannot establish an unknown team');
    const exact = await knowledge.search('FM-HX-001 มีหน้าที่อะไร');
    assert.equal(exact[0]?.id, 'forms');
    assert.equal(exact[0]?.score, 1, 'explicit document numbers retain exact retrieval');
  });
});

test('topic coverage rejects shared place names in an independent synthetic catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'step-knowledge-topic-'));
  try {
    await writeFile(join(root, 'synthetic.md'), '# สวัสดิการพนักงานในนครสมมติ\n\n## เวลาทำงาน\nเข้างาน 09.00 น. เลิกงาน 17.00 น.\n');
    const knowledge = new OrganizationKnowledge(root, async () => [
      { id: 'synthetic', title: 'สวัสดิการและเวลาทำงานพนักงานในนครสมมติ', path: 'synthetic.md', keywords: ['เวลางาน'] },
    ]);
    assert.deepEqual(await knowledge.search('แนะนำร้านกาแฟในนครสมมติ'), []);
    assert.deepEqual(await knowledge.search('ช่วยแนะนำร้านกาแฟในนครสมมติหน่อย'), []);
    assert.deepEqual(await knowledge.search('ช่วยแนะนำร้านกาแฟในนครสมมติ'), []);
    assert.equal((await knowledge.search('เข้างานกี่โมง เลิกงานกี่โมง'))[0]?.id, 'synthetic');
    assert.equal((await knowledge.search('แนะนำเวลางานในนครสมมติ'))[0]?.id, 'synthetic', 'in-scope subjects remain searchable');
    assert.equal((await knowledge.search('ช่วยแนะนำเวลางานในนครสมมติหน่อย'))[0]?.id, 'synthetic');
    assert.equal((await knowledge.search('เวลางาน'))[0]?.id, 'synthetic', 'registered keywords remain usable');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
