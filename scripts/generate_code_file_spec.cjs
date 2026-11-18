// scripts/generate_code_file_spec.cjs
// eBroFL TypeScript AST 및 다중 언어 파서 기반 전사 코드 파일 명세서(SSOT) 생성 · 정합성 검증 · 영향도 조회 엔진
// 사용법:
//   node scripts/generate_code_file_spec.cjs            -> docs/CODE_FILE_SPECIFICATION.md & docs/code_file_manifest.json 생성
//   node scripts/generate_code_file_spec.cjs --verify   -> 디스크 실파일 vs 명세서/매니페스트 1:1 정합성 검증
//   node scripts/generate_code_file_spec.cjs --query X  -> 파일명/menuId/심볼/DB테이블/플래그 기반 의존성·영향도 즉시 조회

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const {
  PC_MOBILE_PAIRS,
  TRADE_RENTAL_PAIRS,
  MENU_ID_BY_FILE,
  FILE_DESCRIPTIONS,
} = require('./code_file_descriptions.cjs');

const ROOT = path.resolve(__dirname, '..');
const SPEC_MD_PATH = path.join(ROOT, 'docs', 'CODE_FILE_SPECIFICATION.md');
const MANIFEST_JSON_PATH = path.join(ROOT, 'docs', 'code_file_manifest.json');

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-ssr',
  'dist-construction-sites',
  '.git',
  '.vercel',
  'backups',
  'test-results',
  'scratch',
  'gemma-4-e4b-qlora-adapter',
  'llama-bin',
  'llama.cpp',
  '공공데이터포탈API',
  'audit_reports',
  '.impeccable',
  'manual_patches',
  'refactor_tools',
]);

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.cjs', '.mjs',
  '.css', '.html', '.sql', '.ps1', '.bat', '.cs', '.py',
]);

const INCLUDED_JSON = new Set([
  'package.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vercel.json',
  '.oxlintrc.json',
  'public/manifest.json',
  'agent/package.json',
  'agent/sea-config.json',
  'ebro-web-agent/manifest.json',
  'src/services/demo_golden_dataset.json',
]);

const HEAVY_EXTERNAL_PKGS = new Set([
  'xlsx',
  'exceljs',
  'pdf-lib',
  'pdfjs-dist',
  'jspdf',
  'html2canvas',
]);

const LAYERS = [
  { id: 'L01_ROOT_BUILD', title: '제3장. 루트 엔트리 · 빌드 · 설정 · 마스터 스키마 (L01)' },
  { id: 'L02_APP_SHELL', title: '제4장. 프론트엔드 앱 셸 · 전역 스타일 (L02)' },
  { id: 'L03_CORE_SHELL', title: '제5장. 코어 상태 컨텍스트 · 액션 게이트웨이 · 멀티테넌트 DB 프록시 (L03)' },
  { id: 'L04_TYPES_DATA_MANUAL', title: '제6장. 전사 도메인 타입 · 정적 제원/카탈로그 데이터 · 인앱 매뉴얼 레지스트리 (L04)' },
  { id: 'L05_PAGES', title: '제7장. 정규 28개 메뉴 도메인 페이지 스위트 (L05)' },
  { id: 'L06_COMPONENTS', title: '제8장. 공통 UI 프리미티브 · 레이아웃 셸 · 도메인 탭/모달 (L06)' },
  { id: 'L07_SERVICES_UTILS', title: '제9장. 도메인/재무제표 엔진 · 문서/OCR/국세청/에이전트 서비스 · 보안/검색 유틸리티 (L07)' },
  { id: 'L08_BACKEND_SQL_TEMPLATES', title: '제10장. 백엔드 서버리스 API · Edge Functions · SQL · 인쇄 양식 (L08)' },
  { id: 'L09_NATIVE_AGENTS_TOOLS', title: '제11장. 데스크톱 에이전트 · Python AI 코어 · 브라우저 확장 · 개발자 도구 (L09)' },
  { id: 'L10_TESTS_SCRIPTS', title: '제12장. 테스트(E2E·WTT·RWTT·보존법칙) · 마이그레이션 · DevOps 스크립트 (L10)' },
];

function classifyLayer(rel) {
  if (
    rel.startsWith('src/tests/') ||
    rel.startsWith('tests/') ||
    rel.startsWith('scripts/')
  ) {
    return 'L10_TESTS_SCRIPTS';
  }
  if (
    rel.startsWith('agent/') ||
    rel.startsWith('ebro-agent-core/') ||
    rel.startsWith('ebro-web-agent/') ||
    rel.startsWith('tools/')
  ) {
    return 'L09_NATIVE_AGENTS_TOOLS';
  }
  if (
    rel.startsWith('api/') ||
    rel.startsWith('supabase/') ||
    rel.startsWith('sql/') ||
    rel.startsWith('templates/')
  ) {
    return 'L08_BACKEND_SQL_TEMPLATES';
  }
  if (rel.startsWith('src/services/') || rel.startsWith('src/utils/')) {
    return 'L07_SERVICES_UTILS';
  }
  if (rel.startsWith('src/components/')) {
    return 'L06_COMPONENTS';
  }
  if (rel.startsWith('src/pages/')) {
    return 'L05_PAGES';
  }
  if (
    rel.startsWith('src/types/') ||
    rel.startsWith('src/data/') ||
    rel.startsWith('src/manual/')
  ) {
    return 'L04_TYPES_DATA_MANUAL';
  }
  if (rel.startsWith('src/core/') || rel.startsWith('src/lib/')) {
    return 'L03_CORE_SHELL';
  }
  if (
    rel === 'src/App.tsx' ||
    rel === 'src/main.tsx' ||
    rel === 'src/index.css' ||
    rel === 'src/tailwind_polyfill.css' ||
    rel.startsWith('src/styles/')
  ) {
    return 'L02_APP_SHELL';
  }
  return 'L01_ROOT_BUILD';
}

