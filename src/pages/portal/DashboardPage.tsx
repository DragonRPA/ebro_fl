import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  actionBtnStyle,
  type GridColumn,
} from '../../components/UiPrimitives';
import { addDaysIso, todayIso } from '../../services/domainMath';
import {
  TIER_LABELS,
  isApprovalRequestRentalRelated,
  type FlPageId,
} from '../../types/domain';

type TodoCategory = 'ALL' | 'APPROVAL' | 'FULFILLMENT' | 'BILLING' | 'CONTRACT';

interface TodoFeedRow {
  id: string;
  category: Exclude<TodoCategory, 'ALL'>;
  categoryLabel: string;
  title: string;
  counterparty: string;
  dueDate: string;
  amountText: string;
  urgencyTone: 'danger' | 'warning' | 'primary' | 'neutral';
  targetPage: FlPageId;
}

export const DashboardPage: React.FC = () => {
  const { currentUser, isRentalEnabled, datasets, navigateTo, formatMoney, tierLabel } = useAppShell();
  const [tab, setTab] = useState<TodoCategory>('ALL');

  const today = todayIso();

  const feedRows = useMemo<TodoFeedRow[]>(() => {
    const out: TodoFeedRow[] = [];

    for (const r of datasets.approvalRequests) {
      if (r.status !== 'PENDING') continue;
      if (!isRentalEnabled && isApprovalRequestRentalRelated(r, datasets)) continue;
      const canApprove = (currentUser?.tierLevel || 1) >= r.requiredTier;
      out.push({
        id: r.id,
        category: 'APPROVAL',
        categoryLabel: '결재',
        title: `${r.title} [${TIER_LABELS[r.requiredTier]}]`,
        counterparty: `${r.requesterName} · ${TIER_LABELS[r.requesterTier]}`,
        dueDate: r.requestedAt.slice(0, 10),
        amountText: canApprove ? '승인 가능' : '상위 결재 대기',
        urgencyTone: canApprove ? 'danger' : 'warning',
        targetPage: 'approval_inbox',
      });
    }

    for (const f of datasets.fulfillments) {
      if (f.status !== 'REQUESTED') continue;
      if (!isRentalEnabled && f.fulfillmentDomain !== 'TRADE') continue;
      out.push({
        id: f.id,
        category: 'FULFILLMENT',
        categoryLabel: isRentalEnabled ? `${f.actionType} 의뢰` : '출고',
        title: `${f.fulfillmentNo} · 수량 ${f.quantity}`,
        counterparty: f.partnerName,
        dueDate: f.effectiveDate || today,
        amountText: isRentalEnabled
          ? f.fulfillmentDomain === 'TRADE'
            ? '유통 출고'
            : '렌탈 입출고'
          : '출고 대기',
        urgencyTone: 'primary',
        targetPage: f.fulfillmentDomain === 'TRADE' ? 'trade_fulfillment' : 'rental_fulfillment',
      });
    }

    for (const b of datasets.billings) {
      if (b.status === 'CANCELLED' || b.unpaidBalanceKrw <= 0) continue;
      if (!isRentalEnabled && b.billingDomain === 'RENTAL') continue;
      const overdue = b.dueDate < today;
      out.push({
        id: b.id,
        category: 'BILLING',
        categoryLabel: '수금',
        title: `${b.billingNo} · ${b.billingYm}`,
        counterparty: b.partnerName,
        dueDate: b.dueDate,
        amountText: formatMoney(b.unpaidBalanceKrw, { salesSensitive: true }),
        urgencyTone: overdue ? 'danger' : 'warning',
        targetPage: 'ar_billing_collection',
      });
    }

    const cutoff = addDaysIso(today, 45);
    for (const c of datasets.contracts) {
      if (c.status !== 'ACTIVE' && c.status !== 'FULFILLING') continue;
      if (!isRentalEnabled && c.contractDomain === 'RENTAL') continue;
      if (c.endDate <= cutoff) {
        out.push({
          id: c.id,
          category: 'CONTRACT',
          categoryLabel: isRentalEnabled
            ? c.contractDomain === 'RENTAL'
              ? '만기 계약'
              : '납기 도래'
            : '납기 도래',
          title: isRentalEnabled
            ? `${c.contractNo} · ${c.contractDomain === 'RENTAL' ? '렌탈' : '유통'}`
            : c.contractNo,
          counterparty: c.partnerName,
          dueDate: c.endDate,
          amountText: formatMoney(c.totalAmountKrw, { salesSensitive: true }),
          urgencyTone: c.endDate < today ? 'danger' : 'neutral',
          targetPage: c.contractDomain === 'RENTAL' ? 'rental_contracts' : 'trade_contracts',
        });
      }
    }

    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [currentUser?.tierLevel, datasets, formatMoney, isRentalEnabled, today]);

  const effectiveTab: TodoCategory = tab;

  const filtered = useMemo(
    () => (effectiveTab === 'ALL' ? feedRows : feedRows.filter((r) => r.category === effectiveTab)),
    [effectiveTab, feedRows]
  );

  const columns: GridColumn<TodoFeedRow>[] = [
    {
      key: 'action',
      header: '처리',
      width: 84,
      align: 'center',
      stickyLeft: true,
      render: (row) => (
        <button
          type="button"
          onClick={() => navigateTo(row.targetPage)}
          style={actionBtnStyle('primary', true)}
        >
          화면 이동
        </button>
      ),
    },
    {
      key: 'categoryLabel',
      header: '과제 구분',
      width: 120,
      render: (row) => <StatusBadge label={row.categoryLabel} tone={row.urgencyTone} />,
    },
    {
      key: 'title',
      header: '업무 제목',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.title}</span>,
    },
    {
      key: 'counterparty',
      header: '거래처 · 요청자',
      render: (row) => row.counterparty,
    },
    {
      key: 'dueDate',
      header: '기준일 · 기한',
      width: 110,
      align: 'center',
      render: (row) => row.dueDate,
    },
    {
      key: 'amountText',
      header: '세부 상태 · 금액',
      width: 150,
      align: 'right',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.amountText}</span>,
    },
  ];

  const counts = useMemo(
    () => ({
      ALL: feedRows.length,
      APPROVAL: feedRows.filter((r) => r.category === 'APPROVAL').length,
      FULFILLMENT: feedRows.filter((r) => r.category === 'FULFILLMENT').length,
      BILLING: feedRows.filter((r) => r.category === 'BILLING').length,
      CONTRACT: feedRows.filter((r) => r.category === 'CONTRACT').length,
    }),
    [feedRows]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title={`담당 과제 목록 · ${currentUser?.name || ''} · ${tierLabel(currentUser?.tierLevel)}`}
        manualId="dash-filter"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체', count: counts.ALL },
              { id: 'APPROVAL', label: '결재', count: counts.APPROVAL },
              { id: 'FULFILLMENT', label: '출고', count: counts.FULFILLMENT },
              { id: 'BILLING', label: '수금', count: counts.BILLING },
              { id: 'CONTRACT', label: isRentalEnabled ? '만기·납기' : '납기도래', count: counts.CONTRACT },
            ]}
            activeId={effectiveTab}
            onChange={(id) => setTab(id as TodoCategory)}
          />
        }
      >
        <DataGrid
          manualId="dash-feed"
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          emptyText="처리 대기중인 당면 과제가 없습니다."
          maxHeight="calc(100vh - 200px)"
        />
      </SectionPanel>

      <ConservationBar
        items={[
          { label: '결재대기', value: `${counts.APPROVAL}건`, tone: counts.APPROVAL > 0 ? 'danger' : 'neutral' },
          { label: '출고의뢰', value: `${counts.FULFILLMENT}건`, tone: 'primary' },
          { label: '미수청구', value: `${counts.BILLING}건`, tone: counts.BILLING > 0 ? 'warning' : 'neutral' },
          { label: isRentalEnabled ? '만기·납기' : '납기도래', value: `${counts.CONTRACT}건`, tone: 'neutral' },
        ]}
      />
    </div>
  );
};
