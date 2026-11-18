import React, { useMemo } from 'react';
import { FX_CURRENCIES, FX_PERIOD_OPTIONS, formatFxRate } from '../../utils/fxRateUtils';
import {
  SectionPanel,
  SegmentedTabs,
  actionBtnStyle,
} from '../../components/UiPrimitives';
import type { CurrencyCode } from '../../types/domain';

export type ForeignCurrencyCode = Exclude<CurrencyCode, 'KRW'>;

export interface LiveRateEntry {
  rate: number;
  ttsRate: number;
}

export interface FxChartPoint {
  rateDate: string;
  baseRate: number;
  ttsRate: number;
  source: string;
}

export interface FxChartStats {
  minPoint: FxChartPoint & { index: number };
  maxPoint: FxChartPoint & { index: number };
  avgRate: number;
  startRate: number;
  endRate: number;
  diffRate: number;
  diffPct: number;
}

export interface ExchangeRateMarketPanelProps {
  currencyCode: ForeignCurrencyCode;
  liveRates: Record<ForeignCurrencyCode, LiveRateEntry> | null;
  liveUpdatedAt: string;
  liveLoading: boolean;
  onRefresh: () => void;
  onSelectCurrency: (code: ForeignCurrencyCode, live?: LiveRateEntry) => void;
}

export const ExchangeRateMarketPanel: React.FC<ExchangeRateMarketPanelProps> = ({
  currencyCode,
  liveRates,
  liveUpdatedAt,
  liveLoading,
  onRefresh,
  onSelectCurrency,
}) => {
  return (
    <SectionPanel
      title="핵심 통화 현재 환율"
      manualId="fx-live"
      rightSlot={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)' }}>
          {liveUpdatedAt && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
              기준시각 {liveUpdatedAt}
            </span>
          )}
          <button
            type="button"
            disabled={liveLoading}
            onClick={onRefresh}
            style={actionBtnStyle('secondary')}
          >
            {liveLoading ? '조회중' : '현재 환율 갱신'}
          </button>
        </div>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 'var(--space-inline-gap)',
        }}
      >
        {FX_CURRENCIES.map((c) => {
          const live = liveRates?.[c.code];
          const isSelected = currencyCode === c.code;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onSelectCurrency(c.code, live)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 6,
                border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                background: isSelected ? 'rgba(13, 71, 161, 0.06)' : 'var(--surface-panel)',
                cursor: 'pointer',
                textAlign: 'left',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {c.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  전신환 {live ? `${formatFxRate(live.ttsRate, c.code)}원` : '-'}
                </span>
              </div>
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: 'var(--accent-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {live ? `${formatFxRate(live.rate, c.code)}원` : liveLoading ? '조회중' : '-'}
              </span>
            </button>
          );
        })}
      </div>
    </SectionPanel>
  );
};

export interface ExchangeRateChartPanelProps {
  currencyCode: ForeignCurrencyCode;
  rateDate: string;
  periodDays: 30 | 60 | 90;
  showTtsLine: boolean;
  hoverIdx: number | null;
  currencyCountsInPeriod: Record<ForeignCurrencyCode, number>;
  activeChartSeries: FxChartPoint[];
  chartStats: FxChartStats | null;
  onSelectCurrency: (code: ForeignCurrencyCode) => void;
  onChangePeriodDays: (days: 30 | 60 | 90) => void;
  onToggleTtsLine: () => void;
  onHoverIdxChange: (idx: number | null) => void;
  onSelectPoint: (pt: FxChartPoint) => void;
}

