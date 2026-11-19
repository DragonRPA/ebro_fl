import React, { useEffect, useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import {
  addDaysIso,
  buildContractBillingLines,
  currentYm,
  todayIso,
} from '../../services/domainMath';
import { recordBillingCollection } from '../../services/domainProcurementLeaseEngine';
import { generateTransactionStatementExcel } from '../../services/documentService';
import {
  batchIssuePopbillTaxInvoices,
  cancelPopbillTaxInvoice,
  fetchPopbillLiveStatus,
  formatPopbillStatusLabel,
  openPopbillInvoicePopup,
  openPopbillPortal,
  resendPopbillTaxInvoiceEmail,
  sendPopbillTaxInvoiceToNts,
  syncPopbillTaxInvoiceStatus,
  type PopbillLiveStatus,
} from '../../services/popbillTaxInvoiceService';
import { DocumentActionBar } from '../../components/DocumentActionBar';
import { PopbillTaxInvoiceModal } from '../../components/PopbillTaxInvoiceModal';
import {
  CommaNumberInput,
  ConservationBar,
  DataGrid,
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type GridColumn,
} from '../../components/UiPrimitives';
import {
  BILLING_STATUS_KO_LABELS,
  PAYMENT_METHODS,
  computeDueDateFromCycle,
  formatKoStatus,
  formatPaymentTermsLabel,
  normalizePaymentMethod,
  type FlBilling,
} from '../../types/domain';

export const ArBillingCollectionPage: React.FC = () => {
  const {
    currentUser,
    tenantProfile,
    isRentalEnabled,
    isPopbillTaxInvoiceEnabled,
    datasets,
    formatMoney,
    refreshAll,
    notifyToast,
    canEditPage,
  } = useAppShell();
  const canEdit = canEditPage('ar_billing_collection');
  const today = todayIso();
  const curYm = currentYm();
  const [billingYm, setBillingYm] = useState(curYm);

  const visibleBillings = useMemo(
    () =>
      isRentalEnabled
        ? datasets.billings
        : datasets.billings.filter((b) => b.billingDomain !== 'RENTAL'),
    [datasets.billings, isRentalEnabled]
  );

  const sortedVisibleBillings = useMemo(
    () => [...visibleBillings].sort((a, b) => b.billingDate.localeCompare(a.billingDate)),
    [visibleBillings]
  );

  const billableContracts = useMemo(() => {
    const active = datasets.contracts.filter(
      (c) =>
        (c.status === 'ACTIVE' || c.status === 'FULFILLING' || c.status === 'COMPLETED') &&
        (isRentalEnabled || c.contractDomain !== 'RENTAL')
    );
    return [...active].sort((a, b) => {
      const aAmt = buildContractBillingLines({
        contract: a,
        contractLines: datasets.contractLines,
        fulfillments: datasets.fulfillments,
        rentalMaintenances: datasets.rentalMaintenances,
        logisticsDispatches: datasets.logisticsDispatches,
        existingBillings: datasets.billings,
        ym: billingYm,
      }).reduce((s, r) => s + r.supplyAmountKrw, 0);
      const bAmt = buildContractBillingLines({
        contract: b,
        contractLines: datasets.contractLines,
        fulfillments: datasets.fulfillments,
        rentalMaintenances: datasets.rentalMaintenances,
        logisticsDispatches: datasets.logisticsDispatches,
        existingBillings: datasets.billings,
        ym: billingYm,
      }).reduce((s, r) => s + r.supplyAmountKrw, 0);
      if ((aAmt > 0) !== (bAmt > 0)) return aAmt > 0 ? -1 : 1;
      return b.contractDate.localeCompare(a.contractDate);
    });
  }, [
    billingYm,
    datasets.billings,
    datasets.contractLines,
    datasets.contracts,
    datasets.fulfillments,
    datasets.logisticsDispatches,
    datasets.rentalMaintenances,
    isRentalEnabled,
  ]);

  const [contractId, setContractId] = useState(billableContracts[0]?.id || '');
  const [billingDate, setBillingDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => {
    const first = billableContracts[0];
    return first
      ? computeDueDateFromCycle(curYm, first.paymentCycle, first.paymentMonthOffset, first.paymentDueDay, today)
      : addDaysIso(today, 30);
  });

  const [selectedBillingId, setSelectedBillingId] = useState<string | null>(
    visibleBillings[0]?.id || null
  );
  const [invoiceNoEdits, setInvoiceNoEdits] = useState<Record<string, string>>({});
  const [colAmount, setColAmount] = useState(0);
  const [colDate, setColDate] = useState(today);
  const [colMethod, setColMethod] = useState('계좌이체');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [popbillLive, setPopbillLive] = useState<PopbillLiveStatus | null>(null);
  const [popbillLiveLoading, setPopbillLiveLoading] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [popbillModalBilling, setPopbillModalBilling] = useState<FlBilling | null>(null);
  const [popbillBatchBusy, setPopbillBatchBusy] = useState(false);
  const [resendEmailInput, setResendEmailInput] = useState('');

  const selectedContract =
    billableContracts.find((c) => c.id === (contractId || billableContracts[0]?.id)) || null;
  const previewSupply = useMemo(() => {
    if (!selectedContract) return 0;
    return buildContractBillingLines({
      contract: selectedContract,
      contractLines: datasets.contractLines,
      fulfillments: datasets.fulfillments,
      rentalMaintenances: datasets.rentalMaintenances,
      logisticsDispatches: datasets.logisticsDispatches,
      existingBillings: datasets.billings,
      ym: billingYm,
    }).reduce((s, r) => s + r.supplyAmountKrw, 0);
  }, [
    billingYm,
    datasets.billings,
    datasets.contractLines,
    datasets.fulfillments,
    datasets.logisticsDispatches,
    datasets.rentalMaintenances,
    selectedContract,
  ]);
  const scCycle = selectedContract?.paymentCycle;
  const scOffset = selectedContract?.paymentMonthOffset;
  const scDueDay = selectedContract?.paymentDueDay;
  const hasSelectedContract = Boolean(selectedContract);

  useEffect(() => {
    if (!hasSelectedContract) return;
    setDueDate(computeDueDateFromCycle(billingYm, scCycle, scOffset, scDueDay, today));
  }, [billingYm, hasSelectedContract, scCycle, scDueDay, scOffset, today]);

  const selectedBilling =
    visibleBillings.find((b) => b.id === selectedBillingId) || visibleBillings[0] || null;
  const partnersById = useMemo(
    () => new Map(datasets.partners.map((p) => [p.id, p])),
    [datasets.partners]
  );
  const selectedPartner = useMemo(
    () => (selectedBilling ? partnersById.get(selectedBilling.partnerId) : undefined),
    [partnersById, selectedBilling]
  );

  useEffect(() => {
    if (!selectedBilling) {
      setResendEmailInput('');
      return;
    }
    setResendEmailInput(
      selectedBilling.taxInvoiceEmail || selectedPartner?.taxEmail || selectedPartner?.email || ''
    );
  }, [selectedBilling, selectedPartner?.email, selectedPartner?.taxEmail]);

  const loadPopbillStatus = async (silent = true) => {
    if (!isPopbillTaxInvoiceEnabled) {
      setPopbillLive(null);
      return;
    }
    setPopbillLiveLoading(true);
    try {
      const status = await fetchPopbillLiveStatus(tenantProfile);
      setPopbillLive(status);
    } catch (err) {
      if (!silent) {
        notifyToast(err instanceof Error ? err.message : '팝빌 연동 상태 조회 실패', 'error');
      }
    } finally {
      setPopbillLiveLoading(false);
    }
  };

  useEffect(() => {
    if (!isPopbillTaxInvoiceEnabled) {
      setPopbillLive(null);
      setSelectedBatchIds(new Set());
      setPopbillModalBilling(null);
      return;
    }
    void fetchPopbillLiveStatus(tenantProfile)
      .then((status) => setPopbillLive(status))
      .catch(() => setPopbillLive(null));
  }, [isPopbillTaxInvoiceEnabled, tenantProfile]);

  const selectedBatchBillings = useMemo(
    () =>
      sortedVisibleBillings.filter(
        (b) =>
          selectedBatchIds.has(b.id) &&
          b.status !== 'CANCELLED' &&
          (!b.taxInvoiceIssued || b.taxInvoiceStatus === 'CANCELLED')
      ),
    [selectedBatchIds, sortedVisibleBillings]
  );

  const toggleBatchSelect = (billingId: string) => {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(billingId)) next.delete(billingId);
      else next.add(billingId);
      return next;
    });
  };

  const handleBatchPopbillIssue = async () => {
    if (selectedBatchBillings.length === 0 || popbillBatchBusy) return;
    const totalAmt = selectedBatchBillings.reduce((s, b) => s + b.totalAmountKrw, 0);
    if (
      !window.confirm(
        `선택한 ${selectedBatchBillings.length}건(합계 ₩${totalAmt.toLocaleString('ko-KR')})에 대해 팝빌 전자세금계산서를 일괄 발행하시겠습니까?`
      )
    ) {
      return;
    }
    setPopbillBatchBusy(true);
    try {
      const res = await batchIssuePopbillTaxInvoices({
        tenant: tenantProfile,
        billings: selectedBatchBillings,
        partnersById,
      });
      setSelectedBatchIds(new Set());
      await refreshAll();
      if (res.failed.length > 0) {
        notifyToast(
          `일괄 발행 결과: 성공 ${res.succeeded}건 · 임시저장 ${res.tempSaved}건 · 실패 ${res.failed.length}건 (${res.failed[0]})`,
          res.succeeded + res.tempSaved > 0 ? 'info' : 'error'
        );
      } else {
        notifyToast(
          res.tempSaved > 0
            ? `팝빌 처리 완료: 발행 ${res.succeeded}건 · 임시문서함 저장 ${res.tempSaved}건`
            : `팝빌 전자세금계산서 ${res.succeeded}건 발행 완료`,
          'success'
        );
      }
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '일괄 발행 실패', 'error');
    } finally {
      setPopbillBatchBusy(false);
    }
  };

  const handleSendToNts = async (b: FlBilling) => {
    if (!window.confirm(`[${b.billingNo}] ${b.partnerName} 세금계산서를 국세청으로 즉시 전송하시겠습니까?`)) {
      return;
    }
    setBusyId(b.id);
    try {
      const res = await sendPopbillTaxInvoiceToNts(tenantProfile, b);
      await refreshAll();
      notifyToast(res.message || '국세청 즉시전송 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '국세청 전송 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncPopbillStatus = async (b: FlBilling) => {
    setBusyId(b.id);
    try {
      const res = await syncPopbillTaxInvoiceStatus(tenantProfile, b);
      await refreshAll();
      notifyToast(`상태 동기화 완료 (${formatPopbillStatusLabel(res.status).label})`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '상태 동기화 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenPopbillDoc = async (b: FlBilling, mode: 'VIEW_URL' | 'PRINT_URL') => {
    try {
      await openPopbillInvoicePopup(tenantProfile, b, mode);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '팝빌 문서 열기 실패', 'error');
    }
  };

  const handleResendPopbillEmail = async (b: FlBilling) => {
    setBusyId(b.id);
    try {
      const msg = await resendPopbillTaxInvoiceEmail(tenantProfile, b, resendEmailInput);
      await refreshAll();
      notifyToast(msg, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '이메일 재전송 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelPopbillInvoice = async (b: FlBilling) => {
    if (!window.confirm(`[${b.billingNo}] ${b.partnerName} 팝빌 세금계산서를 발행 취소하시겠습니까?`)) {
      return;
    }
    setBusyId(b.id);
    try {
      const msg = await cancelPopbillTaxInvoice(tenantProfile, b);
      await refreshAll();
      notifyToast(msg, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '발행 취소 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenPortalWindow = async (action: 'PORTAL_URL' | 'CERT_URL' | 'CHARGE_URL') => {
    try {
      await openPopbillPortal(tenantProfile, action);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '팝빌 포털 열기 실패', 'error');
    }
  };

  const executeCreateBilling = async () => {
    if (!selectedContract) throw new Error('청구 대상 계약을 선택해 주세요.');
    const lines = buildContractBillingLines({
      contract: selectedContract,
      contractLines: datasets.contractLines,
      fulfillments: datasets.fulfillments,
      rentalMaintenances: datasets.rentalMaintenances,
      logisticsDispatches: datasets.logisticsDispatches,
      existingBillings: datasets.billings,
      ym: billingYm,
    });

    const supply = lines.reduce((s, r) => s + r.supplyAmountKrw, 0);
    const vat = lines.reduce((s, r) => s + r.vatAmountKrw, 0);
    const total = supply + vat;
    if (lines.length === 0 || total <= 0) {
      throw new Error('출고 실행완료된 미청구 내역이 없습니다.');
    }
    const bId = newId('BIL');
    await execDbMutation('청구서 생성 저장', () =>
      flSupabase.from('billings').insert(
        camelToSnakeRow({
          id: bId,
          tenantId: DEFAULT_TENANT_ID,
          billingNo: bId,
          billingYm,
          billingDomain: selectedContract.contractDomain,
          contractId: selectedContract.id,
          partnerId: selectedContract.partnerId,
          partnerName: selectedContract.partnerName,
          billingDate,
          dueDate,
          supplyAmountKrw: supply,
          vatAmountKrw: vat,
          totalAmountKrw: total,
          paidAmountKrw: 0,
          unpaidBalanceKrw: total,
          taxInvoiceIssued: false,
          lines,
          status: 'UNPAID',
        })
      )
    );
    setSelectedBillingId(bId);
    await refreshAll();
    notifyToast('청구 생성 완료', 'success');
  };

  const handleToggleTaxInvoice = async (b: FlBilling, nextIssued: boolean) => {
    const invNo = invoiceNoEdits[b.id] ?? b.taxInvoiceNo ?? '';
    setBusyId(b.id);
    try {
      await execDbMutation('세금계산서 발행 상태 저장', () =>
        flSupabase
          .from('billings')
          .update(
            camelToSnakeRow({
              taxInvoiceIssued: nextIssued,
              taxInvoiceNo: invNo.trim() || null,
              taxInvoiceIssuedAt: nextIssued ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString(),
            })
          )
          .eq('id', b.id)
      );
      await refreshAll();
      notifyToast(
        nextIssued ? '세금계산서 발행 완료 표기' : '세금계산서 미발행 전환',
        'success'
      );
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '계산서 상태 갱신 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveCollection = async () => {
    if (!currentUser || !selectedBilling) return;
    const amt = colAmount > 0 ? colAmount : selectedBilling.unpaidBalanceKrw;
    if (amt <= 0) {
      notifyToast('수납할 미수 잔액이 없습니다.', 'error');
      return;
    }
    setBusyId(selectedBilling.id);
    try {
      await recordBillingCollection({
        billing: selectedBilling,
        amountKrw: amt,
        collectionDate: colDate,
        paymentMethod: normalizePaymentMethod(colMethod),
        recordedBy: currentUser.name,
      });
      setColAmount(0);
      await refreshAll();
      notifyToast('수납 등록 및 미수잔액 차감 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '수납 저장 실패', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const totals = useMemo(() => {
    const active = visibleBillings.filter((b) => b.status !== 'CANCELLED');
    const total = active.reduce((s, b) => s + b.totalAmountKrw, 0);
    const paid = active.reduce((s, b) => s + b.paidAmountKrw, 0);
    const unpaid = active.reduce((s, b) => s + b.unpaidBalanceKrw, 0);
    return { total, paid, unpaid, diff: total - paid - unpaid };
  }, [visibleBillings]);

  const billingCols: GridColumn<FlBilling>[] = [
    {
      key: 'select',
      header: '선택',
      width: 68,
      align: 'center',
      stickyLeft: true,
      render: (b) => (
        <button
          type="button"
          onClick={() => {
            setSelectedBillingId(b.id);
            setColAmount(b.unpaidBalanceKrw);
          }}
          style={actionBtnStyle('secondary', true)}
        >
          관리
        </button>
      ),
    },
    ...(isPopbillTaxInvoiceEnabled
      ? [
          {
            key: 'batchSelect',
            header: '일괄',
            width: 48,
            align: 'center' as const,
            render: (b: FlBilling) => {
              const eligible =
                b.status !== 'CANCELLED' && (!b.taxInvoiceIssued || b.taxInvoiceStatus === 'CANCELLED');
              return (
                <div onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    disabled={!canEdit || !eligible || popbillBatchBusy}
                    checked={selectedBatchIds.has(b.id)}
                    onChange={() => toggleBatchSelect(b.id)}
                  />
                </div>
              );
            },
          },
        ]
      : []),
    {
      key: 'billingNo',
      header: '청구번호',
      width: 135,
      sortable: true,
      sortValue: (b) => b.billingNo,
      render: (b) => <span style={{ fontWeight: 700 }}>{b.billingNo}</span>,
    },
    {
      key: 'billingYm',
      header: '청구월',
      width: 85,
      align: 'center',
      sortable: true,
      sortValue: (b) => b.billingYm,
      render: (b) => b.billingYm,
    },
    {
      key: 'partnerName',
      header: '거래처',
      sortable: true,
      sortValue: (b) => b.partnerName,
      render: (b) => b.partnerName,
    },
    {
      key: 'totalAmountKrw',
      header: '청구합계',
      width: 120,
      align: 'right',
      sortable: true,
      sortValue: (b) => Number(b.totalAmountKrw || 0),
      render: (b) => formatMoney(b.totalAmountKrw, { salesSensitive: true }),
    },
    {
      key: 'paidAmountKrw',
      header: '수납액',
      width: 115,
      align: 'right',
      sortable: true,
      sortValue: (b) => Number(b.paidAmountKrw || 0),
      render: (b) => (
        <span style={{ color: 'var(--success)', fontWeight: 700 }}>
          {formatMoney(b.paidAmountKrw, { salesSensitive: true })}
        </span>
      ),
    },
    {
      key: 'unpaidBalanceKrw',
      header: '미수납잔액',
      width: 120,
      align: 'right',
      sortable: true,
      sortValue: (b) => Number(b.unpaidBalanceKrw || 0),
      render: (b) => (
        <span style={{ color: b.unpaidBalanceKrw > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
          {formatMoney(b.unpaidBalanceKrw, { salesSensitive: true })}
        </span>
      ),
    },
    {
      key: 'taxInvoice',
      header: '세금계산서 발행',
      width: isPopbillTaxInvoiceEnabled ? 340 : 245,
      sortable: true,
      sortValue: (b) => (b.taxInvoiceIssued ? `1:${b.taxInvoiceNo || ''}` : '0:'),
      render: (b) => {
        const isPopbillActiveDoc =
          isPopbillTaxInvoiceEnabled &&
          b.taxInvoiceChannel === 'POPBILL' &&
          b.taxInvoiceStatus !== 'CANCELLED';

        if (isPopbillActiveDoc) {
          const stMeta = formatPopbillStatusLabel(b.taxInvoiceStatus);
          return (
            <div
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              onClick={(e) => e.stopPropagation()}
            >
              <StatusBadge label={stMeta.label} tone={stMeta.tone} />
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {b.taxInvoiceNo || b.taxInvoiceMgtKey || '-'}
              </span>
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => void handleOpenPopbillDoc(b, 'VIEW_URL')}
                style={actionBtnStyle('secondary', true)}
              >
                조회
              </button>
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => void handleOpenPopbillDoc(b, 'PRINT_URL')}
                style={actionBtnStyle('secondary', true)}
              >
                인쇄
              </button>
              {canEdit && b.taxInvoiceStatus !== 'SENT_NTS' && (
                <button
                  type="button"
                  disabled={busyId === b.id}
                  onClick={() => void handleSendToNts(b)}
                  style={actionBtnStyle('primary', true)}
                >
                  전송
                </button>
              )}
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => void handleSyncPopbillStatus(b)}
                style={actionBtnStyle('secondary', true)}
              >
                동기화
              </button>
            </div>
          );
        }

        return (
          <div
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', whiteSpace: 'nowrap' }}
            onClick={(e) => e.stopPropagation()}
          >
            {isPopbillTaxInvoiceEnabled && canEdit && b.status !== 'CANCELLED' && (
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => setPopbillModalBilling(b)}
                style={actionBtnStyle('primary', true)}
              >
                팝빌 발행
              </button>
            )}
            <input
              type="checkbox"
              disabled={!canEdit || busyId === b.id}
              checked={b.taxInvoiceIssued}
              onChange={(e) => handleToggleTaxInvoice(b, e.target.checked)}
            />
            <input
              type="text"
              value={invoiceNoEdits[b.id] ?? b.taxInvoiceNo ?? ''}
              onChange={(e) =>
                setInvoiceNoEdits((prev) => ({ ...prev, [b.id]: e.target.value }))
              }
              placeholder="승인번호"
              style={{ ...controlInputStyle, height: '26px', width: '125px', fontSize: '11.5px' }}
            />
            {canEdit && (
              <button
                type="button"
                disabled={busyId === b.id}
                onClick={() => handleToggleTaxInvoice(b, b.taxInvoiceIssued)}
                style={actionBtnStyle('secondary', true)}
              >
                저장
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: '수납상태',
      width: 90,
      align: 'center',
      sortable: true,
      sortValue: (b) => (b.status === 'PAID' ? '완납' : b.status === 'PARTIAL' ? '부분수납' : '미수'),
      render: (b) => (
        <StatusBadge
          label={b.status === 'PAID' ? '완납' : b.status === 'PARTIAL' ? '부분수납' : '미수'}
          tone={b.status === 'PAID' ? 'success' : b.status === 'PARTIAL' ? 'warning' : 'danger'}
        />
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && (
        <SectionPanel title="계약 근거 청구 생성" manualId="ar-gen">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
            <VerticalField label="청구 연월" required width={145}>
              <input
                type="month"
                value={billingYm}
                onChange={(e) => setBillingYm(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="대상 계약" required minWidth={260} flex={1}>
              <select
                value={selectedContract?.id || ''}
                onChange={(e) => setContractId(e.target.value)}
                style={controlInputStyle}
              >
                {billableContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractNo}
                    {isRentalEnabled ? ` · ${c.contractDomain === 'RENTAL' ? '렌탈' : '유통'}` : ''} · {c.partnerName} · {formatPaymentTermsLabel(c.paymentCycle, c.paymentDueDay, c.paymentMonthOffset)}
                  </option>
                ))}
              </select>
            </VerticalField>
            {selectedContract && (
              <>
                <VerticalField label="계약 지급조건" width={165}>
                  <input
                    type="text"
                    readOnly
                    value={`${normalizePaymentMethod(selectedContract.paymentMethod)} · ${formatPaymentTermsLabel(selectedContract.paymentCycle, selectedContract.paymentDueDay, selectedContract.paymentMonthOffset)}`}
                    style={{ ...controlInputStyle, backgroundColor: 'var(--bg-secondary)' }}
                  />
                </VerticalField>
                <VerticalField label="예정 청구 공급가" width={145}>
                  <input
                    type="text"
                    readOnly
                    value={formatMoney(previewSupply, { salesSensitive: true })}
                    style={{
                      ...controlInputStyle,
                      backgroundColor: 'var(--bg-secondary)',
                      fontWeight: 700,
                      color: previewSupply > 0 ? 'var(--primary)' : 'var(--text-muted)',
                    }}
                  />
                </VerticalField>
              </>
            )}
            <VerticalField label="청구일자" required width={145}>
              <input
                type="date"
                value={billingDate}
                onChange={(e) => setBillingDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="납부기한" required width={145}>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <CommitActionButton
              actionCode="BILLING_CREATE"
              targetTable="fl_billings"
              targetId={selectedContract?.id || 'NEW'}
              title={`청구 생성 · ${billingYm} · ${selectedContract?.partnerName || ''}`}
              disabled={!selectedContract}
              buildPayload={() =>
                selectedContract
                  ? { contractId: selectedContract.id, billingYm, billingDate, dueDate }
                  : null
              }
              onExecuteDirect={executeCreateBilling}
              label="청구 생성"
            />
          </div>
        </SectionPanel>
      )}

      {isPopbillTaxInvoiceEnabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-inline-gap)',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
              팝빌 전자세금계산서 연동
            </span>
            <StatusBadge
              label={
                popbillLive
                  ? popbillLive.isTest
                    ? '테스트 서버'
                    : '실운영 서버'
                  : '연동 확인중'
              }
              tone={popbillLive?.isTest ? 'warning' : 'success'}
            />
            {popbillLive && (
              <>
                <StatusBadge
                  label={popbillLive.certRegistered ? '인증서 등록' : '인증서 미등록'}
                  tone={popbillLive.certRegistered ? 'success' : 'danger'}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  사업자 {popbillLive.corpNum} · 잔여 포인트 {popbillLive.partnerBalance.toLocaleString('ko-KR')}원
                </span>
              </>
            )}
            {canEdit && selectedBatchBillings.length > 0 && (
              <button
                type="button"
                disabled={popbillBatchBusy}
                onClick={() => void handleBatchPopbillIssue()}
                style={actionBtnStyle('primary', true)}
              >
                {popbillBatchBusy
                  ? '일괄 발행중'
                  : `선택 청구 일괄 발행 (${selectedBatchBillings.length}건)`}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              onClick={() => void handleOpenPortalWindow('CHARGE_URL')}
              style={actionBtnStyle('secondary', true)}
            >
              포인트 충전
            </button>
            <button
              type="button"
              onClick={() => void handleOpenPortalWindow('CERT_URL')}
              style={actionBtnStyle('secondary', true)}
            >
              인증서 관리
            </button>
            <button
              type="button"
              onClick={() => void handleOpenPortalWindow('PORTAL_URL')}
              style={actionBtnStyle('secondary', true)}
            >
              팝빌 포털
            </button>
            <button
              type="button"
              disabled={popbillLiveLoading}
              onClick={() => void loadPopbillStatus(false)}
              style={actionBtnStyle('secondary', true)}
            >
              {popbillLiveLoading ? '조회중' : '상태 새로고침'}
            </button>
          </div>
        </div>
      )}

      <div data-manual-id="ar-grid">
        <DataGrid
          columns={billingCols}
          rows={sortedVisibleBillings}
          rowKey={(b) => b.id}
          selectedRowId={selectedBilling?.id || null}
          onRowClick={(b) => {
            setSelectedBillingId(b.id);
            setColAmount(b.unpaidBalanceKrw);
          }}
          maxHeight="clamp(280px, calc(100vh - 380px), 680px)"
        />
      </div>

      {selectedBilling && (
        <SectionPanel
          title={`청구 관리 · ${selectedBilling.billingNo} · ${selectedBilling.partnerName}`}
          manualId="ar-docs"
          rightSlot={
            <DocumentActionBar
              docLabel="거래명세서"
              defaultEmail={selectedPartner?.taxEmail || selectedPartner?.email || ''}
              defaultSubject={`[${tenantProfile.corporateName}] ${selectedBilling.billingYm} 거래명세서`}
              defaultBody={`${selectedBilling.partnerName} 귀중\n\n${selectedBilling.billingYm}분 거래명세서를 첨부하여 송부드립니다.\n청구합계: ${selectedBilling.totalAmountKrw.toLocaleString('ko-KR')}원`}
              onGenerate={() =>
                generateTransactionStatementExcel({
                  billing: selectedBilling,
                  partner: selectedPartner,
                  tenant: tenantProfile,
                  templates: datasets.documentTemplates,
                })
              }
            />
          }
        >
          {isPopbillTaxInvoiceEnabled && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-inline-gap)',
                padding: '10px 12px',
                marginBottom: '12px',
                borderRadius: '6px',
                border: '1px solid var(--table-border-color)',
                backgroundColor: 'var(--bg-app)',
              }}
            >
              {selectedBilling.taxInvoiceChannel === 'POPBILL' &&
              selectedBilling.taxInvoiceStatus !== 'CANCELLED' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', fontSize: '12.5px' }}>
                    <StatusBadge
                      label={formatPopbillStatusLabel(selectedBilling.taxInvoiceStatus).label}
                      tone={formatPopbillStatusLabel(selectedBilling.taxInvoiceStatus).tone}
                    />
                    <span>관리번호: {selectedBilling.taxInvoiceMgtKey || '-'}</span>
                    <span>국세청 승인번호: {selectedBilling.taxInvoiceNo || '-'}</span>
                    <span>구분: {selectedBilling.taxInvoicePurpose || '청구'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '6px' }}>
                    <VerticalField label="수신 이메일" width={200}>
                      <input
                        type="email"
                        value={resendEmailInput}
                        onChange={(e) => setResendEmailInput(e.target.value)}
                        placeholder="재전송 이메일 입력"
                        style={controlInputStyle}
                      />
                    </VerticalField>
                    <button
                      type="button"
                      disabled={busyId === selectedBilling.id}
                      onClick={() => void handleResendPopbillEmail(selectedBilling)}
                      style={actionBtnStyle('secondary', true)}
                    >
                      메일 재전송
                    </button>
                    <button
                      type="button"
                      disabled={busyId === selectedBilling.id}
                      onClick={() => void handleOpenPopbillDoc(selectedBilling, 'VIEW_URL')}
                      style={actionBtnStyle('secondary', true)}
                    >
                      계산서 조회
                    </button>
                    <button
                      type="button"
                      disabled={busyId === selectedBilling.id}
                      onClick={() => void handleOpenPopbillDoc(selectedBilling, 'PRINT_URL')}
                      style={actionBtnStyle('secondary', true)}
                    >
                      인쇄
                    </button>
                    {canEdit && selectedBilling.taxInvoiceStatus !== 'SENT_NTS' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === selectedBilling.id}
                          onClick={() => void handleSendToNts(selectedBilling)}
                          style={actionBtnStyle('primary', true)}
                        >
                          국세청 즉시전송
                        </button>
                        <button
                          type="button"
                          disabled={busyId === selectedBilling.id}
                          onClick={() => void handleCancelPopbillInvoice(selectedBilling)}
                          style={actionBtnStyle('danger', true)}
                        >
                          발행 취소
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busyId === selectedBilling.id}
                      onClick={() => void handleSyncPopbillStatus(selectedBilling)}
                      style={actionBtnStyle('secondary', true)}
                    >
                      상태 동기화
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    팝빌 전자세금계산서 상태: {formatPopbillStatusLabel(selectedBilling.taxInvoiceStatus).label}
                  </span>
                  {canEdit && selectedBilling.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      disabled={busyId === selectedBilling.id}
                      onClick={() => setPopbillModalBilling(selectedBilling)}
                      style={actionBtnStyle('primary', true)}
                    >
                      팝빌 전자세금계산서 발행
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {canEdit && selectedBilling.unpaidBalanceKrw > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
              <VerticalField label="수납 입금액" required width={160}>
                <CommaNumberInput
                  min={0}
                  value={colAmount || selectedBilling.unpaidBalanceKrw}
                  onChange={setColAmount}
                />
              </VerticalField>
              <VerticalField label="수납일자" required width={145}>
                <input
                  type="date"
                  value={colDate}
                  onChange={(e) => setColDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="수납수단" width={130}>
                <select
                  value={colMethod}
                  onChange={(e) => setColMethod(e.target.value)}
                  style={controlInputStyle}
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <button
                type="button"
                disabled={busyId === selectedBilling.id}
                onClick={handleSaveCollection}
                style={actionBtnStyle('primary')}
              >
                수납 등록
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              선택 청구 수납상태: {BILLING_STATUS_KO_LABELS[selectedBilling.status] || formatKoStatus(selectedBilling.status)} · 미수납잔액 {formatMoney(selectedBilling.unpaidBalanceKrw, { salesSensitive: true })}
            </div>
          )}
        </SectionPanel>
      )}

      <ConservationBar
        items={[
          { label: '청구총액', value: formatMoney(totals.total, { salesSensitive: true }) },
          { label: '수납누계액', value: formatMoney(totals.paid, { salesSensitive: true }), tone: 'success' },
          { label: '미수납잔액', value: formatMoney(totals.unpaid, { salesSensitive: true }), tone: 'danger' },
        ]}
        balanced={totals.diff === 0}
        balanceMessage={`청구 대차 차액 ${totals.diff.toLocaleString('ko-KR')}원`}
      />

      {isPopbillTaxInvoiceEnabled && (
        <PopbillTaxInvoiceModal
          open={Boolean(popbillModalBilling)}
          onClose={() => setPopbillModalBilling(null)}
          billing={popbillModalBilling}
          partner={popbillModalBilling ? partnersById.get(popbillModalBilling.partnerId) : undefined}
          tenant={tenantProfile}
          liveStatus={popbillLive}
          onIssued={async (res) => {
            await refreshAll();
            notifyToast(res.message || '팝빌 전자세금계산서 발행 완료', 'success');
          }}
        />
      )}
    </div>
  );
};
