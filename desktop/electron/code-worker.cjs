// A local TypeScript language service over a bounded snapshot. No project code, plugins or config scripts execute.
const { parentPort, workerData } = require('node:worker_threads');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
try {
  const library = fs.existsSync(path.join(__dirname, 'typescript-lib', 'lib.es2022.d.ts'))
    ? path.join(__dirname, 'typescript-lib')
    : path.dirname(require.resolve('typescript/lib/lib.es2022.d.ts'));
  const sources = new Map(workerData.files.map(file => ['/workspace/' + file.path.replaceAll('\\', '/'), file.text]));
  const target = '/workspace/' + workerData.target.replaceAll('\\', '/');
  const trustedLibrary = name =>
    path.resolve(name).startsWith(path.resolve(library) + path.sep) && /^[\w.-]+\.d\.ts$/.test(path.basename(name));
  const read = name => sources.get(name) ?? (trustedLibrary(name) ? fs.readFileSync(name, 'utf8') : undefined);
  const host = {
    getCompilationSettings: () => ({
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    }),
    getScriptFileNames: () => [...sources.keys()],
    getScriptVersion: () => '1',
    getCurrentDirectory: () => '/workspace',
    getDefaultLibFileName: () => path.join(library, 'lib.es2022.d.ts'),
    getScriptSnapshot: name => {
      const text = read(name);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    fileExists: name => sources.has(name) || (trustedLibrary(name) && fs.existsSync(name)),
    readFile: read,
    readDirectory: () => [],
    directoryExists: name => name.startsWith('/workspace') || name === library,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    writeFile: () => {
      throw Error('READ_ONLY');
    },
  };
  const service = ts.createLanguageService(host);
  const all = [...service.getSyntacticDiagnostics(target), ...service.getSemanticDiagnostics(target)];
  const diagnostics = all.slice(0, 100).map(d => {
    const position = d.file?.getLineAndCharacterOfPosition(d.start || 0);
    return {
      code: d.code,
      severity: d.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
      line: (position?.line || 0) + 1,
      column: (position?.character || 0) + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n').slice(0, 2000),
    };
  });
  const incomplete = all.some(d => [2307, 2688, 7016, 2580].includes(d.code));
  service.dispose();
  parentPort.postMessage({
    diagnostics,
    incomplete,
    truncated: all.length > 100,
    engine: 'typescript-language-service',
    scope: 'bounded-snapshot',
  });
} catch {
  parentPort.postMessage({ error: 'CODE_DIAGNOSTICS_FAILED' });
}
