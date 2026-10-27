// ── Which web tests can a change affect? ─────────────────────────────
//
// The full suite runs in CI and in `make check-web`, and it stays the gate.
// This exists for the loop before that: an agent or a person iterating on one
// file was paying the whole suite, about two minutes, on every edit.
//
// A test is selected when the change could reach it in one of three ways:
//
//   1. It imports the changed file, directly or through anything it imports
//      (relative paths and the tsconfig.test.json / eddy-ios aliases).
//   2. It, or a local module it imports, names the changed file or one of its
//      directories in a string literal. Roughly a third of the suite reads
//      files instead of importing them (workflows, docs, eddy-ios manifests,
//      migrations), and import tracing alone would miss every one.
//   3. It is the changed file.
//
// Changes to the things every test depends on (manifests, lockfile, tsconfig)
// select everything. This errs toward running too much: a miss here is a
// regression that waits for CI, so the rules are deliberately broad.

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Web-relative files whose change can affect every test. */
export const RUN_EVERYTHING = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.test.json',
  '.npmrc',
  '../.nvmrc',
]);

/** Always selected: cheap, and the only check that a new test file is registered. */
export const ALWAYS_RUN = ['src/lib/trust/registered-tests.test.ts'];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json'];
const MODULE_PATTERNS = [
  /(?:^|[^\w.$])(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"\n]+)['"]/g,
  /(?:^|[^\w.$])import\s*['"]([^'"\n]+)['"]/g,
  /(?:^|[^\w.$])(?:import|require)\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];
