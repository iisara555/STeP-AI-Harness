import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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

    assert.equal(registered.length, 45);
    assert.deepEqual([...new Set(registered)].sort(), [...covered].sort());
    assert.equal(evals.directModelSideBenchmark.skills.length, 26);
    assert.equal(evals.needsDirectModelSideCoverage.length, 19);
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
    assert.equal(integrity.summary.skillsCount, 45);
    assert.equal(integrity.summary.routerSkillsCount, 44);
    assert.equal(integrity.summary.playbooksCount, 4);
  });
});
