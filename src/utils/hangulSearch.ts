const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const CHOSUNG_SET = new Set(CHOSUNG);

export function isChosungChar(ch: string): boolean {
  return CHOSUNG_SET.has(ch);
}

export function extractChosung(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = Math.floor((code - 0xac00) / (21 * 28));
      out += CHOSUNG[idx] || text[i];
    } else {
      out += text[i].toLowerCase();
    }
  }
  return out;
}

function matchSingleToken(target: string, token: string): boolean {
  const normTarget = target.toLowerCase();
  const normToken = token.toLowerCase();
  if (normTarget.includes(normToken)) return true;

  const targetChosung = extractChosung(target);
  if (targetChosung.includes(normToken)) return true;

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

/**
 * 공백으로 구분된 모든 검색 토큰에 대해 키워드(부분일치) 및 한글 초성 검색을 동시 지원합니다.
 */
export function matchesKoreanQuery(target: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  if (!target) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens.every((token) => matchSingleToken(target, token));
}
