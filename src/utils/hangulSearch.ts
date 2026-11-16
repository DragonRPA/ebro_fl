const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const CHOSUNG_SET = new Set(CHOSUNG);

// 겹받침(복자음) 자동 분리 맵
const COMPOUND_CONSONANT_MAP: Record<string, string> = {
  'ㄳ': 'ㄱㅅ',
  'ㄵ': 'ㄴㅈ',
  'ㄶ': 'ㄴㅎ',
  'ㄺ': 'ㄹㄱ',
  'ㄻ': 'ㄹㅁ',
  'ㄼ': 'ㄹㅂ',
  'ㄽ': 'ㄹㅅ',
  'ㄾ': 'ㄹㅌ',
  'ㄿ': 'ㄹㅍ',
  'ㅀ': 'ㄹㅎ',
  'ㅄ': 'ㅂㅅ',
};

// 쌍자음 분리 맵 (빠른 연타 조합 및 쌍자음 입력 양방향 대응)
const DOUBLE_CONSONANT_MAP: Record<string, string> = {
  'ㄲ': 'ㄱㄱ',
  'ㄸ': 'ㄷㄷ',
  'ㅃ': 'ㅂㅂ',
  'ㅆ': 'ㅅㅅ',
  'ㅉ': 'ㅈㅈ',
};

export function isChosungChar(ch: string): boolean {
  return (
    CHOSUNG_SET.has(ch) ||
    Boolean(COMPOUND_CONSONANT_MAP[ch]) ||
    Boolean(DOUBLE_CONSONANT_MAP[ch])
  );
}

/**
 * 입력된 자모/문자열 내 복자음(ㄳ->ㄱㅅ, ㄺ->ㄹㄱ 등)을 낱자음으로 자동 분리합니다.
 */
export function decomposeCompoundConsonants(text: string, includeDouble = false): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (COMPOUND_CONSONANT_MAP[ch]) {
      out += COMPOUND_CONSONANT_MAP[ch];
    } else if (includeDouble && DOUBLE_CONSONANT_MAP[ch]) {
      out += DOUBLE_CONSONANT_MAP[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

export function extractChosung(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / (21 * 28));
      out += CHOSUNG[idx] || text[i];
    } else {
      out += decomposeCompoundConsonants(text[i].toLowerCase(), false);
    }
  }
  return out;
}

function matchExpandedToken(target: string, targetChosung: string, token: string): boolean {
  const normTarget = target.toLowerCase();
  const normToken = token.toLowerCase();
  if (normTarget.includes(normToken)) return true;

  if (targetChosung.includes(normToken)) return true;

  // 타겟의 쌍자음을 단자음 2개로 펼친 경우에도 매칭 (예: "꼬올" -> "ㄱㄱㅇ" 매칭)
  const expandedTargetChosung = decomposeCompoundConsonants(targetChosung, true);
  if (expandedTargetChosung.includes(normToken)) return true;

  // 초성+완성형 혼합 입력 지원 (예: "넥ㅅ" -> "넥센")
  if (normToken.length <= target.length) {
    for (let start = 0; start <= target.length - normToken.length; start++) {
      let matched = true;
      for (let j = 0; j < normToken.length; j++) {
        const tc = normToken[j];
        const sc = normTarget[start + j];
        if (isChosungChar(tc)) {
          if (targetChosung[start + j] !== tc) {
            matched = false;
            break;
          }
        } else if (sc !== tc) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }
  }

  return false;
}

function matchSingleToken(target: string, token: string): boolean {
  const targetChosung = extractChosung(target);
  // 1) 겹받침(ㄳ, ㄺ, ㅄ 등) 분리 버전으로 매칭
  const compoundSplit = decomposeCompoundConsonants(token, false);
  if (matchExpandedToken(target, targetChosung, compoundSplit)) return true;

  // 2) 쌍자음(ㄲ, ㄸ, ㅃ, ㅆ, ㅉ)도 2자음(ㄱㄱ 등)으로 분리한 버전으로 추가 매칭
  const doubleSplit = decomposeCompoundConsonants(token, true);
  if (doubleSplit !== compoundSplit && matchExpandedToken(target, targetChosung, doubleSplit)) {
    return true;
  }

  return false;
}

/**
 * 공백으로 구분된 모든 검색 토큰에 대해 키워드(부분일치) 및 복자음 분리 한글 초성 검색을 동시 지원합니다.
 */
export function matchesKoreanQuery(target: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  if (!target) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((token) => matchSingleToken(target, token));
}
