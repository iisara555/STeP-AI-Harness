import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSymbolsFromSource, searchSymbolsInFiles, findReferencesInFiles } from '../electron/code-intelligence';

test('extractSymbolsFromSource identifies classes, methods, functions, interfaces and variables', () => {
  const code = `
export interface DocumentConfig {
  id: string;
  title: string;
}

export type DocumentType = 'memo' | 'order' | 'report';

export enum DocumentStatus {
  Draft = 0,
  Reviewed = 1,
  Approved = 2,
}

export class DocumentManager {
  private activeId: string = '';

  processDocument(config: DocumentConfig): DocumentStatus {
    return DocumentStatus.Reviewed;
  }
}

export const DEFAULT_TIMEOUT = 5000;
export let lastAccessed = 0;

export function buildDocument(title: string): DocumentConfig {
  return { id: 'doc-1', title };
}
`;

  const symbols = extractSymbolsFromSource('src/documents.ts', code);
  const names = symbols.map(s => s.name);

  assert.ok(names.includes('DocumentConfig'));
  assert.ok(names.includes('DocumentType'));
  assert.ok(names.includes('DocumentStatus'));
  assert.ok(names.includes('DocumentManager'));
  assert.ok(names.includes('processDocument'));
  assert.ok(names.includes('DEFAULT_TIMEOUT'));
  assert.ok(names.includes('lastAccessed'));
  assert.ok(names.includes('buildDocument'));

  const iface = symbols.find(s => s.name === 'DocumentConfig');
  assert.equal(iface?.kind, 'interface');
  assert.equal(iface?.path, 'src/documents.ts');

  const method = symbols.find(s => s.name === 'processDocument');
  assert.equal(method?.kind, 'method');
  assert.equal(method?.containerName, 'DocumentManager');

  const fn = symbols.find(s => s.name === 'buildDocument');
  assert.equal(fn?.kind, 'function');
  assert.ok(fn?.line && fn.line > 0);
});

test('searchSymbolsInFiles filters by query and kind across files', () => {
  const files = [
    {
      path: 'src/user.ts',
      text: 'export interface User { id: string; } export function getUser(id: string): User { return { id }; }',
    },
    {
      path: 'src/admin.ts',
      text: 'export class AdminService { getAdmin(id: string) { return id; } }',
    },
  ];

  const searchAll = searchSymbolsInFiles(files);
  assert.equal(searchAll.total, 4); // User (interface), getUser (function), AdminService (class), getAdmin (method)

  const queryMatch = searchSymbolsInFiles(files, { query: 'User' });
  assert.equal(queryMatch.total, 2);
  assert.equal(queryMatch.symbols[0].name, 'User'); // Exact match first

  const kindMatch = searchSymbolsInFiles(files, { kind: 'class' });
  assert.equal(kindMatch.total, 1);
  assert.equal(kindMatch.symbols[0].name, 'AdminService');
});

test('findReferencesInFiles distinguishes symbol definitions and usages', () => {
  const files = [
    {
      path: 'src/math.ts',
      text: `
export function calculateBudget(base: number, rate: number): number {
  return base * rate;
}
`,
    },
    {
      path: 'src/service.ts',
      text: `
import { calculateBudget } from './math';
export function runService() {
  const total = calculateBudget(100, 1.07);
  return total;
}
`,
    },
  ];

  const result = findReferencesInFiles(files, 'calculateBudget');
  assert.equal(result.symbol, 'calculateBudget');
  assert.equal(result.definitions.length, 1);
  assert.equal(result.definitions[0].path, 'src/math.ts');
  assert.equal(result.definitions[0].isDefinition, true);

  assert.ok(result.references.length >= 2); // import statement + invocation
  assert.ok(result.references.some(r => r.path === 'src/service.ts' && !r.isDefinition));
});
