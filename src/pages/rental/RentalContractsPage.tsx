import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import { addDaysIso, todayIso } from '../../services/domainMath';
import { allocateNextContractNo } from '../../services/domainProcurementLeaseEngine';
import { allocateNextFulfillmentNos } from '../../services/domainFulfillmentEngine';
import { generateContractExcel } from '../../services/documentService';
import { DocumentActionBar } from '../../components/DocumentActionBar';
import {
  SearchableSelect,
  toItemMasterSelectOptions,
  toPartnerSelectOptions,
} from '../../components/SearchableSelect';
import {
  CommaNumberInput,
  DataGrid,
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  CONTRACT_LINE_STATUS_KO_LABELS,
  CONTRACT_STATUS_KO_LABELS,
  DAY_OF_MONTH_OPTIONS,
  PAYMENT_CYCLES,
  PAYMENT_METHODS,
  cycleToMonthOffset,
  formatKoStatus,
  formatPaymentTermsLabel,
  koStatusTone,
  normalizePaymentMethod,
  resolvePartnerPaymentDefaults,
  selectCustomerPartners,
  type FlContract,
  type FlContractLine,
  type FlFulfillment,
  type PaymentCycleType,
  type PaymentMethodType,
} from '../../types/domain';

export const RentalContractsPage: React.FC = () => {
  const {
    currentUser,
    tenantProfile,
    datasets,
    formatMoney,
    refreshAll,
    notifyToast,
    canEditPage,
    navigateTo,
  } = useAppShell();
  const canEdit = canEditPage('rental_contracts');
  const today = todayIso();

  const rentalContracts = useMemo(
    () =>
      datasets.contracts
        .filter((c) => c.contractDomain === 'RENTAL')
        .sort((a, b) => b.contractDate.localeCompare(a.contractDate)),
    [datasets.contracts]
  );

  const customers = useMemo(
    () => selectCustomerPartners(datasets.partners),
    [datasets.partners]
  );

  const rentalItems = useMemo(() => {
    const matched = datasets.itemMasters.filter(
      (i) =>
        (i.itemDomain === 'RENTAL' || i.itemDomain === 'BOTH') &&
        (i.itemCategory === '완제품' || i.itemCategory === '어태치먼트')
    );
    return matched.length > 0 ? matched : datasets.itemMasters;
  }, [datasets.itemMasters]);

  const initialPaymentDefaults = resolvePartnerPaymentDefaults(customers[0]);
  const [selectedId, setSelectedId] = useState<string | null>(rentalContracts[0]?.id || null);
  const [partnerId, setPartnerId] = useState(customers[0]?.id || '');
  const [itemId, setItemId] = useState(rentalItems[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [monthlyPriceKrw, setMonthlyPriceKrw] = useState(
    rentalItems[0]?.standardMonthlyRentalKrw || 800000
  );
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysIso(today, 365));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(
    initialPaymentDefaults.paymentMethod
  );
  const [closingDay, setClosingDay] = useState<number>(initialPaymentDefaults.closingDay);
  const [paymentCycle, setPaymentCycle] = useState<PaymentCycleType>(
    initialPaymentDefaults.paymentCycle
  );
  const [paymentDueDay, setPaymentDueDay] = useState<number>(
    initialPaymentDefaults.paymentDueDay
  );
  const [specialTerms, setSpecialTerms] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreateContract = async () => {
    const partner = customers.find((c) => c.id === (partnerId || customers[0]?.id));
    const item = rentalItems.find((i) => i.id === (itemId || rentalItems[0]?.id));
    if (!partner || !item) {
      notifyToast('임차 거래처와 계약 기종을 선택해 주세요.', 'error');
      return;
    }
    const cleanQty = Math.max(1, Number(qty || 1));
    const monthlySupply = Math.round(cleanQty * Number(monthlyPriceKrw || 0));
    const vat = Math.round(monthlySupply * 0.1);
    const ctrId = newId('CTR');
    const contractNo = await allocateNextContractNo('RENTAL', startDate);
    const resolvedDueDay = paymentCycle === '선입금' ? 0 : Math.min(31, Math.max(1, Number(paymentDueDay || 10)));
    const ctr: FlContract = {
      id: ctrId,
      tenantId: DEFAULT_TENANT_ID,
      contractNo,
      contractDomain: 'RENTAL',
      partnerId: partner.id,
      partnerName: partner.name,
      salespersonId: currentUser?.id || 'USR_ADMIN',
      salespersonName: currentUser?.name || '영업담당',
      contractDate: today,
      startDate,
      endDate,
      closingDay: Math.min(31, Math.max(1, Number(closingDay || 31))),
      paymentCycle,
      paymentDueDay: resolvedDueDay,
      paymentMonthOffset: cycleToMonthOffset(paymentCycle),
      paymentMethod: normalizePaymentMethod(paymentMethod),
      supplyAmountKrw: monthlySupply,
      vatAmountKrw: vat,
      totalAmountKrw: monthlySupply + vat,
      monthlyRentalKrw: monthlySupply,
      dailyRentalKrw: Math.round(monthlySupply / 30),
      status: 'DRAFT',
      specialTerms: specialTerms.trim() || null,
    };
    const lineUnitCount = item.managementType === 'SERIAL' ? cleanQty : 1;
    const perLineQty = item.managementType === 'SERIAL' ? 1 : cleanQty;
    const perLineSupply =
      item.managementType === 'SERIAL' ? Math.round(monthlyPriceKrw || 0) : monthlySupply;
    const perLineVat = Math.round(perLineSupply * 0.1);
    const lines: FlContractLine[] = Array.from({ length: lineUnitCount }, (_, idx) => ({
      id: newId('CL'),
      tenantId: DEFAULT_TENANT_ID,
      contractId: ctrId,
      lineNo: idx + 1,
      itemId: item.id,
      sku: item.sku,
      itemName: item.name,
      itemCategory: item.itemCategory,
      managementType: item.managementType,
      quantity: perLineQty,
      fulfilledQty: 0,
      unitPriceKrw: Math.round(monthlyPriceKrw || 0),
      supplyAmountKrw: perLineSupply,
      vatAmountKrw: perLineVat,
      totalAmountKrw: perLineSupply + perLineVat,
      lineStatus: 'ACTIVE',
      effectiveStartDate: startDate,
      effectiveEndDate: endDate,
    }));
    setBusy(true);
    try {
      await execDbMutation('렌탈 계약 등록', () =>
        flSupabase.from('contracts').insert(camelToSnakeRow({ ...ctr }))
      );
      await execDbMutation('렌탈 계약 품목 등록', () =>
        flSupabase.from('contract_lines').insert(lines.map((ln) => camelToSnakeRow({ ...ln })))
      );
      setSelectedId(ctrId);
      await refreshAll();
      notifyToast('렌탈 계약 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '렌탈 계약 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedContract =
    rentalContracts.find((c) => c.id === selectedId) || rentalContracts[0] || null;
  const selectedLines = useMemo(
    () =>
      selectedContract
        ? datasets.contractLines.filter((l) => l.contractId === selectedContract.id)
        : [],
    [datasets.contractLines, selectedContract]
  );
  const selectedPartner = useMemo(
    () =>
      selectedContract
        ? datasets.partners.find((p) => p.id === selectedContract.partnerId)
        : undefined,
    [datasets.partners, selectedContract]
  );

  const handleRequestFulfillment = async (actionType: '렌탈출고' | '렌탈회수') => {
    if (!selectedContract) return;
    if (selectedContract.status === 'DRAFT') {
      notifyToast('먼저 계약 확정을 진행해 주세요.', 'error');
      return;
    }
    const requestedLineIds = new Set(
      datasets.fulfillments
        .filter(
          (f) =>
            f.contractId === selectedContract.id &&
            f.actionType === actionType &&
            f.status === 'REQUESTED'
        )
        .map((f) => f.contractLineId)
    );
    const targetLines = (
      actionType === '렌탈출고'
        ? selectedLines.filter((l) => l.lineStatus === 'ACTIVE' && l.fulfilledQty < l.quantity)
        : selectedLines.filter((l) => l.lineStatus === 'FULFILLED' && Boolean(l.assignedUnitId))
    ).filter((l) => !requestedLineIds.has(l.id));
    if (targetLines.length === 0) {
      notifyToast(
        actionType === '렌탈출고'
          ? '출고 의뢰할 잔여 계약 품목이 없습니다.'
          : '회수 의뢰할 대여중 품목이 없습니다.',
        'error'
      );
      return;
    }
    setBusy(true);
    try {
      const fulNos = await allocateNextFulfillmentNos(today, targetLines.length);
      let fulNoCursor = 0;
      for (const line of targetLines) {
        const ful: FlFulfillment = {
          id: newId('FUL'),
          tenantId: DEFAULT_TENANT_ID,
          fulfillmentNo: fulNos[fulNoCursor++] || newId('FUL'),
          fulfillmentDomain: 'RENTAL',
          actionType,
          contractId: selectedContract.id,
          contractLineId: line.id,
          partnerId: selectedContract.partnerId,
          partnerName: selectedContract.partnerName,
          siteId: selectedContract.siteId || null,
          itemId: line.itemId,
          unitId: actionType === '렌탈회수' ? line.assignedUnitId || null : null,
          quantity: 1,
          cogsAmountKrw: 0,
          status: 'REQUESTED',
          effectiveDate: today,
        };
        await execDbMutation(`${actionType} 의뢰 발행`, () =>
          flSupabase.from('fulfillments').insert(camelToSnakeRow({ ...ful }))
        );
      }
      if (actionType === '렌탈출고' && selectedContract.status === 'ACTIVE') {
        await execDbMutation('계약 출고진행 상태 갱신', () =>
          flSupabase
            .from('contracts')
            .update({ status: 'FULFILLING', updated_at: new Date().toISOString() })
            .eq('id', selectedContract.id)
        );
      }
      await refreshAll();
      notifyToast(`${actionType} 의뢰 발행 완료`, 'success');
      navigateTo('rental_fulfillment');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '의뢰 발행 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && (
        <SectionPanel
          title="렌탈 계약 등록 · 기종 단위 지정"
          manualId="rctr-form"
          rightSlot={
            <button
              type="button"
              disabled={busy}
              onClick={handleCreateContract}
              style={actionBtnStyle('primary', true)}
            >
              렌탈 계약 저장
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="임차 거래처" required>
              <SearchableSelect
                value={partnerId || customers[0]?.id || ''}
                options={toPartnerSelectOptions(customers)}
                onChange={(id) => {
                  setPartnerId(id);
                  const pt = customers.find((p) => p.id === id);
                  if (pt) {
                    const defaults = resolvePartnerPaymentDefaults(pt);
                    setPaymentMethod(defaults.paymentMethod);
                    setClosingDay(defaults.closingDay);
                    setPaymentCycle(defaults.paymentCycle);
                    setPaymentDueDay(defaults.paymentDueDay);
                  }
                }}
                placeholder="임차 거래처 선택"
                searchPlaceholder="거래처명 · 초성 · 사업자번호 검색"
                minDropdownWidth={280}
              />
            </VerticalField>
            <VerticalField label="계약 기종 품목" required minWidth={210}>
              <SearchableSelect
                value={itemId || rentalItems[0]?.id || ''}
                options={toItemMasterSelectOptions(rentalItems)}
                onChange={(id) => {
                  setItemId(id);
                  const it = rentalItems.find((x) => x.id === id);
                  if (it) setMonthlyPriceKrw(it.standardMonthlyRentalKrw);
                }}
                placeholder="계약 기종 품목 선택"
                searchPlaceholder="품명 · 초성 · 품번 · 제조사 검색"
                minDropdownWidth={320}
              />
            </VerticalField>
            <VerticalField label="수량">
              <CommaNumberInput min={1} value={qty} onChange={setQty} />
            </VerticalField>
            <VerticalField label="월 임대단가">
              <CommaNumberInput
                disabled={Boolean(currentUser?.maskSalesPrice)}
                value={currentUser?.maskSalesPrice ? 0 : monthlyPriceKrw}
                onChange={setMonthlyPriceKrw}
              />
            </VerticalField>
            <VerticalField label="계약 시작일" required>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="계약 종료일" required>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="결제수단">
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodType)}
                style={controlInputStyle}
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </VerticalField>
            <VerticalField label="청구마감일">
              <select
                value={closingDay}
                onChange={(e) => setClosingDay(Number(e.target.value))}
                style={controlInputStyle}
              >
                {DAY_OF_MONTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </VerticalField>
            <VerticalField label="지급기일 월구분">
              <select
                value={paymentCycle}
                onChange={(e) => {
                  const nextCycle = e.target.value as PaymentCycleType;
                  setPaymentCycle(nextCycle);
                  setPaymentDueDay((prev) =>
                    nextCycle === '선입금' ? 0 : prev >= 1 ? prev : 10
                  );
                }}
                style={controlInputStyle}
              >
                {PAYMENT_CYCLES.map((cy) => (
                  <option key={cy} value={cy}>
                    {cy}
                  </option>
                ))}
              </select>
            </VerticalField>
            <VerticalField label="지급기일 일자">
              <select
                disabled={paymentCycle === '선입금'}
                value={paymentCycle === '선입금' ? 0 : paymentDueDay}
                onChange={(e) => setPaymentDueDay(Number(e.target.value))}
                style={controlInputStyle}
              >
                {paymentCycle === '선입금' ? (
                  <option value={0}>출고 전 선입금</option>
                ) : (
                  DAY_OF_MONTH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))
                )}
              </select>
            </VerticalField>
            <VerticalField label="특약사항">
              <input
                type="text"
                value={specialTerms}
                onChange={(e) => setSpecialTerms(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
        </SectionPanel>
      )}

      {selectedContract && (
        <SectionPanel
          title={`선택 렌탈 계약 · ${selectedContract.contractNo} · ${selectedContract.partnerName}`}
          rightSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
              {canEdit && selectedContract.status === 'DRAFT' && (
                <CommitActionButton
                  actionCode="RENTAL_CONTRACT_CONFIRM"
                  targetTable="fl_contracts"
                  targetId={selectedContract.id}
                  title={`렌탈계약 확정 · ${selectedContract.contractNo}`}
                  buildPayload={() => ({ contractId: selectedContract.id })}
                  onExecuteDirect={async () => {
                    await execDbMutation('렌탈 계약 확정', () =>
                      flSupabase
                        .from('contracts')
                        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
                        .eq('id', selectedContract.id)
                    );
                    await refreshAll();
                    notifyToast('렌탈 계약 확정 완료', 'success');
                  }}
                  label="계약 확정"
                />
              )}
              <DocumentActionBar
                manualId="rctr-docs"
                docLabel="렌탈 계약서"
                defaultEmail={selectedPartner?.email || selectedPartner?.taxEmail || ''}
                defaultSubject={`[${tenantProfile.corporateName}] ${selectedContract.contractNo} 장비 임대차 계약서`}
                defaultBody={`${selectedContract.partnerName} 귀중\n\n체결하신 지게차 임대차 계약서를 첨부하여 송부드립니다.\n계약기간: ${selectedContract.startDate} ~ ${selectedContract.endDate}`}
                onGenerate={() =>
                  generateContractExcel({
                    contract: selectedContract,
                    lines: selectedLines,
                    partner: selectedPartner,
                    tenant: tenantProfile,
                    templates: datasets.documentTemplates,
                  })
                }
              />
              {canEdit && (
                <div data-manual-id="rctr-actions" style={{ display: 'inline-flex', gap: 'var(--space-tight-gap)' }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRequestFulfillment('렌탈출고')}
                    style={actionBtnStyle('primary', true)}
                  >
                    렌탈출고 의뢰
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRequestFulfillment('렌탈회수')}
                    style={actionBtnStyle('secondary', true)}
                  >
                    렌탈회수 의뢰
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo('rental_fulfillment')}
                    style={actionBtnStyle('warning', true)}
                  >
                    교환 실행 이동
                  </button>
                </div>
              )}
            </div>
          }
        >
          <DataGrid
            columns={[
              { key: 'lineNo', header: '행', width: 55, align: 'center', render: (l) => l.lineNo },
              { key: 'itemName', header: '기종 · 품명', render: (l) => l.itemName },
              {
                key: 'serial',
                header: '배정 시리얼',
                width: 140,
                render: (l) => l.assignedSerialNo || '-',
              },
              {
                key: 'period',
                header: '가동 적용기간',
                width: 190,
                render: (l) => `${l.effectiveStartDate || '-'} ~ ${l.effectiveEndDate || '-'}`,
              },
              {
                key: 'monthly',
                header: '월단가',
                width: 120,
                align: 'right',
                render: (l) => formatMoney(l.unitPriceKrw, { salesSensitive: true }),
              },
              {
                key: 'lineStatus',
                header: '상태',
                width: 115,
                align: 'center',
                render: (l) => (
                  <StatusBadge
                    label={CONTRACT_LINE_STATUS_KO_LABELS[l.lineStatus] || formatKoStatus(l.lineStatus)}
                    tone={koStatusTone(l.lineStatus)}
                  />
                ),
              },
            ]}
            rows={selectedLines}
            rowKey={(l) => l.id}
            maxHeight="200px"
          />
        </SectionPanel>
      )}

      <DataGrid
        columns={[
          { key: 'contractNo', header: '계약번호', width: 140, render: (r) => <span style={{ fontWeight: 700 }}>{r.contractNo}</span> },
          { key: 'partnerName', header: '임차 거래처', render: (r) => r.partnerName },
          {
            key: 'period',
            header: '계약기간',
            width: 190,
            render: (r) => `${r.startDate} ~ ${r.endDate}`,
          },
          {
            key: 'paymentTerms',
            header: '결제 · 지급기일',
            width: 155,
            render: (r) =>
              `${normalizePaymentMethod(r.paymentMethod)} · ${formatPaymentTermsLabel(
                r.paymentCycle,
                r.paymentDueDay,
                r.paymentMonthOffset
              )}`,
          },
          {
            key: 'monthlyRentalKrw',
            header: '월임대료',
            width: 130,
            align: 'right',
            render: (r) => formatMoney(r.monthlyRentalKrw, { salesSensitive: true }),
          },
          {
            key: 'status',
            header: '상태',
            width: 100,
            align: 'center',
            render: (r) => (
              <StatusBadge
                label={CONTRACT_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status)}
                tone={koStatusTone(r.status)}
              />
            ),
          },
        ]}
        rows={rentalContracts}
        rowKey={(r) => r.id}
        selectedRowId={selectedContract?.id || null}
        onRowClick={(r) => setSelectedId(r.id)}
        maxHeight="calc(100vh - 260px)"
      />
    </div>
  );
};
