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

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{26A0}\u{2705}\u{274C}\u{2728}\u{26A1}\u{1F680}-\u{1F6FF}\u{FE0F}➔✓✕☑☐★]/u;
const CSS_JS_FN_PREFIX = /(?<!\\)(?:url|var|calc|rgba?|hsla?|translate[XYZ3d]*|scale[XYZ3d]*|rotate[XYZ3d]*|skew[XY]?|matrix3d?|linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|cubic-bezier|drop-shadow|blur|brightness|contrast|grayscale|hue-rotate|invert|opacity|saturate|sepia|minmax|fit-content|repeat|clamp|max|min|env|attr|counter|counters|not|is|where|has|nth-child|nth-of-type|contains|import|require|function|if|for|while|switch|catch|super|return|typeof|instanceof|void|delete|await|yield|SUM|COUNT|AVG|MIN|MAX|COALESCE|CAST|EXTRACT|DATE_TRUNC|NOW|RANDOM|gen_random_uuid|USING|CHECK)\s*$/i;
const PAREN_ALPHA_RE = /(\s*)\(([^()\n]*[A-Za-z][^()\n]*)\)/g;

const bannedPhrases = [
  'ERP DISPATCH ORDER',
  'RECEIPT OF PAYMENT',
  'SYSTEM EXCEPTION LOG',
  '[ASAP]',
  '교체(대차)',
  '대차(교체)',
  '스마트',
  '실시간',
  '원클릭',
  '올인원',
  '강력한',
  '완벽한',
  '혁신적인',
  '자동화된',
  '최적화된',
  '초고속',
  '비주얼',
  '맞교환',
  '스왑',
  '대차교체',
];

const EXCLUDED_PHRASE_FILES = new Set([
  'src/data/accountingStandardsData.ts',
  'src/lib/supabasePrefixProxy.ts',
  'src/utils/cryptoVault.ts',
]);

const bannedKpiCardMarkers = [
  'data-mid="trade_profitability-kpi"',
  'data-mid="customer-kpi-summary"',
  'data-mid="waiver-kpi-summary"',
  'data-mid="asset-kpi-summary"',
  'data-mid="cash_flow-kpi"',
  'data-mid="asset-category-summary-strip"',
  'data-mid="smart_return-summary"',
  'data-mid="leave-inspection-summary"',
  'KPI 요약 카드',
  'KPI 요약 바',
  '상단 요약 카드',
  '핵심 요약 지표 카드',
  '2x2 KPI 요약 그리드',
  '상단 2x2 핵심 KPI 그리드',
];

const RAW_ENUM_PROP_RE =
  /\.(?:status|lineStatus|settlementStatus|payableType|currencyCode|acquisitionType|actionCode|matchedType|matchStatus|loginId|code)$/;
const RAW_RENDER_ENUM_RE =
  /\.(?:status|lineStatus|settlementStatus|payableType|currencyCode|acquisitionType|actionCode|matchedType|matchStatus)$/;
const KO_CONVERTER_CALL_RE =
  /(?:formatKoStatus|formatKoCurrency|formatKoPayableType|formatKoAcquisitionType|formatKoActionCode|formatKoTargetTable|formatPartnerNtsStatus|statusText|statusLabel|tierLabel)$/;
const UI_JSX_ATTRS = new Set([
  'label',
  'title',
  'header',
  'placeholder',
  'searchPlaceholder',
  'balanceMessage',
  'emptyText',
  'docLabel',
  'aria-label',
]);
const UI_OBJ_KEYS = new Set([
  'label',
  'header',
  'shortDesc',
  'basicDescription',
  'processName',
  'purpose',
  'targetLabel',
  'actionDetail',
  'balanceMessage',
  'emptyText',
  'sectionTitle',
]);

