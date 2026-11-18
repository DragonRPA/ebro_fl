import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { currentYm } from '../../services/domainMath';
import { generateFinancialStatements } from '../../services/financialStatementEngine';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  VerticalField,
  controlInputStyle,
} from '../../components/UiPrimitives';
import { formatKoAcquisitionType } from '../../types/domain';

const AccountingStandardsTab = React.lazy(() => import('../../components/AccountingStandardsTab'));

export const FinancialStatementsPage: React.FC = () => {
  const { isRentalEnabled, datasets, formatMoney } = useAppShell();
  const curYm = currentYm();
  const yearStartYm = `${curYm.slice(0, 4)}-01`;

  const [startYm, setStartYm] = useState(yearStartYm);
  const [endYm, setEndYm] = useState(curYm);
  const [tab, setTab] = useState<'BS' | 'PL' | 'CF' | 'ASSET' | 'LEASE' | 'STANDARD'>('BS');
  const effectiveTab: 'BS' | 'PL' | 'CF' | 'ASSET' | 'LEASE' | 'STANDARD' =
    !isRentalEnabled && (tab === 'ASSET' || tab === 'LEASE') ? 'BS' : tab;

  const report = useMemo(
    () => generateFinancialStatements(datasets, startYm, endYm, { includeRental: isRentalEnabled }),
    [datasets, endYm, isRentalEnabled, startYm]
  );

  const renderStatementRows = (
    items: { code: string; label: string; amount: number; indent?: number; isSubtotal?: boolean }[]
  ) => (
    <DataGrid
      columns={[
        { key: 'code', header: '과목코드', width: 100, render: (r) => r.code },
        {
          key: 'label',
          header: '계정과목',
          render: (r) => (
            <span
              style={{
                paddingLeft: `${(r.indent || 0) * 18}px`,
                fontWeight: r.isSubtotal ? 800 : 500,
              }}
            >
              {r.label}
            </span>
          ),
        },
        {
          key: 'amount',
          header: '금액',
          width: 150,
          align: 'right',
          render: (r) => (
            <span style={{ fontWeight: r.isSubtotal ? 800 : 600 }}>
              {formatMoney(r.amount)}
            </span>
          ),
        },
      ]}
      rows={items}
      rowKey={(r) => r.code}
      maxHeight="clamp(340px, calc(100vh - 250px), 800px)"
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="재무제표 · 회계기준 조회"
        manualId="fs-period"
        rightSlot={
          <div style={{ display: 'flex', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <VerticalField label="시작 연월" width={140}>
              <input
                type="month"
                value={startYm}
                onChange={(e) => setStartYm(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="종료 연월" width={140}>
              <input
                type="month"
                value={endYm}
                onChange={(e) => setEndYm(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
        }
      >
        <div data-manual-id="fs-tabs" style={{ marginBottom: 'var(--space-panel-head-mb)' }}>
          <SegmentedTabs
            tabs={[
              { id: 'BS', label: '재무상태표' },
              { id: 'PL', label: '손익계산서' },
              { id: 'CF', label: '현금흐름표' },
              ...(isRentalEnabled
                ? [
                    { id: 'ASSET', label: '렌탈자산 감가상각명세' },
                    { id: 'LEASE', label: '금융리스 이자·원금명세' },
                  ]
                : []),
              { id: 'STANDARD', label: '중소기업회계기준 해설' },
            ]}
            activeId={effectiveTab}
            onChange={(id) => setTab(id as typeof tab)}
          />
        </div>

        {effectiveTab === 'BS' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-page-gap)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-tight-gap)' }}>
                자산 · 합계 {formatMoney(report.balanceSheet.totalAssets)}
              </div>
              {renderStatementRows(report.balanceSheet.assets)}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: 'var(--space-tight-gap)' }}>
                부채 및 자본 · 합계{' '}
                {formatMoney(report.balanceSheet.totalLiabilities + report.balanceSheet.totalEquity)}
              </div>
              {renderStatementRows([
                ...report.balanceSheet.liabilities,
                ...report.balanceSheet.equity,
              ])}
            </div>
          </div>
        )}

        {effectiveTab === 'PL' && renderStatementRows(report.incomeStatement.rows)}

        {effectiveTab === 'CF' && renderStatementRows(report.cashFlow.rows)}

        {isRentalEnabled && effectiveTab === 'ASSET' && (
          <DataGrid
            columns={[
              { key: 'code', header: '자산번호', width: 120, render: (a) => a.unitCode },
              { key: 'name', header: '기종명', render: (a) => a.itemName },
              { key: 'serial', header: '시리얼', width: 125, render: (a) => a.serialNo },
              { key: 'acq', header: '취득방식', width: 110, render: (a) => formatKoAcquisitionType(a.acquisitionType) },
              { key: 'cost', header: '취득원가', width: 120, align: 'right', render: (a) => formatMoney(a.acquisitionCostKrw) },
              { key: 'pdep', header: '기간상각비', width: 115, align: 'right', render: (a) => formatMoney(a.periodDepreciationKrw) },
              { key: 'adep', header: '누적상각액', width: 115, align: 'right', render: (a) => formatMoney(a.accumulatedDepreciationKrw) },
              { key: 'bv', header: '기말장부가액', width: 120, align: 'right', render: (a) => formatMoney(a.endingBookValueKrw) },
            ]}
            rows={report.assetSchedule}
            rowKey={(a) => a.unitId}
            maxHeight="clamp(300px, calc(100vh - 300px), 760px)"
          />
        )}

        {isRentalEnabled && effectiveTab === 'LEASE' && (
          <DataGrid
            columns={[
              { key: 'leaseId', header: '리스번호', width: 120, render: (l) => l.leaseId },
              { key: 'lender', header: '금융사', width: 130, render: (l) => l.lenderName },
              { key: 'serial', header: '시리얼', width: 120, render: (l) => l.serialNo },
              { key: 'method', header: '상환방식', width: 95, render: (l) => l.repaymentMethod },
              { key: 'rate', header: '연이율', width: 80, align: 'right', render: (l) => `${l.annualInterestRate}%` },
              { key: 'prin', header: '최초원금', width: 120, align: 'right', render: (l) => formatMoney(l.principalAmountKrw) },
              { key: 'paid', header: '기간상환원금', width: 115, align: 'right', render: (l) => formatMoney(l.periodPrincipalPaidKrw) },
              { key: 'int', header: '기간이자비용', width: 115, align: 'right', render: (l) => formatMoney(l.periodInterestExpenseKrw) },
              { key: 'end', header: '기말잔여부채', width: 120, align: 'right', render: (l) => formatMoney(l.endingRemainingPrincipalKrw) },
            ]}
            rows={report.leaseSummary}
            rowKey={(l) => l.leaseId}
            maxHeight="clamp(300px, calc(100vh - 300px), 760px)"
          />
        )}

        {effectiveTab === 'STANDARD' && (
          <React.Suspense
            fallback={
              <div style={{ padding: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                회계기준 불러오는 중
              </div>
            }
          >
            <AccountingStandardsTab />
          </React.Suspense>
        )}
      </SectionPanel>

      <ConservationBar
        manualId="fs-verify"
        items={[
          { label: '자산총계', value: formatMoney(report.balanceSheet.totalAssets), tone: 'primary' },
          {
            label: '부채 · 자본합계',
            value: formatMoney(report.balanceSheet.totalLiabilities + report.balanceSheet.totalEquity),
          },
          {
            label: '당기순이익',
            value: formatMoney(report.incomeStatement.netIncome),
            tone: report.incomeStatement.netIncome >= 0 ? 'success' : 'danger',
          },
          {
            label: '대차 차액',
            value: formatMoney(report.balanceSheet.balanceDiff),
            tone: report.balanceSheet.balanceDiff === 0 ? 'success' : 'danger',
          },
          {
            label: '현금 검증차액',
            value: formatMoney(report.cashFlow.cashCheckDiff),
            tone: report.cashFlow.cashCheckDiff === 0 ? 'success' : 'danger',
          },
        ]}
        balanced={
          report.balanceSheet.balanceDiff === 0 && report.cashFlow.cashCheckDiff === 0
        }
        balanceMessage={
          report.balanceSheet.balanceDiff === 0 && report.cashFlow.cashCheckDiff === 0
            ? '대차 · 현금흐름 0원 일치 검증 완료'
            : '대차 또는 현금 검증 차이 확인 필요'
        }
      />
    </div>
  );
};
