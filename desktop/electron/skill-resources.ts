import { constants } from 'node:fs';
import { open, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, posix, resolve, sep } from 'node:path';

export type SkillResourceKind = 'template' | 'example' | 'reference';

export type SkillResourceItem = {
  path: string;
  kind: SkillResourceKind;
  title: string;
  headings: string[];
  bytes: number;
};

export type SkillResourceCatalog = {
  skillDir: string;
  templates: SkillResourceItem[];
  examples: SkillResourceItem[];
  references: SkillResourceItem[];
  all: SkillResourceItem[];
};

const RESOURCE_DIRS: { dir: string; kind: SkillResourceKind }[] = [
  { dir: 'templates', kind: 'template' },
  { dir: 'examples', kind: 'example' },
  { dir: 'references', kind: 'reference' },
];

const MAX_RESOURCE_BYTES = 400_000;
const DEFAULT_BUNDLE_BUDGET_CHARS = 14_000;
const SINGLE_RESOURCE_MAX_CHARS = 8_000;

const cache = new Map<string, { stamp: string; catalog: SkillResourceCatalog }>();
const thaiSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : undefined;

function inside(base: string, target: string): boolean {
  const b = resolve(base);
  const t = resolve(target);
  return t === b || t.startsWith(b + sep);
}

export function tokenizeSearchText(text: string): string[] {
  const raw = String(text || '').toLowerCase();
  const tokens = new Set<string>();
  for (const part of raw.split(/[^a-z0-9\u0E00-\u0E7F]+/g)) {
    if (part.length >= 2) tokens.add(part);
  }
  if (thaiSegmenter && /[\u0E00-\u0E7F]/.test(raw)) {
    for (const seg of thaiSegmenter.segment(raw)) {
      const w = seg.segment.trim();
      if (seg.isWordLike && w.length >= 2) tokens.add(w);
    }
  }
  return [...tokens];
}

