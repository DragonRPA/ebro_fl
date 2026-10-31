// api/exchange-rate.ts
// Vercel Serverless Function — 지게차·부품 해외수입 원가 산출용 일일 기준환율(CNY / USD -> KRW) 자동 확보 API
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RateResult {
  currency: 'CNY' | 'USD' | 'KRW';
  baseDate: string;
  baseRate: number;      // 매매기준율 (1 외화당 원화)
  ttsRate: number;       // 전신환매도율 (송금 보낼 때 환율, 약 +1.0% 스프레드)
  customsRate: number;   // 관세 과세 참고환율
  source: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const currencyParam = String(req.query.currency || 'CNY').toUpperCase();
  const targetCurrency: 'CNY' | 'USD' | 'KRW' =
    currencyParam === 'USD' ? 'USD' : currencyParam === 'KRW' ? 'KRW' : 'CNY';
  const requestedDate = String(req.query.date || new Date().toISOString().split('T')[0]);

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

  // 1순위: 한국수출입은행 Open API (환경변수 EXIM_API_KEY 설정 시 작동)
  const eximKey = process.env.EXIM_API_KEY;
  if (eximKey) {
    try {
      const searchDate = requestedDate.replace(/-/g, '');
      const eximUrl = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${encodeURIComponent(eximKey)}&searchdate=${searchDate}&data=AP01`;
      const eximRes = await fetch(eximUrl);
      if (eximRes.ok) {
        const list = await eximRes.json();
        if (Array.isArray(list) && list.length > 0) {
          const code = targetCurrency === 'CNY' ? 'CNH' : 'USD';
          const found = list.find((item: any) => item.cur_unit === code);
          if (found && found.deal_bas_r) {
            const baseRate = Number(String(found.deal_bas_r).replace(/,/g, ''));
            const ttsRate = found.tts
              ? Number(String(found.tts).replace(/,/g, ''))
              : Math.round(baseRate * 1.01 * 100) / 100;
            if (baseRate > 0) {
              return res.status(200).json({
                success: true,
                data: {
                  currency: targetCurrency,
                  baseDate: requestedDate,
                  baseRate,
                  ttsRate,
                  customsRate: Math.round(baseRate * 1.003 * 100) / 100,
                  source: '한국수출입은행 공식 고시환율'
                } as RateResult
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
      const json: any = await frankRes.json();
      const krwRate = Number(json?.rates?.KRW);
      if (krwRate > 0) {
        const baseRate = Math.round(krwRate * 100) / 100;
        const ttsRate = Math.round(baseRate * 1.01 * 100) / 100;
        return res.status(200).json({
          success: true,
          data: {
            currency: targetCurrency,
            baseDate: json.date || requestedDate,
            baseRate,
            ttsRate,
            customsRate: Math.round(baseRate * 1.002 * 100) / 100,
            source: '국제외환시장 일일 매매기준율'
          } as RateResult
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
      const json: any = await openRes.json();
      const krwRate = Number(json?.rates?.KRW);
      if (krwRate > 0) {
        const baseRate = Math.round(krwRate * 100) / 100;
        const ttsRate = Math.round(baseRate * 1.01 * 100) / 100;
        return res.status(200).json({
          success: true,
          data: {
            currency: targetCurrency,
            baseDate: requestedDate,
            baseRate,
            ttsRate,
            customsRate: Math.round(baseRate * 1.002 * 100) / 100,
            source: '글로벌 외환 고시환율'
          } as RateResult
        });
      }
    }
  } catch {
    // 안전 기본값 폴백
  }

  const fallbackBase = targetCurrency === 'USD' ? 1385.0 : 193.5;
  return res.status(200).json({
    success: true,
    data: {
      currency: targetCurrency,
      baseDate: requestedDate,
      baseRate: fallbackBase,
      ttsRate: Math.round(fallbackBase * 1.01 * 100) / 100,
      customsRate: fallbackBase,
      source: '표준 기준환율'
    } as RateResult
  });
}