function walkActiveCodeFiles(dir = ROOT, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      if (rel === 'public/downloads' || rel === 'public/tenants') continue;
      if (rel === 'agent/bin' || rel === 'agent/core') continue;
      walkActiveCodeFiles(full, results);
    } else {
      if (rel === 'agent/agent-bundle.js' || rel === 'WTT_SQL.sql') continue;
      if (/^회사소개서_기연리프트_Draft.*\.html$/i.test(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTS.has(ext) || INCLUDED_JSON.has(rel)) {
        if (rel.startsWith('agent/certs/') && ext !== '.ps1') continue;
        results.push(rel);
      }
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function resolveImportTarget(fromRel, spec, fileSet) {
  if (!spec) {
    return null;
  }
  if (spec.startsWith('/src/')) {
    const rootRel = spec.replace(/^\/+/, '');
    if (fileSet.has(rootRel)) return rootRel;
  }
  if (!spec.startsWith('./') && !spec.startsWith('../')) {
    return null;
  }
  const baseDir = path.posix.dirname(fromRel);
  const joined = path.posix.normalize(path.posix.join(baseDir, spec));
  if (fileSet.has(joined)) return joined;

  const tryExts = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.css', '.json'];
  for (const ext of tryExts) {
    if (fileSet.has(joined + ext)) return joined + ext;
  }
  for (const ext of ['.ts', '.tsx', '.js', '.cjs', '.mjs']) {
    const idx = path.posix.join(joined, 'index' + ext);
    if (fileSet.has(idx)) return idx;
  }
  return null;
}

function parseTsJsMetadata(rel, content, ext, fileSet) {
  const kind =
    ext === '.tsx' ? ts.ScriptKind.TSX :
    ext === '.ts' ? ts.ScriptKind.TS :
    ts.ScriptKind.JS;
  const sf = ts.createSourceFile(rel, content, ts.ScriptTarget.Latest, true, kind);

  const exportsSet = new Set();
  const staticRuntimeSpecs = new Set();
  const typeOnlySpecs = new Set();
  const dynamicSpecs = new Set();
  const staticPageImportsInApp = new Set();
  const lazyPageImportsInApp = new Set();

  function recordSpec(targetSet, raw) {
    if (typeof raw === 'string' && raw.trim()) {
      targetSet.add(raw.trim());
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      const isTypeOnly = Boolean(
        clause && (
          clause.isTypeOnly ||
          (!clause.name &&
            clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((el) => el.isTypeOnly))
        )
      );
      recordSpec(isTypeOnly ? typeOnlySpecs : staticRuntimeSpecs, spec);
      if (rel === 'src/App.tsx' && !isTypeOnly) {
        const resolved = resolveImportTarget(rel, spec, fileSet);
        if (resolved && resolved.startsWith('src/pages/')) {
          staticPageImportsInApp.add(resolved);
        }
      }
    }

    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        recordSpec(node.isTypeOnly ? typeOnlySpecs : staticRuntimeSpecs, node.moduleSpecifier.text);
      }
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((el) => exportsSet.add(el.name.text));
      }
    }

    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = Boolean(mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    const isDefault = Boolean(mods && mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
    if (isExported) {
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node)) &&
        node.name
      ) {
        exportsSet.add(node.name.text);
      } else if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((d) => {
          if (ts.isIdentifier(d.name)) exportsSet.add(d.name.text);
        });
      } else if (isDefault) {
        exportsSet.add('default');
      }
    }
    if (ts.isExportAssignment(node)) {
      exportsSet.add('default');
    }

    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length >= 1) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          const spec = arg.text;
          recordSpec(dynamicSpecs, spec);
          if (rel === 'src/App.tsx') {
            const resolved = resolveImportTarget(rel, spec, fileSet);
            if (resolved && resolved.startsWith('src/pages/')) {
              lazyPageImportsInApp.add(resolved);
            }
          }
        }
      }
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'ssrLoadModule' &&
        node.arguments.length >= 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        recordSpec(dynamicSpecs, node.arguments[0].text);
      }
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length >= 1) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          recordSpec(staticRuntimeSpecs, arg.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);

  const cjsExportMatch = content.match(/module\.exports\s*=\s*\{([\s\S]{0,600}?)\}/);
  if (cjsExportMatch) {
    const keys = [...cjsExportMatch[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|:|\})/g)].map((m) => m[1]);
    keys.forEach((k) => exportsSet.add(k));
  }

  const staticRuntimeInternalSet = new Set();
  for (const spec of staticRuntimeSpecs) {
    const resolved = resolveImportTarget(rel, spec, fileSet);
    if (resolved && resolved !== rel) {
      staticRuntimeInternalSet.add(resolved);
    }
  }

  const internalImports = [];
  for (const spec of [...staticRuntimeSpecs, ...typeOnlySpecs, ...dynamicSpecs]) {
    const resolved = resolveImportTarget(rel, spec, fileSet);
    if (resolved && resolved !== rel && !internalImports.includes(resolved)) {
      internalImports.push(resolved);
    }
  }

  const dynamicImports = [];
  const externalDynamicLibs = [];
  for (const spec of dynamicSpecs) {
    if (!spec.startsWith('./') && !spec.startsWith('../') && !spec.startsWith('/src/')) {
      if (!externalDynamicLibs.includes(spec)) externalDynamicLibs.push(spec);
      continue;
    }
    const resolved = resolveImportTarget(rel, spec, fileSet);
    if (resolved && resolved !== rel && !staticRuntimeInternalSet.has(resolved) && !dynamicImports.includes(resolved)) {
      dynamicImports.push(resolved);
    }
  }

  const heavyStaticLibs = [];
  if (rel.startsWith('src/') && !rel.startsWith('src/tests/')) {
    for (const spec of staticRuntimeSpecs) {
      if (HEAVY_EXTERNAL_PKGS.has(spec) && !heavyStaticLibs.includes(spec)) {
        heavyStaticLibs.push(spec);
      }
    }
  }

  return {
    exports: Array.from(exportsSet),
    internalImports: internalImports.sort(),
    staticRuntimeImports: Array.from(staticRuntimeInternalSet).sort(),
    dynamicImports: dynamicImports.sort(),
    externalDynamicLibs: externalDynamicLibs.sort(),
    heavyStaticLibs: heavyStaticLibs.sort(),
    staticPageImportsInApp,
    lazyPageImportsInApp,
  };
}

