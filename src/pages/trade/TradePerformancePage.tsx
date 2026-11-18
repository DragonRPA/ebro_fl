import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { currentYm, todayIso } from '../../services/domainMath';
import { SearchableSelect } from '../../components/SearchableSelect';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';

export const TradePerformancePage: React.FC = () => {
  const { datasets, formatMoney } = useAppShell();
  const ymStart = `${currentYm()}-01`;
  const today = todayIso();

  const [viewMode, setViewMode] = useState<'DETAIL' | 'MONTHLY' | 'YEARLY' | 'DIMENSION'>('DETAIL');
  const [dimType, setDimType] = useState<'MANUFACTURER' | 'MODEL' | 'PARTNER'>('MANUFACTURER');
  const [startDate, setStartDate] = useState(ymStart);
  const [endDate, setEndDate] = useState(today);
  const [filterPartnerName, setFilterPartnerName] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const tradePurchaseIds = useMemo(
    () =>
      new Set(
        datasets.purchases.filter((p) => p.targetDomain === 'TRADE').map((p) => p.id)
      ),
    [datasets.purchases]
  );

  const periodFxGainLoss = useMemo(() => {
    let total = 0;
    for (const ap of datasets.apPayables) {
      if (ap.payableType !== 'PURCHASE') continue;
      if (ap.refId && !tradePurchaseIds.has(ap.refId)) continue;
      const fx = Number(ap.fxGainLossKrw || 0);
      if (fx === 0) continue;
      const dt = (ap.paidDate || ap.accrualDate || '').slice(0, 10);
      if (startDate && dt < startDate) continue;
      if (endDate && dt > endDate) continue;
      total += fx;
    }
    return Math.round(total);
  }, [datasets.apPayables, endDate, startDate, tradePurchaseIds]);

  const rows = useMemo(() => {
    const out: {
      id: string;
      date: string;
      partnerName: string;
      itemName: string;
      salesKrw: number;
      cogsKrw: number;
      refundKrw: number;
      grossProfit: number;
    }[] = [];

    for (const f of datasets.fulfillments) {
      if (f.fulfillmentDomain !== 'TRADE' || f.status !== 'COMPLETED') continue;
      const d = f.effectiveDate || '';
      if (d < startDate || d > endDate) continue;
      const line = datasets.contractLines.find((l) => l.id === f.contractLineId);
      const sales = line
        ? f.quantity === line.quantity
          ? Math.round(line.supplyAmountKrw)
          : Math.round((line.supplyAmountKrw * f.quantity) / Math.max(1, line.quantity))
        : 0;
      const cogs = f.cogsAmountKrw;
      out.push({
        id: f.id,
        date: d,
        partnerName: f.partnerName,
        itemName: line?.itemName || f.fulfillmentNo,
        salesKrw: sales,
        cogsKrw: cogs,
        refundKrw: 0,
        grossProfit: sales - cogs,
      });
    }

    for (const b of datasets.billings) {
      if (b.status === 'CANCELLED' || b.billingDomain !== 'TRADE') continue;
      const bYm = b.billingYm;
      if (bYm < startDate.slice(0, 7) || bYm > endDate.slice(0, 7)) continue;
      for (const bl of b.lines || []) {
        if (!bl.dispatchId) continue;
        out.push({
          id: `${b.id}-${bl.dispatchId}`,
          date: b.billingDate,
          partnerName: b.partnerName,
          itemName: bl.description,
          salesKrw: bl.supplyAmountKrw,
          cogsKrw: 0,
          refundKrw: 0,
          grossProfit: bl.supplyAmountKrw,
        });
      }
    }

    for (const ac of datasets.tradeAftercareCases) {
      if (ac.status !== 'COMPLETED') continue;
      if (ac.effectiveDate < startDate || ac.effectiveDate > endDate) continue;
      const u = datasets.inventoryUnits.find((x) => x.id === ac.unitId);
      const revCogs = u ? u.unitCostKrw : 0;
      if (ac.caseType === '반품환불') {
        out.push({
          id: ac.id,
          date: ac.effectiveDate,
          partnerName: ac.partnerName,
          itemName: `반품환불 · ${u?.itemName || ac.caseNo}`,
          salesKrw: 0,
          cogsKrw: -revCogs,
          refundKrw: ac.refundSupplyKrw,
          grossProfit: -ac.refundSupplyKrw + revCogs,
        });
      } else if (ac.caseType === '반품교환') {
        const rep = ac.replacementUnitId
          ? datasets.inventoryUnits.find((x) => x.id === ac.replacementUnitId)
          : undefined;
        const repCogs = rep ? rep.unitCostKrw : 0;
        const netCogsDelta = repCogs - revCogs;
        out.push({
          id: ac.id,
          date: ac.effectiveDate,
          partnerName: ac.partnerName,
          itemName: `반품교환 · ${u?.itemName || ac.caseNo}`,
          salesKrw: 0,
          cogsKrw: netCogsDelta,
          refundKrw: 0,
          grossProfit: -netCogsDelta,
        });
      }
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [datasets, endDate, startDate]);

  const partnerFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.partnerName) seen.add(r.partnerName);
    }
    return [
      { value: '', label: '전체 매출처' },
      ...[...seen].sort((a, b) => a.localeCompare(b, 'ko')).map((name) => ({ value: name, label: name })),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const kw = filterKeyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterPartnerName && r.partnerName !== filterPartnerName) return false;
      if (kw && !`${r.partnerName} ${r.itemName}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [filterKeyword, filterPartnerName, rows]);

  const itemMasterMap = useMemo(
    () => new Map(datasets.itemMasters.map((it) => [it.id, it])),
    [datasets.itemMasters]
  );

  const periodSummaryRows = useMemo(() => {
    const isYearly = viewMode === 'YEARLY';
    const map = new Map<
      string,
      {
        period: string;
        purchaseKrw: number;
        salesKrw: number;
        refundKrw: number;
        cogsKrw: number;
        unitCount: number;
      }
    >();
    const ensure = (p: string) => {
      let cur = map.get(p);
      if (!cur) {
        cur = { period: p, purchaseKrw: 0, salesKrw: 0, refundKrw: 0, cogsKrw: 0, unitCount: 0 };
        map.set(p, cur);
      }
      return cur;
    };

    for (const pur of datasets.purchases) {
      if (pur.status !== 'CONFIRMED' || pur.targetDomain !== 'TRADE') continue;
      const dt = (pur.effectiveDate || '').slice(0, 10);
      if (startDate && dt < startDate) continue;
      if (endDate && dt > endDate) continue;
      const key = isYearly ? dt.slice(0, 4) : dt.slice(0, 7);
      if (key) ensure(key).purchaseKrw += Number(pur.totalLandedCostKrw || 0);
    }

    for (const f of datasets.fulfillments) {
      if (f.fulfillmentDomain !== 'TRADE' || f.status !== 'COMPLETED') continue;
      const dt = (f.effectiveDate || '').slice(0, 10);
      if (startDate && dt < startDate) continue;
      if (endDate && dt > endDate) continue;
      if (filterPartnerName && f.partnerName !== filterPartnerName) continue;
      const key = isYearly ? dt.slice(0, 4) : dt.slice(0, 7);
      if (key) ensure(key).unitCount += Number(f.quantity || 0);
    }

    for (const r of filteredRows) {
      const key = isYearly ? r.date.slice(0, 4) : r.date.slice(0, 7);
      if (!key) continue;
      const cur = ensure(key);
      cur.salesKrw += r.salesKrw;
      cur.refundKrw += r.refundKrw;
      cur.cogsKrw += r.cogsKrw;
    }

    return [...map.values()]
      .map((x) => {
        const netSales = x.salesKrw - x.refundKrw;
        const grossProfit = netSales - x.cogsKrw;
        const marginRate = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
        return { ...x, netSales, grossProfit, marginRate };
      })
      .sort((a, b) => b.period.localeCompare(a.period));
  }, [datasets.fulfillments, datasets.purchases, endDate, filterPartnerName, filteredRows, startDate, viewMode]);

  const dimensionRows = useMemo(() => {
    const map = new Map<
      string,
      {
        dimKey: string;
        qty: number;
        salesKrw: number;
        refundKrw: number;
        cogsKrw: number;
      }
    >();
    const ensure = (k: string) => {
      let cur = map.get(k);
      if (!cur) {
        cur = { dimKey: k, qty: 0, salesKrw: 0, refundKrw: 0, cogsKrw: 0 };
        map.set(k, cur);
      }
      return cur;
    };

    for (const f of datasets.fulfillments) {
      if (f.fulfillmentDomain !== 'TRADE' || f.status !== 'COMPLETED') continue;
      const dt = (f.effectiveDate || '').slice(0, 10);
      if (startDate && dt < startDate) continue;
      if (endDate && dt > endDate) continue;
      if (filterPartnerName && f.partnerName !== filterPartnerName) continue;
      const it = itemMasterMap.get(f.itemId);
      const key =
        dimType === 'MANUFACTURER'
          ? it?.manufacturer || '기타 제조사'
          : dimType === 'MODEL'
            ? it?.modelName || '기타 모델'
            : f.partnerName;
      const line = datasets.contractLines.find((l) => l.id === f.contractLineId);
      const sales = line ? Math.round(Number(line.unitPriceKrw || 0) * Number(f.quantity || 0)) : 0;
      const cur = ensure(key);
      cur.qty += Number(f.quantity || 0);
      cur.salesKrw += sales;
      cur.cogsKrw += Number(f.cogsAmountKrw || 0);
    }

    return [...map.values()]
      .map((x) => {
        const netSales = x.salesKrw - x.refundKrw;
        const grossProfit = netSales - x.cogsKrw;
        const marginRate = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
        return { ...x, netSales, grossProfit, marginRate };
      })
      .sort((a, b) => b.netSales - a.netSales);
  }, [datasets.contractLines, datasets.fulfillments, dimType, endDate, filterPartnerName, itemMasterMap, startDate]);

  const totals = useMemo(() => {
    const netSales = filteredRows.reduce((s, r) => s + r.salesKrw - r.refundKrw, 0);
    const netCogs = filteredRows.reduce((s, r) => s + r.cogsKrw, 0);
    return {
      sales: filteredRows.reduce((s, r) => s + r.salesKrw, 0),
      refund: filteredRows.reduce((s, r) => s + r.refundKrw, 0),
      cogs: netCogs,
      gp: netSales - netCogs,
    };
  }, [filteredRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="유통 실적 조회 조건"
        manualId="tperf-period"
        rightSlot={
          (filterPartnerName || filterKeyword) ? (
            <button
              type="button"
              onClick={() => {
                setFilterPartnerName('');
                setFilterKeyword('');
              }}
              style={actionBtnStyle('secondary', true)}
            >
              필터 초기화
            </button>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-stack-gap)', alignItems: 'center' }}>
            <SegmentedTabs
              tabs={[
                { id: 'DETAIL', label: '건별 상세' },
                { id: 'MONTHLY', label: '월별 매입·매출·판매대수' },
                { id: 'YEARLY', label: '연도별 매입·매출' },
                { id: 'DIMENSION', label: '제조사·모델·거래처별' },
              ]}
              activeId={viewMode}
              onChange={(id) => setViewMode(id as typeof viewMode)}
            />
            {viewMode === 'DIMENSION' && (
              <SegmentedTabs
                tabs={[
                  { id: 'MANUFACTURER', label: '제조사별 매출현황' },
                  { id: 'MODEL', label: '모델별 매출현황' },
                  { id: 'PARTNER', label: '거래처별 매출현황' },
                ]}
                activeId={dimType}
                onChange={(id) => setDimType(id as typeof dimType)}
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-stack-gap)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <VerticalField label="시작일" width={150}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="종료일" width={150}>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="매출처" width={220}>
            <SearchableSelect
              value={filterPartnerName}
              onChange={setFilterPartnerName}
              options={partnerFilterOptions}
              placeholder="전체 매출처"
              searchPlaceholder="매출처명 · 초성 검색"
            />
          </VerticalField>
          <VerticalField label="품명 · 내역 검색" width={240}>
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="품명, 모델, 반품/운송 내역"
              style={controlInputStyle}
            />
          </VerticalField>
          </div>
        </div>
      </SectionPanel>

      {viewMode === 'DETAIL' && (
      <DataGrid
        manualId="tperf-grid"
        columns={[
          {
            key: 'date',
            header: '귀속기준일',
            width: 105,
            sortable: true,
            sortValue: (r) => r.date,
            render: (r) => r.date,
          },
          {
            key: 'partnerName',
            header: '매출처',
            width: 160,
            sortable: true,
            sortValue: (r) => r.partnerName,
            render: (r) => r.partnerName,
          },
          {
            key: 'itemName',
            header: '품명 · 내역',
            sortable: true,
            sortValue: (r) => r.itemName,
            render: (r) => r.itemName,
          },
          {
            key: 'sales',
            header: '유통매출액',
            width: 125,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.salesKrw || 0),
            render: (r) => formatMoney(r.salesKrw, { salesSensitive: true }),
          },
          {
            key: 'refund',
            header: '반품차감',
            width: 115,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.refundKrw || 0),
            render: (r) => formatMoney(r.refundKrw, { salesSensitive: true }),
          },
          {
            key: 'cogs',
            header: '매출원가',
            width: 125,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.cogsKrw || 0),
            render: (r) => formatMoney(r.cogsKrw),
          },
          {
            key: 'gp',
            header: '매출총이익',
            width: 125,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.grossProfit || 0),
            render: (r) => (
              <span style={{ fontWeight: 700, color: r.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatMoney(r.grossProfit, { salesSensitive: true })}
              </span>
            ),
          },
          {
            key: 'marginRate',
            header: '이익율',
            width: 90,
            align: 'right',
            sortable: true,
            sortValue: (r) => {
              const netSales = Number(r.salesKrw || 0) - Number(r.refundKrw || 0);
              return netSales > 0 ? (Number(r.grossProfit || 0) / netSales) * 100 : 0;
            },
            render: (r) => {
              const netSales = Number(r.salesKrw || 0) - Number(r.refundKrw || 0);
              const rate = netSales > 0 ? (Number(r.grossProfit || 0) / netSales) * 100 : 0;
              return (
                <span style={{ fontWeight: 700, color: rate >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {`${rate.toFixed(2)}%`}
                </span>
              );
            },
          },
        ]}
        rows={filteredRows}
        rowKey={(r) => r.id}
        maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
      />
      )}

      {(viewMode === 'MONTHLY' || viewMode === 'YEARLY') && (
        <DataGrid
          manualId="tprf-period-grid"
          excelFileName={viewMode === 'YEARLY' ? '유통실적_연도별_매입매출' : '유통실적_월별_매입매출_판매대수'}
          columns={[
            { key: 'period', header: viewMode === 'YEARLY' ? '기준연도' : '기준월', width: 110, render: (r) => <span style={{ fontWeight: 700 }}>{r.period}</span> },
            { key: 'unitCount', header: '판매대수', width: 95, align: 'right', render: (r) => `${r.unitCount.toLocaleString('ko-KR')}대` },
            { key: 'purchaseKrw', header: '매입실적', width: 135, align: 'right', render: (r) => formatMoney(r.purchaseKrw) },
            { key: 'salesKrw', header: '유통매출액', width: 135, align: 'right', render: (r) => formatMoney(r.salesKrw, { salesSensitive: true }) },
            { key: 'refundKrw', header: '반품차감', width: 115, align: 'right', render: (r) => formatMoney(r.refundKrw, { salesSensitive: true }) },
            { key: 'cogsKrw', header: '매출원가', width: 130, align: 'right', render: (r) => formatMoney(r.cogsKrw) },
            {
              key: 'gp',
              header: '매출총이익',
              width: 130,
              align: 'right',
              render: (r) => (
                <span style={{ fontWeight: 700, color: r.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatMoney(r.grossProfit, { salesSensitive: true })}
                </span>
              ),
            },
            {
              key: 'marginRate',
              header: '이익율',
              width: 90,
              align: 'right',
              render: (r) => (
                <span style={{ fontWeight: 700, color: r.marginRate >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {`${r.marginRate.toFixed(2)}%`}
                </span>
              ),
            },
          ]}
          rows={periodSummaryRows}
          rowKey={(r) => r.period}
          maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
        />
      )}

      {viewMode === 'DIMENSION' && (
        <DataGrid
          manualId="tprf-dim-grid"
          excelFileName={
            dimType === 'MANUFACTURER'
              ? '유통실적_제조사별_매출현황'
              : dimType === 'MODEL'
                ? '유통실적_모델별_매출현황'
                : '유통실적_거래처별_매출현황'
          }
          columns={[
            {
              key: 'dimKey',
              header: dimType === 'MANUFACTURER' ? '제조사' : dimType === 'MODEL' ? '모델명' : '거래처',
              render: (r) => <span style={{ fontWeight: 700 }}>{r.dimKey}</span>,
            },
            { key: 'qty', header: '판매수량', width: 95, align: 'right', render: (r) => `${r.qty.toLocaleString('ko-KR')}대` },
            { key: 'salesKrw', header: '유통매출액', width: 140, align: 'right', render: (r) => formatMoney(r.salesKrw, { salesSensitive: true }) },
            { key: 'cogsKrw', header: '매출원가', width: 135, align: 'right', render: (r) => formatMoney(r.cogsKrw) },
            {
              key: 'gp',
              header: '매출총이익',
              width: 135,
              align: 'right',
              render: (r) => (
                <span style={{ fontWeight: 700, color: r.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatMoney(r.grossProfit, { salesSensitive: true })}
                </span>
              ),
            },
            {
              key: 'marginRate',
              header: '이익율',
              width: 90,
              align: 'right',
              render: (r) => (
                <span style={{ fontWeight: 700, color: r.marginRate >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {`${r.marginRate.toFixed(2)}%`}
                </span>
              ),
            },
          ]}
          rows={dimensionRows}
          rowKey={(r) => r.dimKey}
          maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
        />
      )}

      <ConservationBar
        items={[
          { label: '총유통매출', value: formatMoney(totals.sales, { salesSensitive: true }) },
          { label: '반품환불차감', value: formatMoney(totals.refund, { salesSensitive: true }), tone: 'warning' },
          { label: '순매출원가', value: formatMoney(totals.cogs) },
          {
            label: '매출총이익',
            value: formatMoney(totals.gp, { salesSensitive: true }),
            tone: totals.gp >= 0 ? 'success' : 'danger',
          },
          {
            label: '환차손익',
            value: formatMoney(periodFxGainLoss, { salesSensitive: true }),
            tone: periodFxGainLoss > 0 ? 'success' : periodFxGainLoss < 0 ? 'danger' : 'neutral',
          },
          {
            label: '실질손익',
            value: formatMoney(totals.gp + periodFxGainLoss, { salesSensitive: true }),
            tone: totals.gp + periodFxGainLoss >= 0 ? 'success' : 'danger',
          },
          {
            label: '이익율',
            value: `${((totals.sales - totals.refund) > 0 ? ((totals.gp + periodFxGainLoss) / (totals.sales - totals.refund)) * 100 : 0).toFixed(2)}%`,
            tone: totals.gp + periodFxGainLoss >= 0 ? 'success' : 'danger',
          },
        ]}
      />
    </div>
  );
};
