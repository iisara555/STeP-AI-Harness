import ts from 'typescript';

export type SymbolKind = 'function' | 'method' | 'class' | 'interface' | 'type' | 'enum' | 'variable' | 'constant' | 'property';

export type CodeSymbol = {
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  column: number;
  preview: string;
  containerName?: string;
};

export type SymbolReference = {
  path: string;
  line: number;
  column: number;
  preview: string;
  isDefinition: boolean;
};

export type SymbolSearchResults = {
  total: number;
  symbols: CodeSymbol[];
};

export type SymbolReferencesResult = {
  symbol: string;
  definitions: SymbolReference[];
  references: SymbolReference[];
};

/**
 * Extracts declared symbols from TypeScript / JavaScript source text using the TypeScript AST parser.
 */
export function extractSymbolsFromSource(filePath: string, sourceText: string): CodeSymbol[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const symbols: CodeSymbol[] = [];
  const lines = sourceText.split(/\r?\n/);

  function getPreview(lineNum: number): string {
    const raw = lines[lineNum - 1] ?? '';
    return raw.trim().slice(0, 160);
  }

  function visit(node: ts.Node, currentContainer?: string) {
    let symbol: CodeSymbol | undefined;

    if (ts.isFunctionDeclaration(node) && node.name) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      symbol = {
        name: node.name.text,
        kind: 'function',
        path: filePath,
        line: pos.line + 1,
        column: pos.character + 1,
        preview: getPreview(pos.line + 1),
        ...(currentContainer ? { containerName: currentContainer } : {}),
      };
    } else if (ts.isClassDeclaration(node) && node.name) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      symbol = {
        name: node.name.text,
        kind: 'class',
        path: filePath,
        line: pos.line + 1,
        column: pos.character + 1,
        preview: getPreview(pos.line + 1),
        ...(currentContainer ? { containerName: currentContainer } : {}),
      };
    } else if (ts.isInterfaceDeclaration(node)) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      symbol = {
        name: node.name.text,
        kind: 'interface',
        path: filePath,
        line: pos.line + 1,
        column: pos.character + 1,
        preview: getPreview(pos.line + 1),
        ...(currentContainer ? { containerName: currentContainer } : {}),
      };
    } else if (ts.isTypeAliasDeclaration(node)) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      symbol = {
        name: node.name.text,
        kind: 'type',
        path: filePath,
        line: pos.line + 1,
        column: pos.character + 1,
        preview: getPreview(pos.line + 1),
        ...(currentContainer ? { containerName: currentContainer } : {}),
      };
    } else if (ts.isEnumDeclaration(node)) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      symbol = {
        name: node.name.text,
        kind: 'enum',
        path: filePath,
        line: pos.line + 1,
        column: pos.character + 1,
        preview: getPreview(pos.line + 1),
        ...(currentContainer ? { containerName: currentContainer } : {}),
      };
    } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      symbol = {
        name: node.name.text,
        kind: 'method',
        path: filePath,
        line: pos.line + 1,
        column: pos.character + 1,
        preview: getPreview(pos.line + 1),
        ...(currentContainer ? { containerName: currentContainer } : {}),
      };
    } else if (ts.isVariableStatement(node)) {
      const isConst = Boolean(node.declarationList.flags & ts.NodeFlags.Const);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const pos = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile));
          symbols.push({
            name: decl.name.text,
            kind: isConst ? 'constant' : 'variable',
            path: filePath,
            line: pos.line + 1,
            column: pos.character + 1,
            preview: getPreview(pos.line + 1),
            ...(currentContainer ? { containerName: currentContainer } : {}),
          });
        }
      }
    }

    if (symbol) {
      symbols.push(symbol);
    }

    const nextContainer =
      ts.isClassDeclaration(node) && node.name ? node.name.text : ts.isInterfaceDeclaration(node) ? node.name.text : currentContainer;

    ts.forEachChild(node, child => visit(child, nextContainer));
  }

  visit(sourceFile);
  return symbols;
}

/**
 * Searches symbols across given files with optional name query and kind filter.
 */
export function searchSymbolsInFiles(
  files: { path: string; text: string }[],
  options?: { query?: string; kind?: string; limit?: number },
): SymbolSearchResults {
  const query = options?.query?.trim().toLowerCase();
  const kind = options?.kind?.toLowerCase();
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

  const matched: CodeSymbol[] = [];

  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?)$/i.test(file.path)) continue;
    try {
      const fileSymbols = extractSymbolsFromSource(file.path, file.text);
      for (const s of fileSymbols) {
        if (query && !s.name.toLowerCase().includes(query)) continue;
        if (kind && kind !== 'all' && s.kind !== kind) continue;
        matched.push(s);
      }
    } catch {
      // Ignore unparseable syntax in individual files
    }
  }

  // Sort by exact match first, then alphabetically
  if (query) {
    matched.sort((a, b) => {
      const aExact = a.name.toLowerCase() === query;
      const bExact = b.name.toLowerCase() === query;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  return {
    total: matched.length,
    symbols: matched.slice(0, limit),
  };
}

/**
 * Finds definitions and references of a symbol across given files.
 */
export function findReferencesInFiles(files: { path: string; text: string }[], symbolName: string): SymbolReferencesResult {
  const targetSymbol = symbolName.trim();
  if (!targetSymbol) throw new Error('INVALID_INPUT');

  const definitions: SymbolReference[] = [];
  const references: SymbolReference[] = [];

  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?)$/i.test(file.path)) continue;
    try {
      const sourceFile = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
      const lines = file.text.split(/\r?\n/);

      const getPreview = (lineNum: number) => (lines[lineNum - 1] ?? '').trim().slice(0, 160);

      const isDefNode = (node: ts.Node): boolean => {
        const parent = node.parent;
        if (!parent) return false;
        if (
          (ts.isFunctionDeclaration(parent) ||
            ts.isClassDeclaration(parent) ||
            ts.isInterfaceDeclaration(parent) ||
            ts.isTypeAliasDeclaration(parent) ||
            ts.isEnumDeclaration(parent) ||
            ts.isMethodDeclaration(parent)) &&
          parent.name === node
        ) {
          return true;
        }
        if (ts.isVariableDeclaration(parent) && parent.name === node) {
          return true;
        }
        if (ts.isParameter(parent) && parent.name === node) {
          return true;
        }
        return false;
      };

      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && node.text === targetSymbol) {
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const line = pos.line + 1;
          const column = pos.character + 1;
          const preview = getPreview(line);
          const isDef = isDefNode(node);

          if (isDef) {
            definitions.push({
              path: file.path,
              line,
              column,
              preview,
              isDefinition: true,
            });
          } else {
            references.push({
              path: file.path,
              line,
              column,
              preview,
              isDefinition: false,
            });
          }
        }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch {
      // Skip file on parser failure
    }
  }

  return {
    symbol: targetSymbol,
    definitions: definitions.slice(0, 100),
    references: references.slice(0, 200),
  };
}