function parsePythonMetadata(rel, content, fileSet) {
  const exportsList = [];
  for (const line of content.split(/\r?\n/)) {
    const mClass = line.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (mClass) exportsList.push(`class ${mClass[1]}`);
    const mDef = line.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (mDef && !mDef[1].startsWith('_')) exportsList.push(mDef[1]);
  }

  const internalImports = [];
  const baseDir = path.posix.dirname(rel);
  const pyModMatches = [
    ...content.matchAll(/^(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_.]*)/gm),
  ];
  for (const m of pyModMatches) {
    const modPath = m[1].replace(/\./g, '/') + '.py';
    const candidates = [
      path.posix.normalize(path.posix.join(baseDir, modPath)),
      path.posix.normalize(path.posix.join('ebro-agent-core', modPath)),
    ];
    for (const c of candidates) {
      if (fileSet.has(c) && c !== rel && !internalImports.includes(c)) {
        internalImports.push(c);
      }
    }
  }

  return {
    exports: exportsList.slice(0, 12),
    internalImports: internalImports.sort(),
  };
}

function parseSqlTables(content) {
  const tables = new Set();
  const re = /(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?|INSERT\s+INTO)\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    tables.add(m[1]);
  }
  return Array.from(tables).sort();
}

function normalizeFlTableName(raw) {
  if (!raw) return raw;
  if (raw.startsWith('fl_') || raw.startsWith('core_')) return raw;
  return `fl_${raw}`;
}

function normalizeCoreTableName(raw) {
  if (!raw) return raw;
  if (raw.startsWith('core_') || raw.startsWith('fl_')) return raw;
  return `core_${raw}`;
}

function extractDbTables(rel, content, ext) {
  if (ext === '.json') {
    return [];
  }
  if (ext === '.sql') {
    return parseSqlTables(content);
  }
  const tables = new Set();
  const fromRe = /([A-Za-z0-9_$.]*)\s*\.from\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(content)) !== null) {
    const clientExpr = m[1] || '';
    const tbl = m[2];
    if (clientExpr.endsWith('flSupabase')) {
      tables.add(normalizeFlTableName(tbl));
    } else if (clientExpr.endsWith('centralSupabase')) {
      tables.add(normalizeCoreTableName(tbl));
    } else {
      tables.add(tbl);
    }
  }
  const selectAllRe = /selectAllFlRows\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]/g;
  while ((m = selectAllRe.exec(content)) !== null) {
    tables.add(normalizeFlTableName(m[1]));
  }
  return Array.from(tables).sort();
}

