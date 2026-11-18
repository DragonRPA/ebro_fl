import React, { useMemo, useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { isApprovalRequestRentalRelated, useActionGateway } from '../core/ActionCommandGateway';
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
  formatKoStatus,
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
  const { currentUser, isRentalEnabled, datasets, navigateTo, formatMoney, tierLabel } = useAppShell();
  const [tab, setTab] = useState<TodoCategory>('ALL');

  const today = new Date().toISOString().slice(0, 10);

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

    const cutoff = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
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

const PAYLOAD_KEY_LABELS: Record<string, string> = {
  unitId: '대상 재고 ID',
  contractId: '대상 계약 ID',
  purchaseId: '대상 매입 ID',
  payableId: '대상 채무 ID',
  billingId: '대상 청구 ID',
  fulfillmentId: '대상 출고의뢰 ID',
  toDomain: '전환 대상 구분',
  effectiveDate: '처리 기준일',
  paidDate: '지급 일자',
  settledFxRate: '결제 적용 환율',
  paidAmountKrw: '지급 금액(원)',
  billingYm: '청구 기준 연월',
  memo: '적요 · 메모',
  reason: '변경 사유',
  caseType: '사후처리 유형',
  refundSupplyKrw: '환불 공급가액',
};

function buildApprovalContextRows(
  req: FlApprovalRequest,
  datasets: ReturnType<typeof useAppShell>['datasets'],
  formatMoney: (amount: number | null | undefined, options?: { salesSensitive?: boolean }) => string,
  rentalEnabled: boolean
): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const p = (req.payload || {}) as Record<string, unknown>;

  const unitId = String(p.unitId || (req.targetTable === 'fl_inventory_units' ? req.targetId : '') || '');
  const unit = unitId ? datasets.inventoryUnits.find((u) => u.id === unitId) : undefined;
  if (unit) {
    out.push(
      { label: '재고번호 · 품목', value: `${unit.unitCode} · ${unit.itemName}` },
      { label: '차대번호 · 로트', value: unit.serialNo || unit.lotNo || '-' },
      rentalEnabled
        ? { label: '현재 구분 · 상태', value: `${unit.ownershipDomain} · ${formatKoStatus(unit.status)}` }
        : {
            label: '현재 상태',
            value: formatKoStatus(
              unit.status === '대여중' || unit.status === '정비중' ? '보유중' : unit.status
            ),
          },
      { label: '장부단가 · 입고일', value: `${formatMoney(unit.unitCostKrw)} · ${unit.acquisitionDate}` }
    );
  }

  const contractId = String(p.contractId || (req.targetTable === 'fl_contracts' ? req.targetId : '') || '');
  const contract = contractId ? datasets.contracts.find((c) => c.id === contractId) : undefined;
  if (contract) {
    out.push(
      {
        label: rentalEnabled ? '계약번호 · 구분' : '계약번호',
        value: rentalEnabled
          ? `${contract.contractNo} · ${contract.contractDomain === 'RENTAL' ? '렌탈' : '유통'}`
          : contract.contractNo,
      },
      { label: '거래처', value: contract.partnerName },
      { label: '계약기간', value: `${contract.contractDate} ~ ${contract.endDate}` },
      { label: '계약 총액', value: formatMoney(contract.totalAmountKrw, { salesSensitive: true }) }
    );
  }

  const payableId = String(p.payableId || (req.targetTable === 'fl_ap_payables' ? req.targetId : '') || '');
  const payable = payableId ? datasets.apPayables.find((a) => a.id === payableId) : undefined;
  if (payable) {
    out.push(
      { label: '채무번호 · 거래처', value: `${payable.payableNo} · ${payable.partnerName}` },
      { label: '총 채무액 · 기지급', value: `${formatMoney(payable.totalAmountKrw)} / 기지급 ${formatMoney(payable.paidAmountKrw)}` },
      { label: '발생환율 · 외화액', value: `${payable.bookedFxRate} · ${payable.foreignAmount.toLocaleString('ko-KR')} ${payable.currencyCode}` }
    );
  }

  const purchaseId = String(p.purchaseId || (req.targetTable === 'fl_purchases' ? req.targetId : '') || '');
  const purchase = purchaseId ? datasets.purchases.find((pu) => pu.id === purchaseId) : undefined;
  if (purchase) {
    out.push(
      { label: '매입번호 · 매입처', value: `${purchase.purchaseNo} · ${purchase.supplierName || '-'}` },
      { label: '매입일 · 총원가', value: `${purchase.effectiveDate} · ${formatMoney(purchase.totalLandedCostKrw)}` }
    );
  }

  const billingId = String(p.billingId || (req.targetTable === 'fl_billings' ? req.targetId : '') || '');
  const billing = billingId ? datasets.billings.find((b) => b.id === billingId) : undefined;
  if (billing) {
    out.push(
      { label: '청구번호 · 청구월', value: `${billing.billingNo} · ${billing.billingYm}` },
      { label: '매출처 · 납기일', value: `${billing.partnerName} · ${billing.dueDate}` },
      { label: '청구총액 · 미수잔액', value: `${formatMoney(billing.totalAmountKrw)} / 미수 ${formatMoney(billing.unpaidBalanceKrw)}` }
    );
  }

  const fulId = String(p.fulfillmentId || (req.targetTable === 'fl_fulfillments' ? req.targetId : '') || '');
  const ful = fulId ? datasets.fulfillments.find((f) => f.id === fulId) : undefined;
  if (ful) {
    out.push(
      { label: '출고의뢰 · 매출처', value: `${ful.fulfillmentNo} · ${ful.partnerName}` },
      { label: '수량 · 희망완료일', value: `${ful.quantity}대 · ${ful.effectiveDate}` }
    );
  }

  return out;
}

