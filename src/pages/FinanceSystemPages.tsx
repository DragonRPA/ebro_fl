import React, { useEffect, useMemo, useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { CommitActionButton } from '../core/ActionCommandGateway';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../core/supabase';
import {
  addDaysIso,
  buildContractBillingLines,
  createEmployeeUser,
  payLeaseInstallment,
  recordBillingCollection,
  settleApPayable,
  updateEmployeeHrRecord,
} from '../services/domainEngine';
import { generateFinancialStatements } from '../services/financialStatementEngine';
import { generateTransactionStatementExcel } from '../services/documentService';
import { useManual } from '../manual/ManualContext';
import { ALL_MANUAL_ENTRIES } from '../manual/manualRegistry';
import { COMMENTARY_SECTIONS, STANDARD_ARTICLES } from '../data/accountingStandardsData';
import {
  CommaNumberInput,
  ConservationBar,
  DataGrid,
  DocumentActionBar,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type GridColumn,
} from '../components/UiPrimitives';
import {
  AP_STATUS_KO_LABELS,
  BANK_MATCH_STATUS_KO_LABELS,
  BILLING_STATUS_KO_LABELS,
  FL_MENU_GROUPS,
  PAYMENT_METHODS,
  TIER_LABELS,
  computeDueDateFromCycle,
  defaultTierPagePermission,
  formatKoAcquisitionType,
  formatKoActionCode,
  formatKoCurrency,
  formatKoPayableType,
  formatKoStatus,
  formatPaymentTermsLabel,
  koStatusTone,
  normalizePaymentMethod,
  type DocumentTemplateType,
  type FlApprovalPolicy,
  type FlBankTransaction,
  type FlBilling,
  type FlDocumentTemplate,
  type FlPageId,
  type FlUser,
  type TierLevel,
} from '../types/domain';

export const ArBillingCollectionPage: React.FC = () => {
  const {
    currentUser,
    tenantProfile,
    datasets,
    formatMoney,
    refreshAll,
    notifyToast,
    canEditPage,
  } = useAppShell();
  const canEdit = canEditPage('ar_billing_collection');
  const today = new Date().toISOString().slice(0, 10);
  const curYm = today.slice(0, 7);
  const [billingYm, setBillingYm] = useState(curYm);

  const billableContracts = useMemo(() => {
    const active = datasets.contracts.filter(
      (c) => c.status === 'ACTIVE' || c.status === 'FULFILLING' || c.status === 'COMPLETED'
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
    datasets.billings[0]?.id || null
  );
  const [invoiceNoEdits, setInvoiceNoEdits] = useState<Record<string, string>>({});
  const [colAmount, setColAmount] = useState(0);
  const [colDate, setColDate] = useState(today);
  const [colMethod, setColMethod] = useState('계좌이체');
  const [busyId, setBusyId] = useState<string | null>(null);

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
    datasets.billings.find((b) => b.id === selectedBillingId) || datasets.billings[0] || null;
  const selectedPartner = useMemo(
    () =>
      selectedBilling
        ? datasets.partners.find((p) => p.id === selectedBilling.partnerId)
        : undefined,
    [datasets.partners, selectedBilling]
  );

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
    const active = datasets.billings.filter((b) => b.status !== 'CANCELLED');
    const total = active.reduce((s, b) => s + b.totalAmountKrw, 0);
    const paid = active.reduce((s, b) => s + b.paidAmountKrw, 0);
    const unpaid = active.reduce((s, b) => s + b.unpaidBalanceKrw, 0);
    return { total, paid, unpaid, diff: total - paid - unpaid };
  }, [datasets.billings]);

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
    { key: 'billingNo', header: '청구번호', width: 135, render: (b) => <span style={{ fontWeight: 700 }}>{b.billingNo}</span> },
    { key: 'billingYm', header: '청구월', width: 85, align: 'center', render: (b) => b.billingYm },
    { key: 'partnerName', header: '거래처', render: (b) => b.partnerName },
    {
      key: 'totalAmountKrw',
      header: '청구합계',
      width: 120,
      align: 'right',
      render: (b) => formatMoney(b.totalAmountKrw, { salesSensitive: true }),
    },
    {
      key: 'paidAmountKrw',
      header: '수납액',
      width: 115,
      align: 'right',
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
      render: (b) => (
        <span style={{ color: b.unpaidBalanceKrw > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 700 }}>
          {formatMoney(b.unpaidBalanceKrw, { salesSensitive: true })}
        </span>
      ),
    },
    {
      key: 'taxInvoice',
      header: '세금계산서 발행',
      width: 245,
      render: (b) => (
        <div
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)' }}
          onClick={(e) => e.stopPropagation()}
        >
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
            style={{ ...controlInputStyle, height: '26px', width: '130px', fontSize: '11.5px' }}
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
      ),
    },
    {
      key: 'status',
      header: '수납상태',
      width: 90,
      align: 'center',
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
                    {c.contractNo} · {c.contractDomain === 'RENTAL' ? '렌탈' : '유통'} · {c.partnerName} · {formatPaymentTermsLabel(c.paymentCycle, c.paymentDueDay, c.paymentMonthOffset)}
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

      <div data-manual-id="ar-grid">
        <DataGrid
          columns={billingCols}
          rows={[...datasets.billings].sort((a, b) => b.billingDate.localeCompare(a.billingDate))}
          rowKey={(b) => b.id}
          selectedRowId={selectedBilling?.id || null}
          onRowClick={(b) => {
            setSelectedBillingId(b.id);
            setColAmount(b.unpaidBalanceKrw);
          }}
          maxHeight="340px"
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
    </div>
  );
};