function escapeMdCell(val) {
  return String(val || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildPcMobileLookup() {
  const map = new Map();
  for (const pair of PC_MOBILE_PAIRS) {
    for (const pcFile of pair.pc) {
      map.set(pcFile, { side: 'PC', domain: pair.domain, counterparts: pair.mobile });
    }
    for (const mobFile of pair.mobile) {
      map.set(mobFile, { side: 'MOBILE', domain: pair.domain, counterparts: pair.pc });
    }
  }
  return map;
}

function findCircularSrcDependencies(srcStaticAdj) {
  const indexMap = new Map();
  const lowlinkMap = new Map();
  const onStack = new Set();
  const stack = [];
  let nextIndex = 0;
  const circularNodes = new Set();

  function strongConnect(v) {
    indexMap.set(v, nextIndex);
    lowlinkMap.set(v, nextIndex);
    nextIndex += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of srcStaticAdj.get(v) || []) {
      if (!srcStaticAdj.has(w)) continue;
      if (!indexMap.has(w)) {
        strongConnect(w);
        lowlinkMap.set(v, Math.min(lowlinkMap.get(v), lowlinkMap.get(w)));
      } else if (onStack.has(w)) {
        lowlinkMap.set(v, Math.min(lowlinkMap.get(v), indexMap.get(w)));
      }
    }

    if (lowlinkMap.get(v) === indexMap.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      const hasSelfLoop = (srcStaticAdj.get(v) || []).includes(v);
      if (scc.length > 1 || hasSelfLoop) {
        scc.forEach((node) => circularNodes.add(node));
      }
    }
  }

  for (const v of srcStaticAdj.keys()) {
    if (!indexMap.has(v)) {
      strongConnect(v);
    }
  }
  return circularNodes;
}

function collectSpecData() {
  const relFiles = walkActiveCodeFiles();
  const fileSet = new Set(relFiles);
  const pcMobileMap = buildPcMobileLookup();

  let appEagerPages = new Set();
  let appLazyPages = new Set();
  const entries = [];
  const srcStaticAdj = new Map();

  for (const rel of relFiles) {
    const full = path.join(ROOT, rel);
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/).length;
    const bytes = Buffer.byteLength(content, 'utf8');
    const ext = path.extname(rel).toLowerCase();
    const layer = classifyLayer(rel);

    let exportsList = [];
    let internalImports = [];
    let dynamicImports = [];
    let externalDynamicLibs = [];
    let heavyStaticLibs = [];

    if (['.ts', '.tsx', '.js', '.cjs', '.mjs'].includes(ext)) {
      const meta = parseTsJsMetadata(rel, content, ext, fileSet);
      exportsList = meta.exports;
      internalImports = meta.internalImports;
      dynamicImports = meta.dynamicImports;
      externalDynamicLibs = meta.externalDynamicLibs;
      heavyStaticLibs = meta.heavyStaticLibs;
      if (rel.startsWith('src/')) {
        srcStaticAdj.set(
          rel,
          (meta.staticRuntimeImports || []).filter((t) => t.startsWith('src/'))
        );
      }
      if (rel === 'src/App.tsx') {
        appEagerPages = meta.staticPageImportsInApp;
        appLazyPages = meta.lazyPageImportsInApp;
      }
    } else if (ext === '.py') {
      const pyMeta = parsePythonMetadata(rel, content, fileSet);
      exportsList = pyMeta.exports;
      internalImports = pyMeta.internalImports;
    } else if (ext === '.html') {
      const assetRefs = [...content.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((m) => m[1]);
      for (const ref of assetRefs) {
        const clean = ref.replace(/^\//, '');
        const resolved = resolveImportTarget(rel, ref, fileSet) || (fileSet.has(clean) ? clean : null);
        if (resolved && !internalImports.includes(resolved)) internalImports.push(resolved);
      }
      internalImports.sort();
    } else if (ext === '.css') {
      const cssImports = [...content.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g)].map((m) => m[1]);
      for (const spec of cssImports) {
        const resolved = resolveImportTarget(rel, spec, fileSet);
        if (resolved && !internalImports.includes(resolved)) internalImports.push(resolved);
      }
      internalImports.sort();
    } else if (ext === '.bat' || ext === '.ps1') {
      const scriptRefs = [...content.matchAll(/(?:agent|scripts|tools|ebro-agent-core)[\\/][A-Za-z0-9_.\-가-힣]+/g)].map((m) => m[0].replace(/\\/g, '/'));
      for (const sr of scriptRefs) {
        if (fileSet.has(sr) && sr !== rel && !internalImports.includes(sr)) internalImports.push(sr);
      }
      internalImports.sort();
    }

    const dbTables = extractDbTables(rel, content, ext);
    const description = FILE_DESCRIPTIONS[rel] || '';
    const menuInfo = MENU_ID_BY_FILE[rel] || null;
    const pairInfo = pcMobileMap.get(rel) || null;

    entries.push({
      path: rel,
      layer,
      ext,
      lines,
      bytes,
      menuInfo,
      exports: exportsList,
      internalImports,
      dynamicImports,
      importedBy: [],
      fanOut: internalImports.length,
      dynamicFanOut: dynamicImports.length,
      fanIn: 0,
      externalDynamicLibs,
      heavyStaticLibs,
      dbTables,
      pcMobilePair: pairInfo,
      loadMode: null,
      optimizationFlags: [],
      description,
    });
  }

  const byPath = new Map(entries.map((e) => [e.path, e]));
  for (const e of entries) {
    for (const target of e.internalImports) {
      const targetEntry = byPath.get(target);
      if (targetEntry && !targetEntry.importedBy.includes(e.path)) {
        targetEntry.importedBy.push(e.path);
      }
    }
  }

  const circularSrcNodes = findCircularSrcDependencies(srcStaticAdj);

  const NON_ORPHAN_ENTRIES = new Set([
    'src/main.tsx',
    'src/App.tsx',
  ]);

  for (const e of entries) {
    e.importedBy.sort();
    e.fanIn = e.importedBy.length;

    if (e.path.startsWith('src/pages/')) {
      if (appLazyPages.has(e.path)) e.loadMode = 'lazy';
      else if (appEagerPages.has(e.path)) e.loadMode = 'eager';
    }

    const flags = [];
    if (e.lines >= 1500 || e.bytes >= 81920) {
      flags.push('GOD_FILE');
    } else if (e.lines >= 800) {
      flags.push('LARGE_FILE');
    }
    if (e.fanIn >= 8) {
      flags.push('HIGH_COUPLING_HUB');
    }
    if (e.loadMode === 'eager') {
      flags.push('EAGER_ROUTE_IMPORT');
    }
    if (e.heavyStaticLibs.length > 0) {
      flags.push('HEAVY_STATIC_LIB');
    }
    if (circularSrcNodes.has(e.path)) {
      flags.push('CIRCULAR_DEP');
    }
    if (
      e.path.startsWith('src/') &&
      !NON_ORPHAN_ENTRIES.has(e.path) &&
      !e.path.startsWith('src/tests/') &&
      !e.path.startsWith('src/scripts/') &&
      e.fanIn === 0
    ) {
      flags.push('ORPHAN_CANDIDATE');
    }
    e.optimizationFlags = flags;
  }

  return entries;
}

function renderMarkdownSpec(entries) {
  const totalLines = entries.reduce((acc, e) => acc + e.lines, 0);
  const totalBytes = entries.reduce((acc, e) => acc + e.bytes, 0);
  const godFiles = entries.filter((e) => e.optimizationFlags.includes('GOD_FILE')).sort((a, b) => b.lines - a.lines);
  const largeFiles = entries.filter((e) => e.optimizationFlags.includes('LARGE_FILE')).sort((a, b) => b.lines - a.lines);
  const srcNonDataLargeFiles = entries.filter(
    (e) =>
      e.path.startsWith('src/') &&
      !e.path.startsWith('src/data/') &&
      (e.lines >= 800 || e.optimizationFlags.includes('GOD_FILE') || e.optimizationFlags.includes('LARGE_FILE'))
  );
  const hubFiles = entries.filter((e) => e.optimizationFlags.includes('HIGH_COUPLING_HUB')).sort((a, b) => b.fanIn - a.fanIn);
  const eagerFiles = entries.filter((e) => e.optimizationFlags.includes('EAGER_ROUTE_IMPORT')).sort((a, b) => b.lines - a.lines);
  const orphanFiles = entries.filter((e) => e.optimizationFlags.includes('ORPHAN_CANDIDATE')).sort((a, b) => b.lines - a.lines);
  const circularFiles = entries.filter((e) => e.optimizationFlags.includes('CIRCULAR_DEP')).sort((a, b) => b.lines - a.lines);
  const dynamicHostFiles = entries
    .filter((e) => e.dynamicFanOut > 0 || (e.externalDynamicLibs && e.externalDynamicLibs.length > 0))
    .sort((a, b) => (b.dynamicFanOut + (b.externalDynamicLibs?.length || 0)) - (a.dynamicFanOut + (a.externalDynamicLibs?.length || 0)) || b.lines - a.lines);
  const totalDynamicInternalEdges = dynamicHostFiles.reduce((acc, e) => acc + e.dynamicFanOut, 0);
  const totalDynamicExternalEdges = dynamicHostFiles.reduce((acc, e) => acc + (e.externalDynamicLibs?.length || 0), 0);
  const heavyStaticFiles = entries
    .filter((e) => e.optimizationFlags.includes('HEAVY_STATIC_LIB'))
    .sort((a, b) => b.lines - a.lines);

  const byLayer = new Map(LAYERS.map((l) => [l.id, []]));
  for (const e of entries) {
    byLayer.get(e.layer).push(e);
  }

  const lines = [];
  lines.push('# eBroFL 전사 코드 파일 및 파일별 기능 명세서 (SSOT)');
  lines.push('');
  lines.push('> **대상 프로젝트**: `fl-bero` (`ebro_fl` v2.2 — 지게차 수입·유통·렌탈·재무회계 통합 ERP)');
  lines.push('> **역할**: 전사 소스코드 전체 파일 목록, 기능 명세, AST 의존성(`Imports`/`Fan-In`), DB 테이블 매핑, 기능 대칭 쌍 및 최적화 지표 단일 진실의 원천(SSOT)');
  lines.push('> **생성·검증 엔진**: `scripts/generate_code_file_spec.cjs` + `scripts/code_file_descriptions.cjs`');
  lines.push('> **조회·동기화 명령**: `npm run spec:query -- <검색어>` · `npm run spec:sync` · `npm run spec:verify`');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 제1장. 명세 개요 · 통계 요약 · 계층 목차');
  lines.push('');
  lines.push('### 1.1 전체 코드베이스 정량 요약');
  lines.push('');
  lines.push('| 항목 | 집계 수치 | 설명 |');
  lines.push('|:---|---:|:---|');
  lines.push(`| 총 활성 코드 파일 수 | ${entries.length}개 | 빌드 산출물(dist), 외부 모델, node_modules 제외 전수 스캔 |`);
  lines.push(`| 총 소스 라인 / 용량 | ${totalLines.toLocaleString()}줄 / ${(totalBytes / 1024 / 1024).toFixed(2)} MB | AST 및 다중 언어 파서 기준 실측 |`);
  lines.push(`| 초대형 모듈 (GOD_FILE) | ${godFiles.length}개 | 1,500줄 이상 또는 80KB 초과 분할 우선 대상 |`);
  lines.push(`| 대형 모듈 (LARGE_FILE) | ${largeFiles.length}개 | 800줄~1,499줄 비대화 주의 대상 |`);
  lines.push(`| src/ 비데이터 대형 모듈 (SRC_LARGE_FILE) | ${srcNonDataLargeFiles.length}개 | src/ 하위(src/data 정적 데이터 제외) 800줄 이상 모듈 |`);
  lines.push(`| 고결합 핵심 허브 (HIGH_COUPLING_HUB) | ${hubFiles.length}개 | 역참조(Fan-In) 8개 이상 공유 모듈 |`);
  lines.push(`| 정적 라우트 임포트 (EAGER_ROUTE_IMPORT) | ${eagerFiles.length}개 | App.tsx 내 React.lazy 미적용 페이지 모듈 |`);
  lines.push(`| 동적 코드 스플리팅 호스트 | ${dynamicHostFiles.length}개 | 내부 동적 임포트 ${totalDynamicInternalEdges}건 · 외부 동적 패키지 임포트 ${totalDynamicExternalEdges}건 |`);
  lines.push(`| 중량 패키지 정적 임포트 (HEAVY_STATIC_LIB) | ${heavyStaticFiles.length}개 | src/ 하위 xlsx·exceljs·pdf 런타임 정적 결합 모듈 |`);
  lines.push(`| 정적 런타임 순환 참조 (CIRCULAR_DEP) | ${circularFiles.length}개 | src/ 정적 런타임 의존성 SCC 순환 탐지 대상 |`);
  lines.push(`| 미참조 후보 (ORPHAN_CANDIDATE) | ${orphanFiles.length}개 | src/ 하위 비엔트리·비테스트 파일 중 Fan-In 0건 |`);
  lines.push(`| 유통↔렌탈 기능 대칭 도메인 | ${TRADE_RENTAL_PAIRS.length}쌍 | 단일 반응형 셸(별도 모바일 트리 없음 · 유통/렌탈 대칭 모듈) |`);
  lines.push('');
  lines.push('### 1.2 CLI 사용 및 에이전트 활용 절차');
  lines.push('');
  lines.push('1. **수정 전 영향도 조회**: `npm run spec:query -- <파일명|메뉴ID|심볼|테이블>` 실행으로 수정 대상, 역참조(`importedBy`) 목록 및 DB 테이블 즉시 특정.');
  lines.push('2. **수정 후 명세 동기화**: 파일 추가·분할·삭제·역할 변경 직후 `scripts/code_file_descriptions.cjs` 보완 후 `npm run spec:sync` 실행.');
  lines.push('3. **무결성 검증 게이트**: 커밋 또는 완료 보고 전 `npm run spec:verify` 실행(`exit code 0` 필수).');
  lines.push('');
  lines.push('### 1.3 계층별 파일 수 및 문서 목차');
  lines.push('');
  lines.push('| 계층 코드 | 계층명 | 파일 수 | 시작 라인 |');
  lines.push('|:---|:---|---:|:---|');
  lines.push('| L00_RADAR | 제2장. 코드 수정 · 최적화 레이더 | - | __LINE_RADAR__ |');
  for (const layer of LAYERS) {
    const count = byLayer.get(layer.id).length;
    lines.push(`| ${layer.id} | ${layer.title} | ${count}개 | __LINE_${layer.id}__ |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 제2장. 코드 수정 · 최적화 레이더');
  lines.push('');
  lines.push('### 2.1 비대 모듈 분할 우선 후보 (`GOD_FILE` 상위 35개)');
  lines.push('');
  if (godFiles.length === 0) {
    lines.push('- 해당 없음');
  } else {
    lines.push('| 순위 | 파일 경로 | 줄수 | 용량(KB) | Fan-In | 메뉴ID / 구분 | 핵심 기능 요약 |');
    lines.push('|---:|:---|---:|---:|---:|:---|:---|');
    godFiles.slice(0, 35).forEach((e, idx) => {
      lines.push(
        `| ${idx + 1} | \`${e.path}\` | ${e.lines.toLocaleString()} | ${(e.bytes / 1024).toFixed(1)} | ${e.fanIn} | ${escapeMdCell(e.menuInfo || e.layer)} | ${escapeMdCell(e.description)} |`
      );
    });
  }
  lines.push('');
  lines.push('### 2.2 고결합 핵심 허브 (`HIGH_COUPLING_HUB` — 수정 시 역참조 연쇄 검증 필수)');
  lines.push('');
  if (hubFiles.length === 0) {
    lines.push('- 해당 없음');
  } else {
    lines.push('| 순위 | 파일 경로 | Fan-In (피참조 수) | Outbound | 줄수 | 주요 Export | 핵심 역할 |');
    lines.push('|---:|:---|---:|---:|---:|:---|:---|');
    hubFiles.slice(0, 35).forEach((e, idx) => {
      const exps = e.exports.slice(0, 5).join(', ') || '-';
      lines.push(
        `| ${idx + 1} | \`${e.path}\` | ${e.fanIn} | ${e.fanOut} | ${e.lines.toLocaleString()} | \`${escapeMdCell(exps)}\` | ${escapeMdCell(e.description)} |`
      );
    });
  }
  lines.push('');
  lines.push('### 2.3 유통 ↔ 렌탈 기능 대칭 쌍 매핑 (단일 반응형 셸 기준)');
  lines.push('');
  lines.push('> 참고: `eBroFL` v2는 별도 `src/mobile/` 트리 없이 `ShellLayout.tsx`와 `UiPrimitives.tsx` 기반 단일 반응형 셸로 PC·모바일 화면을 통합 운용합니다.');
  lines.push('');
  lines.push('| 번호 | 업무 도메인 | 유통 구현 파일 | 렌탈 대응 파일 |');
  lines.push('|---:|:---|:---|:---|');
  TRADE_RENTAL_PAIRS.forEach((pair, idx) => {
    const trCol = pair.trade.map((p) => `\`${p}\``).join('<br>');
    const rnCol = pair.rental.map((m) => `\`${m}\``).join('<br>');
    lines.push(`| ${idx + 1} | ${escapeMdCell(pair.domain)} | ${trCol} | ${rnCol} |`);
  });
  lines.push('');
  lines.push('### 2.4 정적 라우트 임포트(`EAGER_ROUTE_IMPORT`) 및 미참조 후보(`ORPHAN_CANDIDATE`)');
  lines.push('');
  lines.push('#### 2.4.1 `App.tsx` 정적 임포트 페이지 (`React.lazy()` 코드 스플리팅 전환 후보)');
  lines.push('');
  if (eagerFiles.length === 0) {
    lines.push('- 해당 없음 (전 페이지 지연 로딩 적용 완료)');
  } else {
    lines.push('| 파일 경로 | 줄수 | 용량(KB) | 메뉴ID | 기능 명세 |');
    lines.push('|:---|---:|---:|:---|:---|');
    eagerFiles.forEach((e) => {
      lines.push(
        `| \`${e.path}\` | ${e.lines.toLocaleString()} | ${(e.bytes / 1024).toFixed(1)} | ${escapeMdCell(e.menuInfo || '-')} | ${escapeMdCell(e.description)} |`
      );
    });
  }
  lines.push('');
  lines.push('#### 2.4.2 `src/` 하위 미참조 후보 (`ORPHAN_CANDIDATE` — Fan-In 0건 점검 대상)');
  lines.push('');
  if (orphanFiles.length === 0) {
    lines.push('- 해당 없음');
  } else {
    lines.push('| 파일 경로 | 계층 | 줄수 | 용량(KB) | 비고 (기능 명세) |');
    lines.push('|:---|:---|---:|---:|:---|');
    orphanFiles.forEach((e) => {
      lines.push(
        `| \`${e.path}\` | ${e.layer} | ${e.lines.toLocaleString()} | ${(e.bytes / 1024).toFixed(1)} | ${escapeMdCell(e.description)} |`
      );
    });
  }
  lines.push('');
  lines.push('### 2.5 동적 코드 스플리팅 및 중량 라이브러리 격리 현황');
  lines.push('');
  lines.push('#### 2.5.1 동적 청크 분리 호스트 모듈 (내부 Lazy · 외부 온디맨드 패키지)');
  lines.push('');
  if (dynamicHostFiles.length === 0) {
    lines.push('- 해당 없음');
  } else {
    lines.push('| 파일 경로 | 총 Out | 내부 동적 | 외부 동적 패키지 | 핵심 역할 |');
    lines.push('|:---|---:|---:|:---|:---|');
    dynamicHostFiles.slice(0, 30).forEach((e) => {
      const extDyn = (e.externalDynamicLibs && e.externalDynamicLibs.length > 0) ? `\`${e.externalDynamicLibs.join(', ')}\`` : '-';
      lines.push(
        `| \`${e.path}\` | ${e.fanOut} | ${e.dynamicFanOut} | ${escapeMdCell(extDyn)} | ${escapeMdCell(e.description)} |`
      );
    });
  }
  lines.push('');
  lines.push('#### 2.5.2 잔여 중량 패키지 정적 결합 모듈 (`HEAVY_STATIC_LIB`)');
  lines.push('');
  if (heavyStaticFiles.length === 0) {
    lines.push('- 해당 없음 (전 런타임 화면·모달 동적 격리 완료)');
  } else {
    lines.push('| 파일 경로 | 정적 중량 패키지 | 줄수 | 비고 (기능 명세) |');
    lines.push('|:---|:---|---:|:---|');
    heavyStaticFiles.forEach((e) => {
      lines.push(
        `| \`${e.path}\` | \`${e.heavyStaticLibs.join(', ')}\` | ${e.lines.toLocaleString()} | ${escapeMdCell(e.description)} |`
      );
    });
  }
  lines.push('');
  lines.push('#### 2.5.3 정적 런타임 순환 참조 (`CIRCULAR_DEP`)');
  lines.push('');
  if (circularFiles.length === 0) {
    lines.push('- 해당 없음 (정적 런타임 순환 참조 0건)');
  } else {
    lines.push('| 파일 경로 | 계층 | 정방향 Out | Fan-In | 비고 (기능 명세) |');
    lines.push('|:---|:---|---:|---:|:---|');
    circularFiles.forEach((e) => {
      lines.push(
        `| \`${e.path}\` | ${e.layer} | ${e.fanOut} | ${e.fanIn} | ${escapeMdCell(e.description)} |`
      );
    });
  }
  lines.push('');
  lines.push('---');

  for (const layer of LAYERS) {
    const list = byLayer.get(layer.id);
    lines.push('');
    lines.push(`## ${layer.title} — ${list.length}개 파일`);
    lines.push('');
    lines.push('| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |');
    lines.push('|:---|---:|:---|:---|:---|:---|');
    for (const e of list) {
      const sizeStr = `${e.lines.toLocaleString()}줄 (${(e.bytes / 1024).toFixed(1)}KB)`;
      const metaTags = [];
      if (e.menuInfo) metaTags.push(e.menuInfo);
      if (e.pcMobilePair) metaTags.push(`대칭:${e.pcMobilePair.domain}`);
      if (e.loadMode) metaTags.push(`load:${e.loadMode}`);
      if (e.optimizationFlags.length > 0) metaTags.push(e.optimizationFlags.join(', '));
      const metaStr = metaTags.join(' / ') || '-';

      const expStr = e.exports.length > 0 ? e.exports.slice(0, 6).join(', ') + (e.exports.length > 6 ? ` 외 ${e.exports.length - 6}` : '') : '-';
      const outLabel = e.dynamicFanOut > 0 ? `Out:${e.fanOut}(동적${e.dynamicFanOut})` : `Out:${e.fanOut}`;
      const depParts = [`${outLabel} / In:${e.fanIn}`];
      if (e.externalDynamicLibs && e.externalDynamicLibs.length > 0) {
        depParts.push('동적패키지:' + e.externalDynamicLibs.join(','));
      }
      if (e.dbTables.length > 0) {
        depParts.push('DB:' + e.dbTables.slice(0, 4).join(',') + (e.dbTables.length > 4 ? `(+${e.dbTables.length - 4})` : ''));
      }
      const depStr = depParts.join(' · ');

      lines.push(
        `| \`${e.path}\` | ${sizeStr} | ${escapeMdCell(metaStr)} | \`${escapeMdCell(expStr)}\` | ${escapeMdCell(depStr)} | ${escapeMdCell(e.description || '[미기재]')} |`
      );
    }
  }

  lines.push('');

  const headingLineMap = new Map();
  lines.forEach((line, idx) => {
    if (line === '## 제2장. 코드 수정 · 최적화 레이더') {
      headingLineMap.set('__LINE_RADAR__', `L${idx + 1}`);
    }
    for (const layer of LAYERS) {
      if (line.startsWith(`## ${layer.title}`)) {
        headingLineMap.set(`__LINE_${layer.id}__`, `L${idx + 1}`);
      }
    }
  });

  const finalText = lines
    .map((line) => {
      let out = line;
      for (const [token, lineRef] of headingLineMap.entries()) {
        if (out.includes(token)) {
          out = out.replace(token, lineRef);
        }
      }
      return out;
    })
    .join('\n');

  return finalText;
}

