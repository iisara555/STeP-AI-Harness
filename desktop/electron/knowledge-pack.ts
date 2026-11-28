import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import type { CatalogEntry } from './knowledge';
import type { Policy } from './policy';

/** Official STeP Knowledge Pack release manifest URL (overridable via managed policy `knowledgePack.manifestUrl`). */
export const DEFAULT_KNOWLEDGE_PACK_URL =
  'https://github.com/iisara555/STeP-AI-Harness/releases/download/knowledge-latest/knowledge-pack-manifest.json';

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_PACK_FILES = 150;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;
const UNREADABLE_DOCUMENT = new Set(['not-provided', 'superseded', 'archived', 'withdrawn', 'restricted', 'unregistered']);

export type KnowledgePackFile = {
  path: string;
  sha256: string;
  bytes: number;
  url?: string;
};

export type KnowledgePackManifest = {
  schemaVersion: 1;
  packVersion: string;
  publishedAt: string;
  baseUrl?: string;
  documentsYaml: KnowledgePackFile;
  files: KnowledgePackFile[];
};

export type KnowledgePackMeta = {
  packVersion: string;
  publishedAt: string;
  installedAt: string;
  manifestUrl: string;
  manifestSha256: string;
  documentCount: number;
};

export type KnowledgePackStatus = {
  enabled: boolean;
  source: 'bundled' | 'pack';
  packVersion?: string;
  publishedAt?: string;
  installedAt?: string;
  documentCount?: number;
  manifestUrl: string;
};

function sha256Hex(data: Buffer | string) {
  return createHash('sha256').update(data).digest('hex');
}

function stripYamlScalar(raw: string) {
  const s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).trim();
  return s;
}

/** Parse manifest/documents.yaml entries with the same visibility rules as src/modules/router/metadata.js. */
export function parseDocumentsYaml(text: string): (CatalogEntry & { sensitivity?: string })[] {
  const lines = text.split(/\r?\n/);
  const results: (CatalogEntry & { sensitivity?: string })[] = [];
  let current: (CatalogEntry & { sensitivity?: string }) | null = null;
  for (const line of lines) {
    const key = /^  ([a-z0-9_-]+):\s*$/.exec(line);
    if (key) {
      current = { id: key[1], title: '', path: '', status: '', authority: '', verification: '' };
      results.push(current);
      continue;
    }
    if (!current) continue;
    const title = /^    title:\s*(.+)/.exec(line);
    if (title) current.title = stripYamlScalar(title[1]);
    const pathMatch = /^    path:\s*(.+)/.exec(line);
    if (pathMatch) current.path = stripYamlScalar(pathMatch[1]);
    const index = /^    index:\s*(.+)/.exec(line);
    if (index && !current.path) current.path = stripYamlScalar(index[1]);
    const status = /^    status:\s*(.+)/.exec(line);
    if (status) current.status = stripYamlScalar(status[1]);
    const keywords = /^    keywords:\s*\[(.*)\]/.exec(line);
    if (keywords)
      current.keywords = keywords[1]
        .split(',')
        .map(w => stripYamlScalar(w.trim()))
        .filter(Boolean);
    const gov = /^    (authority|verification|sensitivity|owner):\s*(.+)/.exec(line);
    if (gov) (current as any)[gov[1]] = stripYamlScalar(gov[2]);
  }
  return results;
}

export function readableCatalogFromYaml(text: string): CatalogEntry[] {
  return parseDocumentsYaml(text)
    .map(ref => (ref.sensitivity === 'restricted' ? { ...ref, path: '', status: 'restricted' } : ref))
    .filter(ref => ref.path && ref.title && !UNREADABLE_DOCUMENT.has(ref.status || ''));
}

function assertSafeUrl(raw: string, allowLocalHttp: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('KNOWLEDGE_PACK_INVALID');
  }
  if (url.username || url.password || url.hash) throw new Error('KNOWLEDGE_PACK_INVALID');
  const isLocal = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol === 'https:') {
    if (isLocal && !allowLocalHttp) throw new Error('KNOWLEDGE_PACK_INVALID');
    return url;
  }
  if (allowLocalHttp && url.protocol === 'http:' && isLocal) return url;
  throw new Error('KNOWLEDGE_PACK_INVALID');
}

function validateSafeDocPath(path: string, expectDocumentsYaml: boolean) {
  if (typeof path !== 'string' || path.length > 240 || path.includes('\\') || path.includes('\0'))
    throw new Error('KNOWLEDGE_PACK_INVALID');
  const normalized = posix.normalize(path);
  if (normalized !== path || normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('/../'))
    throw new Error('KNOWLEDGE_PACK_INVALID');
  if (expectDocumentsYaml) {
    if (normalized !== 'manifest/documents.yaml') throw new Error('KNOWLEDGE_PACK_INVALID');
    return normalized;
  }
  if (!/^docs\/knowledge\/[a-zA-Z0-9._/-]+\.md$/.test(normalized)) throw new Error('KNOWLEDGE_PACK_INVALID');
  return normalized;
}

