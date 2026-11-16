import React, { useMemo, useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { useActionGateway } from '../core/ActionCommandGateway';
import {
  ConservationBar,
  DataGrid,
  ModalDialog,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlTextareaStyle,
  type GridColumn,
} from '../components/UiPrimitives';
import {
  TIER_LABELS,
  formatKoActionCode,
  formatKoTargetTable,
  type FlApprovalRequest,
  type FlPageId,
} from '../types/domain';

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
  const { currentUser, datasets, navigateTo, formatMoney, tierLabel } = useAppShell();
  const [tab, setTab] = useState<TodoCategory>('ALL');

  const today = new Date().toISOString().slice(0, 10);

  const feedRows = useMemo<TodoFeedRow[]>(() => {
    const out: TodoFeedRow[] = [];

    for (const r of datasets.approvalRequests) {
      if (r.status !== 'PENDING') continue;
      const canApprove = (currentUser?.tierLevel || 1) >= r.requiredTier;
      out.push({
        id: r.id,
        category: 'APPROVAL',
        categoryLabel: '결재 대기',
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
      out.push({
        id: f.id,
        category: 'FULFILLMENT',
        categoryLabel: `${f.actionType} 의뢰`,
        title: `${f.fulfillmentNo} · 수량 ${f.quantity}`,
        counterparty: f.partnerName,
        dueDate: f.effectiveDate || today,
        amountText: f.fulfillmentDomain === 'TRADE' ? '유통 출고' : '렌탈 입출고',
        urgencyTone: 'primary',
        targetPage: f.fulfillmentDomain === 'TRADE' ? 'trade_fulfillment' : 'rental_fulfillment',
      });
    }

    for (const b of datasets.billings) {
      if (b.status === 'CANCELLED' || b.unpaidBalanceKrw <= 0) continue;
      const overdue = b.dueDate < today;
      out.push({
        id: b.id,
        category: 'BILLING',
        categoryLabel: '미수 청구',
        title: `${b.billingNo} · ${b.billingYm}`,
        counterparty: b.partnerName,
        dueDate: b.dueDate,
        amountText: formatMoney(b.unpaidBalanceKrw, { salesSensitive: true }),
        urgencyTone: overdue ? 'danger' : 'warning',
        targetPage: 'ar_billing_collection',
      });
    }

    const cutoff = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
    for (const c of datasets.contracts) {
      if (c.status !== 'ACTIVE' && c.status !== 'FULFILLING') continue;
      if (c.endDate <= cutoff) {
        out.push({
          id: c.id,
          category: 'CONTRACT',
          categoryLabel: '만기 도래 계약',
          title: `${c.contractNo} · ${c.contractDomain === 'RENTAL' ? '렌탈' : '유통'}`,
          counterparty: c.partnerName,
          dueDate: c.endDate,
          amountText: formatMoney(c.totalAmountKrw, { salesSensitive: true }),
          urgencyTone: c.endDate < today ? 'danger' : 'neutral',
          targetPage: c.contractDomain === 'RENTAL' ? 'rental_contracts' : 'trade_contracts',
        });
      }
    }

    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [currentUser?.tierLevel, datasets, formatMoney, today]);

  const filtered = useMemo(
    () => (tab === 'ALL' ? feedRows : feedRows.filter((r) => r.category === tab)),
    [feedRows, tab]
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
              { id: 'APPROVAL', label: '결재대기', count: counts.APPROVAL },
              { id: 'FULFILLMENT', label: '출고의뢰', count: counts.FULFILLMENT },
              { id: 'BILLING', label: '미수청구', count: counts.BILLING },
              { id: 'CONTRACT', label: '만기계약', count: counts.CONTRACT },
            ]}
            activeId={tab}
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
          { label: '만기계약', value: `${counts.CONTRACT}건`, tone: 'neutral' },
        ]}
      />
    </div>
  );
};