function buildManifestObject(entries) {
  const summaryByLayer = {};
  for (const l of LAYERS) summaryByLayer[l.id] = 0;
  for (const e of entries) summaryByLayer[e.layer] = (summaryByLayer[e.layer] || 0) + 1;

  return {
    schemaVersion: '1.1.0',
    project: 'ebro_fl',
    totalFiles: entries.length,
    totalLines: entries.reduce((a, b) => a + b.lines, 0),
    totalBytes: entries.reduce((a, b) => a + b.bytes, 0),
    layers: LAYERS,
    summaryByLayer,
    pcMobilePairs: PC_MOBILE_PAIRS,
    tradeRentalPairs: TRADE_RENTAL_PAIRS,
    files: entries,
  };
}

function runSync() {
  const entries = collectSpecData();
  const missingDesc = entries.filter((e) => !e.description);
  const md = renderMarkdownSpec(entries);
  const manifest = buildManifestObject(entries);

  fs.mkdirSync(path.dirname(SPEC_MD_PATH), { recursive: true });
  fs.writeFileSync(SPEC_MD_PATH, md, 'utf8');
  fs.writeFileSync(MANIFEST_JSON_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`✅ [spec:sync] 완료: 총 ${entries.length}개 코드 파일, ${manifest.totalLines.toLocaleString()}줄 명세 생성`);
  console.log(`   - ${path.relative(ROOT, SPEC_MD_PATH).replace(/\\/g, '/')}`);
  console.log(`   - ${path.relative(ROOT, MANIFEST_JSON_PATH).replace(/\\/g, '/')}`);

  if (missingDesc.length > 0) {
    console.warn(`⚠️ 기능 명세 미기재 파일 ${missingDesc.length}건 발견 (scripts/code_file_descriptions.cjs 보완 필요):`);
    missingDesc.slice(0, 30).forEach((m) => console.warn(`   - ${m.path}`));
  } else {
    console.log('✅ 기능 명세 미기재 파일: 0건 (100% 완결)');
  }
}