async function readSafeFile(baseReal: string, filePath: string, maxBytes = MAX_RESOURCE_BYTES): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const fileReal = await realpath(filePath);
    if (!inside(baseReal, fileReal)) return null;
    handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_RESOURCE_BYTES) return null;
    const toRead = Math.min(info.size, maxBytes);
    const buf = Buffer.alloc(toRead);
    const { bytesRead } = await handle.read(buf, 0, toRead, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function extractHeadings(preview: string, fallbackName: string): { title: string; headings: string[] } {
  const lines = preview.replace(/\r\n/g, '\n').split('\n');
  const headings: string[] = [];
  for (const line of lines) {
    const match = /^#{1,3}\s+(.+?)\s*$/.exec(line);
    if (match) {
      headings.push(match[1].replace(/`/g, '').trim());
      if (headings.length >= 6) break;
    }
  }
  const title = headings[0] || fallbackName.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim();
  return { title, headings };
}

/**
 * Discovers `templates/*.md`, `examples/*.md`, and `references/*.md` inside a Skill folder, cached by mtime.
 */
export async function discoverSkillResources(root: string, skillPath: string): Promise<SkillResourceCatalog> {
  const skillsBase = resolve(root, 'skills');
  const skillFile = resolve(root, String(skillPath || ''));
  const skillDir = dirname(skillFile);
  if (!inside(skillsBase, skillDir)) {
    return { skillDir, templates: [], examples: [], references: [], all: [] };
  }
  let baseReal: string;
  try {
    baseReal = await realpath(skillDir);
    const skillsReal = await realpath(skillsBase);
    if (!inside(skillsReal, baseReal)) return { skillDir, templates: [], examples: [], references: [], all: [] };
  } catch {
    return { skillDir, templates: [], examples: [], references: [], all: [] };
  }

  const stampParts: string[] = [];
  const entriesByKind: { kind: SkillResourceKind; dir: string; files: string[] }[] = [];
  for (const { dir, kind } of RESOURCE_DIRS) {
    const subDir = resolve(skillDir, dir);
    try {
      const subStat = await stat(subDir);
      if (!subStat.isDirectory()) continue;
      const names = (await readdir(subDir)).filter(name => /^[a-zA-Z0-9._-]+\.md$/i.test(name)).sort();
      stampParts.push(`${dir}:${subStat.mtimeMs}:${names.join(',')}`);
      entriesByKind.push({ kind, dir, files: names });
    } catch {
      // Optional resource directory not present in this Skill.
    }
  }

  const stamp = stampParts.join('|');
  const hit = cache.get(skillDir);
  if (hit && hit.stamp === stamp) return hit.catalog;

  const templates: SkillResourceItem[] = [];
  const examples: SkillResourceItem[] = [];
  const references: SkillResourceItem[] = [];

  for (const { kind, dir, files } of entriesByKind) {
    for (const file of files) {
      const full = resolve(skillDir, dir, file);
      try {
        const info = await stat(full);
        if (!info.isFile() || info.size > MAX_RESOURCE_BYTES) continue;
        const preview = await readSafeFile(baseReal, full, 2048);
        if (preview === null) continue;
        const { title, headings } = extractHeadings(preview, file);
        const item: SkillResourceItem = {
          path: posix.join(dir, file),
          kind,
          title,
          headings,
          bytes: info.size,
        };
        if (kind === 'template') templates.push(item);
        else if (kind === 'example') examples.push(item);
        else references.push(item);
      } catch {
        // Ignore unreadable resource file.
      }
    }
  }

  const catalog: SkillResourceCatalog = {
    skillDir,
    templates,
    examples,
    references,
    all: [...templates, ...examples, ...references],
  };
  cache.set(skillDir, { stamp, catalog });
  return catalog;
}

function scoreResource(item: SkillResourceItem, queryTokens: string[], rawQuery: string): number {
  if (!queryTokens.length) return 0;
  const hay = `${item.path} ${item.title} ${item.headings.join(' ')}`.toLowerCase();
  const itemTokens = new Set(tokenizeSearchText(hay));
  let score = 0;
  for (const token of queryTokens) {
    if (itemTokens.has(token)) score += 3;
    else if (token.length >= 3 && hay.includes(token)) score += 1.5;
  }
  const stem = item.path
    .replace(/^[^/]+\//, '')
    .replace(/\.md$/i, '')
    .toLowerCase();
  if (stem && rawQuery.toLowerCase().includes(stem)) score += 5;
  return score;
}

/**
 * Selects the best-matching template and example for a Skill within a bounded character budget, and builds a compact
 * `<skill_resource_manifest>` so the model knows what is already preloaded and what else it can load in one batched call.
 */
export async function selectSkillBundle(
  root: string,
  skillPath: string,
  query: string,
  options: {
    skillName?: string;
    mode?: string;
    budgetChars?: number;
    alreadyLoaded?: Iterable<string>;
  } = {},
): Promise<{
  manifestText: string;
  preloadedText: string;
  preloadedPaths: string[];
  availableResources: { templates: string[]; examples: string[]; references: string[] };
}> {
  const catalog = await discoverSkillResources(root, skillPath);
  const availableResources = {
    templates: catalog.templates.map(item => item.path),
    examples: catalog.examples.map(item => item.path),
    references: catalog.references.map(item => item.path),
  };
  if (!catalog.all.length) {
    return { manifestText: '', preloadedText: '', preloadedPaths: [], availableResources };
  }

  const loaded = new Set(options.alreadyLoaded || []);
  const budget = options.budgetChars ?? DEFAULT_BUNDLE_BUDGET_CHARS;
  const queryTokens = tokenizeSearchText(query);
  let remaining = budget;
  const preloadedPaths: string[] = [];
  const preloadedBlocks: string[] = [];

  let baseReal = '';
  try {
    baseReal = await realpath(catalog.skillDir);
  } catch {
    baseReal = '';
  }

  const pickBest = (items: SkillResourceItem[], preloadSingleByDefault: boolean): SkillResourceItem | undefined => {
    const candidates = items.filter(item => !loaded.has(item.path));
    if (!candidates.length) return undefined;
    const ranked = candidates
      .map(item => ({ item, score: scoreResource(item, queryTokens, query) }))
      .sort((a, b) => b.score - a.score || a.item.bytes - b.item.bytes);
    if (ranked[0].score > 0) return ranked[0].item;
    if (preloadSingleByDefault && candidates.length === 1) return candidates[0];
    if (options.mode === 'draft' && candidates.length > 0) return ranked[0].item;
    return undefined;
  };

  if (baseReal) {
    const chosenTemplate = pickBest(catalog.templates, true);
    if (chosenTemplate && remaining >= 1000) {
      const content = await readSafeFile(baseReal, resolve(catalog.skillDir, chosenTemplate.path));
      if (content && content.trim()) {
        const clipped = content.trim().slice(0, Math.min(SINGLE_RESOURCE_MAX_CHARS, remaining));
        preloadedPaths.push(chosenTemplate.path);
        loaded.add(chosenTemplate.path);
        preloadedBlocks.push(
          `<skill_template path="${chosenTemplate.path}" title="${chosenTemplate.title}">\n${clipped}\n</skill_template>`,
        );
        remaining -= clipped.length;
      }
    }

    const chosenExample = pickBest(catalog.examples, catalog.examples.length === 1);
    if (chosenExample && remaining >= 1200) {
      const content = await readSafeFile(baseReal, resolve(catalog.skillDir, chosenExample.path));
      if (content && content.trim()) {
        const clipped = content.trim().slice(0, Math.min(SINGLE_RESOURCE_MAX_CHARS, remaining));
        preloadedPaths.push(chosenExample.path);
        loaded.add(chosenExample.path);
        preloadedBlocks.push(`<skill_example path="${chosenExample.path}" title="${chosenExample.title}">\n${clipped}\n</skill_example>`);
        remaining -= clipped.length;
      }
    }
  }

  const formatList = (items: SkillResourceItem[]) =>
    items.map(item => `- ${item.path} (${item.title})${loaded.has(item.path) ? ' [PRELOADED]' : ''}`).join('\n');

  const sections: string[] = [];
  if (catalog.templates.length) sections.push(`Templates:\n${formatList(catalog.templates)}`);
  if (catalog.examples.length) sections.push(`Examples:\n${formatList(catalog.examples)}`);
  if (catalog.references.length) sections.push(`References:\n${formatList(catalog.references)}`);

  const skillAttr = options.skillName ? ` skill="${options.skillName}"` : '';
  const manifestText = [
    `<skill_resource_manifest${skillAttr}>`,
    'Resources marked [PRELOADED] are already included below; do not call the `skill` tool to reload them.',
    'If you need any non-preloaded resource, fetch up to 4 in one call: skill(input="<skill-name>", args={"resources":["references/...","templates/..."]}).',
    ...sections,
    '</skill_resource_manifest>',
  ].join('\n');

  return {
    manifestText,
    preloadedText: preloadedBlocks.join('\n\n'),
    preloadedPaths,
    availableResources,
  };
}
