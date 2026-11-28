import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OrganizationKnowledge, STRONG_MATCH } from '../electron/knowledge';
import { shouldRunModelSkillSelection } from '../electron/skill-selection';
import { compactSearchQuery, relevantResults, searchPublicWeb, searchUrl } from '../electron/public-search';
import {
  computeColumnStats,
  enrichDelimitedAttachmentText,
  formatWorkbookForAttachment,
  parseSummableNumber,
} from '../electron/spreadsheet-attachment';
import { sheetWorker } from '../electron/sheets';
import { hasCodingWorkspace } from '../electron/coding-project';

const routing: any = await import('../../src/modules/router/service.js');

test('[OFFICE-P0] STeP map and contact queries hit step-public-profile strongly with official map link and skip extra selection', async () => {
  const knowledge = new OrganizationKnowledge(resolve('..'), routing.loadDocumentCatalog);
  const found = await knowledge.searchTurn('ขอแผนที่เดินทางมายัง STeP', 'ขอแผนที่เดินทางมายัง STeP');
  assert.ok(found.length > 0);
  assert.equal(found[0].id, 'step-public-profile');
  assert.ok(found[0].score >= STRONG_MATCH, `Expected STRONG_MATCH (>=${STRONG_MATCH}), got ${found[0].score}`);
  assert.match(found[0].text, /https:\/\/maps\.app\.goo\.gl\/HMPZjhafSpNSJP9j9/);
  assert.match(found[0].text, /18\.764640,\s*98\.934470/);
  assert.match(found[0].text, /https:\/\/www\.step\.cmu\.ac\.th\/contact/);

  // Fast-path skips redundant LLM skill-selection round-trip on map/contact lookups.
  assert.equal(shouldRunModelSkillSelection({ candidateSkills: [{ score: 0.4 }] }, 'ขอแผนที่เดินทางมายัง STeP', '', true), false);
  assert.equal(shouldRunModelSkillSelection({ candidateSkills: [{ score: 0.4 }] }, 'STeP อยู่ที่ไหน', '', false), false);
  // Still runs when user asks for an explicit deliverable (e.g. drafting a letter/report).
  assert.equal(
    shouldRunModelSkillSelection({ candidateSkills: [{ score: 0.4 }] }, 'ช่วยร่างหนังสือเชิญพร้อมแนบแผนที่ STeP', '', true),
    true,
  );
});

test('[OFFICE-P1] Thai public web search adds th-TH locale, strips polite filler words, and retries compact query', async () => {
  const thaiUrl = new URL(searchUrl('แผนที่ STeP เชียงใหม่'));
  assert.equal(thaiUrl.searchParams.get('mkt'), 'th-TH');
  assert.equal(thaiUrl.searchParams.get('cc'), 'TH');
  assert.equal(thaiUrl.searchParams.get('setlang'), 'th');

  const enUrl = new URL(searchUrl('Chiang Mai Science Park map'));
  assert.equal(enUrl.searchParams.get('mkt'), null);

  assert.equal(compactSearchQuery('ขอแผนที่เดินทางมายัง STeP หน่อยครับ'), 'แผนที่เดินทาง STeP');

  const hits = [
    {
      title: 'ติดต่อเรา | อุทยานวิทยาศาสตร์และเทคโนโลยี มช. (STeP)',
      url: 'https://www.step.cmu.ac.th/contact',
      snippet: 'แผนที่เดินทางและช่องทางติดต่อ STeP แม่เหียะ เชียงใหม่',
    },
  ];
  assert.equal(relevantResults('ขอแผนที่เดินทางมายัง STeP หน่อยครับ', hits).length, 1);

  // First call with polite phrasing returns empty RSS -> retries once with compact query on the same Bing host.
  const queries: string[] = [];
  const goodRss =
    '<rss><channel><item><title>แผนที่เดินทาง STeP เชียงใหม่</title><link>https://www.step.cmu.ac.th/contact</link><description>ที่ตั้งและแผนที่เดินทาง STeP</description></item></channel></rss>';
  const out = await searchPublicWeb('ขอแผนที่เดินทางมายัง STeP หน่อยครับ', new AbortController().signal, undefined, async url => {
    const q = new URL(url).searchParams.get('q') || '';
    queries.push(q);
    return { url, text: queries.length === 1 ? '<rss><channel></channel></rss>' : goodRss };
  });
  assert.equal(queries.length, 2);
  assert.equal(queries[1], 'แผนที่เดินทาง STeP');
  assert.match(out, /https:\/\/www\.step\.cmu\.ac\.th\/contact/);
});