function validateFileSpec(raw: unknown, expectDocumentsYaml: boolean): KnowledgePackFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('KNOWLEDGE_PACK_INVALID');
  const obj = raw as Record<string, unknown>;
  const path = validateSafeDocPath(String(obj.path || ''), expectDocumentsYaml);
  const sha256 = typeof obj.sha256 === 'string' ? obj.sha256 : '';
  const bytes = typeof obj.bytes === 'number' ? obj.bytes : -1;
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_FILE_BYTES)
    throw new Error('KNOWLEDGE_PACK_INVALID');
  const url = obj.url === undefined ? undefined : typeof obj.url === 'string' ? obj.url : '';
  if (obj.url !== undefined && !url) throw new Error('KNOWLEDGE_PACK_INVALID');
  return { path, sha256, bytes, ...(url ? { url } : {}) };
}

export function validateKnowledgePackManifest(raw: unknown): KnowledgePackManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('KNOWLEDGE_PACK_INVALID');
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) throw new Error('KNOWLEDGE_PACK_INVALID');
  const packVersion = typeof obj.packVersion === 'string' ? obj.packVersion.trim() : '';
  const publishedAt = typeof obj.publishedAt === 'string' ? obj.publishedAt.trim() : '';
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(packVersion) || !/^\d{4}-\d{2}-\d{2}/.test(publishedAt) || publishedAt.length > 40)
    throw new Error('KNOWLEDGE_PACK_INVALID');
  const baseUrl = obj.baseUrl === undefined ? undefined : typeof obj.baseUrl === 'string' ? obj.baseUrl.trim() : '';
  if (obj.baseUrl !== undefined && !baseUrl) throw new Error('KNOWLEDGE_PACK_INVALID');
  const documentsYaml = validateFileSpec(obj.documentsYaml, true);
  if (!Array.isArray(obj.files) || !obj.files.length || obj.files.length > MAX_PACK_FILES) throw new Error('KNOWLEDGE_PACK_INVALID');
  const seen = new Set<string>();
  let totalBytes = documentsYaml.bytes;
  const files = obj.files.map(entry => {
    const item = validateFileSpec(entry, false);
    if (seen.has(item.path)) throw new Error('KNOWLEDGE_PACK_INVALID');
    seen.add(item.path);
    totalBytes += item.bytes;
    return item;
  });
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error('KNOWLEDGE_PACK_LIMIT');
  return {
    schemaVersion: 1,
    packVersion,
    publishedAt,
    ...(baseUrl ? { baseUrl } : {}),
    documentsYaml,
    files,
  };
}

async function fetchBoundedBytes(
  targetUrl: string,
  limit: number,
  allowLocalHttp: boolean,
  signal: AbortSignal,
  fetcher: typeof fetch,
): Promise<Buffer> {
  let current = assertSafeUrl(targetUrl, allowLocalHttp);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetcher(current, {
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      });
    } catch {
      throw new Error(signal.aborted ? 'CANCELLED' : 'KNOWLEDGE_PACK_DOWNLOAD_FAILED');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location || hop === MAX_REDIRECTS) throw new Error('KNOWLEDGE_PACK_DOWNLOAD_FAILED');
      current = assertSafeUrl(new URL(location, current).toString(), allowLocalHttp);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error('KNOWLEDGE_PACK_DOWNLOAD_FAILED');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > limit) throw new Error('KNOWLEDGE_PACK_LIMIT');
        chunks.push(part.value);
      }
      return Buffer.concat(chunks);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  throw new Error('KNOWLEDGE_PACK_DOWNLOAD_FAILED');
}