const ALLOWED_TECH_TOKEN_RE =
  /(?<![A-Za-z])(?:VDI\s*2198|VDI|ISO\s*5053|ISO\s*2328|ISO|OEM|TVH|KS|CE|IPX4|BMS|AC|DC|LED|LFP|PDF|kg|mm|cm|km\/h|mm\/s|l\/min|L\/min|kW|MPa|kPa|dB|Ah|Wh|Hz|rpm|h(?:10|[1-9])|l[1-2]|b(?:1[0-3]|[1-9])|m[1-2]|Wa|Ast|[mNVLAQcxysel])(?![A-Za-z])/g;

function hasDisallowedUiText(text, allowTechTokens) {
  const source = String(text || '');
  if (source.includes('->')) return true;
  const checkStr = allowTechTokens ? source.replace(ALLOWED_TECH_TOKEN_RE, ' ') : source;
  return /[A-Za-z]/.test(checkStr);
}

function checkUiOutputExpr(expr, sf, checkEnumProp, allowTechTokens = true) {
  const hits = [];
  function inspectOutput(node) {
    if (!node) return;
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      inspectOutput(node.expression);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      // 삼항 조건식은 제외하고 실제 화면 출력 분기만 검사
      inspectOutput(node.whenTrue);
      inspectOutput(node.whenFalse);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.PlusToken
      ) {
        inspectOutput(node.left);
        inspectOutput(node.right);
      } else if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        inspectOutput(node.right);
      }
      return;
    }
    if (ts.isCallExpression(node)) {
      const fn = node.expression.getText(sf);
      if (KO_CONVERTER_CALL_RE.test(fn)) {
        return;
      }
      if (
        fn.endsWith('.toLocaleString') ||
        fn.endsWith('.toFixed') ||
        fn.endsWith('.slice') ||
        fn.endsWith('.replace')
      ) {
        return;
      }
    }
    if (ts.isElementAccessExpression(node)) {
      const arrName = node.expression.getText(sf);
      if (arrName.endsWith('_LABELS') || arrName === 'TIER_LABELS') {
        return;
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const t = node.text;
      if (hasDisallowedUiText(t, allowTechTokens)) {
        hits.push(`"${t}"`);
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      for (const p of parts) {
        if (hasDisallowedUiText(p, allowTechTokens)) {
          hits.push(`템플릿 "${p}"`);
        }
      }
      for (const s of node.templateSpans) {
        inspectOutput(s.expression);
      }
      return;
    }
    if (checkEnumProp && ts.isPropertyAccessExpression(node)) {
      const txt = node.getText(sf);
      if (RAW_ENUM_PROP_RE.test(txt)) {
        hits.push(`원시코드 "${txt}"`);
      }
      return;
    }
    if (checkEnumProp && ts.isIdentifier(node)) {
      const txt = node.getText(sf);
      if (txt === 'currencyCode') {
        hits.push(`원시통화 "${txt}"`);
      }
    }
  }
  inspectOutput(expr);
  return hits;
}

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
    for (const kpiMarker of bannedKpiCardMarkers) {
      if (line.includes(kpiMarker)) {
        violations.push(`${rel}:${idx + 1} [카드형 요약정보 영구 금지 위반] "${kpiMarker}"`);
      }
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('{/*')) {
      return;
    }
    if (!EXCLUDED_PHRASE_FILES.has(rel)) {
      for (const phrase of bannedPhrases) {
        if (line.includes(phrase)) {
          violations.push(`${rel}:${idx + 1} [금지 표현] "${phrase}"`);
        }
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
    const lineNum = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const isUiScope =
      rel.startsWith('src/components/') ||
      rel.startsWith('src/pages/') ||
      rel.startsWith('src/manual/') ||
      rel === 'src/types/domain.ts';

    if (ts.isJsxText(node)) {
      const raw = code.slice(node.getFullStart(), node.getEnd());
      checkText(raw, node.getStart(sf), false);
      // 규칙 2: JSX 본문 영문/화살표 직접 노출 차단 (허용 기술 표준 단위·기호 제외)
      const cleaned = node
        .getText(sf)
        .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, '')
        .trim();
      if (cleaned && hasDisallowedUiText(cleaned, true)) {
        violations.push(
          `${rel}:${lineNum} [JSX 영문/화살표 노출 금지] "${cleaned.replace(/\s+/g, ' ').slice(0, 80)}"`
        );
      }
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

    // 규칙 1 & 규칙 3a: StatusBadge 및 UI 표시 JSX 속성 검사
    if (ts.isJsxAttribute(node) && node.initializer) {
      const attrName = node.name.getText(sf);
      const parentTag =
        node.parent && node.parent.parent && node.parent.parent.tagName
          ? node.parent.parent.tagName.getText(sf)
          : '';
      if (parentTag === 'StatusBadge' && attrName === 'label') {
        if (ts.isStringLiteral(node.initializer) && hasDisallowedUiText(node.initializer.text, false)) {
          violations.push(`${rel}:${lineNum} [영문 배지/원시코드 금지] "${node.initializer.text}"`);
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          for (const h of checkUiOutputExpr(node.initializer.expression, sf, true, false)) {
            violations.push(`${rel}:${lineNum} [영문 배지/원시코드 금지] ${h}`);
          }
        }
      } else if (isUiScope && UI_JSX_ATTRS.has(attrName)) {
        if (ts.isStringLiteral(node.initializer) && hasDisallowedUiText(node.initializer.text, true)) {
          violations.push(`${rel}:${lineNum} [UI 속성 영문/화살표 금지] ${attrName}="${node.initializer.text}"`);
        } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          for (const h of checkUiOutputExpr(
            node.initializer.expression,
            sf,
            attrName === 'label' || attrName === 'header',
            true
          )) {
            violations.push(`${rel}:${lineNum} [UI 속성 영문/화살표 금지] ${attrName}=${h}`);
          }
        }
      }
    }

    // 규칙 3b & 규칙 4: UI 객체 프로퍼티 및 그리드 render 반환 검사
    if (isUiScope && ts.isPropertyAssignment(node)) {
      const propKey = node.name.getText(sf).replace(/['"]/g, '');
      if (UI_OBJ_KEYS.has(propKey)) {
        for (const h of checkUiOutputExpr(
          node.initializer,
          sf,
          propKey === 'label' || propKey === 'header',
          true
        )) {
          violations.push(`${rel}:${lineNum} [UI 속성 영문/화살표 금지] ${propKey}: ${h}`);
        }
      }
      if ((rel.startsWith('src/pages/') || rel.startsWith('src/components/')) && propKey === 'render') {
        const fn = node.initializer;
        if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
          const returns = [];
          if (!ts.isBlock(fn.body)) {
            returns.push(fn.body);
          } else {
            function findRet(b) {
              if (ts.isFunctionLike(b) && b !== fn) return;
              if (ts.isReturnStatement(b) && b.expression) returns.push(b.expression);
              ts.forEachChild(b, findRet);
            }
            findRet(fn.body);
          }
          for (const ret of returns) {
            let unwrap = ret;
            while (ts.isParenthesizedExpression(unwrap)) unwrap = unwrap.expression;
            const retLine = sf.getLineAndCharacterOfPosition(ret.getStart(sf)).line + 1;
            if (ts.isPropertyAccessExpression(unwrap) && RAW_RENDER_ENUM_RE.test(unwrap.getText(sf))) {
              violations.push(`${rel}:${retLine} [그리드 원시 영문코드 반환 금지] "${unwrap.getText(sf)}"`);
            }
            if (ts.isTemplateExpression(unwrap)) {
              const lits = [unwrap.head.text, ...unwrap.templateSpans.map((s) => s.literal.text)];
              if (lits.some((l) => l.includes('->'))) {
                violations.push(`${rel}:${retLine} [그리드 화살표 표기 금지] ${unwrap.getText(sf).slice(0, 80)}`);
              }
            }
          }
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
  console.log(`[UI 표기 검증 통과] 검사 파일 ${files.length}개 내 이모지, 괄호 영문, 금지 표현, 영문 배지·표기 0건 확인 완료.`);
  process.exit(0);
}
