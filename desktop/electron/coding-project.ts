import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { CODING_CHECKS, type CodingCheck, type CodingPackage, type CodingProject, type PackageManager } from '../src/coding-project';
import type { Workbench } from './workbench';

const CODING_MARKERS = new Set(['.git', 'package.json', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Makefile']);

/** Lightweight check for whether an employee's active workspace is a software repository rather than an office folder. */
export async function hasCodingWorkspace(workspace?: string): Promise<boolean> {
  if (!workspace?.trim()) return false;
  try {
    const entries = await readdir(workspace, { withFileTypes: true });
    for (const entry of entries) {
      if (CODING_MARKERS.has(entry.name)) return true;
    }
    const subdirs = entries.filter(e => e.isDirectory() && (ROOT_PACKAGES.includes(e.name) || GROUPS.includes(e.name)));
    for (const dir of subdirs) {
      const dirPath = join(workspace, dir.name);
      if (GROUPS.includes(dir.name)) {
        const nested = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
        for (const child of nested.filter(e => e.isDirectory()).slice(0, 12)) {
          const hit = await stat(join(dirPath, child.name, 'package.json')).catch(() => null);
          if (hit?.isFile()) return true;
        }
      } else {
        const hit = await stat(join(dirPath, 'package.json')).catch(() => null);
        if (hit?.isFile()) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const FRONTEND = ['app', 'client', 'frontend', 'web'];
const BACKEND = ['api', 'backend', 'server'];
const ROOT_PACKAGES = [...FRONTEND, ...BACKEND, 'desktop', 'shared'];
const GROUPS = ['apps', 'packages', 'services'];
const LOCKFILES = {
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lock': 'bun',
  'bun.lockb': 'bun',
} as const;
const PACKAGE_LIMIT = 48;
const MANIFEST_LIMIT = 256_000;
type Manifest = {
  packageManager?: string;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

function managerFor(manifest: Manifest | undefined, files: string[]): PackageManager | undefined {
  const declared = typeof manifest?.packageManager === 'string' && /^(npm|pnpm|yarn|bun)@/.exec(manifest.packageManager)?.[1];
  if (declared) return declared as PackageManager;
  return Object.entries(LOCKFILES).find(([name]) => files.includes(name))?.[1];
}

function packageKind(directory: string, manifest: Manifest): CodingPackage['kind'] {
  const leaf = directory.split('/').at(-1)!;
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  const frontend =
    FRONTEND.includes(leaf) || ['react', 'vue', 'svelte', '@angular/core', 'astro', 'next', 'nuxt'].some(name => name in dependencies);
  const backend =
    BACKEND.includes(leaf) ||
    directory.startsWith('services/') ||
    ['express', 'fastify', 'koa', '@nestjs/core', 'hono'].some(name => name in dependencies);
  if (frontend && backend) return 'fullstack';
  if (frontend) return 'frontend';
  if (backend) return 'backend';
  return 'shared';
}

type ProjectFiles = Pick<Workbench, 'root' | 'files' | 'bytes'>;

async function discover(workbench: ProjectFiles, expectedRoot?: string) {
  const root = await workbench.root();
  if (expectedRoot !== undefined && expectedRoot !== root) throw new Error('WORKSPACE_CHANGED');
  const rootEntries = (await workbench.files(root)).entries;
  let incomplete = rootEntries.length === 500;
  const candidates = ['.', ...rootEntries.filter(entry => entry.directory && ROOT_PACKAGES.includes(entry.name)).map(entry => entry.name)];
  for (const group of rootEntries.filter(entry => entry.directory && GROUPS.includes(entry.name))) {
    const { entries } = await workbench.files(join(root, group.name));
    incomplete ||= entries.length === 500;
    candidates.push(...entries.filter(entry => entry.directory).map(entry => `${group.name}/${entry.name}`));
  }
  incomplete ||= candidates.length > PACKAGE_LIMIT;

  const packages: { target: CodingPackage; manifest: Manifest; digest: string }[] = [];
  let rootManager: PackageManager =
    managerFor(
      undefined,
      rootEntries.filter(entry => !entry.directory).map(entry => entry.name),
    ) || 'npm';
  for (const directory of candidates.slice(0, PACKAGE_LIMIT)) {
    const path = join(root, directory, 'package.json');
    try {
      const bytes = await workbench.bytes(path, MANIFEST_LIMIT);
      const manifest: Manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new SyntaxError('Invalid manifest');
      const entries = directory === '.' ? rootEntries : (await workbench.files(dirname(path))).entries;
      const manager =
        managerFor(
          manifest,
          entries.filter(entry => !entry.directory).map(entry => entry.name),
        ) || rootManager;
      if (directory === '.') rootManager = manager;
      packages.push({
        target: {
          directory,
          manager,
          kind: packageKind(directory, manifest),
          checks: CODING_CHECKS.filter(check => script(manifest, check)),
        },
        manifest,
        digest: createHash('sha256').update(bytes).digest('hex'),
      });
    } catch (error) {
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      // A malformed, denied or concurrently changed manifest cannot advertise a runnable check.
      incomplete = true;
    }
  }
  if (root !== (await workbench.root())) throw new Error('WORKSPACE_CHANGED');
  return { root, packages, incomplete };
}

function script(manifest: Manifest, name: string): string {
  const value = manifest.scripts?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

export async function inspectCodingProject(workbench: ProjectFiles): Promise<CodingProject> {
  const { root, packages, incomplete } = await discover(workbench);
  return { root, packages: packages.map(({ target }) => target), incomplete };
}

export async function resolveCodingCheck(workbench: ProjectFiles, root: string, directory: string, check: string) {
  if (!CODING_CHECKS.some(name => name === check)) throw new Error('CODING_CHECK_UNAVAILABLE');
  const project = await discover(workbench, root);
  const selected = project.packages.find(({ target }) => target.directory === directory && target.checks.includes(check as CodingCheck));
  if (!selected) throw new Error('CODING_CHECK_UNAVAILABLE');
  const { target, manifest, digest } = selected;
  const executable = process.platform === 'win32' && target.manager !== 'bun' ? `${target.manager}.cmd` : target.manager;
  return {
    cwd: join(root, ...directory.split('/')),
    command: `${executable} run ${check}`,
    scripts: [`pre${check}`, check, `post${check}`].map(name => script(manifest, name)).filter(Boolean),
    key: [root, directory.split('/').join(sep), target.manager, check, digest].join('\n'),
  };
}
