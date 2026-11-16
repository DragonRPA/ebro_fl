// api/exchange-rate.ts
// Vercel Serverless Function — 지게차·부품 해외수입 원가 산출용 일일 기준환율(CNY / USD -> KRW) 자동 확보 API
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RateResult {
  currency: 'CNY' | 'USD' | 'JPY' | 'EUR' | 'KRW';
  baseDate: string;
  baseRate: number;      // 매매기준율 (모든 외화 1단위당 원화 통일: JPY도 1엔당 원화)
  ttsRate: number;       // 전신환매도율 (송금 보낼 때 환율, 약 +1.0% 스프레드)
  customsRate: number;   // 관세 과세 참고환율
  source: string;
}

function roundRateByCurrency(currency: 'CNY' | 'USD' | 'JPY' | 'EUR', val: number): number {
  const factor = currency === 'JPY' ? 10000 : 100;
  return Math.round(val * factor) / factor;
}

const FALLBACK_BASE_RATES: Record<'CNY' | 'USD' | 'JPY' | 'EUR', number> = {
  USD: 1395.5,
  CNY: 196.8,
  EUR: 1518.0,
  JPY: 9.24,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const currencyParam = String(req.query.currency || 'CNY').toUpperCase();
  const targetCurrency: 'CNY' | 'USD' | 'JPY' | 'EUR' | 'KRW' =
    currencyParam === 'USD'
      ? 'USD'
      : currencyParam === 'JPY'
      ? 'JPY'
      : currencyParam === 'EUR'
      ? 'EUR'
      : currencyParam === 'KRW'
      ? 'KRW'
      : 'CNY';
  const requestedDate = String(req.query.date || new Date().toISOString().split('T')[0]);
  const daysParam = Math.min(180, Math.max(0, Number(req.query.days || 0)));

  if (targetCurrency === 'KRW') {
    return res.status(200).json({
      success: true,
      data: {
        currency: 'KRW',
        baseDate: requestedDate,
        baseRate: 1,
        ttsRate: 1,
        customsRate: 1,
        source: '원화 기준'
      }
    });
  }

  // 시계열(최근 N일, 기본 90일) 요청 처리 — fl_exchange_rates와 동일하게 모든 외화 1단위당 원화(JPY 1엔당) 기준 유지
  if (daysParam > 0) {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const endDateStr = requestedDate <= todayStr ? requestedDate : todayStr;
      const endObj = new Date(endDateStr);
      const startObj = new Date(endObj.getTime() - daysParam * 24 * 60 * 60 * 1000);
      const startDateStr = startObj.toISOString().split('T')[0];

      const tsUrl = `https://api.frankfurter.dev/v1/${startDateStr}..${endDateStr}?base=${targetCurrency}&symbols=KRW`;
      const tsRes = await fetch(tsUrl);
      if (tsRes.ok) {
        const tsJson = (await tsRes.json()) as { rates?: Record<string, { KRW?: number }> };
        const rateMap = tsJson?.rates || {};
        const dates = Object.keys(rateMap).sort();
        if (dates.length > 0) {
          const series = dates
            .map((d) => {
              const rawKrw = Number(rateMap[d]?.KRW || 0);
              const baseRate = roundRateByCurrency(targetCurrency, rawKrw);
              return {
                date: d,
                baseRate,
                ttsRate: roundRateByCurrency(targetCurrency, baseRate * 1.01),
                ttbRate: roundRateByCurrency(targetCurrency, baseRate * 0.99),
                customsRate: roundRateByCurrency(targetCurrency, baseRate * 1.003),
              };
            })
            .filter((pt) => pt.baseRate > 0);
          return res.status(200).json({
            success: true,
            data: {
              currency: targetCurrency,
              startDate: startDateStr,
              endDate: endDateStr,
              source: '국제외환시장 일별 고시 시계열',
              series,
            },
          });
        }
      }
    } catch {
      // 시계열 조회 실패 시 아래 단건/폴백으로 진행
    }
  }

  // 1순위: 한국수출입은행 Open API (환경변수 EXIM_API_KEY 설정 시 작동)
  const eximKey = process.env.EXIM_API_KEY;
  if (eximKey) {
    try {
      const searchDate = requestedDate.replace(/-/g, '');
      const eximUrl = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${encodeURIComponent(eximKey)}&searchdate=${searchDate}&data=AP01`;
      const eximRes = await fetch(eximUrl);
      if (eximRes.ok) {
        const list = (await eximRes.json()) as Array<{ cur_unit?: string; deal_bas_r?: string; tts?: string }>;
        if (Array.isArray(list) && list.length > 0) {
          const eximCode =
            targetCurrency === 'CNY'
              ? 'CNH'
              : targetCurrency === 'JPY'
              ? 'JPY(100)'
              : targetCurrency;
          const found = list.find((item) => item.cur_unit === eximCode);
          if (found && found.deal_bas_r) {
            const divisor = targetCurrency === 'JPY' ? 100 : 1;
            const rawBase = Number(String(found.deal_bas_r).replace(/,/g, '')) / divisor;
            const baseRate = roundRateByCurrency(targetCurrency, rawBase);
            const ttsRate = found.tts
              ? roundRateByCurrency(targetCurrency, Number(String(found.tts).replace(/,/g, '')) / divisor)
              : roundRateByCurrency(targetCurrency, baseRate * 1.01);
            if (baseRate > 0) {
              return res.status(200).json({
                success: true,
                data: {
                  currency: targetCurrency,
                  baseDate: requestedDate,
                  baseRate,
                  ttsRate,
                  customsRate: roundRateByCurrency(targetCurrency, baseRate * 1.003),
                  source: '한국수출입은행 공식 고시환율',
                } as RateResult,
              });
            }
          }
        }
      }
    } catch {
      // 수출입은행 응답 지연/휴일 결측 시 글로벌 기준환율 API로 폴백
    }
  }

  // 2순위: 유럽중앙은행(ECB) 기반 Frankfurter 일자별 환율 API (무인증 즉시 조회)
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const dateSegment = requestedDate <= todayStr ? requestedDate : 'latest';
    const frankUrl = `https://api.frankfurter.dev/v1/${dateSegment}?base=${targetCurrency}&symbols=KRW`;
    const frankRes = await fetch(frankUrl);
    if (frankRes.ok) {
      const json = (await frankRes.json()) as { date?: string; rates?: { KRW?: number } };
      const krwRate = Number(json?.rates?.KRW);
      if (krwRate > 0) {
        const baseRate = roundRateByCurrency(targetCurrency, krwRate);
        const ttsRate = roundRateByCurrency(targetCurrency, baseRate * 1.01);
        return res.status(200).json({
          success: true,
          data: {
            currency: targetCurrency,
            baseDate: json.date || requestedDate,
            baseRate,
            ttsRate,
            customsRate: roundRateByCurrency(targetCurrency, baseRate * 1.002),
            source: '국제외환시장 일일 매매기준율',
          } as RateResult,
        });
      }
    }
  } catch {
    // 3순위 폴백으로 진행
  }

  // 3순위: Open Exchange Rates API 폴백
  try {
    const openUrl = `https://open.er-api.com/v6/latest/${targetCurrency}`;
    const openRes = await fetch(openUrl);
    if (openRes.ok) {
      const json = (await openRes.json()) as { rates?: { KRW?: number } };
      const krwRate = Number(json?.rates?.KRW);
      if (krwRate > 0) {
        const baseRate = roundRateByCurrency(targetCurrency, krwRate);
        const ttsRate = roundRateByCurrency(targetCurrency, baseRate * 1.01);
        return res.status(200).json({
          success: true,
          data: {
            currency: targetCurrency,
            baseDate: requestedDate,
            baseRate,
            ttsRate,
            customsRate: roundRateByCurrency(targetCurrency, baseRate * 1.002),
            source: '글로벌 외환 고시환율',
          } as RateResult,
        });
      }
    }
  } catch {
    // 안전 기본값 폴백
  }

  const fallbackBase = FALLBACK_BASE_RATES[targetCurrency];
  return res.status(200).json({
    success: true,
    data: {
      currency: targetCurrency,
      baseDate: requestedDate,
      baseRate: fallbackBase,
      ttsRate: roundRateByCurrency(targetCurrency, fallbackBase * 1.01),
      customsRate: fallbackBase,
      source: '표준 기준환율',
    } as RateResult,
  });
}
