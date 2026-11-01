import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Calculator, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface CurrencyRateRow {
  code: string;
  currencyName: string;
  countryLabel: string;
  unitLabel: string;
  baseRate: number;
  ttsRate: number;
  ttbRate: number;
  customsRate: number;
  prevDiff: number;
  sourceLabel: string;
  updatedDate: string;
}

const INITIAL_RATES: CurrencyRateRow[] = [
  {
    code: 'CNY',
    currencyName: '중국 위안화',
    countryLabel: '중국 · 헬리/비와이디/이피 지게차 수입 결제통화',
    unitLabel: '1 위안 기준',
    baseRate: 194.20,
    ttsRate: 196.14,
    ttbRate: 192.26,
    customsRate: 194.78,
    prevDiff: 0.45,
    sourceLabel: '한국수출입은행 · 국제외환 매매기준율',
    updatedDate: new Date().toISOString().split('T')[0]
  },
  {
    code: 'USD',
    currencyName: '미국 달러화',
    countryLabel: '미국 · 글로벌 호환부품 및 해상운임 결제통화',
    unitLabel: '1 달러 기준',
    baseRate: 1386.50,
    ttsRate: 1400.37,
    ttbRate: 1372.64,
    customsRate: 1390.66,
    prevDiff: -2.10,
    sourceLabel: '한국수출입은행 · 국제외환 매매기준율',
    updatedDate: new Date().toISOString().split('T')[0]
  },
  {
    code: 'JPY',
    currencyName: '일본 엔화',
    countryLabel: '일본 · 토요타/니치유 전동지게차 및 전장부품 결제통화',
    unitLabel: '100 엔 기준',
    baseRate: 912.40,
    ttsRate: 921.52,
    ttbRate: 903.28,
    customsRate: 915.14,
    prevDiff: 1.80,
    sourceLabel: '한국수출입은행 · 국제외환 매매기준율',
    updatedDate: new Date().toISOString().split('T')[0]
  },
  {
    code: 'EUR',
    currencyName: '유럽연합 유로화',
    countryLabel: '유럽 · 린데/융하인리히 지게차 및 유압 어태치먼트 결제통화',
    unitLabel: '1 유로 기준',
    baseRate: 1504.80,
    ttsRate: 1519.85,
    ttbRate: 1489.75,
    customsRate: 1509.31,
    prevDiff: 3.20,
    sourceLabel: '한국수출입은행 · 국제외환 매매기준율',
    updatedDate: new Date().toISOString().split('T')[0]
  }
];

