import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PACKAGE_ROOT } from '../role-resolver.js';
import { loadRouterIndex } from '../router/service.js';
import { stripYamlScalar } from '../../utils/simple-yaml.js';

/**
 * One view of every Skill the workspace knows about, from three sources that can drift apart:
 * SKILL.md files on disk, the governance registry (manifest/skills.yaml) and the router index
 * (manifest/router-index.yaml).
 *
 * status:
 *   routed        registered and reachable through the router
 *   registered    in the registry but not routed; it can only be invoked by name once routed
 *   unregistered  a SKILL.md with no registry entry; not governed or routed yet
 *   missing-file  registry or router names a Skill whose file is absent
 */
export async function loadSkillCatalog(root = PACKAGE_ROOT) {
  const files = await skillFiles(root);
  const registry = await loadRegistry(root);
  const routed = new Map((await loadRouterIndex()).map((skill) => [skill.name, skill]));

  const names = new Set([...files.keys(), ...registry.keys(), ...routed.keys()]);
  const catalog = [];
  for (const name of names) {
    const file = files.get(name), entry = registry.get(name), route = routed.get(name);
    const path = entry?.path || file?.path || '';
    const onDisk = Boolean(path) && existsSync(join(root, path));
    const status = !onDisk ? 'missing-file' : entry && route ? 'routed' : entry ? 'registered' : route ? 'routed' : 'unregistered';
    catalog.push({
      name,
      title: file?.title || name,
      description: route?.description || entry?.description || file?.description || '',
      category: path.split('/')[1] || '',
      path,
      status,
      inRegistry: Boolean(entry),
      inRouter: Boolean(route),
      owner: entry?.owner || route?.teams?.primary?.[0] || '',
      version: entry?.version || '',
      stage: entry?.stage || '',
      cluster: route?.cluster || '',
      teams: route?.teams?.primary || [],
      triggers: (route?.triggers || []).slice(0, 8),
    });
  }
  const order = { routed: 0, registered: 1, unregistered: 2, 'missing-file': 3 };
  return catalog.sort((a, b) => order[a.status] - order[b.status] || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Per-harness metadata cache. File/registry additions, removal and edits invalidate it without rereading every body. */
export function createSkillCatalog(root = PACKAGE_ROOT) {
  let revision = '', pending;
  return async () => {
    const names = (await readdir(join(root, 'skills'), { recursive: true }))
      .filter(name => /(?:^|[\\/])SKILL\.md$/.test(name)).sort();
    const paths = [...names.map(name => join('skills', name)), 'package.json', 'manifest/skills.yaml', 'manifest/router-index.yaml'];
    const versions = await Promise.all(paths.map(async path => {
      const info = await stat(join(root, path), { bigint: true }).catch(() => undefined);
      return [path, info ? `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}` : 'missing'];
    }));
    const next = JSON.stringify(versions);
    if (!pending || next !== revision) {
      revision = next;
      const load = loadSkillCatalog(root);
      pending = load;
      void load.catch(() => { if (pending === load) pending = undefined; });
    }
    // Consumers must never mutate the catalog cached for another task.
    return structuredClone(await pending);
  };
}

async function skillFiles(root) {
  const found = new Map();
  const entries = await readdir(join(root, 'skills'), { recursive: true });
  for (const entry of entries) {
    if (!entry.endsWith(`${sep}SKILL.md`) && !entry.endsWith('/SKILL.md')) continue;
    const path = relative(root, join(root, 'skills', entry)).split(sep).join('/');
    const text = await readFile(join(root, path), 'utf-8');
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] || '';
    const name = stripYamlScalar(/^name:\s*(.+)$/m.exec(front)?.[1] || '') || path.split('/').at(-2);
    const description = stripYamlScalar(/^description:\s*(.+)$/m.exec(front)?.[1] || '');
    const title = /^#\s+(.+)$/m.exec(text.slice(front.length))?.[1]?.trim() || name;
    found.set(name, { path, description, title });
  }
  return found;
}

async function loadRegistry(root) {
  const registry = new Map();
  const text = await readFile(join(root, 'manifest', 'skills.yaml'), 'utf-8');
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const key = /^ {2}([a-z0-9_-]+):\s*$/.exec(line);
    if (key) { current = { name: key[1] }; registry.set(key[1], current); continue; }
    if (!current) continue;
    const field = /^ {4}(owner|version|path|description):\s*(.+)$/.exec(line);
    if (field) current[field[1]] = stripYamlScalar(field[2]);
    const stage = /^ {8}stage:\s*(.+)$/.exec(line);
    if (stage) current.stage = stripYamlScalar(stage[1]);
  }
  return registry;
}