/** Build a verified KnowledgePackManifest from a repository checkout (used by scripts/build-knowledge-pack.mjs and tests). */
export async function buildKnowledgePackManifest(
  repoRoot: string,
  options: { packVersion: string; publishedAt?: string; baseUrl?: string },
): Promise<KnowledgePackManifest> {
  const yamlPath = join(repoRoot, 'manifest', 'documents.yaml');
  const yamlBytes = await readFile(yamlPath);
  const catalog = readableCatalogFromYaml(yamlBytes.toString('utf8'));
  const uniquePaths = [...new Set(catalog.map(e => e.path).filter(p => /^docs\/knowledge\/[a-zA-Z0-9._/-]+\.md$/.test(p)))].sort();
  const files: KnowledgePackFile[] = [];
  for (const rel of uniquePaths) {
    const full = resolve(repoRoot, rel);
    const check = relative(repoRoot, full);
    if (isAbsolute(check) || check.startsWith('..')) continue;
    const bytes = await readFile(full);
    files.push({ path: rel, sha256: sha256Hex(bytes), bytes: bytes.length });
  }
  return validateKnowledgePackManifest({
    schemaVersion: 1,
    packVersion: options.packVersion,
    publishedAt: options.publishedAt || new Date().toISOString().slice(0, 10),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    documentsYaml: { path: 'manifest/documents.yaml', sha256: sha256Hex(yamlBytes), bytes: yamlBytes.length },
    files,
  });
}

/**
 * Manages checksum-verified STeP organization Knowledge Packs stored in userData without modifying the bundled app.
 * Every file is verified by SHA-256 and byte size in a disposable staging folder before atomic activation.
 */
export class KnowledgePackManager {
  private active = false;
  constructor(
    private dir: string,
    private bundledRoot: string,
    private policy: () => Policy,
    private options: { allowLocalHttp?: boolean; fetcher?: typeof fetch } = {},
  ) {}

  private currentDir() {
    return join(this.dir, 'current');
  }

  private metaPath() {
    return join(this.currentDir(), 'pack-meta.json');
  }

  private readActiveMeta(): KnowledgePackMeta | undefined {
    try {
      const metaFile = this.metaPath();
      const yamlFile = join(this.currentDir(), 'manifest', 'documents.yaml');
      if (!existsSync(metaFile) || !existsSync(yamlFile)) return undefined;
      if (lstatSync(metaFile).isSymbolicLink() || lstatSync(yamlFile).isSymbolicLink()) return undefined;
      const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
      if (typeof meta?.packVersion !== 'string' || !meta.packVersion) return undefined;
      return meta as KnowledgePackMeta;
    } catch {
      return undefined;
    }
  }

  manifestUrl(): string {
    return this.policy().knowledgePack?.manifestUrl || DEFAULT_KNOWLEDGE_PACK_URL;
  }

  status(): KnowledgePackStatus {
    const enabled = this.policy().features.knowledgePackRefresh !== false;
    const meta = enabled ? this.readActiveMeta() : undefined;
    return {
      enabled,
      source: meta ? 'pack' : 'bundled',
      ...(meta
        ? {
            packVersion: meta.packVersion,
            publishedAt: meta.publishedAt,
            installedAt: meta.installedAt,
            documentCount: meta.documentCount,
          }
        : {}),
      manifestUrl: this.manifestUrl(),
    };
  }

  /** Returns the active verified Knowledge Pack directory when installed and enabled, otherwise the bundled root. */
  activeRoot(): string {
    if (this.policy().features.knowledgePackRefresh === false) return this.bundledRoot;
    return this.readActiveMeta() ? this.currentDir() : this.bundledRoot;
  }

  /** Returns the active overlay document catalog when installed, or undefined to fall back to bundled catalog. */
  async overlayDocumentCatalog(): Promise<CatalogEntry[] | undefined> {
    const root = this.activeRoot();
    if (root === this.bundledRoot) return undefined;
    try {
      const yaml = await readFile(join(root, 'manifest', 'documents.yaml'), 'utf8');
      const entries = readableCatalogFromYaml(yaml);
      return entries.length ? entries : undefined;
    } catch {
      return undefined;
    }
  }

  /** Returns overlay metadata for requested document IDs, falling back to bundled loader for non-overlay entries. */
  async overlayDocumentMetadata(ids: string[], bundledLoader: (ids: string[]) => Promise<any[]>): Promise<any[]> {
    const root = this.activeRoot();
    if (root === this.bundledRoot || !ids.length) return bundledLoader(ids);
    try {
      const yaml = await readFile(join(root, 'manifest', 'documents.yaml'), 'utf8');
      const parsed = parseDocumentsYaml(yaml);
      const byId = new Map(parsed.map(item => [item.id, item]));
      const missingIds = ids.filter(id => !byId.has(id));
      const fallback = missingIds.length ? await bundledLoader(missingIds) : [];
      const fallbackById = new Map(fallback.map((item: any) => [item.id, item]));
      return ids.map(id => {
        const hit = byId.get(id);
        if (hit) return hit.sensitivity === 'restricted' ? { ...hit, path: '', status: 'restricted' } : hit;
        return fallbackById.get(id) || { id, title: '', path: '', status: 'unregistered', authority: 'unverified', verification: '' };
      });
    } catch {
      return bundledLoader(ids);
    }
  }