export const ApprovalInboxPage: React.FC = () => {
  const { currentUser, isRentalEnabled, datasets, notifyToast, formatMoney } = useAppShell();
  const { approveRequest, rejectRequest } = useActionGateway();

  const [statusTab, setStatusTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [selectedReq, setSelectedReq] = useState<FlApprovalRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<FlApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleRequests = useMemo(
    () =>
      isRentalEnabled
        ? datasets.approvalRequests
        : datasets.approvalRequests.filter((r) => !isApprovalRequestRentalRelated(r, datasets)),
    [datasets, isRentalEnabled]
  );

  const filtered = useMemo(() => {
    const list =
      statusTab === 'ALL'
        ? visibleRequests
        : visibleRequests.filter((r) => r.status === statusTab);
    return [...list].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [statusTab, visibleRequests]);

  const counts = useMemo(
    () => ({
      PENDING: visibleRequests.filter((r) => r.status === 'PENDING').length,
      APPROVED: visibleRequests.filter((r) => r.status === 'APPROVED').length,
      REJECTED: visibleRequests.filter((r) => r.status === 'REJECTED').length,
      ALL: visibleRequests.length,
    }),
    [visibleRequests]
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
    { key: 'actionCode', header: '업무구분', width: 155, render: (r) => formatKoActionCode(r.actionCode, isRentalEnabled) },
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
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-header)',
                fontSize: '12.5px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>요청번호</div>
                <div style={{ fontWeight: 700 }}>{selectedReq.id}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>업무구분 · 대상원장</div>
                <div style={{ fontWeight: 700 }}>
                  {formatKoActionCode(selectedReq.actionCode, isRentalEnabled)} · {formatKoTargetTable(selectedReq.targetTable)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>요청자 · 요청일시</div>
                <div style={{ fontWeight: 700 }}>
                  {selectedReq.requesterName} · {selectedReq.requestedAt.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>필요티어 · 상태</div>
                <div style={{ fontWeight: 700 }}>
                  {TIER_LABELS[selectedReq.requiredTier]} · {formatKoStatus(selectedReq.status)}
                </div>
              </div>
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

            {(() => {
              const contextRows = buildApprovalContextRows(selectedReq, datasets, formatMoney, isRentalEnabled);
              const payloadEntries = Object.entries(selectedReq.payload || {}).filter(
                ([k]) => k !== 'seq' && k !== 'source'
              );
              const allRows = [
                ...contextRows,
                ...payloadEntries.map(([k, v]) => ({
                  label: PAYLOAD_KEY_LABELS[k] || k,
                  value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-'),
                })),
              ];
              return (
                <div
                  style={{
                    border: '1px solid var(--table-border-color)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <tbody>
                      {allRows.length === 0 ? (
                        <tr>
                          <td style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                            연결된 상세 항목이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        allRows.map((row, idx) => (
                          <tr key={`${row.label}-${idx}`} style={{ borderBottom: '1px solid var(--table-row-border)' }}>
                            <td
                              style={{
                                width: '180px',
                                padding: 'calc(7px - 2pt) var(--space-compact-pad-x)',
                                fontWeight: 700,
                                backgroundColor: 'var(--bg-header)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {row.label}
                            </td>
                            <td style={{ padding: 'calc(7px - 2pt) var(--space-compact-pad-x)', wordBreak: 'break-all' }}>
                              {row.value}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
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