export const ApprovalInboxPage: React.FC = () => {
  const { currentUser, datasets, notifyToast } = useAppShell();
  const { approveRequest, rejectRequest } = useActionGateway();

  const [statusTab, setStatusTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [selectedReq, setSelectedReq] = useState<FlApprovalRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FlApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list =
      statusTab === 'ALL'
        ? datasets.approvalRequests
        : datasets.approvalRequests.filter((r) => r.status === statusTab);
    return [...list].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [datasets.approvalRequests, statusTab]);

  const counts = useMemo(
    () => ({
      PENDING: datasets.approvalRequests.filter((r) => r.status === 'PENDING').length,
      APPROVED: datasets.approvalRequests.filter((r) => r.status === 'APPROVED').length,
      REJECTED: datasets.approvalRequests.filter((r) => r.status === 'REJECTED').length,
      ALL: datasets.approvalRequests.length,
    }),
    [datasets.approvalRequests]
  );

  const handleApprove = async (req: FlApprovalRequest) => {
    setBusyId(req.id);
    try {
      await approveRequest(req);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '승인 처리 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      await rejectRequest(rejectTarget, rejectReason);
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '반려 처리 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const statusTone = (st: FlApprovalRequest['status']) =>
    st === 'PENDING' ? 'warning' : st === 'APPROVED' ? 'success' : st === 'REJECTED' ? 'danger' : 'neutral';

  const statusText = (st: FlApprovalRequest['status']) =>
    st === 'PENDING' ? '결재대기' : st === 'APPROVED' ? '승인완료' : st === 'REJECTED' ? '반려' : '취소';

  const columns: GridColumn<FlApprovalRequest>[] = [
    {
      key: 'actions',
      header: '결재 실행',
      width: 195,
      stickyLeft: true,
      render: (row) => {
        const eligible = (currentUser?.tierLevel || 1) >= row.requiredTier;
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-label-gap)' }}>
            <button
              type="button"
              onClick={() => setSelectedReq(row)}
              style={actionBtnStyle('secondary', true)}
            >
              상세
            </button>
            {row.status === 'PENDING' && (
              <>
                <button
                  type="button"
                  disabled={!eligible || busyId === row.id}
                  onClick={() => handleApprove(row)}
                  style={{
                    ...actionBtnStyle('primary', true),
                    opacity: !eligible || busyId === row.id ? 0.45 : 1,
                    cursor: !eligible ? 'not-allowed' : 'pointer',
                  }}
                >
                  {eligible ? '승인' : '권한부족'}
                </button>
                <button
                  type="button"
                  disabled={!eligible || busyId === row.id}
                  onClick={() => {
                    setRejectTarget(row);
                    setRejectReason('');
                  }}
                  style={{
                    ...actionBtnStyle('danger', true),
                    opacity: !eligible || busyId === row.id ? 0.45 : 1,
                    cursor: !eligible ? 'not-allowed' : 'pointer',
                  }}
                >
                  반려
                </button>
              </>
            )}
          </div>
        );
      },
    },
    { key: 'id', header: '요청번호', width: 140, render: (r) => r.id },
    { key: 'actionCode', header: '업무구분', width: 155, render: (r) => formatKoActionCode(r.actionCode) },
    { key: 'title', header: '요청 제목', render: (r) => <span style={{ fontWeight: 700 }}>{r.title}</span> },
    {
      key: 'requester',
      header: '상신자 · 티어',
      width: 170,
      render: (r) => `${r.requesterName} · ${TIER_LABELS[r.requesterTier]}`,
    },
    {
      key: 'requiredTier',
      header: '필요 티어',
      width: 135,
      render: (r) => <StatusBadge label={TIER_LABELS[r.requiredTier]} tone="primary" />,
    },
    {
      key: 'status',
      header: '상태',
      width: 90,
      align: 'center',
      render: (r) => <StatusBadge label={statusText(r.status)} tone={statusTone(r.status)} />,
    },
    {
      key: 'requestedAt',
      header: '상신 일시',
      width: 150,
      render: (r) => r.requestedAt.slice(0, 16).replace('T', ' '),
    },
    {
      key: 'approverName',
      header: '결재자',
      width: 110,
      render: (r) => r.approverName || '-',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="결재함"
        manualId="apr-tabs"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'PENDING', label: '대기', count: counts.PENDING },
              { id: 'APPROVED', label: '승인', count: counts.APPROVED },
              { id: 'REJECTED', label: '반려', count: counts.REJECTED },
              { id: 'ALL', label: '전체', count: counts.ALL },
            ]}
            activeId={statusTab}
            onChange={(id) => setStatusTab(id as typeof statusTab)}
          />
        }
      >
        <DataGrid
          manualId="apr-grid"
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          emptyText="해당 상태의 결재 요청 내역이 없습니다."
          maxHeight="calc(100vh - 200px)"
        />
      </SectionPanel>

      <ModalDialog
        open={Boolean(selectedReq)}
        title={selectedReq ? `결재 상세 · ${selectedReq.title}` : ''}
        onClose={() => setSelectedReq(null)}
        width={680}
      >
        {selectedReq && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-stack-gap)', fontSize: '13px' }}>
              <span>요청번호: {selectedReq.id}</span>
              <span>대상원장: {formatKoTargetTable(selectedReq.targetTable)}</span>
              <span>필요티어: {TIER_LABELS[selectedReq.requiredTier]}</span>
            </div>
            {selectedReq.rejectReason && (
              <div
                style={{
                  padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)',
                  border: '1px solid var(--danger)',
                  borderRadius: '6px',
                  color: 'var(--danger)',
                  fontSize: '13px',
                }}
              >
                반려사유: {selectedReq.rejectReason}
              </div>
            )}
            <div
              style={{
                border: '1px solid var(--table-border-color)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <tbody>
                  {Object.entries(selectedReq.payload || {}).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--table-row-border)' }}>
                      <td
                        style={{
                          width: '180px',
                          padding: 'calc(7px - 2pt) var(--space-compact-pad-x)',
                          fontWeight: 700,
                          backgroundColor: 'var(--bg-header)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {k}
                      </td>
                      <td style={{ padding: 'calc(7px - 2pt) var(--space-compact-pad-x)', wordBreak: 'break-all' }}>
                        {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ModalDialog>

      <ModalDialog
        open={Boolean(rejectTarget)}
        title="결재 반려 사유 입력"
        onClose={() => setRejectTarget(null)}
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <VerticalField label="반려 사유" required>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="구체적인 반려 사유 입력"
              style={controlTextareaStyle}
            />
          </VerticalField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              style={actionBtnStyle('secondary')}
            >
              취소
            </button>
            <button
              type="button"
              disabled={!rejectReason.trim() || busyId === rejectTarget?.id}
              onClick={handleConfirmReject}
              style={actionBtnStyle('danger')}
            >
              반려 확정
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
