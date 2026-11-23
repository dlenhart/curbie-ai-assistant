import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';

const SOURCE_ROOT = __dirname;
const CORE_ROOT = join(SOURCE_ROOT, 'core');
const THIS_FILE = join(SOURCE_ROOT, 'architecture.spec.ts');
const SHARED_CONSTANTS_FILE = join(SOURCE_ROOT, 'constants.ts');
const SERVER_ROOT = resolve(SOURCE_ROOT, '..');
const REPOSITORY_ROOT = resolve(SERVER_ROOT, '..');

const PURE_PACKAGES_ALLOWED_IN_CORE = new Set(['ajv', 'gray-matter']);

const PROCESS_SPAWNING_MODULES = new Set(['child_process', 'node:child_process']);

const FILES_ALLOWED_TO_SPAWN_PROCESSES = new Set<string>(['adapters/ocr/vision-ocr.invoker.ts']);

function listFilesWithExtension(directory: string, extension: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === 'bin') return [];
    if (statSync(fullPath).isDirectory()) return listFilesWithExtension(fullPath, extension);
    return fullPath.endsWith(extension) ? [fullPath] : [];
  });
}

function listTypeScriptFiles(directory: string): string[] {
  return listFilesWithExtension(directory, '.ts');
}

function lineNumberOf(sourceText: string, position: number): number {
  return sourceText.slice(0, position).split('\n').length;
}

function findScriptComments(sourceText: string, scriptKind: ts.ScriptKind): number[] {
  const sourceFile = ts.createSourceFile('sample', sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const commentPositions = new Set<number>();
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      const ranges = [
        ...(ts.getTrailingCommentRanges(sourceText, node.getFullStart()) ?? []),
        ...(ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? []),
      ];
      for (const range of ranges) commentPositions.add(range.pos);
      return;
    }
    children.forEach(visit);
  };
  visit(sourceFile);
  return [...commentPositions].sort((first, second) => first - second).map((position) => lineNumberOf(sourceText, position));
}