  /** Download, SHA-256 verify, and atomically install a refreshed Knowledge Pack from the configured manifest URL. */
  async refresh(options: { signal?: AbortSignal; fetcher?: typeof fetch; manifestUrl?: string } = {}): Promise<KnowledgePackStatus> {
    const pol = this.policy();
    if (pol.features.knowledgePackRefresh === false) throw new Error('KNOWLEDGE_PACK_DISABLED');
    if (pol.network?.proxyUrl && !this.options.allowLocalHttp) throw new Error('PROVIDER_PROXY_UNAVAILABLE');
    if (this.active) throw new Error('COMPONENT_BUSY');
    this.active = true;
    const allowLocal = Boolean(this.options.allowLocalHttp);
    const fetcher = options.fetcher || this.options.fetcher || fetch;
    const signal = options.signal || new AbortController().signal;
    const targetManifestUrl = options.manifestUrl || this.manifestUrl();
    let stage = '';
    try {
      const manifestBytes = await fetchBoundedBytes(targetManifestUrl, MAX_MANIFEST_BYTES, allowLocal, signal, fetcher);
      const manifestDigest = sha256Hex(manifestBytes);
      if (pol.knowledgePack?.sha256 && manifestDigest !== pol.knowledgePack.sha256) throw new Error('KNOWLEDGE_PACK_CHECKSUM_FAILED');

      let parsed: unknown;
      try {
        parsed = JSON.parse(manifestBytes.toString('utf8'));
      } catch {
        throw new Error('KNOWLEDGE_PACK_INVALID');
      }
      const manifest = validateKnowledgePackManifest(parsed);
      const base = manifest.baseUrl
        ? assertSafeUrl(manifest.baseUrl.endsWith('/') ? manifest.baseUrl : manifest.baseUrl + '/', allowLocal)
        : new URL('./', assertSafeUrl(targetManifestUrl, allowLocal));

      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      stage = await mkdtemp(join(this.dir, 'stage-'));

      const downloadAndStage = async (spec: KnowledgePackFile) => {
        const fileUrl = spec.url ? assertSafeUrl(spec.url, allowLocal).toString() : new URL(spec.path, base).toString();
        const bytes = await fetchBoundedBytes(fileUrl, MAX_FILE_BYTES, allowLocal, signal, fetcher);
        if (bytes.length !== spec.bytes || sha256Hex(bytes) !== spec.sha256) throw new Error('KNOWLEDGE_PACK_CHECKSUM_FAILED');
        const dest = resolve(stage, spec.path);
        const rel = relative(stage, dest);
        if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('KNOWLEDGE_PACK_INVALID');
        await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
        const handle = await open(dest, 'wx', 0o600);
        try {
          await handle.writeFile(bytes);
        } finally {
          await handle.close();
        }
        return bytes;
      };

      const yamlBytes = await downloadAndStage(manifest.documentsYaml);
      const readableDocs = readableCatalogFromYaml(yamlBytes.toString('utf8'));
      if (!readableDocs.length) throw new Error('KNOWLEDGE_PACK_INVALID');

      for (const fileSpec of manifest.files) {
        signal.throwIfAborted();
        await downloadAndStage(fileSpec);
      }

      const meta: KnowledgePackMeta = {
        packVersion: manifest.packVersion,
        publishedAt: manifest.publishedAt,
        installedAt: new Date().toISOString(),
        manifestUrl: targetManifestUrl,
        manifestSha256: manifestDigest,
        documentCount: readableDocs.length,
      };
      const metaHandle = await open(join(stage, 'pack-meta.json'), 'wx', 0o600);
      try {
        await metaHandle.writeFile(JSON.stringify(meta, null, 2), 'utf8');
      } finally {
        await metaHandle.close();
      }

      // Atomic swap with safe backup rollback if rename fails on Windows.
      const current = this.currentDir();
      const backup = join(this.dir, `prev-${Date.now()}`);
      const hadCurrent = await stat(current)
        .then(() => true)
        .catch(() => false);
      if (hadCurrent) await rename(current, backup);
      try {
        await rename(stage, current);
        stage = '';
      } catch (swapError) {
        if (hadCurrent) await rename(backup, current).catch(() => {});
        throw swapError;
      }
      if (hadCurrent) await rm(backup, { recursive: true, force: true }).catch(() => {});
      return this.status();
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {});
      this.active = false;
    }
  }

  /** Remove any downloaded Knowledge Pack overlay and revert immediately to bundled app knowledge. */
  async reset(): Promise<KnowledgePackStatus> {
    if (this.active) throw new Error('COMPONENT_BUSY');
    await rm(this.currentDir(), { recursive: true, force: true });
    return this.status();
  }
}
