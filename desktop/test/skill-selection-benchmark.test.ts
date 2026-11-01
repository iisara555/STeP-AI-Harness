import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkService, type Harness } from '../electron/service';
import { Store } from '../electron/store';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const skills: any = await import('../../src/modules/skills/catalog.js');
const root = resolve('..');
const catalog = skills.createSkillCatalog(root);

// Desktop's hybrid Skill selection on the staff-style routing benchmark (manifest/routing-staff-benchmark.json): which
// requests the router settles without an AI call, which skip the selection call, and which wait for it. The AI here
// always names the expected Skill, so the numbers measure only what the host decides before any AI call. A wrong router
// pick loads the wrong Skill; a skipped request starts without its Skill preloaded and relies on the answering AI to
// open it with the skill tool. Speed changes must lower selection calls without raising the other counts (the owner's
// quality rule, 2026-11-01). Limits only tighten.
const suite = JSON.parse(await readFile(resolve(root, 'manifest/routing-staff-benchmark.json'), 'utf-8'));
const limits = suite.limits.desktopSelection;

type Outcome = { method?: string; skill?: string; selectionCalls: number };

async function select(request: string, expected: string | null): Promise<Outcome> {
  const store = new Store(':memory:');
  try {
    store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
    store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'fixture', ready: true });
    let selectionCalls = 0;
    const harness: Harness = {
      root,
      hybridSkillSelection: () => true,
      route: (q, opts) => routing.queryStepRouter(q, { autoRoute: false, authorityChecks: true, disableMemory: true, ...opts }),
      contextPolicy: boundary.classifyContextPolicy,
      privacy: privacy.evaluatePrivacyGate,
      skillMetadata: async id => {
        const m = await routing.loadSkillContextMetadata(id);
        return { ...m, mandatoryReferences: await routing.loadDocumentContextMetadata(m.mandatory) };
      },
      catalog,
      documentCatalog: routing.loadDocumentCatalog,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
      toolLoop: () => true,
      tools: async () => ({
        enabled: () => true,
        check: async () => {},
        readOnly: () => true,
        execute: async () => '',
        outgoing: async s => s,
      }),
    };
    const service = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: tmpdir(), env: {} },
        adapter: {
          run: async (_prompt, _c, ctx) => {
            if ((ctx.jsonSchema as any)?.properties?.skillId) {
              selectionCalls++;
              return JSON.stringify({ skillId: expected, reason: 'benchmark' });
            }
            return 'Synthetic answer';
          },
        },
      }),
      () => {},
    );
    const session = store.create('c', 'cc');
    await service.run(session.id, request, '', true, undefined, 'chat');
    const selection = store.session(session.id).runs?.at(-1)?.skillSelection;
    return { method: selection?.method, skill: selection?.skill, selectionCalls };
  } finally {
    store.close();
  }
}

test('hybrid Skill selection on staff-style requests stays at or above the recorded level', { timeout: 600_000 }, async () => {
  let routerRight = 0,
    selectionCalls = 0,
    finalRight = 0;
  const routerWrong: string[] = [],
    skippedSkill: string[] = [];
  for (const [skill, requests] of Object.entries(suite.skills) as [string, string[]][])
    for (const request of requests) {
      const outcome = await select(request, skill);
      selectionCalls += outcome.selectionCalls;
      if (outcome.method === 'router') {
        if (outcome.skill === skill) routerRight++;
        else routerWrong.push(`${request} => ${outcome.skill} (expected ${skill})`);
      } else if (!outcome.selectionCalls) skippedSkill.push(`${request} (expected ${skill})`);
      if (outcome.skill === skill) finalRight++;
    }
  const generalPicked: string[] = [];
  let generalCalls = 0;
  for (const request of suite.general as string[]) {
    const outcome = await select(request, null);
    generalCalls += outcome.selectionCalls;
    if (outcome.skill) generalPicked.push(`${request} => ${outcome.skill}`);
  }
  const total = Object.values(suite.skills).flat().length;
  const report = [
    `router: ${routerRight}/${total} right, ${routerWrong.length} wrong`,
    `selection calls: ${selectionCalls}/${total} Skill requests, ${generalCalls}/${suite.general.length} general`,
    `Skill not preloaded (selection skipped): ${skippedSkill.length}`,
    `final right with a perfect selector: ${finalRight}/${total}`,
    `general requests given a Skill: ${generalPicked.length}`,
  ].join('; ');
  assert.ok(routerRight >= limits.minRouterRight, `${report}; minRouterRight is ${limits.minRouterRight}`);
  assert.ok(
    routerWrong.length <= limits.maxRouterWrong,
    `${report}; maxRouterWrong is ${limits.maxRouterWrong}\n${routerWrong.join('\n')}`,
  );
  assert.ok(
    skippedSkill.length <= limits.maxSkippedSkill,
    `${report}; maxSkippedSkill is ${limits.maxSkippedSkill}\n${skippedSkill.join('\n')}`,
  );
  assert.ok(selectionCalls <= limits.maxSelectionCalls, `${report}; maxSelectionCalls is ${limits.maxSelectionCalls}`);
  assert.ok(
    generalPicked.length <= limits.maxGeneralPicked,
    `${report}; maxGeneralPicked is ${limits.maxGeneralPicked}\n${generalPicked.join('\n')}`,
  );
});
