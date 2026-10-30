import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../electron/store';
import { ArtifactStore } from '../electron/artifacts';

test('ArtifactStore creates, versions, and lists interactive live artifacts', () => {
  const store = new Store(':memory:');
  const artifacts = new ArtifactStore(store);

  // 1. Save new markdown artifact
  const art1 = artifacts.save(
    'session-1',
    'project-roadmap',
    'แผนงานโครงการและการแบ่งรอบ',
    'markdown',
    '# Roadmap\n- Phase 1: Core\n- Phase 2: Polish',
  );

  assert.equal(art1.id, 'project-roadmap');
  assert.equal(art1.sessionId, 'session-1');
  assert.equal(art1.version, 1);
  assert.equal(art1.kind, 'markdown');
  assert.equal(art1.uri, 'sidecar://artifact/project-roadmap');

  // 2. Read back
  const read1 = artifacts.get('session-1', 'project-roadmap');
  assert.equal(read1?.title, 'แผนงานโครงการและการแบ่งรอบ');
  assert.equal(read1?.version, 1);

  // 3. Update artifact -> increments version
  const art1v2 = artifacts.save(
    'session-1',
    'project-roadmap',
    'แผนงานโครงการ (ฉบับปรับปรุง)',
    'markdown',
    '# Roadmap\n- Phase 1: Core\n- Phase 2: Polish\n- Phase 3: Rollout',
  );
  assert.equal(art1v2.version, 2);
  assert.equal(art1v2.title, 'แผนงานโครงการ (ฉบับปรับปรุง)');

  // 4. Save a mermaid diagram artifact
  const art2 = artifacts.save(
    'session-1',
    'architecture-diagram',
    'โครงสร้างสถาปัตยกรรมระบบ',
    'mermaid',
    'graph TD\nA[Client] --> B[Host]',
  );
  assert.equal(art2.kind, 'mermaid');

  // 5. List artifacts in session
  const list = artifacts.list('session-1');
  assert.equal(list.length, 2);
  assert.ok(list.some(a => a.id === 'project-roadmap'));
  assert.ok(list.some(a => a.id === 'architecture-diagram'));

  // 6. Delete
  const deleted = artifacts.delete('session-1', 'architecture-diagram');
  assert.equal(deleted, true);
  assert.equal(artifacts.get('session-1', 'architecture-diagram'), undefined);
  assert.equal(artifacts.list('session-1').length, 1);
});

test('ArtifactStore validates identifiers and payload bounds', () => {
  const store = new Store(':memory:');
  const artifacts = new ArtifactStore(store);

  // Invalid ID characters
  assert.throws(() => artifacts.save('s1', 'bad id with spaces!', 'title', 'markdown', 'content'), /INVALID_INPUT/);

  // Unsupported kind
  assert.throws(() => artifacts.save('s1', 'id', 'title', 'invalid-kind' as any, 'content'), /INVALID_INPUT/);
});
