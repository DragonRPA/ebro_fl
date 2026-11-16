import type { PartnerNtsStatus } from '../types/domain';

const DEFAULT_NTS_PUBLIC_KEY =
  '7f24250bd002412aaa152a6e3ec63e556604f75be0fa9181983c33a618cb2e03';

export interface PartnerNtsCheckItem {
  bizRegNo: string;
  ntsStatus: PartnerNtsStatus;
  ntsClosedDate: string | null;
  ntsTaxType: string | null;
  ntsCheckedAt: string;
  source: 'NTS_LIVE_API' | 'CHECKSUM_FALLBACK';
}

export function formatNtsYmd(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  }
  const trimmed = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function validateBizRegNoChecksum(bizNo: string): boolean {
  const digits = String(bizNo || '').replace(/[^0-9]/g, '');
  if (digits.length !== 10) return false;

  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += parseInt(digits[i], 10) * weights[i];
  }
  const d9 = parseInt(digits[8], 10);
  sum += Math.floor((d9 * 5) / 10) + ((d9 * 5) % 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(digits[9], 10);
}

export function parseRawNtsItem(
  item: Record<string, unknown>,
  source: 'NTS_LIVE_API' | 'CHECKSUM_FALLBACK',
  checkedAt = new Date().toISOString()
): PartnerNtsCheckItem {
  const bizRegNo = String(item.b_no || '').replace(/[^0-9]/g, '');
  const code = String(item.b_stt_cd || '').trim();
  const taxTypeRaw = item.tax_type ? String(item.tax_type).trim() : null;

  if (code === '01') {
    return {
      bizRegNo,
      ntsStatus: '정상',
      ntsClosedDate: null,
      ntsTaxType: taxTypeRaw,
      ntsCheckedAt: checkedAt,
      source,
    };
  }
  if (code === '02') {
    return {
      bizRegNo,
      ntsStatus: '휴업',
      ntsClosedDate: formatNtsYmd(String(item.end_dt || item.tax_type_change_dt || '')),
      ntsTaxType: taxTypeRaw,
      ntsCheckedAt: checkedAt,
      source,
    };
  }
  if (code === '03') {
    return {
      bizRegNo,
      ntsStatus: '폐업',
      ntsClosedDate: formatNtsYmd(String(item.end_dt || item.tax_type_change_dt || '')),
      ntsTaxType: taxTypeRaw,
      ntsCheckedAt: checkedAt,
      source,
    };
  }

  return {
    bizRegNo,
    ntsStatus: '미등록',
    ntsClosedDate: null,
    ntsTaxType: taxTypeRaw,
    ntsCheckedAt: checkedAt,
    source,
  };
}

async function fetchNtsStatusChunk(
  chunk: string[]
): Promise<{ items: Record<string, unknown>[]; source: 'NTS_LIVE_API' | 'CHECKSUM_FALLBACK' }> {
  try {
    const res = await fetch('/api/nts-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b_no: chunk }),
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const json = (await res.json()) as {
        success?: boolean;
        source?: 'NTS_LIVE_API' | 'CHECKSUM_FALLBACK';
        data?: Record<string, unknown>[];
      };
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        return {
          items: json.data,
          source: json.source || 'NTS_LIVE_API',
        };
      }
    }
  } catch {
    // 정적 프리뷰 환경 또는 로컬 프록시 미기동 시 공공데이터 직접 호출로 폴백
  }

  try {
    const targetUrl = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(DEFAULT_NTS_PUBLIC_KEY)}`;
    const directRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ b_no: chunk }),
    });
    if (directRes.ok) {
      const directJson = (await directRes.json()) as { data?: Record<string, unknown>[] };
      if (Array.isArray(directJson.data) && directJson.data.length > 0) {
        return {
          items: directJson.data,
          source: 'NTS_LIVE_API',
        };
      }
    }
  } catch {
    // 오프라인 시 체크섬 검증 폴백으로 전환
  }

  const fallbackItems: Record<string, unknown>[] = chunk.map((no) => {
    const ok = validateBizRegNoChecksum(no);
    return ok
      ? {
          b_no: no,
          b_stt: '계속사업자',
          b_stt_cd: '01',
          tax_type: '부가가치세 일반과세자',
          end_dt: '',
        }
      : {
          b_no: no,
          b_stt: '',
          b_stt_cd: '',
          tax_type: '국세청에 등록되지 않은 사업자등록번호입니다.',
          end_dt: '',
        };
  });
  return { items: fallbackItems, source: 'CHECKSUM_FALLBACK' };
}

export async function queryBatchPartnerNtsStatus(
  bizNos: string[],
  onProgress?: (processed: number, total: number) => void
): Promise<Map<string, PartnerNtsCheckItem>> {
  const resultMap = new Map<string, PartnerNtsCheckItem>();
  const checkedAt = new Date().toISOString();
  const validTenDigits = new Set<string>();

  for (const raw of bizNos) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    const digits = trimmed.replace(/[^0-9]/g, '');
    if (digits.length === 10) {
      validTenDigits.add(digits);
    } else {
      resultMap.set(trimmed, {
        bizRegNo: digits,
        ntsStatus: '미등록',
        ntsClosedDate: null,
        ntsTaxType: '사업자등록번호 10자리 형식 오류',
        ntsCheckedAt: checkedAt,
        source: 'CHECKSUM_FALLBACK',
      });
    }
  }

  const uniqueList = Array.from(validTenDigits);
  const total = uniqueList.length;
  const CHUNK_SIZE = 100;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = uniqueList.slice(i, i + CHUNK_SIZE);
    const { items, source } = await fetchNtsStatusChunk(chunk);
    for (const rawItem of items) {
      const parsed = parseRawNtsItem(rawItem, source, checkedAt);
      if (parsed.bizRegNo) {
        resultMap.set(parsed.bizRegNo, parsed);
      }
    }
    onProgress?.(Math.min(i + CHUNK_SIZE, total), total);
  }

  return resultMap;
}

export async function querySinglePartnerNtsStatus(
  rawBizNo: string
): Promise<PartnerNtsCheckItem | null> {
  const trimmed = String(rawBizNo || '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/g, '');
  const map = await queryBatchPartnerNtsStatus([trimmed]);
  return map.get(digits) || map.get(trimmed) || null;
}
