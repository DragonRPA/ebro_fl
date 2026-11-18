import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import {
  calculateRentalProRataForMonth,
  computeUnitDepreciationAsOf,
  currentYm,
  listMonthsBetween,
} from '../../services/domainMath';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  VerticalField,
  controlInputStyle,
} from '../../components/UiPrimitives';

export const RentalPerformancePage: React.FC = () => {
  const { datasets, formatMoney } = useAppShell();
  const curYm = currentYm();
  const [startYm, setStartYm] = useState(curYm);
  const [endYm, setEndYm] = useState(curYm);

  const months = useMemo(() => listMonthsBetween(startYm, endYm), [endYm, startYm]);

  const rows = useMemo(() => {
    const rentalAssets = datasets.inventoryUnits.filter((u) => u.ownershipDomain !== '유통재고');
    const revByUnit = new Map<string, number>();

    for (const c of datasets.contracts) {
      if (c.contractDomain !== 'RENTAL' || c.status === 'CANCELLED') continue;
      for (const ym of months) {
        const res = calculateRentalProRataForMonth({
          contract: c,
          lines: datasets.contractLines,
          ym,
        });
        for (const r of res) {
          if (r.unitId) {
            revByUnit.set(r.unitId, (revByUnit.get(r.unitId) || 0) + r.supplyAmountKrw);
          }
        }
      }
    }

    for (const b of datasets.billings) {
      if (b.status === 'CANCELLED' || b.billingDomain !== 'RENTAL') continue;
      if (!months.includes(b.billingYm)) continue;
      for (const bl of b.lines || []) {
        if ((bl.maintId || bl.dispatchId) && bl.unitId && !bl.contractLineId) {
          revByUnit.set(bl.unitId, (revByUnit.get(bl.unitId) || 0) + Math.round(bl.supplyAmountKrw));
        }
      }
    }

    return rentalAssets.map((u) => {
      const revenueKrw = revByUnit.get(u.id) || 0;
      const depKrw = computeUnitDepreciationAsOf(u, startYm, endYm, datasets.stockMovements).periodDep;
      const activeSubleaseMonths = months.filter((m) => m >= u.acquisitionDate.slice(0, 7)).length;
      const subleaseKrw =
        u.ownershipDomain === '전대자산'
          ? Math.round(u.subleaseMonthlyCostKrw) * activeSubleaseMonths
          : 0;
      const maintKrw = datasets.rentalMaintenances
        .filter(
          (m) =>
            m.status === 'COMPLETED' &&
            m.unitId === u.id &&
            months.includes(m.effectiveDate.slice(0, 7))
        )
        .reduce((s, m) => s + m.totalCostKrw, 0);

      const leaseInterestKrw = datasets.financeLeases
        .filter((fl) => fl.unitId === u.id || fl.unitIds.includes(u.id))
        .flatMap((fl) =>
          datasets.financeLeaseSchedules.filter(
            (s) => s.leaseId === fl.id && months.includes(s.dueYm)
          )
        )
        .reduce((s, sch) => s + sch.interestExpenseKrw, 0);

      const contributionKrw = revenueKrw - depKrw - subleaseKrw - maintKrw - leaseInterestKrw;
      return {
        id: u.id,
        unitCode: u.unitCode,
        itemName: u.itemName,
        serialNo: u.serialNo || '-',
        revenueKrw,
        depKrw,
        subleaseKrw,
        maintKrw,
        leaseInterestKrw,
        contributionKrw,
      };
    });
  }, [datasets, endYm, months, startYm]);

  const totals = useMemo(() => {
    const rev = rows.reduce((s, r) => s + r.revenueKrw, 0);
    const dep = rows.reduce((s, r) => s + r.depKrw, 0);
    const sub = rows.reduce((s, r) => s + r.subleaseKrw, 0);
    const maint = rows.reduce((s, r) => s + r.maintKrw, 0);
    const interest = rows.reduce((s, r) => s + r.leaseInterestKrw, 0);
    return {
      rev,
      dep,
      sub,
      maint,
      interest,
      net: rev - dep - sub - maint - interest,
    };
  }, [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel title="렌탈 실적 조회 연월" manualId="rperf-period">
        <div style={{ display: 'flex', gap: 'var(--space-stack-gap)', flexWrap: 'wrap' }}>
          <VerticalField label="시작 연월" width={150}>
            <input
              type="month"
              value={startYm}
              onChange={(e) => setStartYm(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="종료 연월" width={150}>
            <input
              type="month"
              value={endYm}
              onChange={(e) => setEndYm(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
        </div>
      </SectionPanel>

      <DataGrid
        manualId="rperf-grid"
        columns={[
          { key: 'code', header: '자산번호', width: 125, render: (r) => r.unitCode },
          { key: 'itemName', header: '기종명', render: (r) => r.itemName },
          { key: 'serial', header: '시리얼', width: 130, render: (r) => r.serialNo },
          {
            key: 'rev',
            header: '일할 임대매출',
            width: 120,
            align: 'right',
            render: (r) => formatMoney(r.revenueKrw, { salesSensitive: true }),
          },
          { key: 'dep', header: '감가상각비', width: 110, align: 'right', render: (r) => formatMoney(r.depKrw) },
          { key: 'sub', header: '전대임차료', width: 110, align: 'right', render: (r) => formatMoney(r.subleaseKrw) },
          { key: 'maint', header: '정비비', width: 100, align: 'right', render: (r) => formatMoney(r.maintKrw) },
          { key: 'int', header: '리스이자', width: 100, align: 'right', render: (r) => formatMoney(r.leaseInterestKrw) },
          {
            key: 'net',
            header: '자산 순기여액',
            width: 125,
            align: 'right',
            render: (r) => (
              <span style={{ fontWeight: 700, color: r.contributionKrw >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatMoney(r.contributionKrw, { salesSensitive: true })}
              </span>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
      />

      <ConservationBar
        items={[
          { label: '총 임대매출', value: formatMoney(totals.rev, { salesSensitive: true }) },
          { label: '상각·전대·정비', value: formatMoney(totals.dep + totals.sub + totals.maint), tone: 'warning' },
          { label: '리스이자비용', value: formatMoney(totals.interest), tone: 'warning' },
          {
            label: '순기여합계',
            value: formatMoney(totals.net, { salesSensitive: true }),
            tone: totals.net >= 0 ? 'success' : 'danger',
          },
        ]}
      />
    </div>
  );
};
