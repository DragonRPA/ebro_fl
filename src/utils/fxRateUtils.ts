import type { CurrencyCode, FlExchangeRate } from '../types/domain';

export const FX_CURRENCIES: Array<{
  code: Exclude<CurrencyCode, 'KRW'>;
  name: string;
  decimals: number;
}> = [
  { code: 'USD', name: '미국 달러', decimals: 2 },
  { code: 'CNY', name: '중국 위안', decimals: 2 },
  { code: 'EUR', name: '유럽 유로', decimals: 2 },
  { code: 'JPY', name: '일본 엔', decimals: 4 },
];

export const FX_PERIOD_OPTIONS: Array<{ days: 30 | 60 | 90; label: string }> = [
  { days: 30, label: '1개월' },
  { days: 60, label: '2개월' },
  { days: 90, label: '3개월' },
];

export const DEFAULT_FX_RATES: Record<Exclude<CurrencyCode, 'KRW'>, number> = {
  USD: 1395.5,
  CNY: 196.8,
  EUR: 1518.0,
  JPY: 9.24,
};

export function formatFxRate(value: number, currencyCode: Exclude<CurrencyCode, 'KRW'>): string {
  const maxFrac = currencyCode === 'JPY' ? 4 : 2;
  return Number(value || 0).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  });
}

export function resolveManagedRateForDate(
  exchangeRates: FlExchangeRate[],
  currencyCode: CurrencyCode,
  targetDate: string
): { rate: number; matchedDate: string | null; exactMatch: boolean } {
  if (currencyCode === 'KRW') {
    return { rate: 1, matchedDate: targetDate, exactMatch: true };
  }
  const rows = exchangeRates
    .filter((r) => r.currencyCode === currencyCode && Number(r.baseRateKrw) > 0)
    .sort((a, b) => a.rateDate.localeCompare(b.rateDate));
  if (rows.length === 0) {
    return {
      rate: DEFAULT_FX_RATES[currencyCode],
      matchedDate: null,
      exactMatch: false,
    };
  }
  const exact = rows.find((r) => r.rateDate === targetDate);
  if (exact) {
    return {
      rate: Number(exact.baseRateKrw),
      matchedDate: exact.rateDate,
      exactMatch: true,
    };
  }
  const onOrBefore = [...rows].reverse().find((r) => r.rateDate <= targetDate);
  if (onOrBefore) {
    return {
      rate: Number(onOrBefore.baseRateKrw),
      matchedDate: onOrBefore.rateDate,
      exactMatch: false,
    };
  }
  return {
    rate: Number(rows[0].baseRateKrw),
    matchedDate: rows[0].rateDate,
    exactMatch: false,
  };
}
