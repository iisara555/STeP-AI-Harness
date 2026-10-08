import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Store } from '../electron/store';
import { WorkService, type Harness } from '../electron/service';
import {
  INTERACTION_STYLES,
  LANGUAGE_STYLES,
  interactionStyleId,
  languageStyleId,
  speakingStyleRules,
  type SpeakingStyle,
} from '../src/speaking-styles';
import type { Connection } from '../src/types';
const privacy: any = await import('../../src/modules/privacy/index.js');

const doc = async (name: string) =>
  readFile(new URL(`../../docs/speaking-styles/${name}.md`, import.meta.url), 'utf8').then(text => text.replace(/\r\n/g, '\n'));
const front = (text: string, key: string) => text.match(new RegExp(`^${key}: "?([^"\\n]*)"?$`, 'm'))?.[1];

test('each speaking style matches its source document: metadata and the System Prompt Fragment', async () => {
  const styles: [string, SpeakingStyle][] = [
    ['witty', INTERACTION_STYLES.witty],
    ['ob-oon', INTERACTION_STYLES['ob-oon']],
    ['northern-thai', LANGUAGE_STYLES['northern-thai']],
  ];
  for (const [file, style] of styles) {
    const text = await doc(file);
    assert.equal(front(text, 'id'), style.id, file);
    assert.equal(front(text, 'display_name'), style.displayName, file);
    assert.equal(front(text, 'version'), style.version, file);
    assert.equal(Number(front(text, 'default_intensity')), style.defaultIntensity, file);
    assert.equal(front(text, 'impersonation'), 'false', file);
    const fragment = text.match(/## System Prompt Fragment\s+```text\n([\s\S]*?)\n```/)?.[1];
    assert.equal(style.fragment, fragment, `${file}: copy the document's System Prompt Fragment`);
  }
});

test('interaction styles guide natural prose without printing their internal stage names', () => {
  for (const style of Object.values(INTERACTION_STYLES)) {
    assert.match(style.fragment, /internal reasoning aid/);
    assert.match(style.fragment, /Do not print.*stage names/);
    assert.match(style.fragment, /Do not add.*greeting/);
  }
});

test('Standard adds nothing; a style adds its fragment below the wording-only rule; dialect stacks on any style', () => {
  assert.deepEqual(speakingStyleRules({}), [], 'existing users keep today’s prompt');
  assert.deepEqual(speakingStyleRules({ interactionStyle: 'standard', languageStyle: 'standard' }), []);
  assert.deepEqual(speakingStyleRules({ interactionStyle: 'persona-x', languageStyle: '<b>' }), [], 'unknown values are Standard');

  const witty = speakingStyleRules({ interactionStyle: 'witty' });
  assert.equal(witty.length, 2);
  assert.match(witty[0], /wording only/);
  assert.match(witty[0], /ranks below every rule above/);
  assert.equal(witty[1], INTERACTION_STYLES.witty.fragment);

  const stacked = speakingStyleRules({ interactionStyle: 'ob-oon', languageStyle: 'northern-thai' });
  assert.deepEqual(stacked.slice(1), [INTERACTION_STYLES['ob-oon'].fragment, LANGUAGE_STYLES['northern-thai'].fragment]);
  assert.deepEqual(speakingStyleRules({ languageStyle: 'northern-thai' }).slice(1), [LANGUAGE_STYLES['northern-thai'].fragment]);

  for (const fragment of [...Object.values(INTERACTION_STYLES), ...Object.values(LANGUAGE_STYLES)].map(s => s.fragment))
    assert.match(fragment, /never (override|change) facts/);
  assert.match(LANGUAGE_STYLES['northern-thai'].fragment, /formal artifacts[\s\S]*Standard Thai/);

  assert.equal(interactionStyleId('witty'), 'witty');
  assert.equal(interactionStyleId(undefined), 'standard');
  assert.equal(languageStyleId('northern-thai'), 'northern-thai');
  assert.equal(languageStyleId('witty'), 'standard', 'an interaction style is not a language style');
});

test('the chosen styles reach the model after the governance rules and personal preferences', async () => {
  const systems: string[] = [];
  for (const styles of [{}, { interactionStyle: 'witty', languageStyle: 'northern-thai' }]) {
    const store = new Store(':memory:');
    store.put('connection', 'c', { id: 'c', provider: 'openai', model: 'test', ready: true } as Connection);
    const session = store.create('c', 'cc');
    store.put('settings', 'main', { workspace: tmpdir(), team: 'cc', assistant: 'test', personality: 'professional', ...styles });
    const harness: Harness = {
      root: tmpdir(),
      route: async () => ({ routingContract: { mode: 'GENERAL', authority: { status: 'ALLOW' }, mandatoryReferences: [] } }),
      contextPolicy: () => ({ history: 'ignore', carryover: false }),
      privacy: privacy.evaluatePrivacyGate,
      skillMetadata: async () => null,
      documentPrivacy: async () => null,
      nextOutput: async () => null,
    };
    const service = new WorkService(
      store,
      harness,
      async () => ({
        context: { cwd: tmpdir(), env: {} },
        adapter: {
          run: async (_prompt, _c, context) => {
            systems.push(context.system || '');
            return 'คำตอบ';
          },
        },
      }),
      () => {},
    );
    await service.run(session.id, 'สรุปแผนงานสั้น ๆ', '', false, undefined, 'chat');
    store.close();
  }
  const [standard, styled] = systems;
  assert.ok(standard && styled);
  assert.doesNotMatch(standard, /Speaking style/);
  assert.doesNotMatch(standard, /Witty|Northern Thai/);
  const at = (text: string) => styled.indexOf(text);
  assert.ok(at('You are the STeP assistant') >= 0);
  assert.ok(at('Personal preferences') > at('You are the STeP assistant'));
  assert.ok(at('Speaking style (user-selected') > at('Personal preferences'));
  assert.ok(at(INTERACTION_STYLES.witty.fragment) > at('Speaking style (user-selected'));
  assert.ok(at(LANGUAGE_STYLES['northern-thai'].fragment) > at(INTERACTION_STYLES.witty.fragment));
});
