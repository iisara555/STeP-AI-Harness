import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { queryStepRouter } from '../src/cli/commands/ask.js';
import { loadAndValidateManifests } from '../src/modules/router/index.js';

async function skillFiles() {
  const roots = await readdir('skills', { withFileTypes: true });
  const files = [];
  for (const ns of roots.filter((item) => item.isDirectory())) {
    const entries = await readdir(join('skills', ns.name), { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const path = join('skills', ns.name, entry.name, 'SKILL.md');
      try {
        await access(path);
        files.push(path);
      } catch {}
    }
  }
  return files.sort();
}

test('STeP Skill Authoring Standard', async (t) => {
  await t.test('Skill creation routes through the STeP-native Skill-to-Pilot playbook', async () => {
    const result = await queryStepRouter(
      'ช่วยสร้าง skill ใหม่ของ STeP ลง repo พร้อม register router และ test ให้พร้อม pilot',
      { team: 'ai-admin' }
    );

    assert.equal(result.routingMode, 'PLAYBOOK');
    assert.equal(result.selectedPlaybook?.id, 'skill-to-pilot');
    assert.equal(result.selectedSkill?.name, 'step-skill-authoring');
    assert.deepEqual(
      result.playbookPlan.map((step) => step.skill || step.action),
      ['step-skill-authoring', 'coding-git-workflow', 'evidence-before-approval']
    );
  });

  await t.test('SOP drafting does not collide with Skill authoring', async () => {
    const result = await queryStepRouter(
      'ช่วยร่าง SOP ขั้นตอนรับเรื่องลูกค้าของทีมให้คนอื่นทำซ้ำได้',
      { team: 'qs' }
    );
    assert.equal(result.selectedSkill?.name, 'sop-authoring');
  });

  await t.test('Skill authoring contract contains trigger, anti-trigger, source, authority and eval gates', async () => {
    const skill = await readFile('skills/common/step-skill-authoring/SKILL.md', 'utf-8');
    for (const phrase of ['Trigger', 'Anti-trigger', 'Source Contract', 'Authority Boundary', 'Eval Contract', 'Baseline → Change → Eval']) {
      assert.ok(skill.includes(phrase), `missing authoring contract: ${phrase}`);
    }
  });

  await t.test('all local Markdown dependencies referenced by Skills exist', async () => {
    const markdownLink = /\[[^\]]*\]\(([^)]+)\)/g;
    const localResource = /`((?:references|scripts|templates)\/[A-Za-z0-9_.\-/]+)`/g;

    for (const skillPath of await skillFiles()) {
      const body = await readFile(skillPath, 'utf-8');
      const targets = new Set();

      for (const match of body.matchAll(markdownLink)) targets.add(match[1].trim().replace(/^<|>$/g, ''));
      for (const match of body.matchAll(localResource)) targets.add(match[1]);

      for (const raw of targets) {
        const target = raw.split('#')[0].split('?')[0].trim();
        if (!target || /^(?:https?:\/\/|mailto:|data:)/i.test(target)) continue;
        const localPath = resolve(dirname(skillPath), target);
        await assert.doesNotReject(access(localPath), `${skillPath} -> missing ${raw}`);
      }
    }
  });

  await t.test('AFP source-sensitive Skills do not retain the old hard-coded policy claims', async () => {
    const tor = await readFile('skills/pm/tor-review/SKILL.md', 'utf-8');
    const torDraft = await readFile('skills/pm/tor-government-writing/SKILL.md', 'utf-8');
    const receipt = await readFile('skills/common/receipt-audit/SKILL.md', 'utf-8');
    const receiptGuide = await readFile('skills/common/receipt-audit/references/receipt-rules-cmu.md', 'utf-8');

    assert.ok(tor.includes('NEED-SOURCE'));
    assert.ok(torDraft.includes('resolve จาก `manifest/documents.yaml`'));
    assert.ok(receipt.includes('NEEDS-CURRENT-SOURCE'));
    assert.ok(receiptGuide.includes('working reference only'));

    assert.ok(!tor.includes('๐.๒๐ ต่อวัน'));
    assert.ok(!torDraft.includes('๐.๒๐ ต่อวัน'));
    assert.ok(!receipt.includes('0994000164973'));
    assert.ok(!receiptGuide.includes('35 – 50'));
  });

  await t.test('Skill eval baseline covers every registered Skill without pretending model-side coverage', async () => {
    const registry = await readFile('manifest/skills.yaml', 'utf-8');
    const registered = [...registry.matchAll(/^  ([a-z0-9-]+):$/gm)].map((m) => m[1]);
    const evals = JSON.parse(await readFile('manifest/skill-evals.json', 'utf-8'));
    const covered = new Set([
      ...evals.directModelSideBenchmark.skills,
      ...evals.needsDirectModelSideCoverage,
    ]);

    assert.equal(registered.length, 49);
    assert.deepEqual([...new Set(registered)].sort(), [...covered].sort());
    assert.equal(evals.directModelSideBenchmark.skills.length, 26);
    assert.equal(evals.needsDirectModelSideCoverage.length, 23);
  });

  await t.test('Standard v2 is enforced on new document-review without forcing legacy migration', async () => {
    const skill = await readFile('skills/common/document-review/SKILL.md', 'utf-8');
    assert.ok(skill.includes('standardVersion: 2'));

    for (const heading of [
      '## Purpose',
      '## เมื่อควรใช้',
      '## Inputs',
      '## Source',
      '## Workflow',
      '## Output',
      '## Authority',
      '## Handoff',
      '## Guardrails',
    ]) {
      assert.ok(skill.includes(heading), `document-review missing v2 heading: ${heading}`);
    }

    const authoring = await readFile('skills/common/step-skill-authoring/SKILL.md', 'utf-8');
    assert.ok(authoring.includes('standardVersion: 2'));
    assert.ok(authoring.includes('Purpose → เมื่อควรใช้ → Inputs → Source → Workflow → Output → Authority → Handoff → Guardrails'));

    const ncr = await readFile('skills/common/ncr-capa/SKILL.md', 'utf-8');
    const iso = await readFile('skills/common/iso9001-audit-readiness/SKILL.md', 'utf-8');
    assert.ok(ncr.includes('## Authority'));
    assert.ok(iso.includes('## Authority'));
  });

  await t.test('every Skill except the documented exemption follows Standard v2', async () => {
    // docs/skill-authoring-standard.md records step-router as the only exemption:
    // it specifies the routing algorithm itself, not a task Skill.
    const exempt = new Set(['skills/common/step-router/SKILL.md'.replace(/\//g, sep)]);
    const required = [
      'Purpose',
      'เมื่อควรใช้',
      'Inputs',
      'Source',
      'Workflow',
      'Output',
      'Authority',
      'Handoff',
      'Guardrails',
    ];

    const standard = await readFile('docs/skill-authoring-standard.md', 'utf-8');
    assert.ok(
      standard.includes('skills/common/step-router'),
      'the exemption must stay documented in the authoring standard'
    );

    const offenders = [];
    for (const file of await skillFiles()) {
      if (exempt.has(file)) continue;
      const text = await readFile(file, 'utf-8');
      const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!frontmatter || !/standardVersion:\s*2/.test(frontmatter[1])) {
        offenders.push(`${file}: missing standardVersion: 2`);
        continue;
      }
      const headings = [...text.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1].trim());
      const missing = required.filter((heading) => !headings.includes(heading));
      if (missing.length) offenders.push(`${file}: missing ${missing.join(', ')}`);
    }

    assert.deepEqual(offenders, [], offenders.join('\n'));
  });

  await t.test('no Skill uses emoji in its Markdown', async () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const offenders = [];
    for (const file of await skillFiles()) {
      const lines = (await readFile(file, 'utf-8')).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (emoji.test(line)) offenders.push(`${file}:${index + 1}`);
      });
    }
    assert.deepEqual(offenders, [], `emoji found in:\n${offenders.join('\n')}`);
  });

  await t.test('approved lifecycle cannot be inferred from an approver role alone', async () => {
    const registry = await readFile('manifest/skills.yaml', 'utf-8');
    const blocks = registry.split(/^  (?=[a-z0-9-]+:\s*$)/m).slice(1);
    for (const block of blocks) {
      if (!/stage:\s*approved/.test(block)) continue;
      assert.match(block, /approvalEvidence:\s*(?!pending|none|$)\S+/m, 'approved Skill must carry explicit approval evidence');
    }
    assert.equal((registry.match(/stage:\s*approved/g) || []).length, 0, 'current repo has no owner-review evidence sufficient for approved status');
  });

  await t.test('manifest integrity includes the new Skill, process and Playbook', async () => {
    const integrity = await loadAndValidateManifests(resolve('manifest'));
    assert.equal(integrity.valid, true, integrity.errors.join('\n'));
    assert.equal(integrity.summary.skillsCount, 49);
    assert.equal(integrity.summary.routerSkillsCount, 48);
    assert.equal(integrity.summary.playbooksCount, 5);
  });
});