export const ExchangeRateInquiryPage: React.FC = () => {
  const { setActiveTab } = useApp();
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rates, setRates] = useState<CurrencyRateRow[]>(INITIAL_RATES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('방금 동기화됨');

  // 수입 원가 환산 시뮬레이터 상태
  const [simCurrency, setSimCurrency] = useState<string>('CNY');
  const [simForeignUnitPrice, setSimForeignUnitPrice] = useState<number>(68000);
  const [simQty, setSimQty] = useState<number>(2);
  const [simRateType, setSimRateType] = useState<'BASE' | 'TTS' | 'CUSTOMS'>('TTS');
  const [simDutyPercent, setSimDutyPercent] = useState<number>(8);
  const [simFreightKrw, setSimFreightKrw] = useState<number>(1200000);

  const fetchOfficialRates = async (dateStr: string) => {
    setIsLoading(true);
    try {
      const [cnyRes, usdRes] = await Promise.all([
        fetch(`/api/exchange-rate?currency=CNY&date=${encodeURIComponent(dateStr)}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/exchange-rate?currency=USD&date=${encodeURIComponent(dateStr)}`).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      setRates(prev => prev.map(row => {
        if (row.code === 'CNY' && cnyRes?.data?.baseRate) {
          const base = Number(cnyRes.data.baseRate);
          return {
            ...row,
            baseRate: base,
            ttsRate: Number(cnyRes.data.ttsRate || Math.round(base * 1.01 * 100) / 100),
            ttbRate: Math.round(base * 0.99 * 100) / 100,
            customsRate: Number(cnyRes.data.customsRate || Math.round(base * 1.003 * 100) / 100),
            sourceLabel: cnyRes.data.source || row.sourceLabel,
            updatedDate: cnyRes.data.baseDate || dateStr
          };
        }
        if (row.code === 'USD' && usdRes?.data?.baseRate) {
          const base = Number(usdRes.data.baseRate);
          return {
            ...row,
            baseRate: base,
            ttsRate: Number(usdRes.data.ttsRate || Math.round(base * 1.01 * 100) / 100),
            ttbRate: Math.round(base * 0.99 * 100) / 100,
            customsRate: Number(usdRes.data.customsRate || Math.round(base * 1.003 * 100) / 100),
            sourceLabel: usdRes.data.source || row.sourceLabel,
            updatedDate: usdRes.data.baseDate || dateStr
          };
        }
        return { ...row, updatedDate: dateStr };
      }));
      const now = new Date();
      setLastSyncedAt(`${dateStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 기준`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOfficialRates(targetDate);
  }, []);

  const selectedCurrencyRow = useMemo(() => {
    return rates.find(r => r.code === simCurrency) || rates[0];
  }, [rates, simCurrency]);

  const simResult = useMemo(() => {
    const unitDivisor = selectedCurrencyRow.code === 'JPY' ? 100 : 1;
    const appliedRate =
      simRateType === 'BASE'
        ? selectedCurrencyRow.baseRate
        : simRateType === 'CUSTOMS'
        ? selectedCurrencyRow.customsRate
        : selectedCurrencyRow.ttsRate;

    const totalForeign = simForeignUnitPrice * Math.max(1, simQty);
    const krwGoodsAmount = Math.round((totalForeign / unitDivisor) * appliedRate);
    const customsDutyAmount = Math.round(krwGoodsAmount * (simDutyPercent / 100));
    const totalLandedKrw = krwGoodsAmount + customsDutyAmount + (simFreightKrw || 0);
    const perUnitLandedKrw = Math.round(totalLandedKrw / Math.max(1, simQty));

    return {
      appliedRate,
      totalForeign,
      krwGoodsAmount,
      customsDutyAmount,
      totalLandedKrw,
      perUnitLandedKrw
    };
  }, [selectedCurrencyRow, simForeignUnitPrice, simQty, simRateType, simDutyPercent, simFreightKrw]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
      {/* 상단 헤더 */}
      <div className="card" style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>환율조회 · 공식 기준환율 및 수입원가 환산</h2>
            <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              영업관리 · 공식 환율 조회
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            해외 지게차 및 호환부품 수입 결제를 위한 통화별 매매기준율·전신환매도율·관세과세환율을 조회하고 입고관리-유통 원가에 연동합니다.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>고시 기준일자</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} color="var(--text-secondary)" />
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchOfficialRates(targetDate)}
            disabled={isLoading}
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <RefreshCw size={14} />
            <span>{isLoading ? '환율 조회 중...' : '공식 환율 조회'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trade_purchases')}
            className="btn btn-secondary"
            style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <span>입고관리-유통 이동</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* 통화별 요약 카드 4종 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: '10px' }}>
        {rates.map(r => (
          <div
            key={r.code}
            onClick={() => setSimCurrency(r.code)}
            className="card"
            style={{
              padding: '14px 16px',
              cursor: 'pointer',
              border: simCurrency === r.code ? '2px solid #2563eb' : '1px solid var(--border-color)',
              backgroundColor: simCurrency === r.code ? 'rgba(37, 99, 235, 0.04)' : 'var(--bg-card)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>{r.currencyName}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#334155' }}>
                {r.unitLabel}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '21px', fontWeight: 900, color: '#1e40af' }}>
                ₩{r.baseRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: r.prevDiff >= 0 ? '#dc2626' : '#2563eb' }}>
                {r.prevDiff >= 0 ? `전일대비 +${r.prevDiff.toFixed(2)}` : `전일대비 ${r.prevDiff.toFixed(2)}`}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>송금보낼때: ₩{r.ttsRate.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</span>
              <span>관세환율: ₩{r.customsRate.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 공식 환율 상세 고시 테이블 */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>통화별 공식 고시환율 상세표</h3>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>{lastSyncedAt}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>통화명</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>기준단위</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>매매기준율</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>송금보낼때 · 전신환매도율</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>송금받을때 · 전신환매입율</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>관세과세 참고환율</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>주요 수입 적용 대상</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>고시 출처</th>
              </tr>
            </thead>
            <tbody>
              {rates.map(r => (
                <tr key={r.code} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '9px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{r.currencyName}</td>
                  <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>{r.unitLabel}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                    ₩{r.baseRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                    ₩{r.ttsRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₩{r.ttbRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                    ₩{r.customsRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.countryLabel}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.sourceLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 수입 지게차·부품 원화 인수도원가 환율 계산기 */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Calculator size={16} color="#2563eb" />
          <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
            해외수입 지게차·부품 환율 적용 원가 계산기
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(130px, 1fr))', gap: '10px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>결제 통화 선택</label>
            <select
              value={simCurrency}
              onChange={e => setSimCurrency(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
            >
              {rates.map(r => (
                <option key={r.code} value={r.code}>{r.currencyName}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>적용 환율 기준</label>
            <select
              value={simRateType}
              onChange={e => setSimRateType(e.target.value as any)}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
            >
              <option value="TTS">전신환매도율 · 송금환율</option>
              <option value="BASE">매매기준율</option>
              <option value="CUSTOMS">관세과세 참고환율</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>외화 단가</label>
            <input
              type="number"
              value={simForeignUnitPrice}
              onChange={e => setSimForeignUnitPrice(Number(e.target.value) || 0)}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>수입 수량</label>
            <input
              type="number"
              min={1}
              value={simQty}
              onChange={e => setSimQty(Math.max(1, Number(e.target.value) || 1))}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>관세율 · 퍼센트</label>
            <input
              type="number"
              step="0.5"
              value={simDutyPercent}
              onChange={e => setSimDutyPercent(Number(e.target.value) || 0)}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>통관·운송 부대비용 · 원화</label>
            <input
              type="number"
              step="50000"
              value={simFreightKrw}
              onChange={e => setSimFreightKrw(Number(e.target.value) || 0)}
              style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
            />
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
          padding: '12px 14px',
          borderRadius: '8px',
          backgroundColor: 'var(--bg-app)',
          border: '1px solid var(--border-color)'
        }}>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>원화 환산 물대</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
              ₩{simResult.krwGoodsAmount.toLocaleString('ko-KR')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>예상 관세액</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#d97706', marginTop: '2px' }}>
              ₩{simResult.customsDutyAmount.toLocaleString('ko-KR')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>총 수입 인수도원가 합계</div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#1d4ed8', marginTop: '2px' }}>
              ₩{simResult.totalLandedKrw.toLocaleString('ko-KR')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>1대당 평균 취득원가</div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669', marginTop: '2px' }}>
              ₩{simResult.perUnitLandedKrw.toLocaleString('ko-KR')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ExchangeRateInquiryPage;
