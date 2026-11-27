export const CODING_CHECKS = ['lint', 'typecheck', 'check', 'test', 'build'] as const;
export type CodingCheck = (typeof CODING_CHECKS)[number];
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type CodingPackage = {
  directory: string;
  kind: 'frontend' | 'backend' | 'fullstack' | 'shared';
  manager: PackageManager;
  checks: CodingCheck[];
};
export type CodingProject = { root: string; packages: CodingPackage[]; incomplete: boolean };