const STRING_LITERAL = /(['"`])((?:(?!\1)[^\\\n$])+)\1/g;

export type Alias = { prefix: string; wildcard: boolean; targets: string[] };

/** tsconfig `paths` as absolute targets. */
export function aliasesFromPaths(paths: Record<string, string[]>, configDir: string): Alias[] {
  return Object.entries(paths).map(([key, targets]) => ({
    prefix: key.replace(/\*$/, ''),
    wildcard: key.endsWith('*'),
    targets: targets.map((t) => path.resolve(configDir, t.replace(/\*$/, ''))),
  }));
}

export function moduleSpecifiers(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of MODULE_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

/**
 * String literals that could name a path: anything with a slash, a filename
 * ('MapLayersSheet.tsx', for join(APP, 'src', 'components', ...)), or a bare
 * word that may be a directory a test walks ('src', 'app', 'migrations').
 * Bare words only count later if they resolve to a real directory.
 */
export function pathLiterals(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(STRING_LITERAL)) {
    const value = match[2];
    if (/\s/.test(value) || /^[a-z][\w+.-]*:/i.test(value)) continue;
    if (value.includes('/') || /\.\w{1,6}$/.test(value) || /^[\w-]{2,40}$/.test(value)) found.add(value);
  }
  return [...found];
}

/** Filenames too common to identify one file when named without a directory. */
export const GENERIC_BASENAMES = new Set([
  'index.ts', 'index.tsx', 'index.js', 'page.tsx', 'layout.tsx', 'route.ts', 'package.json',
  'package-lock.json', 'README.md', 'app.json', 'tsconfig.json', 'eas.json',
]);

function asFile(candidate: string): string | null {
  const tries = [candidate, ...SOURCE_EXTENSIONS.map((e) => candidate + e)];
  if (/\.(m|c)?js$/.test(candidate)) tries.push(candidate.replace(/\.(m|c)?js$/, '.ts'), candidate.replace(/\.(m|c)?js$/, '.tsx'));
  tries.push(...SOURCE_EXTENSIONS.map((e) => path.join(candidate, `index${e}`)));
  for (const t of tries) {
    try {
      if (statSync(t).isFile()) return t;
    } catch {
      // not this one
    }
  }
  return null;
}

export class ImportGraph {
  private readonly edges = new Map<string, { imports: string[]; literals: string[] }>();

  constructor(
    private readonly repoRoot: string,
    private readonly aliasesFor: (file: string) => Alias[],
  ) {}

  resolve(from: string, specifier: string): string | null {
    if (specifier.startsWith('.')) return asFile(path.resolve(path.dirname(from), specifier));
    for (const alias of this.aliasesFor(from)) {
      const matches = alias.wildcard ? specifier.startsWith(alias.prefix) : specifier === alias.prefix;
      if (!matches) continue;
      const rest = alias.wildcard ? specifier.slice(alias.prefix.length) : '';
      for (const target of alias.targets) {
        const file = asFile(alias.wildcard ? path.join(target, rest) : target);
        if (file) return file;
      }
    }
    return null; // a package from node_modules
  }

  private node(file: string) {
    let entry = this.edges.get(file);
    if (!entry) {
      let source = '';
      try {
        source = readFileSync(file, 'utf8');
      } catch {
        // deleted or unreadable: no edges
      }
      const isCode = /\.(m|c)?[jt]sx?$/.test(file);
      entry = {
        imports: isCode
          ? moduleSpecifiers(source)
              .map((s) => this.resolve(file, s))
              .filter((f): f is string => f !== null && !f.includes(`${path.sep}node_modules${path.sep}`))
          : [],
        literals: isCode ? pathLiterals(source) : [],
      };
      this.edges.set(file, entry);
    }
    return entry;
  }

  /** Every local file reachable from `entry` through imports, including itself. */
  reachable(entry: string): Set<string> {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      stack.push(...this.node(file).imports);
    }
    return seen;
  }

  private readonly directories = new Map<string, boolean>();

  isDirectory(candidate: string): boolean {
    let known = this.directories.get(candidate);
    if (known === undefined) {
      known = existsSync(candidate) && statSync(candidate).isDirectory();
      this.directories.set(candidate, known);
    }
    return known;
  }

  /**
   * What string literals in `files` could name. Each literal is resolved from
   * every root a test builds paths from (the web app, the repo, eddy-ios, and
   * the file's own directory); bare filenames are also kept by name.
   */
  namedPaths(files: Iterable<string>, bases: string[]): { paths: Set<string>; basenames: Set<string> } {
    const paths = new Set<string>();
    const basenames = new Set<string>();
    for (const file of files) {
      for (const literal of this.node(file).literals) {
        const bare = !literal.includes('/');
        if (bare && /\.\w{1,6}$/.test(literal) && !GENERIC_BASENAMES.has(literal)) basenames.add(literal);
        for (const base of [...bases, path.dirname(file)]) {
          const candidate = path.resolve(base, literal);
          // Too broad to mean anything: a root itself, or outside the repo.
          if (bases.includes(candidate) && candidate !== path.join(this.repoRoot, 'eddy-ios')) continue;
          if (!candidate.startsWith(this.repoRoot + path.sep)) continue;
          if (bare && !/\.\w{1,6}$/.test(literal) && !this.isDirectory(candidate)) continue;
          paths.add(candidate);
        }
      }
    }
    return { paths, basenames };
  }
}

function names(graph: ImportGraph, changed: string, named: { paths: Set<string>; basenames: Set<string> }): boolean {
  if (named.paths.has(changed) || named.basenames.has(path.basename(changed))) return true;
  // A directory prefix only counts when it is a directory: 'src/lib' yes, a
  // literal that happens to prefix a filename no.
  for (let dir = path.dirname(changed); dir.length > 1 && dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (named.paths.has(dir) && graph.isDirectory(dir)) return true;
  }
  return false;
}

export type Selection = { everything: boolean; tests: string[]; reasons: Map<string, string> };

/**
 * @param tests   web-relative test files (the registered list)
 * @param changed web-relative changed paths (`../` for files outside the web app)
 */
export function selectTests(options: {
  tests: string[];
  changed: string[];
  webRoot: string;
  graph: ImportGraph;
}): Selection {
  const { tests, changed, webRoot, graph } = options;
  const reasons = new Map<string, string>();
  const trigger = changed.find((c) => RUN_EVERYTHING.has(c));
  if (trigger) {
    for (const t of tests) reasons.set(t, `${trigger} changed`);
    return { everything: true, tests: [...tests], reasons };
  }

  const changedAbs = changed.map((c) => path.resolve(webRoot, c));
  const repoRoot = path.resolve(webRoot, '..');
  const bases = [webRoot, repoRoot, path.join(repoRoot, 'eddy-ios')];
  const isTest = /\.(test|spec)\.tsx?$/;
  for (const c of changed) {
    if (isTest.test(c) && !c.startsWith('../') && existsSync(path.resolve(webRoot, c))) reasons.set(c, 'changed');
  }
  for (const test of tests) {
    if (reasons.has(test)) continue;
    const reachable = graph.reachable(path.resolve(webRoot, test));
    const imported = changedAbs.find((c) => reachable.has(c));
    if (imported) {
      reasons.set(test, `imports ${path.relative(webRoot, imported)}`);
      continue;
    }
    const named = graph.namedPaths(reachable, bases);
    const read = changedAbs.find((c) => names(graph, c, named));
    if (read) reasons.set(test, `names ${path.relative(webRoot, read)}`);
  }
  for (const t of ALWAYS_RUN) if (!reasons.has(t)) reasons.set(t, 'always runs');
  return { everything: false, tests: [...reasons.keys()], reasons };
}

/** The import graph with this repo's aliases: tsconfig.test.json for the web app, eddy-ios's own '@/' for app files. */
export function repoGraph(webRoot: string): ImportGraph {
  const repoRoot = path.resolve(webRoot, '..');
  const testConfig = JSON.parse(readFileSync(path.join(webRoot, 'tsconfig.test.json'), 'utf8')) as {
    compilerOptions: { paths: Record<string, string[]> };
  };
  const web = aliasesFromPaths(testConfig.compilerOptions.paths, webRoot);
  const iosRoot = path.join(repoRoot, 'eddy-ios');
  const ios = [
    ...aliasesFromPaths({ '@/*': ['./src/*'] }, iosRoot),
    ...web.filter((a) => a.prefix.startsWith('@eddy/')),
  ];
  return new ImportGraph(repoRoot, (file) => (file.startsWith(iosRoot + path.sep) ? ios : web));
}

/**
 * Whether a package.json edit can affect every test. Registering a test edits
 * the `test` script and nothing else; that should not cost a full run, since
 * the new file is selected as changed and the registration guard always runs.
 */
export function manifestChangeMatters(before: string | null, after: string | null): boolean {
  if (before === null || after === null) return true;
  try {
    const strip = (raw: string) => {
      const json = JSON.parse(raw) as { scripts?: Record<string, string> };
      if (json.scripts) delete json.scripts.test;
      return JSON.stringify(json);
    };
    return strip(before) !== strip(after);
  } catch {
    return true;
  }
}

/** Test files named by the package.json scripts that run tests. */
export function registeredTests(packageJson: { scripts?: Record<string, string> }): string[] {
  const scripts = packageJson.scripts ?? {};
  const listed = [scripts.test ?? '', scripts['test:today'] ?? ''].join(' ');
  return [...new Set(listed.match(/[\w./-]+\.(?:test|spec)\.tsx?/g) ?? [])];
}
