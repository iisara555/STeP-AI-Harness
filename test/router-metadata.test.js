import test from 'node:test';
import assert from 'node:assert/strict';
import * as ask from '../src/cli/commands/ask.js';
import * as metadata from '../src/modules/router/metadata.js';

test('ask uses and preserves the router metadata loaders exported by the module', () => {
  for (const name of [
    'loadRouterIndex',
    'loadTeamsDictionary',
    'loadSkillContextMetadata',
    'loadDocumentContextMetadata',
  ]) {
    assert.strictEqual(ask[name], metadata[name], `${name} must be re-exported, not duplicated`);
  }
});