export const ApSettlementsPage: React.FC = () => {
  const { datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('ap_settlements');
  const today = new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<'AP' | 'LEASE'>('AP');
  const [selectedApId, setSelectedApId] = useState<string | null>(datasets.apPayables[0]?.id || null);
  const [settledFxRate, setSettledFxRate] = useState<number>(1380);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [paidDate, setPaidDate] = useState(today);

  const [selectedSchId, setSelectedSchId] = useState<string | null>(null);

  const selectedAp =
    datasets.apPayables.find((a) => a.id === selectedApId) || datasets.apPayables[0] || null;

  const unpaidSchedules = useMemo(
    () =>
      datasets.financeLeaseSchedules
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [datasets.financeLeaseSchedules]
  );

  const selectedSch =
    unpaidSchedules.find((s) => s.id === selectedSchId) ||
    unpaidSchedules.find((s) => !s.isPaid) ||
    null;

  const fxPreview = useMemo(() => {
    if (!selectedAp || selectedAp.currencyCode === 'KRW') return 0;
    const remKrw = selectedAp.totalAmountKrw - selectedAp.paidAmountKrw;
    const fxQty =
      settleAmount > 0
        ? settleAmount
        : Math.round((remKrw / Math.max(1, selectedAp.bookedFxRate)) * 100) / 100;
    const settledKrw = Math.round(fxQty * Number(settledFxRate || selectedAp.bookedFxRate));
    const bookedPortion = Math.round(fxQty * selectedAp.bookedFxRate);
    return settledKrw - bookedPortion;
  }, [selectedAp, settleAmount, settledFxRate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="매입채무 · 금융리스 원리금 정산"
        manualId="ap-tabs"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'AP', label: '매입 · 물류 · 외주 채무', count: datasets.apPayables.length },
              {
                id: 'LEASE',
                label: '금융리스 상환회차',
                count: datasets.financeLeaseSchedules.filter((s) => !s.isPaid).length,
              },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as typeof tab)}
          />
        }
      >
        {tab === 'AP' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <DataGrid
              columns={[
                { key: 'no', header: '채무번호', width: 140, render: (a) => <span style={{ fontWeight: 700 }}>{a.payableNo}</span> },
                { key: 'type', header: '구분', width: 115, render: (a) => <StatusBadge label={formatKoPayableType(a.payableType)} tone="info" /> },
                { key: 'partnerName', header: '지급처', render: (a) => a.partnerName },
                { key: 'cur', header: '통화', width: 90, align: 'center', render: (a) => formatKoCurrency(a.currencyCode) },
                { key: 'fx', header: '장부환율', width: 95, align: 'right', render: (a) => a.bookedFxRate },
                { key: 'tot', header: '원화채무액', width: 125, align: 'right', render: (a) => formatMoney(a.totalAmountKrw) },
                { key: 'paid', header: '기지급액', width: 115, align: 'right', render: (a) => formatMoney(a.paidAmountKrw) },
                { key: 'fxGl', header: '외환차손익', width: 110, align: 'right', render: (a) => formatMoney(a.fxGainLossKrw) },
                {
                  key: 'st',
                  header: '상태',
                  width: 90,
                  align: 'center',
                  render: (a) => (
                    <StatusBadge
                      label={AP_STATUS_KO_LABELS[a.status] || formatKoStatus(a.status)}
                      tone={koStatusTone(a.status)}
                    />
                  ),
                },
              ]}
              rows={datasets.apPayables}
              rowKey={(a) => a.id}
              selectedRowId={selectedAp?.id || null}
              onRowClick={(a) => {
                setSelectedApId(a.id);
                setSettledFxRate(a.bookedFxRate || 1);
                setSettleAmount(0);
              }}
              maxHeight="380px"
            />

            {canEdit && selectedAp && selectedAp.status !== 'PAID' && (
              <div
                data-manual-id="ap-pay"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-field-grid-gap)',
                  alignItems: 'flex-end',
                  padding: 'var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-header)',
                }}
              >
                <VerticalField label="지급일자" required width={145}>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                {selectedAp.currencyCode !== 'KRW' && (
                  <VerticalField label="결제 적용환율" required width={140}>
                    <input
                      type="number"
                      step="0.01"
                      value={settledFxRate}
                      onChange={(e) => setSettledFxRate(Number(e.target.value))}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                )}
                <VerticalField
                  label={selectedAp.currencyCode === 'KRW' ? '지급 원화금액' : `지급 외화금액 · ${formatKoCurrency(selectedAp.currencyCode)}`}
                  width={165}
                >
                  <CommaNumberInput
                    allowDecimal={selectedAp.currencyCode !== 'KRW'}
                    maxDecimals={2}
                    min={0}
                    value={settleAmount}
                    onChange={setSettleAmount}
                    placeholder="0 입력 시 잔액 전액 지급"
                  />
                </VerticalField>
                {selectedAp.currencyCode !== 'KRW' && (
                  <StatusBadge
                    label={
                      fxPreview > 0
                        ? `예상 외환차손 ${fxPreview.toLocaleString('ko-KR')}원`
                        : fxPreview < 0
                          ? `예상 외환차익 ${Math.abs(fxPreview).toLocaleString('ko-KR')}원`
                          : '환차손익 0원'
                    }
                    tone={fxPreview > 0 ? 'danger' : fxPreview < 0 ? 'success' : 'neutral'}
                  />
                )}
                <CommitActionButton
                  actionCode="AP_SETTLEMENT_PAY"
                  targetTable="fl_ap_payables"
                  targetId={selectedAp.id}
                  title={`채무 지급 확정 · ${selectedAp.payableNo}`}
                  buildPayload={() => ({
                    kind: 'AP',
                    payableId: selectedAp.id,
                    settledFxRate: selectedAp.currencyCode === 'KRW' ? 1 : settledFxRate,
                    amount: settleAmount > 0 ? settleAmount : undefined,
                    paidDate,
                  })}
                  onExecuteDirect={async () => {
                    await settleApPayable({
                      payable: selectedAp,
                      settledFxRate: selectedAp.currencyCode === 'KRW' ? 1 : settledFxRate,
                      settleForeignOrKrwAmount: settleAmount > 0 ? settleAmount : undefined,
                      paidDate,
                    });
                    await refreshAll();
                    notifyToast('매입채무 지급 및 외환차손익 확정 완료', 'success');
                  }}
                  label="지급 확정"
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <DataGrid
              columns={[
                { key: 'leaseId', header: '리스번호', width: 120, render: (s) => s.leaseId },
                { key: 'no', header: '회차', width: 55, align: 'center', render: (s) => s.installmentNo },
                { key: 'dueDate', header: '납입예정일', width: 105, render: (s) => s.dueDate },
                { key: 'prin', header: '원금상환', width: 115, align: 'right', render: (s) => formatMoney(s.principalPaymentKrw) },
                { key: 'int', header: '이자비용', width: 110, align: 'right', render: (s) => formatMoney(s.interestExpenseKrw) },
                { key: 'tot', header: '월납입액', width: 115, align: 'right', render: (s) => formatMoney(s.totalInstallmentKrw) },
                { key: 'end', header: '잔여원금', width: 120, align: 'right', render: (s) => formatMoney(s.endingPrincipalKrw) },
                {
                  key: 'paid',
                  header: '상태',
                  width: 80,
                  align: 'center',
                  render: (s) => <StatusBadge label={s.isPaid ? '납입' : '미납'} tone={s.isPaid ? 'success' : 'warning'} />,
                },
              ]}
              rows={unpaidSchedules}
              rowKey={(s) => s.id}
              selectedRowId={selectedSch?.id || null}
              onRowClick={(s) => setSelectedSchId(s.id)}
              maxHeight="380px"
            />

            {canEdit && selectedSch && !selectedSch.isPaid && (
              <div
                data-manual-id="ap-pay"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-field-grid-gap)',
                  alignItems: 'flex-end',
                  padding: 'var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-header)',
                }}
              >
                <VerticalField label="납입 확정일" required width={150}>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <CommitActionButton
                  actionCode="AP_SETTLEMENT_PAY"
                  targetTable="fl_finance_lease_schedules"
                  targetId={selectedSch.id}
                  title={`금융리스 ${selectedSch.installmentNo}회차 납입`}
                  buildPayload={() => ({
                    kind: 'LEASE_SCHEDULE',
                    leaseId: selectedSch.leaseId,
                    scheduleId: selectedSch.id,
                    paidDate,
                  })}
                  onExecuteDirect={async () => {
                    const lease = datasets.financeLeases.find((l) => l.id === selectedSch.leaseId);
                    if (!lease) throw new Error('리스 원장을 찾을 수 없습니다.');
                    await payLeaseInstallment({ lease, schedule: selectedSch, paidDate });
                    await refreshAll();
                    notifyToast('금융리스 회차 납입 완료', 'success');
                  }}
                  label="리스회차 납입"
                />
              </div>
            )}
          </div>
        )}
      </SectionPanel>
    </div>
  );
};