function findCssComments(sourceText: string): number[] {
  const lines: number[] = [];
  let quote: string | null = null;
  for (let index = 0; index < sourceText.length; index++) {
    const character = sourceText[index];
    if (quote) {
      if (character === '\\') index++;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    if (character === '/' && sourceText[index + 1] === '*') lines.push(lineNumberOf(sourceText, index));
  }
  return lines;
}

function findTemplateComments(sourceText: string): number[] {
  return sourceText.split('\n').flatMap((line, index) => (/\{\{!|<!--/.test(line) ? [index + 1] : []));
}

function findSwiftComments(sourceText: string): number[] {
  const lines: number[] = [];
  let isInsideString = false;
  for (let index = 0; index < sourceText.length; index++) {
    const character = sourceText[index];
    if (isInsideString) {
      if (character === '\\') index++;
      else if (character === '"' || character === '\n') isInsideString = false;
      continue;
    }
    if (character === '"') isInsideString = true;
    if (character === '/' && (sourceText[index + 1] === '/' || sourceText[index + 1] === '*')) {
      lines.push(lineNumberOf(sourceText, index));
    }
  }
  return lines;
}

function findShellComments(sourceText: string): number[] {
  return sourceText.split('\n').flatMap((line, index) => {
    if (index === 0 && line.startsWith('#!')) return [];
    return line.trimStart().startsWith('#') ? [index + 1] : [];
  });
}

function parseTypeScript(sourceText: string): ts.SourceFile {
  return ts.createSourceFile('sample.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function findModuleLevelVariables(sourceText: string): string[] {
  return parseTypeScript(sourceText)
    .statements.filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations.map((declaration) => declaration.name.getText()));
}

interface TopLevelTypeDeclaration {
  kind: 'interface' | 'type';
  name: string;
}

function findTopLevelTypeDeclarations(sourceText: string): TopLevelTypeDeclaration[] {
  return parseTypeScript(sourceText).statements.flatMap((statement): TopLevelTypeDeclaration[] => {
    if (ts.isInterfaceDeclaration(statement)) return [{ kind: 'interface', name: statement.name.text }];
    if (ts.isTypeAliasDeclaration(statement)) return [{ kind: 'type', name: statement.name.text }];
    return [];
  });
}

function findImportSpecifiers(sourceText: string): string[] {
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return patterns.flatMap((pattern) => [...sourceText.matchAll(pattern)].map((match) => match[1]));
}

function packageNameOf(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function relativeToSource(file: string): string {
  return relative(SOURCE_ROOT, file);
}

describe('import scanner', () => {
  it('finds static, side-effect, require, dynamic, re-export, and multi-line imports', () => {
    const sample = [
      "import { a } from 'alpha';",
      'import * as b from "beta";',
      "import 'gamma';",
      "const d = require('delta');",
      "const e = await import('epsilon');",
      "export { f } from './phi';",
      "import {\n  g,\n  h,\n} from 'eta';",
    ].join('\n');
    expect(findImportSpecifiers(sample).sort()).toEqual(['./phi', 'alpha', 'beta', 'delta', 'epsilon', 'eta', 'gamma']);
  });

  it('ignores the word import inside string literals', () => {
    expect(findImportSpecifiers("const names = [\n  'import',\n  'createUnit',\n];")).toEqual([]);
  });
});

describe('comment detectors', () => {
  it('finds line and block comments in TypeScript but not slashes inside strings, regexes, or urls', () => {
    const sample = [
      "const url = 'http://example.com';",
      'const pattern = /a\\/\\/b/;',
      'const template = `// not a comment ${1}`;',
      'const real = 1; // trailing',
      '/* block */',
      'const last = 2;',
    ].join('\n');
    expect(findScriptComments(sample, ts.ScriptKind.TS)).toEqual([4, 5]);
  });

  it('finds comments in plain JavaScript and ignores a clean file', () => {
    expect(findScriptComments('const a = 1;\n// note\n', ts.ScriptKind.JS)).toEqual([2]);
    expect(findScriptComments('const a = 1;\n', ts.ScriptKind.JS)).toEqual([]);
  });

  it('finds CSS comments but not a slash-star inside a string', () => {
    expect(findCssComments('a { color: red; }\n/* note */\nb { content: "/*"; }')).toEqual([2]);
    expect(findCssComments('a { color: red; }')).toEqual([]);
  });

  it('finds handlebars and html comments', () => {
    expect(findTemplateComments('<p>hi</p>\n{{! note }}\n<!-- note -->')).toEqual([2, 3]);
    expect(findTemplateComments('<p>{{name}}</p>')).toEqual([]);
  });

  it('finds swift comments but not slashes inside string literals', () => {
    expect(findSwiftComments('let a = "http://x"\nlet b = 1 // note\n/* block */')).toEqual([2, 3]);
    expect(findSwiftComments('let a = "a\\"//b"\n')).toEqual([]);
  });

  it('finds shell comments except a shebang on the first line', () => {
    expect(findShellComments('#!/bin/bash\necho hi\n  # note\n')).toEqual([3]);
    expect(findShellComments('echo "# not a comment"\n')).toEqual([]);
    expect(findShellComments('echo hi\n#!/bin/bash')).toEqual([2]);
  });
});

describe('declaration detectors', () => {
  it('finds top-level variables of every kind and ignores nested ones', () => {
    const sample = "const a = 1;\nlet b = 2;\nvar c = 3;\nexport const d = 4;\nfunction f() { const inner = 1; return inner; }\nclass K { x = 1; }";
    expect(findModuleLevelVariables(sample)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('finds top-level interfaces and type aliases, exported or not, and ignores nested or inline ones', () => {
    const sample = [
      'interface A { x: number }',
      'export interface B { y: { z: number } }',
      'type C = string;',
      'export type D = A | B;',
      'function f(): void { type Local = number; }',
      'declare module "m" { interface Nested {} }',
    ].join('\n');
    expect(findTopLevelTypeDeclarations(sample)).toEqual([
      { kind: 'interface', name: 'A' },
      { kind: 'interface', name: 'B' },
      { kind: 'type', name: 'C' },
      { kind: 'type', name: 'D' },
    ]);
  });
});

describe('architecture rules', () => {
  it('actually scans a non-empty core (guards against a rule that silently checks nothing)', () => {
    expect(listTypeScriptFiles(CORE_ROOT).length).toBeGreaterThan(5);
  });

  it('keeps core pure: only core-relative imports and approved pure packages', () => {
    const violations: string[] = [];
    for (const file of listTypeScriptFiles(CORE_ROOT)) {
      for (const specifier of findImportSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier);
          const isSharedConstants = `${target}.ts` === SHARED_CONSTANTS_FILE;
          if (!target.startsWith(CORE_ROOT + sep) && !isSharedConstants) {
            violations.push(`${relativeToSource(file)} imports ${specifier}, which is outside core`);
          }
          continue;
        }
        if (!PURE_PACKAGES_ALLOWED_IN_CORE.has(packageNameOf(specifier))) {
          violations.push(`${relativeToSource(file)} imports ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the shared constants file free of imports so core can depend on it', () => {
    expect(findImportSpecifiers(readFileSync(SHARED_CONSTANTS_FILE, 'utf8'))).toEqual([]);
  });

  it('allows process spawning only in approved files', () => {
    const violations: string[] = [];
    for (const file of listTypeScriptFiles(SOURCE_ROOT)) {
      if (file === THIS_FILE) continue;
      const imports = findImportSpecifiers(readFileSync(file, 'utf8'));
      const isSpawning = imports.some((specifier) => PROCESS_SPAWNING_MODULES.has(specifier));
      if (isSpawning && !FILES_ALLOWED_TO_SPAWN_PROCESSES.has(relativeToSource(file))) {
        violations.push(relativeToSource(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('forbids eval and new Function everywhere', () => {
    const violations = listTypeScriptFiles(SOURCE_ROOT)
      .filter((file) => file !== THIS_FILE)
      .filter((file) => /\beval\s*\(|\bnew\s+Function\s*\(/.test(readFileSync(file, 'utf8')))
      .map(relativeToSource);
    expect(violations).toEqual([]);
  });
});

const MODULE_LEVEL_VARIABLE_ALLOWED_FILES_COMPILED_VALIDATORS_AND_DIRNAME_PATHS = new Set<string>([
  'core/answers/structured-answer.parser.ts',
  'core/recipes/line-labels.validator.ts',
]);

function isRoleFile(file: string, folder: string, suffix: string): boolean {
  const segments = relativeToSource(file).split(sep);
  return segments.length >= 2 && segments[segments.length - 2] === folder && segments[segments.length - 1].endsWith(suffix);
}

function nonSpecTypeScriptFiles(): string[] {
  return listTypeScriptFiles(SOURCE_ROOT).filter((file) => !file.endsWith('.spec.ts'));
}

describe('project rules', () => {
  const commentRules: { name: string; files: string[]; find: (sourceText: string, file: string) => number[] }[] = [
    {
      name: 'TypeScript',
      files: listTypeScriptFiles(SOURCE_ROOT),
      find: (sourceText) => findScriptComments(sourceText, ts.ScriptKind.TS),
    },
    {
      name: 'client JavaScript',
      files: listFilesWithExtension(join(SERVER_ROOT, 'public'), '.js'),
      find: (sourceText) => findScriptComments(sourceText, ts.ScriptKind.JS),
    },
    { name: 'CSS', files: listFilesWithExtension(join(SERVER_ROOT, 'public'), '.css'), find: findCssComments },
    { name: 'Handlebars', files: listFilesWithExtension(join(SERVER_ROOT, 'views'), '.hbs'), find: findTemplateComments },
    { name: 'Swift', files: listFilesWithExtension(join(REPOSITORY_ROOT, 'ocr'), '.swift'), find: findSwiftComments },
    { name: 'shell', files: listFilesWithExtension(join(REPOSITORY_ROOT, 'scripts'), '.sh'), find: findShellComments },
  ];

  it.each(commentRules.map((rule) => [rule.name, rule] as const))('has no comments in %s files', (_name, rule) => {
    expect(rule.files.length).toBeGreaterThan(0);
    const violations = rule.files.flatMap((file) =>
      rule.find(readFileSync(file, 'utf8'), file).map((line) => `${relative(REPOSITORY_ROOT, file)}:${line}`),
    );
    expect(violations).toEqual([]);
  });

  it('keeps module-level variables in constants.ts', () => {
    const files = nonSpecTypeScriptFiles();
    expect(files.length).toBeGreaterThan(5);
    const violations = files
      .filter((file) => file !== SHARED_CONSTANTS_FILE)
      .filter((file) => !MODULE_LEVEL_VARIABLE_ALLOWED_FILES_COMPILED_VALIDATORS_AND_DIRNAME_PATHS.has(relativeToSource(file)))
      .flatMap((file) => findModuleLevelVariables(readFileSync(file, 'utf8')).map((name) => `${relativeToSource(file)}: ${name}`));
    expect(violations).toEqual([]);
  });

  it('keeps every allowlisted module-level-variable file real and still violating', () => {
    for (const allowed of MODULE_LEVEL_VARIABLE_ALLOWED_FILES_COMPILED_VALIDATORS_AND_DIRNAME_PATHS) {
      expect(findModuleLevelVariables(readFileSync(join(SOURCE_ROOT, allowed), 'utf8')).length).toBeGreaterThan(0);
    }
  });

  it('declares interfaces and type aliases only in their role files, one per file', () => {
    const violations: string[] = [];
    for (const file of nonSpecTypeScriptFiles()) {
      const declarations = findTopLevelTypeDeclarations(readFileSync(file, 'utf8'));
      const isInterfaceFile = isRoleFile(file, 'interfaces', '.interface.ts');
      const isTypeFile = isRoleFile(file, 'types', '.type.ts');
      for (const declaration of declarations) {
        const isAllowed = (declaration.kind === 'interface' && isInterfaceFile) || (declaration.kind === 'type' && isTypeFile);
        if (!isAllowed) violations.push(`${relativeToSource(file)}: ${declaration.kind} ${declaration.name} is outside its role folder`);
      }
      if ((isInterfaceFile || isTypeFile) && declarations.length !== 1) {
        violations.push(`${relativeToSource(file)}: declares ${declarations.length} types, expected exactly 1`);
      }
    }
    expect(violations).toEqual([]);
  });
});
