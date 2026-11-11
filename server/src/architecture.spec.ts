import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SOURCE_ROOT = __dirname;
const CORE_ROOT = join(SOURCE_ROOT, 'core');
const THIS_FILE = join(SOURCE_ROOT, 'architecture.spec.ts');
const SHARED_CONSTANTS_FILE = join(SOURCE_ROOT, 'constants.ts');

const PURE_PACKAGES_ALLOWED_IN_CORE = new Set(['ajv', 'gray-matter']);

const PROCESS_SPAWNING_MODULES = new Set(['child_process', 'node:child_process']);

const FILES_ALLOWED_TO_SPAWN_PROCESSES = new Set<string>([]);

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') ? [fullPath] : [];
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