test('[OFFICE-P1] Excel (.xlsx) worker extraction and CSV stats compute exact totals while ignoring ID codes', async () => {
  assert.equal(parseSummableNumber('1,250.50'), 1250.5);
  assert.equal(parseSummableNumber('฿45,000'), 45000);
  assert.equal(parseSummableNumber('0812345678'), null);
  assert.equal(parseSummableNumber('0994000423179'), null);

  // Round-trip real XLSX created by sheetWorker -> extracted by sheet_extract in the isolated worker!
  const created = await sheetWorker(
    Buffer.alloc(0),
    {
      operation: 'sheet_create',
      spec: {
        sheets: [
          {
            name: 'งบประมาณ 2569',
            columns: [
              { label: 'รหัสโครงการ', type: 'text' },
              { label: 'แผนก', type: 'text' },
              { label: 'งบประมาณ', type: 'currency' },
              { label: 'เบิกจ่ายจริง', type: 'currency' },
            ],
            rows: [
              ['001', 'CC', 120000, 95000],
              ['002', 'AFP', 80000, 75000],
              ['003', 'QS', 50000, 40000],
            ],
          },
        ],
      },
    },
    new AbortController().signal,
  );
  assert.ok(typeof created?.binary === 'string' && created.binary.length > 0);
  const extracted = await sheetWorker(Buffer.from(created.binary, 'base64'), { operation: 'sheet_extract' }, new AbortController().signal);
  assert.equal(extracted.sheets.length, 1);
  assert.equal(extracted.sheets[0].name, 'งบประมาณ 2569');
  assert.equal(extracted.sheets[0].rowCount, 4);
  const budgetStat = extracted.sheets[0].numericStats.find((s: any) => s.column === 'งบประมาณ');
  const spentStat = extracted.sheets[0].numericStats.find((s: any) => s.column === 'เบิกจ่ายจริง');
  assert.ok(budgetStat && spentStat);
  assert.equal(budgetStat.sum, 250000);
  assert.equal(spentStat.sum, 210000);
  // Leading-zero project IDs ('001', '002', '003') must NOT be summed.
  assert.equal(
    extracted.sheets[0].numericStats.some((s: any) => s.column === 'รหัสโครงการ'),
    false,
  );

  const formatted = formatWorkbookForAttachment(extracted.sheets);
  assert.match(formatted.text, /สรุปสถิติตัวเลขที่ระบบคำนวณจากข้อมูลจริง/);
  assert.match(formatted.text, /250,000/);
  assert.match(formatted.text, /210,000/);

  // CSV enrichment computes identical host-verified stats
  const csv = 'รายการ,เบอร์โทร,จำนวนเงิน\nค่าวิทยากร,0812345678,3600\nค่าอาหาร,0898765432,4400\n';
  const enriched = enrichDelimitedAttachmentText(csv, 'csv');
  assert.match(enriched, /8,000/);
  assert.equal(computeColumnStats([['เบอร์โทร'], ['0812345678'], ['0898765432']]).length, 0);
});

test('[OFFICE-P0] hasCodingWorkspace hides Coding nav for ordinary office folders and shows it for software repos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'step-office-ws-'));
  try {
    await writeFile(join(dir, 'รายงานประจำเดือน.docx'), 'dummy');
    assert.equal(await hasCodingWorkspace(dir), false);
    assert.equal(await hasCodingWorkspace(''), false);

    await mkdir(join(dir, 'apps', 'web'), { recursive: true });
    await writeFile(join(dir, 'apps', 'web', 'package.json'), '{"name":"web"}');
    assert.equal(await hasCodingWorkspace(dir), true);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
