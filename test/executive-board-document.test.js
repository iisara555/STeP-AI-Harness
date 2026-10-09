import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadDocumentCatalog } from '../src/modules/router/service.js';

// docs/knowledge/step-executive-board.md is what the assistant reads; manifest/organization.yaml is the maintained source.
test('the executive board document matches executiveOversight in organization.yaml and is readable by the assistant', async () => {
  // Windows checkouts may use CRLF.
  const org = (await readFile('manifest/organization.yaml', 'utf8')).replace(/\r\n/g, '\n');
  const section = org.slice(org.indexOf('executiveOversight:'), org.indexOf('internalSystems:'));
  const executives = [...section.matchAll(/- name: "([^"]+)"\n\s+position: "([^"]+)"\n\s+teams: \[([^\]]*)\]/g)].map(
    ([, name, position, teams]) => ({ name, position, teams: teams.split(',').map((t) => t.trim()).filter(Boolean) }),
  );
  assert.ok(executives.length >= 10);
  const doc = (await readFile('docs/knowledge/step-executive-board.md', 'utf8')).replace(/\r\n/g, '\n');
  const lastChecked = /lastChecked: "([^"]+)"/.exec(section)[1];
  assert.ok(doc.includes(`**ตรวจล่าสุด:** ${lastChecked}`), 'the document states the same check date');
  const byTeam = doc.slice(doc.indexOf('## ทีมไหนอยู่ภายใต้การกำกับของใคร')).split('\n').filter((line) => line.startsWith('| '));
  const director = executives.find((e) => e.position === 'ผู้อำนวยการ');
  assert.ok(doc.includes(`คนปัจจุบันคือ **${director.name}**`));
  for (const { name, position, teams } of executives) {
    if (position === 'ผู้อำนวยการ') continue;
    const row = doc.split('\n').find((line) => line.startsWith(`| ${name} |`));
    assert.ok(row, `${name} is listed`);
    for (const team of teams) assert.ok(row.includes(`(${team.toUpperCase()})`), `${name} oversees ${team}`);
    // The team table names the same person and position for each team.
    for (const team of teams) {
      const teamRow = byTeam.find((line) => line.includes(`(${team.toUpperCase()}) |`));
      assert.ok(teamRow?.includes(`${name} (${position})`), `${team} row names ${name}`);
    }
  }
  // Nobody in the document who is not in the maintained list.
  const listed = [...doc.matchAll(/^\| ((?:รศ|ผศ|อาจารย์|นาย|นาง|คุณ)[^|]+?) \|/gm)].map((m) => m[1]);
  for (const name of listed) assert.ok(executives.some((e) => e.name === name), `${name} is in organization.yaml`);

  const entry = (await loadDocumentCatalog()).find((d) => d.id === 'step-executive-board');
  assert.equal(entry?.path, 'docs/knowledge/step-executive-board.md');
});