function runVerify() {
  if (!fs.existsSync(SPEC_MD_PATH) || !fs.existsSync(MANIFEST_JSON_PATH)) {
    console.error('❌ [spec:verify 실패] 명세 파일 또는 매니페스트 JSON이 존재하지 않습니다. `npm run spec:sync`를 먼저 실행하십시오.');
    process.exit(1);
  }

  const currentEntries = collectSpecData();
  const savedManifest = JSON.parse(fs.readFileSync(MANIFEST_JSON_PATH, 'utf8'));
  const savedMd = fs.readFileSync(SPEC_MD_PATH, 'utf8');
  const expectedMd = renderMarkdownSpec(currentEntries);

  const errors = [];
  const missingDesc = currentEntries.filter((e) => !e.description || e.description.includes('[미기재]'));
  if (missingDesc.length > 0) {
    errors.push(`기능 명세 미기재 파일 ${missingDesc.length}건: ${missingDesc.slice(0, 10).map((x) => x.path).join(', ')}`);
  }

  const circularInSrc = currentEntries.filter((e) => e.path.startsWith('src/') && e.optimizationFlags.includes('CIRCULAR_DEP'));
  if (circularInSrc.length > 0) {
    errors.push(`정적 런타임 순환 참조 ${circularInSrc.length}건 적발: ${circularInSrc.slice(0, 10).map((x) => x.path).join(', ')}`);
  }

  const curMap = new Map(currentEntries.map((e) => [e.path, e]));
  const savedMap = new Map((savedManifest.files || []).map((e) => [e.path, e]));

  for (const p of curMap.keys()) {
    if (!savedMap.has(p)) errors.push(`매니페스트 누락 파일: ${p}`);
  }
  for (const p of savedMap.keys()) {
    if (!curMap.has(p)) errors.push(`삭제된 유령 파일 잔존: ${p}`);
  }

  for (const [p, cur] of curMap.entries()) {
    const old = savedMap.get(p);
    if (!old) continue;
    if (old.lines !== cur.lines || old.bytes !== cur.bytes || old.fanIn !== cur.fanIn || old.fanOut !== cur.fanOut || (old.dynamicFanOut || 0) !== (cur.dynamicFanOut || 0)) {
      errors.push(`파일 메트릭/의존성 불일치: ${p} (저장=${old.lines}줄/in:${old.fanIn}/dyn:${old.dynamicFanOut || 0}, 현재=${cur.lines}줄/in:${cur.fanIn}/dyn:${cur.dynamicFanOut || 0})`);
    }
  }

  if (savedMd !== expectedMd) {
    errors.push('docs/CODE_FILE_SPECIFICATION.md 내용이 최신 코드 상태와 일치하지 않습니다.');
  }

  if (errors.length > 0) {
    console.error(`❌ [spec:verify 불합격] 정합성 오류 ${errors.length}건 적발:`);
    errors.slice(0, 25).forEach((err) => console.error(`  - ${err}`));
    if (errors.length > 25) console.error(`  ... 외 ${errors.length - 25}건`);
    console.error('👉 `npm run spec:sync`로 명세를 동기화하십시오.');
    process.exit(1);
  }

  console.log(`✅ [spec:verify 통과] 활성 코드 파일 ${currentEntries.length}개 · 미기재 0건 · AST 의존성/명세서 100% 일치 확인`);
}

