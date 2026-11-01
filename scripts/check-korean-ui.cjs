/**
 * 전사 UI 한국어 전용 표기, 이모지 금지, 괄호 영문 금지 정적 검증 스크립트
 * 실행: node scripts/check-korean-ui.cjs
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'tests'].includes(entry.name)) {
        results = results.concat(walk(full));
      }
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{26A0}\u{2705}\u{274C}\u{2728}\u{26A1}\u{1F680}-\u{1F6FF}\u{FE0F}➔✓✕☑☐]/u;
const CSS_JS_FN_PREFIX = /(?<!\\)(?:url|var|calc|rgba?|hsla?|translate[XYZ3d]*|scale[XYZ3d]*|rotate[XYZ3d]*|skew[XY]?|matrix3d?|linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|cubic-bezier|drop-shadow|blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|minmax|fit-content|repeat|clamp|max|min|env|attr|counter|counters|not|is|where|has|nth-child|nth-of-type|contains|import|require|function|if|for|while|switch|catch|super|return|typeof|instanceof|void|delete|await|yield|SUM|COUNT|AVG|MIN|MAX|COALESCE|CAST|EXTRACT|DATE_TRUNC|NOW|RANDOM|gen_random_uuid|USING|CHECK)\s*$/i;
const PAREN_ALPHA_RE = /(\s*)\(([^()\n]*[A-Za-z][^()\n]*)\)/g;

const bannedPhrases = [
  'ERP DISPATCH ORDER',
  'RECEIPT OF PAYMENT',
  'SYSTEM EXCEPTION LOG',
  '[ASAP]',
  '교체(대차)',
  '대차(교체)',
];

const files = walk(path.join(__dirname, '..', 'src'));
const violations = [];

for (const file of files) {
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split(/\r?\n/);

  lines.forEach((line, idx) => {
    if (EMOJI_RE.test(line)) {
      violations.push(`${rel}:${idx + 1} [이모지 검출] "${line.trim().slice(0, 80)}"`);
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('{/*')) {
      return;
    }
    for (const phrase of bannedPhrases) {
      if (line.includes(phrase)) {
        violations.push(`${rel}:${idx + 1} [금지 표현] "${phrase}"`);
      }
    }
  });

  if (rel === 'src/services/dispatchOrderParser.ts') continue;

  const sf = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  function isExcludedContext(node) {
    let cur = node.parent;
    while (cur) {
      if (
        ts.isImportDeclaration(cur) ||
        ts.isExportDeclaration(cur) ||
        ts.isExternalModuleReference(cur) ||
        ts.isLiteralTypeNode(cur)
      ) {
        return true;
      }
      if (ts.isCallExpression(cur)) {
        const exprText = cur.expression.getText(sf);
        if (
          exprText === 'require' ||
          exprText === 'import' ||
          exprText.endsWith('.querySelector') ||
          exprText.endsWith('.querySelectorAll') ||
          exprText.endsWith('.matches') ||
          exprText.endsWith('.closest') ||
          exprText === 'RegExp'
        ) {
          return true;
        }
      }
      if (ts.isJsxAttribute(cur)) {
        const attrName = cur.name.getText(sf);
        if (
          attrName === 'className' ||
          attrName === 'd' ||
          attrName === 'viewBox' ||
          attrName === 'transform' ||
          attrName === 'fill' ||
          attrName === 'stroke' ||
          attrName === 'clipPath' ||
          attrName === 'filter' ||
          attrName === 'points' ||
          attrName === 'src' ||
          attrName === 'href' ||
          attrName === 'id' ||
          attrName === 'name' ||
          attrName === 'type' ||
          attrName === 'value' ||
          attrName === 'htmlFor' ||
          attrName === 'key' ||
          attrName.startsWith('data-') ||
          attrName.startsWith('aria-')
        ) {
          return true;
        }
      }
      cur = cur.parent;
    }
    return false;
  }

  function checkText(text, pos, isCodeLike) {
    if (/CREATE OR REPLACE FUNCTION|band_modal_scraper_hud/.test(text)) return;
    PAREN_ALPHA_RE.lastIndex = 0;
    let m;
    while ((m = PAREN_ALPHA_RE.exec(text)) !== null) {
      const leadingWs = m[1];
      const inner = m[2];
      const offset = m.index;
      const prefixSlice = text.slice(Math.max(0, offset - 40), offset) + leadingWs;
      if (CSS_JS_FN_PREFIX.test(prefixSlice)) continue;
      if (!isCodeLike && /^&[a-zA-Z]+;$/.test(inner.trim())) continue;
      if (isCodeLike) {
        if (/^\s*(?:string|number|boolean|any|void|unknown|never|object|Record|Array|Promise|Partial|Omit|Pick|React)\b/.test(inner)) continue;
        if (/=>/.test(inner)) continue;
      }
      const lineNum = sf.getLineAndCharacterOfPosition(pos).line + 1;
      violations.push(`${rel}:${lineNum} [괄호 영문 병기] "(${inner})"`);
    }
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      const raw = code.slice(node.getFullStart(), node.getEnd());
      checkText(raw, node.getStart(sf), false);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isExcludedContext(node)) {
        const raw = code.slice(node.getStart(sf) + 1, node.getEnd() - 1);
        const isSqlOrCss = /CREATE POLICY|SELECT |INSERT INTO|background:|linear-gradient|translate|rgba?\(|calc\(|var\(--/.test(raw);
        checkText(raw, node.getStart(sf), isSqlOrCss);
      }
    } else if (ts.isTemplateExpression(node)) {
      if (!isExcludedContext(node)) {
        const headRaw = code.slice(node.head.getStart(sf) + 1, node.head.getEnd() - 2);
        checkText(headRaw, node.head.getStart(sf), false);
        for (const span of node.templateSpans) {
          const lit = span.literal;
          const isTail = ts.isTemplateTail(lit);
          const inner = code.slice(lit.getStart(sf) + 1, lit.getEnd() - (isTail ? 1 : 2));
          checkText(inner, lit.getStart(sf), false);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
}

if (violations.length > 0) {
  console.error(`[UI 표기 검증 실패] 위반 ${violations.length}건 검출:`);
  violations.slice(0, 50).forEach(v => console.error('  -', v));
  if (violations.length > 50) {
    console.error(`  ... 외 ${violations.length - 50}건`);
  }
  process.exit(1);
} else {
  console.log(`[UI 표기 검증 통과] 검사 파일 ${files.length}개 내 이모지, 괄호 영문, 금지 표현 0건 확인 완료.`);
  process.exit(0);
}