export const ExchangeRateChartPanel: React.FC<ExchangeRateChartPanelProps> = ({
  currencyCode,
  rateDate,
  periodDays,
  showTtsLine,
  hoverIdx,
  currencyCountsInPeriod,
  activeChartSeries,
  chartStats,
  onSelectCurrency,
  onChangePeriodDays,
  onToggleTtsLine,
  onHoverIdxChange,
  onSelectPoint,
}) => {
  const svgWidth = 960;
  const svgHeight = 240;
  const padLeft = 72;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 32;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    for (const pt of activeChartSeries) {
      vals.push(pt.baseRate);
      if (showTtsLine) vals.push(pt.ttsRate);
    }
    const minVal = vals.length > 0 ? Math.min(...vals) : 0;
    const maxVal = vals.length > 0 ? Math.max(...vals) : 100;
    const minFloor = currencyCode === 'JPY' ? 0.05 : 1;
    const span = Math.max(minFloor, maxVal - minVal);
    const yMin = minVal - span * 0.16;
    const yMax = maxVal + span * 0.16;
    return { yMin, yMax, ySpan: Math.max(minFloor, yMax - yMin) };
  }, [activeChartSeries, currencyCode, showTtsLine]);

  const getX = (idx: number) => {
    if (activeChartSeries.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (activeChartSeries.length - 1)) * plotW;
  };

  const getY = (val: number) => padTop + plotH - ((val - yDomain.yMin) / yDomain.ySpan) * plotH;

  const basePolyline = activeChartSeries
    .map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.baseRate).toFixed(1)}`)
    .join(' ');

  const ttsPolyline = activeChartSeries
    .map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.ttsRate).toFixed(1)}`)
    .join(' ');

  const baseAreaPath =
    activeChartSeries.length < 2
      ? ''
      : `M ${getX(0).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${activeChartSeries
          .map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.baseRate).toFixed(1)}`)
          .join(' L ')} L ${getX(activeChartSeries.length - 1).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;

  const inspectedPoint = useMemo(() => {
    if (activeChartSeries.length === 0) return null;
    const targetIdx =
      hoverIdx !== null && activeChartSeries[hoverIdx]
        ? hoverIdx
        : activeChartSeries.length - 1;
    const pt = activeChartSeries[targetIdx];
    const prevPt = targetIdx > 0 ? activeChartSeries[targetIdx - 1] : null;
    const factor = currencyCode === 'JPY' ? 10000 : 100;
    const prevDiff = prevPt
      ? Math.round((pt.baseRate - prevPt.baseRate) * factor) / factor
      : 0;
    return { ...pt, index: targetIdx, prevDiff };
  }, [activeChartSeries, currencyCode, hoverIdx]);

  const currentCurrencyMeta = FX_CURRENCIES.find((c) => c.code === currencyCode) || FX_CURRENCIES[0];
  const currentPeriodLabel = FX_PERIOD_OPTIONS.find((p) => p.days === periodDays)?.label || '3개월';

  return (
    <SectionPanel
      title={`관리 환율 ${currentPeriodLabel} 추이 차트 · ${currentCurrencyMeta.name}`}
      manualId="fx-chart"
      rightSlot={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
          <SegmentedTabs
            tabs={FX_CURRENCIES.map((c) => ({
              id: c.code,
              label: c.name,
              count: currencyCountsInPeriod[c.code],
            }))}
            activeId={currencyCode}
            onChange={(id) => onSelectCurrency(id as ForeignCurrencyCode)}
          />
          <SegmentedTabs
            tabs={FX_PERIOD_OPTIONS.map((p) => ({
              id: String(p.days),
              label: p.label,
            }))}
            activeId={String(periodDays)}
            onChange={(id) => onChangePeriodDays(Number(id) as 30 | 60 | 90)}
          />
          <button
            type="button"
            onClick={onToggleTtsLine}
            style={actionBtnStyle(showTtsLine ? 'primary' : 'secondary', true)}
          >
            전신환매도율 {showTtsLine ? '표시' : '숨김'}
          </button>
        </div>
      }
    >
      {activeChartSeries.length === 0 ? (
        <div
          style={{
            padding: 'calc(32px - 2pt) var(--space-panel-pad-x)',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          등록된 관리 환율 데이터가 없습니다. 상단 3개월 고시환율 적재 또는 환율 저장을 실행하십시오.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-field-grid-gap)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-stack-gap)',
              paddingBottom: 'var(--space-inline-gap)',
              borderBottom: '1px solid var(--table-row-border)',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            {chartStats && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-page-gap)', flexWrap: 'wrap' }}>
                <span style={{ whiteSpace: 'nowrap' }}>
                  구간 {activeChartSeries[0].rateDate} ~ {activeChartSeries[activeChartSeries.length - 1].rateDate}
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  최저 <strong style={{ color: 'var(--success)' }}>{formatFxRate(chartStats.minPoint.baseRate, currencyCode)} 원</strong>
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  최고 <strong style={{ color: 'var(--danger)' }}>{formatFxRate(chartStats.maxPoint.baseRate, currencyCode)} 원</strong>
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  평균 <strong style={{ color: 'var(--primary)' }}>{formatFxRate(chartStats.avgRate, currencyCode)} 원</strong>
                </span>
                <span style={{ whiteSpace: 'nowrap' }}>
                  변동{' '}
                  <strong style={{ color: chartStats.diffRate >= 0 ? 'var(--danger)' : 'var(--primary)' }}>
                    {chartStats.diffRate >= 0 ? '+' : ''}
                    {formatFxRate(chartStats.diffRate, currencyCode)} 원 · {chartStats.diffPct >= 0 ? '+' : ''}
                    {chartStats.diffPct.toFixed(2)}%
                  </strong>
                </span>
              </div>
            )}

            {inspectedPoint && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-stack-gap)', fontWeight: 700, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-main)', whiteSpace: 'nowrap' }}>일자 {inspectedPoint.rateDate}</span>
                <span style={{ color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                  매매기준율 {formatFxRate(inspectedPoint.baseRate, currencyCode)} 원
                </span>
                <span style={{ color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                  전신환매도율 {formatFxRate(inspectedPoint.ttsRate, currencyCode)} 원
                </span>
                <span
                  style={{
                    color: inspectedPoint.prevDiff >= 0 ? 'var(--danger)' : 'var(--primary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  직전대비 {inspectedPoint.prevDiff >= 0 ? '+' : ''}
                  {formatFxRate(inspectedPoint.prevDiff, currencyCode)} 원
                </span>
              </div>
            )}
          </div>

          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg
              data-fx-chart="svg"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{ width: '100%', minWidth: '640px', height: '240px', display: 'block', userSelect: 'none' }}
              onMouseLeave={() => onHoverIdxChange(null)}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const val = yDomain.yMax - ratio * yDomain.ySpan;
                const y = padTop + ratio * plotH;
                return (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgWidth - padRight}
                      y2={y}
                      stroke="var(--table-row-border)"
                      strokeDasharray={ratio === 0 || ratio === 1 ? undefined : '3 3'}
                      strokeWidth={1}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fontWeight="600"
                      fill="var(--text-secondary)"
                    >
                      {formatFxRate(val, currencyCode)}
                    </text>
                  </g>
                );
              })}

              {chartStats && (
                <g>
                  <line
                    x1={padLeft}
                    y1={getY(chartStats.avgRate)}
                    x2={svgWidth - padRight}
                    y2={getY(chartStats.avgRate)}
                    stroke="var(--text-muted)"
                    strokeDasharray="5 4"
                    strokeWidth={1.2}
                  />
                  <text
                    x={svgWidth - padRight - 4}
                    y={Math.max(padTop + 12, getY(chartStats.avgRate) - 5)}
                    textAnchor="end"
                    fontSize="10.5"
                    fontWeight="700"
                    fill="var(--text-secondary)"
                  >
                    평균 {formatFxRate(chartStats.avgRate, currencyCode)}
                  </text>
                </g>
              )}

              {baseAreaPath && (
                <path d={baseAreaPath} fill="var(--primary)" fillOpacity={0.09} />
              )}

              {showTtsLine && activeChartSeries.length > 1 && (
                <polyline
                  fill="none"
                  stroke="var(--danger)"
                  strokeWidth="1.6"
                  strokeDasharray="4 3"
                  points={ttsPolyline}
                />
              )}

              {activeChartSeries.length > 1 && (
                <polyline
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={basePolyline}
                />
              )}

              {activeChartSeries.length === 1 && (
                <circle
                  cx={getX(0)}
                  cy={getY(activeChartSeries[0].baseRate)}
                  r={5}
                  fill="var(--primary)"
                  stroke="var(--bg-card)"
                  strokeWidth={2}
                />
              )}

              {chartStats && activeChartSeries.length > 1 && (
                <>
                  <g>
                    <circle
                      cx={getX(chartStats.minPoint.index)}
                      cy={getY(chartStats.minPoint.baseRate)}
                      r={4.5}
                      fill="var(--success)"
                      stroke="var(--bg-card)"
                      strokeWidth={1.5}
                    />
                    <text
                      x={Math.min(svgWidth - padRight - 36, Math.max(padLeft + 36, getX(chartStats.minPoint.index)))}
                      y={Math.min(padTop + plotH - 4, getY(chartStats.minPoint.baseRate) + 15)}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight="700"
                      fill="var(--success)"
                    >
                      최저 {formatFxRate(chartStats.minPoint.baseRate, currencyCode)}
                    </text>
                  </g>
                  <g>
                    <circle
                      cx={getX(chartStats.maxPoint.index)}
                      cy={getY(chartStats.maxPoint.baseRate)}
                      r={4.5}
                      fill="var(--danger)"
                      stroke="var(--bg-card)"
                      strokeWidth={1.5}
                    />
                    <text
                      x={Math.min(svgWidth - padRight - 36, Math.max(padLeft + 36, getX(chartStats.maxPoint.index)))}
                      y={Math.max(padTop + 12, getY(chartStats.maxPoint.baseRate) - 8)}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight="700"
                      fill="var(--danger)"
                    >
                      최고 {formatFxRate(chartStats.maxPoint.baseRate, currencyCode)}
                    </text>
                  </g>
                </>
              )}

              {activeChartSeries.map((pt, idx) => {
                const step = Math.max(1, Math.floor((activeChartSeries.length - 1) / 6));
                const showLabel =
                  activeChartSeries.length <= 7 ||
                  idx === 0 ||
                  idx === activeChartSeries.length - 1 ||
                  idx % step === 0;
                if (!showLabel) return null;
                return (
                  <text
                    key={pt.rateDate}
                    x={getX(idx)}
                    y={svgHeight - 8}
                    textAnchor="middle"
                    fontSize="10.5"
                    fontWeight="600"
                    fill="var(--text-secondary)"
                  >
                    {pt.rateDate.slice(5)}
                  </text>
                );
              })}

              {activeChartSeries.map((pt, idx) => {
                if (pt.rateDate !== rateDate) return null;
                return (
                  <circle
                    key={`selected-${pt.rateDate}`}
                    cx={getX(idx)}
                    cy={getY(pt.baseRate)}
                    r={6.5}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={1.8}
                  />
                );
              })}

              {hoverIdx !== null && activeChartSeries[hoverIdx] && (
                <g>
                  <line
                    x1={getX(hoverIdx)}
                    y1={padTop}
                    x2={getX(hoverIdx)}
                    y2={padTop + plotH}
                    stroke="var(--text-secondary)"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={getX(hoverIdx)}
                    cy={getY(activeChartSeries[hoverIdx].baseRate)}
                    r={5}
                    fill="var(--primary)"
                    stroke="var(--bg-card)"
                    strokeWidth={2}
                  />
                  {showTtsLine && (
                    <circle
                      cx={getX(hoverIdx)}
                      cy={getY(activeChartSeries[hoverIdx].ttsRate)}
                      r={4}
                      fill="var(--danger)"
                      stroke="var(--bg-card)"
                      strokeWidth={1.5}
                    />
                  )}
                </g>
              )}

              {activeChartSeries.map((pt, idx) => {
                const sliceW = plotW / Math.max(1, activeChartSeries.length);
                const x = getX(idx) - sliceW / 2;
                return (
                  <rect
                    key={pt.rateDate}
                    x={Math.max(padLeft, x)}
                    y={padTop}
                    width={Math.max(4, sliceW)}
                    height={plotH}
                    fill="transparent"
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => onHoverIdxChange(idx)}
                    onClick={() => onSelectPoint(pt)}
                  />
                );
              })}
            </svg>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-stack-gap)',
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
            }}
          >
            <span>기준 단위: 1 {currentCurrencyMeta.name} 당 원화 · 차트 일자 클릭 시 상단 편집칸 반영</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-page-gap)', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontWeight: 700, color: 'var(--primary)' }}>
                <span style={{ width: '14px', height: '2.5px', backgroundColor: 'var(--primary)', display: 'inline-block' }} />
                매매기준율
              </span>
              {showTtsLine && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontWeight: 700, color: 'var(--danger)' }}>
                  <span style={{ width: '14px', height: '2px', borderTop: '2px dashed var(--danger)', display: 'inline-block' }} />
                  전신환매도율
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                <span style={{ width: '14px', height: '2px', borderTop: '2px dashed var(--text-muted)', display: 'inline-block' }} />
                {currentPeriodLabel} 평균선
              </span>
            </div>
          </div>
        </div>
      )}
    </SectionPanel>
  );
};
