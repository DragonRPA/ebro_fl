import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import { upsertManagedExchangeRates } from '../../services/domainHrAdminEngine';
import { addDaysIso, todayIso } from '../../services/domainMath';
import { FX_CURRENCIES, FX_PERIOD_OPTIONS, formatFxRate } from '../../utils/fxRateUtils';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  formatKoCurrency,
  type FlExchangeRate,
} from '../../types/domain';
import {
  ExchangeRateChartPanel,
  ExchangeRateMarketPanel,
  type ForeignCurrencyCode,
  type FxChartPoint,
  type FxChartStats,
  type LiveRateEntry,
} from './ExchangeRateChartPanel';

export const ExchangeRatesPage: React.FC = () => {
  const { datasets, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('exchange_rates');

  const today = todayIso();
  const [rateDate, setRateDate] = useState(today);
  const [currencyCode, setCurrencyCode] = useState<ForeignCurrencyCode>('USD');
  const [baseRateKrw, setBaseRateKrw] = useState<number>(1395.5);
  const [ttSellingRate, setTtSellingRate] = useState<number>(1409.5);
  const [source, setSource] = useState('한국수출입은행');
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90>(90);
  const [showTtsLine, setShowTtsLine] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [gridFilter, setGridFilter] = useState<'ALL' | ForeignCurrencyCode>('ALL');
  const [busy, setBusy] = useState(false);
  const [liveRates, setLiveRates] = useState<
    Record<ForeignCurrencyCode, LiveRateEntry> | null
  >(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string>('');
  const [liveLoading, setLiveLoading] = useState(false);

  const fetchLiveRates = useCallback(async () => {
    setLiveLoading(true);
    try {
      let rateMap: Record<string, number> | null = null;
      let updatedLabel = '';

      try {
        const resp = await fetch('https://open.er-api.com/v6/latest/KRW');
        if (resp.ok) {
          const json = (await resp.json()) as {
            result?: string;
            time_last_update_utc?: string;
            rates?: Record<string, number>;
          };
          if (json.result === 'success' && json.rates) {
            rateMap = json.rates;
            updatedLabel = new Date().toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          }
        }
      } catch {
        // fallback below
      }

      if (!rateMap) {
        const fbResp = await fetch(
          'https://api.frankfurter.dev/v1/latest?base=KRW&symbols=USD,CNY,EUR,JPY'
        );
        if (fbResp.ok) {
          const fbJson = (await fbResp.json()) as {
            date?: string;
            rates?: Record<string, number>;
          };
          if (fbJson.rates) {
            rateMap = fbJson.rates;
            updatedLabel = fbJson.date || today;
          }
        }
      }

      if (rateMap) {
        const nextRates = {} as Record<ForeignCurrencyCode, LiveRateEntry>;
        for (const c of FX_CURRENCIES) {
          const krwToForeign = Number(rateMap[c.code] || 0);
          if (krwToForeign > 0) {
            const factor = c.code === 'JPY' ? 10000 : 100;
            const rate = Math.round((1 / krwToForeign) * factor) / factor;
            const ttsRate = Math.round(rate * 1.01 * factor) / factor;
            nextRates[c.code] = { rate, ttsRate };
          }
        }
        if (Object.keys(nextRates).length > 0) {
          setLiveRates(nextRates);
          setLiveUpdatedAt(updatedLabel);
        }
      }
    } finally {
      setLiveLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void fetchLiveRates();
  }, [fetchLiveRates]);

  const selectCurrency = (nextCode: ForeignCurrencyCode) => {
    setCurrencyCode(nextCode);
    setHoverIdx(null);
    const sameDateRow = datasets.exchangeRates.find(
      (r) => r.currencyCode === nextCode && r.rateDate === rateDate
    );
    const latestRow =
      sameDateRow ||
      [...datasets.exchangeRates]
        .filter((r) => r.currencyCode === nextCode)
        .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
    if (latestRow) {
      setBaseRateKrw(Number(latestRow.baseRateKrw));
      setTtSellingRate(
        Number(latestRow.ttSellingRate || Math.round(Number(latestRow.baseRateKrw) * 101) / 100)
      );
      setSource(latestRow.source || '외환시장 고시환율');
    }
  };

  const handleFetchRate = async () => {
    setBusy(true);
    try {
      const resp = await fetch(`/api/exchange-rate?currency=${currencyCode}&date=${rateDate}`);
      if (!resp.ok) throw new Error(`환율 조회 오류 · 상태코드 ${resp.status}`);
      const json = (await resp.json()) as {
        success?: boolean;
        data?: { baseRate: number; ttsRate: number; baseDate: string; source: string };
      };
      if (json.success && json.data) {
        setBaseRateKrw(Number(json.data.baseRate));
        setTtSellingRate(Number(json.data.ttsRate));
        setSource(json.data.source || '고시환율조회');
        notifyToast('고시환율 조회 완료', 'success');
      } else {
        throw new Error('환율 응답 데이터가 없습니다.');
      }
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '환율 조회 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSync3MonthRates = async () => {
    setBusy(true);
    try {
      const endDateStr = rateDate <= today ? rateDate : today;
      const startDateStr = addDaysIso(endDateStr, -90);

      const fetchCurrencySeries = async (targetCode: (typeof FX_CURRENCIES)[number]['code']) => {
        let series: Array<{ date: string; baseRate: number; ttsRate: number }> = [];
        let fetchedSource = '국제외환시장 고시환율';

        try {
          const apiResp = await fetch(
            `/api/exchange-rate?currency=${encodeURIComponent(targetCode)}&date=${encodeURIComponent(endDateStr)}&days=90`
          );
          if (apiResp.ok) {
            const apiJson = (await apiResp.json()) as {
              success?: boolean;
              data?: {
                source?: string;
                series?: Array<{ date: string; baseRate: number; ttsRate?: number }>;
              };
            };
            if (apiJson.success && Array.isArray(apiJson.data?.series) && apiJson.data.series.length > 0) {
              series = apiJson.data.series.map((pt) => ({
                date: pt.date,
                baseRate: Number(pt.baseRate),
                ttsRate: Number(pt.ttsRate || Number(pt.baseRate) * 1.01),
              }));
              if (apiJson.data.source) fetchedSource = apiJson.data.source;
            }
          }
        } catch {
          // 정적 프리뷰 등 로컬 API 미지원 환경에서는 직접 시계열 조회
        }

        if (series.length === 0) {
          const directResp = await fetch(
            `https://api.frankfurter.dev/v1/${startDateStr}..${endDateStr}?base=${encodeURIComponent(targetCode)}&symbols=KRW`
          );
          if (directResp.ok) {
            const directJson = (await directResp.json()) as {
              rates?: Record<string, { KRW?: number }>;
            };
            const rateMap = directJson?.rates || {};
            const factor = targetCode === 'JPY' ? 10000 : 100;
            series = Object.keys(rateMap)
              .sort()
              .map((dt) => {
                const baseRate = Math.round(Number(rateMap[dt]?.KRW || 0) * factor) / factor;
                return {
                  date: dt,
                  baseRate,
                  ttsRate: Math.round(baseRate * 1.01 * factor) / factor,
                };
              })
              .filter((pt) => pt.baseRate > 0);
          }
        }

        return { targetCode, series, fetchedSource };
      };

      const results = await Promise.all(FX_CURRENCIES.map((c) => fetchCurrencySeries(c.code)));
      const allRows = results.flatMap(({ targetCode, series, fetchedSource }) =>
        series.map((pt) => ({
          rateDate: pt.date,
          currencyCode: targetCode,
          baseRateKrw: pt.baseRate,
          ttSellingRate: pt.ttsRate,
          source: fetchedSource,
        }))
      );

      if (allRows.length === 0) {
        throw new Error('3개월 고시환율 시계열 데이터를 수신하지 못했습니다.');
      }

      const savedCount = await upsertManagedExchangeRates({ rows: allRows });
      const currentResult = results.find((r) => r.targetCode === currencyCode);
      if (currentResult && currentResult.series.length > 0) {
        const lastPt = currentResult.series[currentResult.series.length - 1];
        setRateDate(lastPt.date);
        setBaseRateKrw(lastPt.baseRate);
        setTtSellingRate(lastPt.ttsRate);
        setSource(currentResult.fetchedSource);
      }
      await refreshAll();
      const loadedCurrencies = results.filter((r) => r.series.length > 0).length;
      notifyToast(`전체 ${loadedCurrencies}개 통화 최근 3개월 관리 환율 ${savedCount}건 적재 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '3개월 환율 적재 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRate = async () => {
    if (baseRateKrw <= 0) {
      notifyToast('기준환율은 0보다 커야 합니다.', 'error');
      return;
    }
    setBusy(true);
    try {
      const existing = datasets.exchangeRates.find(
        (r) => r.rateDate === rateDate && r.currencyCode === currencyCode
      );
      if (existing) {
        await execDbMutation('환율 수정', () =>
          flSupabase
            .from('exchange_rates')
            .update(camelToSnakeRow({ baseRateKrw, ttSellingRate, source }))
            .eq('id', existing.id)
        );
      } else {
        const rec: FlExchangeRate = {
          id: newId('FX'),
          tenantId: DEFAULT_TENANT_ID,
          rateDate,
          currencyCode,
          baseRateKrw,
          ttSellingRate,
          source,
        };
        await execDbMutation('환율 등록', () =>
          flSupabase.from('exchange_rates').insert(camelToSnakeRow({ ...rec }))
        );
      }
      await refreshAll();
      notifyToast('환율 저장 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '환율 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const currencySeriesMap = useMemo(() => {
    const grouped: Record<ForeignCurrencyCode, FlExchangeRate[]> = {
      USD: [],
      CNY: [],
      EUR: [],
      JPY: [],
    };
    const byKey = new Map<string, FlExchangeRate>();
    for (const r of datasets.exchangeRates) {
      const key = `${r.currencyCode}__${r.rateDate}`;
      if (!byKey.has(key)) byKey.set(key, r);
    }
    for (const r of byKey.values()) {
      if (grouped[r.currencyCode]) {
        grouped[r.currencyCode].push(r);
      }
    }
    for (const cur of Object.keys(grouped) as Array<ForeignCurrencyCode>) {
      grouped[cur].sort((a, b) => a.rateDate.localeCompare(b.rateDate));
    }
    return grouped;
  }, [datasets.exchangeRates]);

  const currencyCountsInPeriod = useMemo(() => {
    const out: Record<ForeignCurrencyCode, number> = {
      USD: 0,
      CNY: 0,
      EUR: 0,
      JPY: 0,
    };
    for (const cur of FX_CURRENCIES) {
      const rows = currencySeriesMap[cur.code];
      if (rows.length === 0) continue;
      const latestDt = rows[rows.length - 1].rateDate;
      const cutoff = addDaysIso(latestDt, -(periodDays - 1));
      out[cur.code] = rows.filter((r) => r.rateDate >= cutoff).length;
    }
    return out;
  }, [currencySeriesMap, periodDays]);

  const activeChartSeries = useMemo<FxChartPoint[]>(() => {
    const rows = currencySeriesMap[currencyCode] || [];
    if (rows.length === 0) return [];
    const latestDt = rows[rows.length - 1].rateDate;
    const cutoff = addDaysIso(latestDt, -(periodDays - 1));
    return rows.filter((r) => r.rateDate >= cutoff).map((r) => {
      const base = Number(r.baseRateKrw || 0);
      const tts = Number(r.ttSellingRate || Math.round(base * 101) / 100);
      return {
        rateDate: r.rateDate,
        baseRate: base,
        ttsRate: tts,
        source: r.source,
      };
    });
  }, [currencyCode, currencySeriesMap, periodDays]);

  const chartStats = useMemo<FxChartStats | null>(() => {
    if (activeChartSeries.length === 0) {
      return null;
    }
    let minIdx = 0;
    let maxIdx = 0;
    let sum = 0;
    activeChartSeries.forEach((pt, idx) => {
      sum += pt.baseRate;
      if (pt.baseRate < activeChartSeries[minIdx].baseRate) minIdx = idx;
      if (pt.baseRate > activeChartSeries[maxIdx].baseRate) maxIdx = idx;
    });
    const factor = currencyCode === 'JPY' ? 10000 : 100;
    const avgRate = Math.round((sum / activeChartSeries.length) * factor) / factor;
    const startRate = activeChartSeries[0].baseRate;
    const endRate = activeChartSeries[activeChartSeries.length - 1].baseRate;
    const diffRate = Math.round((endRate - startRate) * factor) / factor;
    const diffPct = startRate > 0 ? Math.round(((endRate - startRate) / startRate) * 10000) / 100 : 0;
    return {
      minPoint: { ...activeChartSeries[minIdx], index: minIdx },
      maxPoint: { ...activeChartSeries[maxIdx], index: maxIdx },
      avgRate,
      startRate,
      endRate,
      diffRate,
      diffPct,
    };
  }, [activeChartSeries, currencyCode]);

  const sorted = useMemo(() => {
    return [...datasets.exchangeRates]
      .filter((r) => gridFilter === 'ALL' || r.currencyCode === gridFilter)
      .sort((a, b) => b.rateDate.localeCompare(a.rateDate) || a.currencyCode.localeCompare(b.currencyCode));
  }, [datasets.exchangeRates, gridFilter]);

  const currentCurrencyMeta = FX_CURRENCIES.find((c) => c.code === currencyCode) || FX_CURRENCIES[0];
  const currentPeriodLabel = FX_PERIOD_OPTIONS.find((p) => p.days === periodDays)?.label || '3개월';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel title="고시환율 조회 · 등록" manualId="fx-fetch">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
          <VerticalField label="적용일자" width={145}>
            <input
              type="date"
              value={rateDate}
              onChange={(e) => setRateDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="통화 선택" width={140}>
            <select
              value={currencyCode}
              onChange={(e) =>
                selectCurrency(e.target.value as ForeignCurrencyCode)
              }
              style={controlInputStyle}
            >
              {FX_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </VerticalField>
          <VerticalField label="매매기준율" width={135}>
            <input
              type="number"
              step="0.0001"
              value={baseRateKrw}
              onChange={(e) => setBaseRateKrw(Number(e.target.value))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="전신환매도율" width={135}>
            <input
              type="number"
              step="0.0001"
              value={ttSellingRate}
              onChange={(e) => setTtSellingRate(Number(e.target.value))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="출처" minWidth={140} flex={1}>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <button
            type="button"
            disabled={busy}
            onClick={handleFetchRate}
            style={actionBtnStyle('secondary')}
          >
            환율 조회
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleSync3MonthRates}
                style={actionBtnStyle('secondary')}
              >
                3개월 고시환율 적재
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveRate}
                style={actionBtnStyle('primary')}
              >
                환율 저장
              </button>
            </>
          )}
        </div>
      </SectionPanel>

      <ExchangeRateMarketPanel
        currencyCode={currencyCode}
        liveRates={liveRates}
        liveUpdatedAt={liveUpdatedAt}
        liveLoading={liveLoading}
        onRefresh={() => void fetchLiveRates()}
        onSelectCurrency={(code, live) => {
          selectCurrency(code);
          if (live) {
            setRateDate(today);
            setBaseRateKrw(live.rate);
            setTtSellingRate(live.ttsRate);
            setSource('국제외환시장 현재환율');
          }
        }}
      />

      <ExchangeRateChartPanel
        currencyCode={currencyCode}
        rateDate={rateDate}
        periodDays={periodDays}
        showTtsLine={showTtsLine}
        hoverIdx={hoverIdx}
        currencyCountsInPeriod={currencyCountsInPeriod}
        activeChartSeries={activeChartSeries}
        chartStats={chartStats}
        onSelectCurrency={selectCurrency}
        onChangePeriodDays={(days) => {
          setPeriodDays(days);
          setHoverIdx(null);
        }}
        onToggleTtsLine={() => setShowTtsLine((v) => !v)}
        onHoverIdxChange={setHoverIdx}
        onSelectPoint={(pt) => {
          setRateDate(pt.rateDate);
          setBaseRateKrw(pt.baseRate);
          setTtSellingRate(pt.ttsRate);
          setSource(pt.source);
        }}
      />

      <SectionPanel
        title="고시환율 원장"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체', count: datasets.exchangeRates.length },
              ...FX_CURRENCIES.map((c) => ({
                id: c.code,
                label: c.name,
                count: (currencySeriesMap[c.code] || []).length,
              })),
            ]}
            activeId={gridFilter}
            onChange={(id) => {
              setGridFilter(id as typeof gridFilter);
              if (id !== 'ALL') {
                selectCurrency(id as ForeignCurrencyCode);
              }
            }}
          />
        }
      >
        <DataGrid
          manualId="fx-grid"
          columns={[
            { key: 'rateDate', header: '적용일자', width: 120, render: (r) => r.rateDate },
            {
              key: 'currencyCode',
              header: '통화',
              width: 105,
              align: 'center',
              render: (r) => <StatusBadge label={formatKoCurrency(r.currencyCode)} tone="primary" />,
            },
            {
              key: 'baseRateKrw',
              header: '매매기준율',
              width: 140,
              align: 'right',
              render: (r) => `${formatFxRate(Number(r.baseRateKrw), r.currencyCode)} 원`,
            },
            {
              key: 'ttSellingRate',
              header: '전신환매도율',
              width: 140,
              align: 'right',
              render: (r) =>
                r.ttSellingRate ? `${formatFxRate(Number(r.ttSellingRate), r.currencyCode)} 원` : '-',
            },
            { key: 'source', header: '출처', render: (r) => r.source },
          ]}
          rows={sorted}
          rowKey={(r) => r.id}
          onRowClick={(r) => {
            setCurrencyCode(r.currencyCode);
            setRateDate(r.rateDate);
            setBaseRateKrw(Number(r.baseRateKrw));
            setTtSellingRate(Number(r.ttSellingRate || 0));
            setSource(r.source);
            setHoverIdx(null);
          }}
          maxHeight="clamp(220px, calc(100vh - 590px), 540px)"
        />
      </SectionPanel>

      <ConservationBar
        manualId="fx-conservation"
        balanced={activeChartSeries.length > 0}
        balanceMessage={activeChartSeries.length > 0 ? '관리 환율 원장 정상' : '환율 데이터 미등록'}
        items={[
          { label: '관리 통화', value: `${FX_CURRENCIES.length}종`, tone: 'neutral' },
          { label: '전체 원장', value: `${datasets.exchangeRates.length}건`, tone: 'primary' },
          { label: `${currentCurrencyMeta.name} ${currentPeriodLabel}`, value: `${activeChartSeries.length}건`, tone: 'success' },
          {
            label: `${currentCurrencyMeta.name} 최신 매매기준율`,
            value:
              chartStats
                ? `${formatFxRate(chartStats.endRate, currencyCode)} 원`
                : `${formatFxRate(baseRateKrw, currencyCode)} 원`,
            tone: 'primary',
          },
        ]}
      />
    </div>
  );
};
