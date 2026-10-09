/** Local payload benchmark. Uses production routing/assembly and a mock adapter; makes no provider calls. */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import { tokens } from '../electron/compact';
import type { Connection } from '../src/types';
const routing: any = await import('../../src/modules/router/service.js');
const boundary: any = await import('../../src/modules/router/task-boundary.js');
const privacy: any = await import('../../src/modules/privacy/index.js');
const skills: any = await import('../../src/modules/skills/catalog.js');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cases = [
  { name: 'translation', query: 'แปลเป็นอังกฤษ: วันนี้อากาศดี', baseline: 14529 },
  { name: 'proofreading', query: 'ตรวจคำผิด: วันนี้ฉันไปทำงาน', baseline: 12228 },
  { name: 'summary', query: 'Summarize this text: The project is complete.', baseline: undefined },
  { name: 'organization', query: 'ติดต่อฝ่ายบุคคลช่องทางไหน', baseline: 16568 },
];
const results = [];
for (const example of cases) {
  const store = new Store(':memory:');
  try {
    store.put('settings', 'main', { workspace: tmpdir(), team: 'cc' });
    store.put('connection', 'fixture', { id: 'fixture', provider: 'openai', model: '', ready: true } as Connection);
    const session = store.create('fixture', 'cc');
    const harness: Harness = {
      root,
      route: (query, options) => routing.queryStepRouter(query, { autoRoute: true, authorityChecks: true, ...options }),
      contextPolicy: boundary.classifyContextPolicy,
      privacy: privacy.evaluatePrivacyGate,
      skillMetadata: async id => {
        const meta = await routing.loadSkillContextMetadata(id);
        return { ...meta, mandatoryReferences: await routing.loadDocumentContextMetadata(meta.mandatory) };
      },
      catalog: skills.createSkillCatalog(root),
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
    let inputEstimate = 0,
      systemTokens = 0,
      promptTokens = 0;
    const work = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: tmpdir(), env: {} },
        adapter: {
          run: async (prompt, _c, context) => {
            systemTokens = tokens(context.system || '');
            promptTokens = tokens(prompt);
            inputEstimate = tokens((context.system || '') + prompt);
            return 'Mock answer';
          },
        },
      }),
      () => {},
    );
    await work.run(session.id, example.query, '', true, undefined, 'chat');
    const done = store.session(session.id),
      step = done.runs?.at(-1)?.steps[0];
    const reductionPercent = example.baseline ? Math.round((1 - inputEstimate / example.baseline) * 1000) / 10 : undefined;
    results.push({
      name: example.name,
      route: done.runs?.at(-1)?.mode,
      status: done.status,
      scope: step?.contextScope,
      systemTokens,
      promptTokens,
      inputEstimate,
      baseline: example.baseline,
      reductionPercent,
      components: step?.providerCalls?.[0].components,
    });
    if (done.status !== 'review' || (['translation', 'proofreading'].includes(example.name) && (reductionPercent ?? 0) <= 60))
      process.exitCode = 1;
  } finally {
    store.close();
  }
}
console.log(
  JSON.stringify(
    {
      method: 'script-aware-estimate-v2',
      providerCalls: 0,
      baselineCommit: '45e7c13',
      measures: 'host-supplied text only; no live latency, cache hits or billed savings',
      results,
    },
    null,
    2,
  ),
);
