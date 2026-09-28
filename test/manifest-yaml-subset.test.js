import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_ROOT, getAvailableRoles, getAvailableTeams, parseSkillRegistryPaths } from '../src/modules/role-resolver.js';
import { loadRouterIndex } from '../src/modules/router/metadata.js';
import { loadAuthorityRegistry, parseAuthorityRegistry, evaluateAuthorityPreflight } from '../src/modules/router/authority-preflight.js';
import { loadActionRegistry } from '../src/modules/actions/index.js';
import { loadPlaybooks } from '../src/modules/playbooks/index.js';
import { parseProvenanceYaml } from '../src/modules/provenance/index.js';

// H5 from the 2026-09-27 harness audit: the manifests are read by line-based
// parsers, not a YAML library. Valid YAML they do not understand was dropped
// without an error. Changing `consumers: ["*"]` to a block list, for example,
// removed a Skill from every team's workspace while validate and tests passed.
// The validator must refuse every shape the parsers cannot read.
const PYTHON = process.platform === 'win32'
  ? { command: 'py', prefixArgs: ['-3'] }
  : { command: 'python3', prefixArgs: [] };

function lint(name, text) {
  const script = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(join(PACKAGE_ROOT, 'scripts'))})`,
    'import validate_repo',
    'data = json.load(sys.stdin)',
    "print(json.dumps(validate_repo.lint_manifest_text(data['name'], data['text'])))",
  ].join('\n');
  const result = spawnSync(PYTHON.command, [...PYTHON.prefixArgs, '-c', script], {
    input: JSON.stringify({ name, text }), encoding: 'utf-8', env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const ENTRY = (teams) => [
  'skills:',
  '  - name: hr-policy-lookup',
  '    cluster: support',
  '    teams:',
  ...teams,
  '    triggers: [ลา, สวัสดิการ]',
  '',
].join('\n');

test('the manifests in the repo are all in the supported subset', () => {
  const result = spawnSync(PYTHON.command, [...PYTHON.prefixArgs, join(PACKAGE_ROOT, 'scripts', 'validate_repo.py')], {
    encoding: 'utf-8', env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('inline lists pass', () => {
  assert.deepEqual(lint('router-index.yaml', ENTRY(['      primary: [hd]', '      consumers: ["*"]'])), []);
});

test('a block list where the parsers expect an inline list is rejected', () => {
  const errors = lint('router-index.yaml', ENTRY(['      primary: [hd]', '      consumers:', '        - "*"']));
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0], /router-index\.yaml:6: 'consumers'.*\[a, b\]/);
});

test('an inline list split over two lines is rejected', () => {
  const errors = lint('router-index.yaml', ENTRY(['      primary: [hd,', '        ga]', '      consumers: []']));
  assert.ok(errors.some((error) => /:5: 'primary'/.test(error)), JSON.stringify(errors));
});

test('a trailing comment on a value is rejected, a # inside quotes is not', () => {
  const errors = lint('router-index.yaml', ENTRY(['      primary: [hd] # owner', '      consumers: []']));
  assert.ok(errors.some((error) => /:5: .*comment/.test(error)), JSON.stringify(errors));
  assert.deepEqual(lint('documents.yaml', 'documents:\n  x:\n    note: "Yellow #FFC709"\n'), []);
});

test('odd indentation and tabs are rejected', () => {
  assert.ok(lint('router-index.yaml', ENTRY(['     primary: [hd]', '      consumers: []'])).some((e) => /:5: .*indent/.test(e)));
  assert.ok(lint('router-index.yaml', ENTRY(['\tprimary: [hd]', '      consumers: []'])).some((e) => /:5: .*tab/i.test(e)));
});

test('a quoted Skill path is rejected', () => {
  const errors = lint('skills.yaml', 'skills:\n  hr-policy-lookup:\n    path: "skills/common/hr-policy-lookup/SKILL.md"\n');
  assert.ok(errors.some((error) => /:3: 'path'.*unquoted/.test(error)), JSON.stringify(errors));
});

test('folded block scalars stay allowed', () => {
  assert.deepEqual(lint('documents.yaml', 'documents:\n  x:\n    summary: >-\n      line one\n      line two\n    owner: afp\n'), []);
});

// --- Independent review of the first lint (blacklist) -----------------------
// Every case below is valid YAML that the line parsers drop or mis-read, and
// every one passed the first version of the lint. They are applied to the real
// manifests so the surrounding text is exactly what ships.
function manifest(name) {
  return readFileSync(join(PACKAGE_ROOT, 'manifest', name), 'utf-8');
}

function mutate(name, from, to) {
  const text = manifest(name);
  assert.equal(text.split(from).length - 1, 1, `${name}: mutation anchor must occur once: ${JSON.stringify(from)}`);
  return text.replace(from, to);
}

async function loadMutatedRouter(text) {
  // Load the real parser against a real manifest without editing the checkout.
  const dir = mkdtempSync(join(tmpdir(), 'h5-router-'));
  try {
    for (const rel of ['src/modules/router/metadata.js', 'src/modules/role-resolver.js',
      'src/utils/simple-yaml.js', 'src/utils/file-ops.js']) {
      const target = join(dir, rel);
      mkdirSync(join(target, '..'), { recursive: true });
      copyFileSync(join(PACKAGE_ROOT, rel), target);
    }
    mkdirSync(join(dir, 'manifest'));
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
    writeFileSync(join(dir, 'manifest', 'router-index.yaml'), text);
    const { loadRouterIndex: readRouter } = await import(pathToFileURL(join(dir, 'src/modules/router/metadata.js')).href);
    return await readRouter();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HR_TEAMS = '    teams:\n      primary: [hd]\n      consumers: ["*"]\n';
const HR_ENTRY = '  - name: hr-policy-lookup\n    cluster: governance-operations\n';

function assertRejected(name, text, pattern = /./) {
  const errors = lint(name, text);
  assert.ok(errors.length > 0, `expected ${name} to be rejected`);
  assert.ok(errors.some((error) => pattern.test(error)), JSON.stringify(errors));
}

const REVIEW_CASES = [
  ['consumers: then the inline list on the next line', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers:\n        ["*"]\n'],
  ['consumers:, a bare dash, and the item on a third line', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers:\n        -\n          "*"\n'],
  ['a tab after the dash of a block item', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers:\n        -\t"*"\n'],
  ['a quoted key', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      "consumers": ["*"]\n'],
  ['a !!seq tag on the value', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers: !!seq ["*"]\n'],
  ['an alias as the value', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers: *everyone\n'],
  ['an anchor on the value', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers: &everyone ["*"]\n'],
  ['teams written as a flow map', 'router-index.yaml', HR_TEAMS,
    '    teams: {primary: [hd], consumers: ["*"]}\n'],
  ['children indented by 4 instead of 2', 'router-index.yaml', HR_TEAMS,
    '    teams:\n        primary: [hd]\n        consumers: ["*"]\n'],
  ['consumers:<TAB># note, then a block list', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers:\t# note\n        - "*"\n'],
  ['a router entry whose first key is not name', 'router-index.yaml', HR_ENTRY,
    '  - cluster: governance-operations\n    name: hr-policy-lookup\n'],
  ['authority actions as a block list', 'authority.yaml',
    '    actions: ["เลือก", "ตัดสิน", "ชี้ขาด", "เห็นชอบ", "ได้งาน", "pick", "choose", "select", "award", "decide"]\n',
    '    actions:\n      - "เลือก"\n      - "pick"\n'],
  ['action preferredTools as a block list', 'actions.yaml',
    '    preferredTools: [google-sheets, xlsx]\n    outputReferenceRequired: true\n    specPath: docs/spreadsheet-project-plan.md\n',
    '    preferredTools:\n      - google-sheets\n      - xlsx\n    outputReferenceRequired: true\n    specPath: docs/spreadsheet-project-plan.md\n'],
  ['a playbook signal as a block list', 'playbooks.yaml',
    '      source: [tor, terms of reference, ขอบเขตของงาน]\n',
    '      source:\n        - tor\n        - terms of reference\n'],
  ['a playbook step consumes as a block list', 'playbooks.yaml',
    '        consumes: [source-facts, planning-assumptions, requirements, deliverables, constraints, project-parameters, missing-information]\n        produces: [wbs,',
    '        consumes:\n          - source-facts\n        produces: [wbs,'],
  ['a block scalar whose body looks like a key (widens access)', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers: []\n      wildcardReason: >-\n        consumers: ["*"]\n'],
  ['a folded router description', 'router-index.yaml',
    '    description: ตอบสิทธิและเงื่อนไขตามประกาศงานบุคคล',
    '    description: >-\n      ตอบสิทธิและเงื่อนไขตามประกาศงานบุคคล'],
  ['a Skill path continued on the next line', 'skills.yaml',
    '    path: skills/common/hr-policy-lookup/SKILL.md\n',
    '    path: skills/common/hr-policy-lookup/\n      SKILL.md\n'],
  ['a comma inside a quoted inline-list item', 'router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: [hd]\n      consumers: ["hd, ga"]\n'],
];

for (const [label, name, from, to] of REVIEW_CASES) {
  test(`review: ${label} is rejected (${name})`, () => {
    assertRejected(name, mutate(name, from, to));
  });
}

test('a lone CR inside a YAML comment cannot hide authority triggers from the JS loader', () => {
  const text = mutate('authority.yaml',
    '    name: "การอนุมัติผ่อนผันระเบียบหรืออนุมัติกรณีพิเศษ"\n',
    '    name: "การอนุมัติผ่อนผันระเบียบหรืออนุมัติกรณีพิเศษ"\n    # reviewed\r');
  assertRejected('authority.yaml', text, /:80: .*carriage return/i);
});

test('a lone CR at EOF is not silently accepted as CRLF', () => {
  assertRejected('authority.yaml', 'authorities:\n  example:\n    triggers: [sign]\r', /carriage return/i);
});

test('CRLF manifests remain supported', () => {
  assert.deepEqual(lint('authority.yaml', 'authorities:\r\n  example:\r\n    triggers: [sign]\r\n'), []);
});

test('disk validation preserves a lone CR rather than normalizing it into a separate YAML line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'h5-manifest-cr-'));
  try {
    mkdirSync(join(dir, 'manifest'));
    writeFileSync(join(dir, 'manifest', 'authority.yaml'),
      'authorities:\n  example:\n    # reviewed\r    triggers: [sign]\n');
    const script = [
      'import json, sys',
      `sys.path.insert(0, ${JSON.stringify(join(PACKAGE_ROOT, 'scripts'))})`,
      'import validate_repo',
      'from pathlib import Path',
      'validate_repo.ROOT = Path(sys.argv[1])',
      'errors = []',
      'validate_repo.validate_manifest_subset(errors)',
      'print(json.dumps(errors))',
    ].join('\n');
    const result = spawnSync(PYTHON.command, [...PYTHON.prefixArgs, '-c', script, dir], {
      encoding: 'utf-8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /carriage return/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an authority identifier unsupported by the JS loader cannot overwrite a previous authority', () => {
  const text = mutate('authority.yaml', '  qms-conformity-decision:\n',
    '  policy_waiver_request:\n    name: "ร่างคำขอผ่อนผัน"\n    triggers: ["อนุมัติผ่อนผัน"]\n    humanInTheLoop: confirmation\n\n  qms-conformity-decision:\n');
  assertRejected('authority.yaml', text, /policy_waiver_request.*(?:identifier|key|parser)/i);
});

test('doubled apostrophes in single-quoted authority triggers decode before matching', () => {
  const text = mutate('authority.yaml',
    '    triggers: ["อนุมัติผ่อนผัน", "ขอยกเว้นระเบียบ", "อนุมัติกรณีพิเศษ"]\n',
    '    triggers: ["อนุมัติผ่อนผัน", "ขอยกเว้นระเบียบ", "อนุมัติกรณีพิเศษ", \'director\'\'s waiver\']\n');
  assert.deepEqual(lint('authority.yaml', text), []);
  const authority = parseAuthorityRegistry(text).find((item) => item.id === 'policy-waiver');
  assert.ok(authority.triggers.includes("director's waiver"));
  const decision = evaluateAuthorityPreflight("director's waiver", [authority]);
  assert.equal(decision.status, 'BLOCK');
  assert.equal(decision.authority, 'policy-waiver');
});

test('doubled apostrophes in a single-quoted authority description decode as YAML does', () => {
  const text = mutate('authority.yaml',
    '    description: "การอนุมัติผ่อนผันระเบียบการเบิกจ่ายหรือจัดซื้อจัดจ้างกรณีจำเป็น ต้องได้รับความเห็นชอบจากผู้อำนวยการ"\n',
    "    description: 'ผอ.''s approval: ต้องได้รับความเห็นชอบ'\n");
  assert.deepEqual(lint('authority.yaml', text), []);
  const authority = parseAuthorityRegistry(text).find((item) => item.id === 'policy-waiver');
  assert.equal(authority.description, "ผอ.'s approval: ต้องได้รับความเห็นชอบ");
});

test('router triggers decode YAML doubled apostrophes instead of losing the match', async () => {
  const text = mutate('router-index.yaml',
    '    intent: [hr-entitlement]\n    triggers: [',
    "    intent: [hr-entitlement]\n    triggers: ['director''s waiver', ");
  assert.deepEqual(lint('router-index.yaml', text), []);
  const router = await loadMutatedRouter(text);
  const skill = router.find((item) => item.name === 'hr-policy-lookup');
  assert.ok(skill.triggers.includes("director's waiver"));
});

test('router fileTypes interpret quoted YAML list items as types, not quote-bearing literals', async () => {
  const text = mutate('router-index.yaml',
    '    fileTypes: [md, pdf, docx]\n    requires: []\n    scope:\n      allow:\n        - อ้างอัตรา',
    '    fileTypes: ["md", "pdf", "docx"]\n    requires: []\n    scope:\n      allow:\n        - อ้างอัตรา');
  assert.deepEqual(lint('router-index.yaml', text), []);
  const skill = (await loadMutatedRouter(text)).find((item) => item.name === 'hr-policy-lookup');
  assert.deepEqual(skill.fileTypes, ['md', 'pdf', 'docx']);
});

test('router intent interprets quoted YAML list items as intent IDs', async () => {
  const text = mutate('router-index.yaml',
    '    intent: [hr-entitlement]\n', '    intent: ["hr-entitlement"]\n');
  assert.deepEqual(lint('router-index.yaml', text), []);
  const skill = (await loadMutatedRouter(text)).find((item) => item.name === 'hr-policy-lookup');
  assert.deepEqual(skill.intent, ['hr-entitlement']);
});

test('router primary team interprets quoted YAML team IDs', async () => {
  const text = mutate('router-index.yaml', HR_TEAMS,
    '    teams:\n      primary: ["hd"]\n      consumers: ["*"]\n');
  assert.deepEqual(lint('router-index.yaml', text), []);
  const skill = (await loadMutatedRouter(text)).find((item) => item.name === 'hr-policy-lookup');
  assert.deepEqual(skill.teams.primary, ['hd']);
});

test('router paths decode doubled apostrophes in quoted YAML items', async () => {
  const text = mutate('router-index.yaml',
    '    paths: ["**/HD/**",',
    "    paths: ['**/Director''s Office/**', \"**/HD/**\",");
  assert.deepEqual(lint('router-index.yaml', text), []);
  const skill = (await loadMutatedRouter(text)).find((item) => item.name === 'hr-policy-lookup');
  assert.ok(skill.paths.includes("**/Director's Office/**"));
});

test('review: the reviewed manifests themselves lint clean', () => {
  for (const name of readdirSync(join(PACKAGE_ROOT, 'manifest')).filter((file) => file.endsWith('.yaml'))) {
    assert.deepEqual(lint(name, manifest(name)), [], name);
  }
});

test('an apostrophe inside an unquoted inline-list item is not a quote', () => {
  assert.deepEqual(lint('router-index.yaml', mutate('router-index.yaml', '    intent: [hr-entitlement]\n',
    "    intent: [hr-entitlement, don't sign, it's fine]\n")), []);
});

test('a comma inside a quoted block-list item is fine: block items are not split', () => {
  assert.deepEqual(lint('organization.yaml', manifest('organization.yaml')), []);
  assert.deepEqual(lint('services.yaml', 'services:\n  x:\n    rules:\n      - "a, b and c"\n'), []);
});

test('any child of signals: must be an inline list', () => {
  assertRejected('playbooks.yaml', mutate('playbooks.yaml', '      source: [tor, terms of reference, ขอบเขตของงาน]\n',
    '      source: tor\n'), /inline list/);
});

test('an inline-list key with an empty value and no children is rejected', () => {
  assertRejected('router-index.yaml', mutate('router-index.yaml', HR_TEAMS, '    teams:\n      primary: [hd]\n      consumers:\n'));
});

test('a block scalar outside the allowlist is rejected, documents summary stays allowed', () => {
  assertRejected('router-index.yaml', mutate('router-index.yaml', HR_TEAMS,
    `${HR_TEAMS}    wildcardReason: >-\n      every employee\n`), /block scalar/);
  assert.deepEqual(lint('documents.yaml', manifest('documents.yaml')), []);
});

// Cross-check on the JS side: what the line parsers load must match the raw
// entries in the text. Any shape the lint misses and the parsers drop shows
// up here as a count mismatch.
function rawCount(text, re) {
  return text.split(/\r?\n/).filter((line) => re.test(line)).length;
}

function rawInlineCount(line) {
  const inner = line.match(/\[(.*)\]\s*$/)?.[1] ?? '';
  return inner.split(',').map((item) => item.trim()).filter(Boolean).length;
}

test('the JS loaders read every entry that is in the manifest text', async () => {
  const router = await loadRouterIndex();
  assert.equal(router.length, rawCount(manifest('router-index.yaml'), /^ {2}- name:/));
  assert.equal(parseSkillRegistryPaths(manifest('skills.yaml')).size, rawCount(manifest('skills.yaml'), /^ {2}[a-z0-9-]+:\s*$/));
  assert.equal((await getAvailableTeams()).length, rawCount(manifest('teams.yaml'), /^ {6}- id:/));
  assert.equal((await getAvailableRoles()).length, rawCount(manifest('roles.yaml'), /^ {2}- id:/));
  const playbooks = await loadPlaybooks(PACKAGE_ROOT);
  assert.equal(playbooks.length, rawCount(manifest('playbooks.yaml'), /^ {2}- id:/));
  assert.equal(playbooks.reduce((sum, playbook) => sum + playbook.steps.length, 0), rawCount(manifest('playbooks.yaml'), /^ {6}- id:/));
  assert.equal(Object.keys(await loadActionRegistry(PACKAGE_ROOT)).length, rawCount(manifest('actions.yaml'), /^ {2}[a-z0-9_-]+:\s*$/));
  assert.equal((await loadAuthorityRegistry(PACKAGE_ROOT)).length, rawCount(manifest('authority.yaml'), /^ {2}[a-z0-9-]+:\s*$/));
  assert.equal(parseProvenanceYaml(manifest('provenance.yaml')).length, rawCount(manifest('provenance.yaml'), /^ {2}- id:/));
});

test('every router entry has a primary team and loads the consumers written in the text', async () => {
  const router = new Map((await loadRouterIndex()).map((skill) => [skill.name, skill]));
  const blocks = manifest('router-index.yaml').split(/^(?= {2}- name:)/m).slice(1);
  assert.equal(blocks.length, router.size);
  for (const block of blocks) {
    const name = block.match(/^ {2}- name:\s*([a-z0-9_-]+)/)[1];
    const lines = block.split(/\r?\n/);
    const primary = lines.filter((line) => /^\s*primary:/.test(line));
    const consumers = lines.filter((line) => /^\s*consumers:/.test(line));
    assert.equal(primary.length, 1, `${name}: one primary line`);
    assert.equal(consumers.length, 1, `${name}: one consumers line`);
    const skill = router.get(name);
    assert.ok(skill.teams.primary.length > 0, `${name}: primary is empty`);
    assert.equal(skill.teams.primary.length, rawInlineCount(primary[0]), `${name}: primary`);
    assert.equal(skill.teams.consumers.length, rawInlineCount(consumers[0]), `${name}: consumers`);
  }
});