export const BankMatchingPage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('bank_matching');
  const today = new Date().toISOString().slice(0, 10);

  const [txDate, setTxDate] = useState(today);
  const [txDirection, setTxDirection] = useState<'IN' | 'OUT'>('IN');
  const [bankName, setBankName] = useState('기업은행');
  const [accountNo, setAccountNo] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [amountKrw, setAmountKrw] = useState(0);
  const [memo, setMemo] = useState('');

  const [selectedTxId, setSelectedTxId] = useState<string | null>(
    datasets.bankTransactions[0]?.id || null
  );
  const [targetMatchId, setTargetMatchId] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedTx =
    datasets.bankTransactions.find((t) => t.id === selectedTxId) ||
    datasets.bankTransactions[0] ||
    null;

  const candidateTargets = useMemo(() => {
    if (!selectedTx) return [];
    if (selectedTx.txDirection === 'IN') {
      return datasets.billings
        .filter((b) => b.unpaidBalanceKrw > 0 && b.status !== 'CANCELLED')
        .map((b) => ({
          id: b.id,
          label: `미수청구 · ${b.billingNo} · ${b.partnerName} · 미수 ${b.unpaidBalanceKrw.toLocaleString('ko-KR')}원`,
        }));
    }
    const apOptions = datasets.apPayables
      .filter((a) => a.status !== 'PAID')
      .map((a) => ({
        id: `AP::${a.id}`,
        label: `매입채무 · ${a.payableNo} · ${a.partnerName} · ${(a.totalAmountKrw - a.paidAmountKrw).toLocaleString('ko-KR')}원`,
      }));
    const leaseOptions = datasets.financeLeaseSchedules
      .filter((s) => !s.isPaid)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((s) => {
        const lease = datasets.financeLeases.find((l) => l.id === s.leaseId);
        return {
          id: `LEASE::${s.id}`,
          label: `금융리스회차 · ${lease?.lenderName || s.leaseId} · ${s.installmentNo}회차 · ${s.dueDate} · ${s.totalInstallmentKrw.toLocaleString('ko-KR')}원`,
        };
      });
    return [...apOptions, ...leaseOptions];
  }, [datasets.apPayables, datasets.billings, datasets.financeLeaseSchedules, datasets.financeLeases, selectedTx]);

  const handleAddTx = async () => {
    if (!counterpartyName.trim() || amountKrw <= 0) {
      notifyToast('거래처 적요와 금액을 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      const id = newId('BTX');
      const rec: FlBankTransaction = {
        id,
        tenantId: DEFAULT_TENANT_ID,
        txDate,
        txDirection,
        bankName,
        accountNo: accountNo.trim() || null,
        counterpartyName: counterpartyName.trim(),
        amountKrw: Math.round(amountKrw),
        matchStatus: 'UNMATCHED',
        memo: memo.trim() || null,
      };
      await execDbMutation('통장 거래내역 등록', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({ ...rec }))
      );
      setCounterpartyName('');
      setAmountKrw(0);
      setSelectedTxId(id);
      await refreshAll();
      notifyToast('통장 거래내역 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '거래내역 등록 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleMatch = async () => {
    if (!currentUser || !selectedTx || selectedTx.matchStatus !== 'UNMATCHED') return;
    const matchId = targetMatchId || candidateTargets[0]?.id;
    if (!matchId) {
      notifyToast('연결할 청구 또는 채무 대상을 선택해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      if (selectedTx.txDirection === 'IN') {
        const bill = datasets.billings.find((b) => b.id === matchId);
        if (!bill) throw new Error('청구 원장을 찾을 수 없습니다.');
        await recordBillingCollection({
          billing: bill,
          amountKrw: Math.min(bill.unpaidBalanceKrw, selectedTx.amountKrw),
          collectionDate: selectedTx.txDate,
          paymentMethod: '계좌이체',
          bankTxId: selectedTx.id,
          recordedBy: currentUser.name,
        });
      } else if (matchId.startsWith('LEASE::')) {
        const schId = matchId.slice('LEASE::'.length);
        const sch = datasets.financeLeaseSchedules.find((s) => s.id === schId);
        const lease = sch ? datasets.financeLeases.find((l) => l.id === sch.leaseId) : undefined;
        if (!sch || !lease) throw new Error('금융리스 회차를 찾을 수 없습니다.');
        await payLeaseInstallment({
          lease,
          schedule: sch,
          paidDate: selectedTx.txDate,
          bankTxId: selectedTx.id,
        });
        await execDbMutation('리스출금 통장대사 연결', () =>
          flSupabase
            .from('bank_transactions')
            .update(
              camelToSnakeRow({
                matchedType: 'LEASE_INSTALLMENT',
                matchedId: sch.id,
                matchStatus: 'MATCHED',
                updatedAt: new Date().toISOString(),
              })
            )
            .eq('id', selectedTx.id)
        );
      } else {
        const apId = matchId.startsWith('AP::') ? matchId.slice('AP::'.length) : matchId;
        const ap = datasets.apPayables.find((a) => a.id === apId);
        if (!ap) throw new Error('매입채무를 찾을 수 없습니다.');
        await settleApPayable({
          payable: ap,
          settledFxRate: ap.bookedFxRate || 1,
          settleForeignOrKrwAmount: ap.currencyCode === 'KRW' ? selectedTx.amountKrw : undefined,
          paidDate: selectedTx.txDate,
        });
        await execDbMutation('출금 통장대사 연결', () =>
          flSupabase
            .from('bank_transactions')
            .update(
              camelToSnakeRow({
                matchedType: 'AP_PAYABLE',
                matchedId: ap.id,
                matchStatus: 'MATCHED',
                updatedAt: new Date().toISOString(),
              })
            )
            .eq('id', selectedTx.id)
        );
      }
      await refreshAll();
      notifyToast('통장 대사 연결 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '통장 대사 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && (
        <SectionPanel
          title="통장 입출금 거래 등록"
          manualId="btx-add"
          rightSlot={
            <button
              type="button"
              disabled={busy}
              onClick={handleAddTx}
              style={actionBtnStyle('primary', true)}
            >
              거래 등록
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="거래일자" required>
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="입출금" required>
              <select
                value={txDirection}
                onChange={(e) => setTxDirection(e.target.value as 'IN' | 'OUT')}
                style={controlInputStyle}
              >
                <option value="IN">입금</option>
                <option value="OUT">출금</option>
              </select>
            </VerticalField>
            <VerticalField label="은행">
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="계좌번호">
              <input
                type="text"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="거래처 적요" required>
              <input
                type="text"
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="거래금액" required>
              <CommaNumberInput min={0} value={amountKrw} onChange={setAmountKrw} />
            </VerticalField>
            <VerticalField label="비고">
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
        </SectionPanel>
      )}

      <SectionPanel title="통장 입출금 1대1 대사 연결" manualId="btx-match">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <DataGrid
            columns={[
              { key: 'txDate', header: '거래일', width: 105, render: (t) => t.txDate },
              {
                key: 'dir',
                header: '구분',
                width: 75,
                align: 'center',
                render: (t) => (
                  <StatusBadge label={t.txDirection === 'IN' ? '입금' : '출금'} tone={t.txDirection === 'IN' ? 'success' : 'warning'} />
                ),
              },
              { key: 'bankName', header: '은행', width: 100, render: (t) => t.bankName },
              { key: 'counterpartyName', header: '거래처 적요', render: (t) => t.counterpartyName },
              { key: 'amountKrw', header: '금액', width: 125, align: 'right', render: (t) => formatMoney(t.amountKrw) },
              {
                key: 'status',
                header: '대사상태',
                width: 95,
                align: 'center',
                render: (t) => (
                  <StatusBadge
                    label={BANK_MATCH_STATUS_KO_LABELS[t.matchStatus] || formatKoStatus(t.matchStatus)}
                    tone={koStatusTone(t.matchStatus)}
                  />
                ),
              },
            ]}
            rows={[...datasets.bankTransactions].sort((a, b) => b.txDate.localeCompare(a.txDate))}
            rowKey={(t) => t.id}
            selectedRowId={selectedTx?.id || null}
            onRowClick={(t) => {
              setSelectedTxId(t.id);
              setTargetMatchId('');
            }}
            maxHeight="340px"
          />

          {canEdit && selectedTx && selectedTx.matchStatus === 'UNMATCHED' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
              <VerticalField label="매칭할 미수청구 · 매입채무" required minWidth={320} flex={1}>
                <select
                  value={targetMatchId || candidateTargets[0]?.id || ''}
                  onChange={(e) => setTargetMatchId(e.target.value)}
                  style={controlInputStyle}
                >
                  {candidateTargets.length === 0 ? (
                    <option value="">매칭 가능한 미정산 대상 없음</option>
                  ) : (
                    candidateTargets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))
                  )}
                </select>
              </VerticalField>
              <button
                type="button"
                disabled={busy || candidateTargets.length === 0}
                onClick={handleMatch}
                style={actionBtnStyle('primary')}
              >
                대사 연결 확정
              </button>
            </div>
          )}
        </div>
      </SectionPanel>
    </div>
  );
};

export const FinancialStatementsPage: React.FC = () => {
  const { datasets, formatMoney } = useAppShell();
  const curYm = new Date().toISOString().slice(0, 7);
  const yearStartYm = `${curYm.slice(0, 4)}-01`;

  const [startYm, setStartYm] = useState(yearStartYm);
  const [endYm, setEndYm] = useState(curYm);
  const [tab, setTab] = useState<'BS' | 'PL' | 'CF' | 'ASSET' | 'LEASE' | 'STANDARD'>('BS');
  const [stdSearch, setStdSearch] = useState('');

  const report = useMemo(
    () => generateFinancialStatements(datasets, startYm, endYm),
    [datasets, endYm, startYm]
  );

  const filteredArticles = useMemo(() => {
    const q = stdSearch.trim().toLowerCase();
    if (!q) return STANDARD_ARTICLES.slice(0, 20);
    return STANDARD_ARTICLES.filter(
      (a) =>
        a.articleTitle.toLowerCase().includes(q) ||
        a.articleNo.toLowerCase().includes(q) ||
        a.paragraphs.some((p) => p.toLowerCase().includes(q))
    );
  }, [stdSearch]);

  const filteredCommentaries = useMemo(() => {
    const q = stdSearch.trim().toLowerCase();
    if (!q) return COMMENTARY_SECTIONS.slice(0, 12);
    return COMMENTARY_SECTIONS.filter(
      (c) =>
        c.sectionTitle.toLowerCase().includes(q) ||
        c.quotedArticles.some((p) => p.toLowerCase().includes(q))
    );
  }, [stdSearch]);

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
      maxHeight="500px"
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
              { id: 'ASSET', label: '렌탈자산 감가상각명세' },
              { id: 'LEASE', label: '금융리스 이자·원금명세' },
              { id: 'STANDARD', label: '중소기업회계기준 해설' },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as typeof tab)}
          />
        </div>

        {tab === 'BS' && (
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

        {tab === 'PL' && renderStatementRows(report.incomeStatement.rows)}

        {tab === 'CF' && renderStatementRows(report.cashFlow.rows)}

        {tab === 'ASSET' && (
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
            maxHeight="470px"
          />
        )}

        {tab === 'LEASE' && (
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
            maxHeight="470px"
          />
        )}

        {tab === 'STANDARD' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <VerticalField label="중소기업회계기준 조문 · 해설 검색" width={360}>
              <input
                type="text"
                value={stdSearch}
                onChange={(e) => setStdSearch(e.target.value)}
                placeholder="리스, 감가상각, 외환차손익, 수익인식 등"
                style={controlInputStyle}
              />
            </VerticalField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-stack-gap)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-inline-gap)', maxHeight: '460px', overflowY: 'auto' }}>
                {filteredArticles.map((art) => (
                  <div
                    key={art.id}
                    style={{
                      padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                      border: '1px solid var(--table-border-color)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-app)',
                      fontSize: '12.5px',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 'var(--space-label-gap)' }}>
                      {art.articleNo} · {art.articleTitle}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      {art.paragraphs.join(' ')}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-inline-gap)', maxHeight: '460px', overflowY: 'auto' }}>
                {filteredCommentaries.map((sec) => (
                  <div
                    key={sec.id}
                    style={{
                      padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                      border: '1px solid var(--table-border-color)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-app)',
                      fontSize: '12.5px',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 'var(--space-label-gap)' }}>
                      {sec.sectionNo} · {sec.sectionTitle}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      {sec.quotedArticles.slice(0, 2).join(' ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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

export const OperationManualPage: React.FC = () => {
  const { navigateTo, visiblePageSet } = useAppShell();
  const { setOverlayOpen, customNotes } = useManual();
  const [query, setQuery] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<FlPageId>('dashboard');

  const visibleEntries = useMemo(
    () => ALL_MANUAL_ENTRIES.filter((e) => visiblePageSet.has(e.pageId)),
    [visiblePageSet]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleEntries;
    return visibleEntries.filter((entry) => {
      if (entry.pageTitle.toLowerCase().includes(q)) return true;
      if (entry.basicDescription.toLowerCase().includes(q)) return true;
      return entry.processes.some(
        (p) =>
          p.processName.toLowerCase().includes(q) ||
          p.purpose.toLowerCase().includes(q) ||
          p.steps.some(
            (s) =>
              s.targetLabel.toLowerCase().includes(q) ||
              s.actionDetail.toLowerCase().includes(q)
          )
      );
    });
  }, [query, visibleEntries]);

  const activeEntry =
    filtered.find((e) => e.pageId === selectedPageId) || filtered[0] || visibleEntries[0];
  const activeNotes = activeEntry ? customNotes[activeEntry.pageId] || [] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel title="업무 매뉴얼 검색" manualId="man-search">
        <VerticalField label="화면명 · 업무프로세스 · 조작 대상 검색" width={420}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="매입통관, 교환, 세금계산서, 금융리스 등"
            style={controlInputStyle}
          />
        </VerticalField>
      </SectionPanel>

      <div
        data-manual-id="man-list"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(380px, 1.5fr)',
          gap: 'var(--space-page-gap)',
          alignItems: 'start',
        }}
      >
        <DataGrid
          columns={[
            { key: 'grp', header: '영역', width: 120, render: (e) => e.groupLabel },
            { key: 'title', header: '화면명', render: (e) => <span style={{ fontWeight: 700 }}>{e.pageTitle}</span> },
            { key: 'cnt', header: '업무수', width: 70, align: 'center', render: (e) => e.processes.length },
          ]}
          rows={filtered}
          rowKey={(e) => e.pageId}
          selectedRowId={activeEntry?.pageId || null}
          onRowClick={(e) => setSelectedPageId(e.pageId)}
          maxHeight="580px"
        />

        {activeEntry && (
          <SectionPanel
            title={`${activeEntry.groupLabel} · ${activeEntry.pageTitle}`}
            rightSlot={
              <div style={{ display: 'flex', gap: 'var(--space-inline-gap)' }}>
                <button
                  type="button"
                  onClick={() => navigateTo(activeEntry.pageId)}
                  style={actionBtnStyle('secondary', true)}
                >
                  해당 화면 이동
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigateTo(activeEntry.pageId);
                    setOverlayOpen(true);
                  }}
                  style={actionBtnStyle('primary', true)}
                >
                  오버레이 실행
                </button>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)', fontSize: '13px' }}>
              <div
                style={{
                  padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                  border: '1px solid var(--table-border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-app)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 'var(--space-label-gap)' }}>기본기능 설명</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {activeEntry.basicDescription}
                </div>
              </div>

              {activeEntry.processes.map((proc) => (
                <div
                  key={proc.processName}
                  style={{
                    padding: 'var(--space-subbox-pad-x)',
                    border: '1px solid var(--table-border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-app)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--primary)' }}>
                    {proc.processName}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px', marginBottom: 'var(--space-inline-gap)' }}>
                    {proc.purpose}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-tight-gap)' }}>
                    {proc.steps.map((st) => (
                      <div key={st.stepNo} style={{ lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700 }}>
                          {st.stepNo}단계 [{st.targetLabel}]
                        </span>{' '}
                        {st.actionDetail}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {activeNotes.length > 0 && (
                <div
                  style={{
                    padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-header)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 'var(--space-label-gap)' }}>현장 추가 주석</div>
                  {activeNotes.map((n) => (
                    <div key={n.anchorId}>
                      {n.anchorId}: {n.note}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionPanel>
        )}
      </div>
    </div>
  );
};

const ALL_DOC_TYPES: DocumentTemplateType[] = [
  '견적서_유통',
  '견적서_렌탈',
  '계약서_유통',
  '계약서_렌탈',
  '거래명세서',
];

export const SystemSettingsPage: React.FC = () => {
  const {
    currentUser,
    tenantProfile,
    datasets,
    refreshAll,
    notifyToast,
    updateTenantConfig,
    canEditPage,
    navigateTo,
  } = useAppShell();
  const canEdit = canEditPage('system_settings');

  const [tab, setTab] = useState<'USERS' | 'POLICIES' | 'PERMS' | 'TEMPLATES' | 'MAIL'>('USERS');
  const [busy, setBusy] = useState(false);

  // 신규 사용자 등록
  const [newLoginId, setNewLoginId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newTier, setNewTier] = useState<TierLevel>(1);
  const [newMaskPrice, setNewMaskPrice] = useState(false);

  // 티어 권한 매트릭스 편집
  const [permTier, setPermTier] = useState<TierLevel>(2);

  // 공식 이메일 연동 설정
  const [smtpProvider, setSmtpProvider] = useState<'GMAIL' | 'NAVER' | 'OUTLOOK' | 'CUSTOM'>(
    tenantProfile.features?.officialMailConfig?.smtpProvider || 'GMAIL'
  );
  const [smtpHost, setSmtpHost] = useState(
    tenantProfile.features?.officialMailConfig?.smtpHost || 'smtp.gmail.com'
  );
  const [smtpPort, setSmtpPort] = useState(
    tenantProfile.features?.officialMailConfig?.smtpPort || 465
  );
  const [googleEmail, setGoogleEmail] = useState(
    tenantProfile.features?.officialMailConfig?.googleEmail || ''
  );
  const [gmailAppPassword, setGmailAppPassword] = useState(
    tenantProfile.features?.officialMailConfig?.gmailAppPassword || ''
  );
  const [senderName, setSenderName] = useState(
    tenantProfile.features?.officialMailConfig?.senderName || tenantProfile.corporateName
  );

  // 양식 노트 편집
  const [tplNotes, setTplNotes] = useState<Record<string, { headerNote: string; footerNote: string }>>({});

  const handleUpdateUserTier = async (u: FlUser, tierLevel: TierLevel, maskSalesPrice: boolean) => {
    setBusy(true);
    try {
      await updateEmployeeHrRecord({
        prevUser: u,
        patch: { tierLevel, maskSalesPrice },
        reason: '시스템 설정 권한 변경',
        actor: {
          id: currentUser?.id || 'u-1',
          name: currentUser?.name || '관리자',
        },
      });
      await refreshAll();
      notifyToast(`${u.name} 직급 티어 저장 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '사용자 변경 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newLoginId.trim() || !newName.trim() || !newPass) {
      notifyToast('아이디, 이름, 비밀번호를 모두 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      await createEmployeeUser({
        loginId: newLoginId,
        initialPassword: newPass,
        name: newName,
        tierLevel: newTier,
        maskSalesPrice: newMaskPrice,
        actor: {
          id: currentUser?.id || 'u-1',
          name: currentUser?.name || '관리자',
        },
      });
      setNewLoginId('');
      setNewName('');
      setNewPass('');
      await refreshAll();
      notifyToast('신규 사용자 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '사용자 등록 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleTogglePerm = async (
    pageId: FlPageId,
    field: 'canView' | 'canEdit' | 'canApprove',
    val: boolean
  ) => {
    setBusy(true);
    try {
      const existing = datasets.userPermissions.find(
        (p) => !p.userId && p.tierLevel === permTier && p.pageId === pageId
      );
      if (existing) {
        await execDbMutation('티어 권한 수정', () =>
          flSupabase
            .from('user_permissions')
            .update(camelToSnakeRow({ [field]: val }))
            .eq('id', existing.id)
        );
      } else {
        const fallback = defaultTierPagePermission(pageId, permTier);
        await execDbMutation('티어 권한 생성', () =>
          flSupabase.from('user_permissions').insert(
            camelToSnakeRow({
              id: newId('PERM'),
              tenantId: DEFAULT_TENANT_ID,
              tierLevel: permTier,
              pageId,
              canView: field === 'canView' ? val : fallback.canView,
              canEdit: field === 'canEdit' ? val : fallback.canEdit,
              canApprove: field === 'canApprove' ? val : fallback.canApprove,
            })
          )
        );
      }
      await refreshAll();
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '권한 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadTemplateFile = async (docType: DocumentTemplateType, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setBusy(true);
      try {
        const existing = datasets.documentTemplates.find((t) => t.docType === docType);
        const nowIso = new Date().toISOString();
        if (existing) {
          await execDbMutation('문서 양식 업로드 갱신', () =>
            flSupabase
              .from('document_templates')
              .update(
                camelToSnakeRow({
                  templateName: file.name,
                  templateBase64: base64,
                  updatedBy: currentUser?.name || '관리자',
                  updatedAt: nowIso,
                })
              )
              .eq('id', existing.id)
          );
        } else {
          const rec: FlDocumentTemplate = {
            id: newId('TPL'),
            tenantId: DEFAULT_TENANT_ID,
            docType,
            templateName: file.name,
            templateBase64: base64,
            isDefault: true,
            updatedBy: currentUser?.name || '관리자',
            updatedAt: nowIso,
          };
          await execDbMutation('문서 양식 신규 등록', () =>
            flSupabase.from('document_templates').insert(camelToSnakeRow({ ...rec }))
          );
        }
        await refreshAll();
        notifyToast(`${docType} 양식 파일 저장 완료`, 'success');
      } catch (err) {
        notifyToast(err instanceof Error ? err.message : '양식 업로드 실패', 'error');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTemplateNotes = async (docType: DocumentTemplateType) => {
    const existing = datasets.documentTemplates.find((t) => t.docType === docType);
    const notes = tplNotes[docType] || {
      headerNote: existing?.headerNote || '',
      footerNote: existing?.footerNote || '',
    };
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      if (existing) {
        await execDbMutation('문서 문구 저장', () =>
          flSupabase
            .from('document_templates')
            .update(
              camelToSnakeRow({
                headerNote: notes.headerNote,
                footerNote: notes.footerNote,
                updatedBy: currentUser?.name || '관리자',
                updatedAt: nowIso,
              })
            )
            .eq('id', existing.id)
        );
      } else {
        await execDbMutation('문서 문구 등록', () =>
          flSupabase.from('document_templates').insert(
            camelToSnakeRow({
              id: newId('TPL'),
              tenantId: DEFAULT_TENANT_ID,
              docType,
              templateName: `${docType} 기본양식`,
              headerNote: notes.headerNote,
              footerNote: notes.footerNote,
              isDefault: true,
              updatedBy: currentUser?.name || '관리자',
              updatedAt: nowIso,
            })
          )
        );
      }
      await refreshAll();
      notifyToast(`${docType} 특약 문구 저장 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '양식 문구 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMailConfig = async () => {
    setBusy(true);
    try {
      await updateTenantConfig({
        features: {
          ...tenantProfile.features,
          officialMailConfig: {
            smtpProvider,
            smtpHost,
            smtpPort: Number(smtpPort || 465),
            googleEmail: googleEmail.trim(),
            gmailAppPassword: gmailAppPassword.trim(),
            senderName: senderName.trim(),
            updatedAt: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '이메일 설정 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="시스템 권한 · 7단계 티어 · 문서 설정"
        manualId="sys-tabs"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'USERS', label: '사용자 7단계 티어' },
              { id: 'POLICIES', label: '결재 기준 정책' },
              { id: 'PERMS', label: '티어별 화면 권한' },
              { id: 'TEMPLATES', label: '문서 양식 · 도장' },
              { id: 'MAIL', label: '공식 이메일 연동' },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as typeof tab)}
          />
        }
      >
        <div data-manual-id="sys-body">
          {tab === 'USERS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
              {canEdit && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-field-grid-gap)', alignItems: 'end' }}>
                  <VerticalField label="아이디" required>
                    <input
                      type="text"
                      value={newLoginId}
                      onChange={(e) => setNewLoginId(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="성명" required>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="초기 비밀번호" required>
                    <input
                      type="password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="직급 티어" required>
                    <select
                      value={newTier}
                      onChange={(e) => setNewTier(Number(e.target.value) as TierLevel)}
                      style={controlInputStyle}
                    >
                      {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                        <option key={t} value={t}>
                          {TIER_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </VerticalField>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', height: 'var(--space-control-h)', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={newMaskPrice}
                      onChange={(e) => setNewMaskPrice(e.target.checked)}
                    />
                    판매단가 비공개
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCreateUser}
                    style={actionBtnStyle('primary')}
                  >
                    사용자 추가
                  </button>
                </div>
              )}

              <DataGrid
                columns={[
                  {
                    key: 'hrLink',
                    header: '인사카드',
                    width: 90,
                    align: 'center',
                    stickyLeft: true,
                    render: () => (
                      <button
                        type="button"
                        onClick={() => navigateTo('organization_hr')}
                        style={actionBtnStyle('secondary', true)}
                      >
                        인사 관리
                      </button>
                    ),
                  },
                  { key: 'employeeNo', header: '사번', width: 96, render: (u) => u.employeeNo || '-' },
                  { key: 'loginId', header: '아이디', width: 110, render: (u) => u.loginId },
                  { key: 'name', header: '성명', width: 100, render: (u) => <span style={{ fontWeight: 700 }}>{u.name}</span> },
                  { key: 'dept', header: '소속 부서', width: 110, render: (u) => u.departmentName || '미배정' },
                  { key: 'pos', header: '직책', width: 100, render: (u) => u.position || '-' },
                  {
                    key: 'tier',
                    header: '7단계 티어 지정',
                    width: 190,
                    render: (u) => (
                      <select
                        disabled={!canEdit || busy}
                        value={u.tierLevel}
                        onChange={(e) =>
                          handleUpdateUserTier(
                            u,
                            Number(e.target.value) as TierLevel,
                            u.maskSalesPrice
                          )
                        }
                        style={{ ...controlInputStyle, height: '28px', fontSize: '12px' }}
                      >
                        {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    ),
                  },
                  {
                    key: 'mask',
                    header: '판매단가 비공개',
                    width: 125,
                    align: 'center',
                    render: (u) => (
                      <input
                        type="checkbox"
                        disabled={!canEdit || busy}
                        checked={u.maskSalesPrice}
                        onChange={(e) =>
                          handleUpdateUserTier(u, u.tierLevel, e.target.checked)
                        }
                      />
                    ),
                  },
                  {
                    key: 'active',
                    header: '상태',
                    width: 80,
                    align: 'center',
                    render: (u) => <StatusBadge label={u.isActive ? '재직' : '중지'} tone={u.isActive ? 'success' : 'neutral'} />,
                  },
                ]}
                rows={datasets.users}
                rowKey={(u) => u.id}
                maxHeight="430px"
              />
            </div>
          )}

          {tab === 'POLICIES' && (
            <PolicyEditorGrid
              policies={datasets.approvalPolicies}
              canEdit={canEdit}
              onRefresh={refreshAll}
              onToast={notifyToast}
            />
          )}

          {tab === 'PERMS' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
              <VerticalField label="편집할 기준 직급 티어 선택" width={240}>
                <select
                  value={permTier}
                  onChange={(e) => setPermTier(Number(e.target.value) as TierLevel)}
                  style={controlInputStyle}
                >
                  {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <DataGrid
                columns={[
                  { key: 'grp', header: '메뉴 그룹', width: 150, render: (r) => r.groupLabel },
                  { key: 'label', header: '화면명', render: (r) => r.label },
                  {
                    key: 'view',
                    header: '조회',
                    width: 80,
                    align: 'center',
                    render: (r) => {
                      const p = datasets.userPermissions.find(
                        (x) => !x.userId && x.tierLevel === permTier && x.pageId === r.pageId
                      );
                      const checked = p ? p.canView : defaultTierPagePermission(r.pageId, permTier).canView;
                      return (
                        <input
                          type="checkbox"
                          disabled={!canEdit || busy}
                          checked={checked}
                          onChange={(e) => handleTogglePerm(r.pageId, 'canView', e.target.checked)}
                        />
                      );
                    },
                  },
                  {
                    key: 'edit',
                    header: '편집',
                    width: 80,
                    align: 'center',
                    render: (r) => {
                      const p = datasets.userPermissions.find(
                        (x) => !x.userId && x.tierLevel === permTier && x.pageId === r.pageId
                      );
                      const checked = p ? p.canEdit : defaultTierPagePermission(r.pageId, permTier).canEdit;
                      return (
                        <input
                          type="checkbox"
                          disabled={!canEdit || busy}
                          checked={checked}
                          onChange={(e) => handleTogglePerm(r.pageId, 'canEdit', e.target.checked)}
                        />
                      );
                    },
                  },
                  {
                    key: 'approve',
                    header: '승인',
                    width: 80,
                    align: 'center',
                    render: (r) => {
                      const p = datasets.userPermissions.find(
                        (x) => !x.userId && x.tierLevel === permTier && x.pageId === r.pageId
                      );
                      const checked = p ? p.canApprove : defaultTierPagePermission(r.pageId, permTier).canApprove;
                      return (
                        <input
                          type="checkbox"
                          disabled={!canEdit || busy}
                          checked={checked}
                          onChange={(e) => handleTogglePerm(r.pageId, 'canApprove', e.target.checked)}
                        />
                      );
                    },
                  },
                ]}
                rows={FL_MENU_GROUPS.flatMap((g) =>
                  g.items.map((it) => ({ ...it, groupLabel: g.groupLabel }))
                )}
                rowKey={(r) => r.pageId}
                maxHeight="470px"
              />
            </div>
          )}

          {tab === 'TEMPLATES' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
              <div
                style={{
                  padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                  border: '1px solid var(--table-border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-app)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-conservation-gap)',
                  flexWrap: 'wrap',
                }}
              >
                <span>법인명: {tenantProfile.corporateName}</span>
                <span>사업자번호: {tenantProfile.businessNumber}</span>
                <span>도장이미지 연동: {tenantProfile.stampImageUrl || tenantProfile.stampBase64 ? '연동됨' : '미등록'}</span>
              </div>

              {ALL_DOC_TYPES.map((dt) => {
                const tpl = datasets.documentTemplates.find((t) => t.docType === dt);
                const draft = tplNotes[dt] || {
                  headerNote: tpl?.headerNote || '',
                  footerNote: tpl?.footerNote || '',
                };
                return (
                  <div
                    key={dt}
                    style={{
                      padding: 'var(--space-subbox-pad-x)',
                      border: '1px solid var(--table-border-color)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-app)',
                      display: 'grid',
                      gridTemplateColumns: '140px 1fr 1fr auto',
                      gap: 'var(--space-field-grid-gap)',
                      alignItems: 'end',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13.5px' }}>{dt.replace('_', ' · ')}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {tpl?.templateBase64 ? `사용자 양식 · ${tpl.templateName}` : '내장 표준양식'}
                      </div>
                    </div>
                    <VerticalField label="특약 · 머리글 문구">
                      <input
                        type="text"
                        value={draft.headerNote}
                        onChange={(e) =>
                          setTplNotes((p) => ({
                            ...p,
                            [dt]: { ...draft, headerNote: e.target.value },
                          }))
                        }
                        style={controlInputStyle}
                      />
                    </VerticalField>
                    <VerticalField label="하단 안내 문구">
                      <input
                        type="text"
                        value={draft.footerNote}
                        onChange={(e) =>
                          setTplNotes((p) => ({
                            ...p,
                            [dt]: { ...draft, footerNote: e.target.value },
                          }))
                        }
                        style={controlInputStyle}
                      />
                    </VerticalField>
                    <div style={{ display: 'flex', gap: 'var(--space-tight-gap)', alignItems: 'center' }}>
                      {canEdit && (
                        <>
                          <label style={{ ...actionBtnStyle('secondary', true), cursor: 'pointer' }}>
                            양식 업로드
                            <input
                              type="file"
                              accept=".xlsx,.xls"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadTemplateFile(dt, f);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSaveTemplateNotes(dt)}
                            style={actionBtnStyle('primary', true)}
                          >
                            문구 저장
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'MAIL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)', maxWidth: '640px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="메일 서버 구분">
                  <select
                    value={smtpProvider}
                    onChange={(e) =>
                      setSmtpProvider(e.target.value as 'GMAIL' | 'NAVER' | 'OUTLOOK' | 'CUSTOM')
                    }
                    style={controlInputStyle}
                  >
                    <option value="GMAIL">지메일</option>
                    <option value="NAVER">네이버웍스 · 네이버</option>
                    <option value="OUTLOOK">아웃룩</option>
                    <option value="CUSTOM">사용자 지정 호스트</option>
                  </select>
                </VerticalField>
                <VerticalField label="발신자 표시명">
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="공식 발신 이메일">
                  <input
                    type="email"
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="앱 비밀번호">
                  <input
                    type="password"
                    value={gmailAppPassword}
                    onChange={(e) => setGmailAppPassword(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="메일 호스트 주소">
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="포트번호">
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    style={controlInputStyle}
                  />
                </VerticalField>
              </div>
              {canEdit && (
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSaveMailConfig}
                    style={actionBtnStyle('primary')}
                  >
                    공식 이메일 연동 저장
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </SectionPanel>
    </div>
  );
};

const PolicyEditorGrid: React.FC<{
  policies: FlApprovalPolicy[];
  canEdit: boolean;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: 'info' | 'success' | 'error') => void;
}> = ({ policies, canEdit, onRefresh, onToast }) => {
  const [drafts, setDrafts] = useState<Record<string, { requiredTier: TierLevel; requiresApproval: boolean }>>({});

  return (
    <DataGrid
      columns={[
        { key: 'code', header: '업무구분', width: 155, render: (p) => formatKoActionCode(p.actionCode) },
        { key: 'name', header: '업무행위', width: 170, render: (p) => <span style={{ fontWeight: 700 }}>{p.actionName}</span> },
        { key: 'desc', header: '적용 설명', render: (p) => p.description || '-' },
        {
          key: 'req',
          header: '결재사용',
          width: 80,
          align: 'center',
          render: (p) => {
            const d = drafts[p.id] || {
              requiredTier: p.requiredTier,
              requiresApproval: p.requiresApproval,
            };
            return (
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={d.requiresApproval}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [p.id]: { ...d, requiresApproval: e.target.checked },
                  }))
                }
              />
            );
          },
        },
        {
          key: 'tier',
          header: '필요 티어',
          width: 175,
          render: (p) => {
            const d = drafts[p.id] || {
              requiredTier: p.requiredTier,
              requiresApproval: p.requiresApproval,
            };
            return (
              <select
                disabled={!canEdit}
                value={d.requiredTier}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [p.id]: { ...d, requiredTier: Number(e.target.value) as TierLevel },
                  }))
                }
                style={{ ...controlInputStyle, height: '28px', fontSize: '12px' }}
              >
                {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABELS[t]}
                  </option>
                ))}
              </select>
            );
          },
        },
        {
          key: 'save',
          header: '저장',
          width: 90,
          align: 'center',
          render: (p) => {
            const d = drafts[p.id] || {
              requiredTier: p.requiredTier,
              requiresApproval: p.requiresApproval,
            };
            return canEdit ? (
              <CommitActionButton
                actionCode="POLICY_CONFIG_SAVE"
                targetTable="fl_approval_policies"
                targetId={p.id}
                title={`결재 기준 변경 · ${p.actionName}`}
                buildPayload={() => ({
                  policyId: p.id,
                  requiredTier: d.requiredTier,
                  requiresApproval: d.requiresApproval,
                })}
                onExecuteDirect={async () => {
                  await execDbMutation('결재 기준 저장', () =>
                    flSupabase
                      .from('approval_policies')
                      .update(
                        camelToSnakeRow({
                          requiredTier: d.requiredTier,
                          requiresApproval: d.requiresApproval,
                          updatedAt: new Date().toISOString(),
                        })
                      )
                      .eq('id', p.id)
                  );
                  await onRefresh();
                  onToast(`${p.actionName} 결재 기준 저장 완료`, 'success');
                }}
                label="저장"
              />
            ) : (
              '-'
            );
          },
        },
      ]}
      rows={policies}
      rowKey={(p) => p.id}
      maxHeight="470px"
    />
  );
};