function runQuery(term) {
  if (!term) {
    console.error('사용법: npm run spec:query -- <검색어(파일경로/menuId/Export심볼/DB테이블/플래그)>');
    process.exit(1);
  }
  const manifest = fs.existsSync(MANIFEST_JSON_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_JSON_PATH, 'utf8'))
    : buildManifestObject(collectSpecData());

  const q = term.trim().toLowerCase();
  const matches = (manifest.files || []).filter((f) => {
    if (f.path.toLowerCase().includes(q)) return true;
    if (f.menuInfo && f.menuInfo.toLowerCase().includes(q)) return true;
    if (f.description && f.description.toLowerCase().includes(q)) return true;
    if ((f.exports || []).some((ex) => ex.toLowerCase().includes(q))) return true;
    if ((f.dbTables || []).some((tb) => tb.toLowerCase().includes(q))) return true;
    if ((f.optimizationFlags || []).some((fl) => fl.toLowerCase() === q)) return true;
    return false;
  });

  if (matches.length === 0) {
    console.log(`🔍 검색어 "${term}" 일치 항목 0건`);
    return;
  }

  console.log(`🔍 검색어 "${term}" 일치 파일 ${matches.length}건:`);
  matches.slice(0, 20).forEach((f, idx) => {
    console.log('');
    console.log(`[${idx + 1}] ${f.path}`);
    console.log(`  - 계층/규모: ${f.layer} | ${f.lines.toLocaleString()}줄 (${(f.bytes / 1024).toFixed(1)} KB)`);
    if (f.menuInfo) console.log(`  - 메뉴 매핑: ${f.menuInfo}`);
    console.log(`  - 기능 명세: ${f.description}`);
    console.log(`  - 주요 Export (${f.exports.length}): ${f.exports.slice(0, 12).join(', ') || '-'}`);
    console.log(`  - 정방향 Imports (${f.fanOut}${f.dynamicFanOut ? `, 동적 ${f.dynamicFanOut}` : ''}): ${f.internalImports.join(', ') || '-'}`);
    if (f.dynamicImports && f.dynamicImports.length > 0) {
      console.log(`  - 내부 동적/Lazy Imports (${f.dynamicImports.length}): ${f.dynamicImports.join(', ')}`);
    }
    if (f.externalDynamicLibs && f.externalDynamicLibs.length > 0) {
      console.log(`  - 외부 온디맨드 패키지 (${f.externalDynamicLibs.length}): ${f.externalDynamicLibs.join(', ')}`);
    }
    if (f.heavyStaticLibs && f.heavyStaticLibs.length > 0) {
      console.log(`  - 정적 중량 패키지 (${f.heavyStaticLibs.length}): ${f.heavyStaticLibs.join(', ')}`);
    }
    console.log(`  - 역방향 ImportedBy / Fan-In (${f.fanIn}): ${f.importedBy.join(', ') || '-'}`);
    if (f.pcMobilePair) {
      console.log(`  - PC↔모바일 대칭 (${f.pcMobilePair.domain} / ${f.pcMobilePair.side}): 대응 파일 = ${f.pcMobilePair.counterparts.join(', ')}`);
    }
    if (f.dbTables && f.dbTables.length > 0) {
      console.log(`  - 접근 DB 테이블: ${f.dbTables.join(', ')}`);
    }
    if (f.optimizationFlags && f.optimizationFlags.length > 0) {
      console.log(`  - 최적화 시그널: ${f.optimizationFlags.join(', ')}`);
    }
  });
  if (matches.length > 20) {
    console.log(`\n... 외 ${matches.length - 20}건 (검색어를 구체화하여 조회 가능)`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--verify')) {
  runVerify();
} else if (args.includes('--query')) {
  const qIdx = args.indexOf('--query');
  const term = args.slice(qIdx + 1).join(' ');
  runQuery(term);
} else {
  runSync();
}
