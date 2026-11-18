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
  filterItemMastersForTenant,
  filterPartnersForTenant,
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

export const TradeContractsPage: React.FC = () => {
  const {
    currentUser,
    tenantProfile,
    isRentalEnabled,
    datasets,
    formatMoney,
    refreshAll,
    notifyToast,
    canEditPage,
    navigateTo,
  } = useAppShell();
  const canEdit = canEditPage('trade_contracts');
  const today = todayIso();

  const tradeContracts = useMemo(
    () =>
      datasets.contracts
        .filter((c) => c.contractDomain === 'TRADE')
        .sort((a, b) => b.contractDate.localeCompare(a.contractDate)),
    [datasets.contracts]
  );

  const tenantPartners = useMemo(
    () => filterPartnersForTenant(datasets.partners, isRentalEnabled),
    [datasets.partners, isRentalEnabled]
  );

  const customers = useMemo(
    () => selectCustomerPartners(tenantPartners),
    [tenantPartners]
  );

  const tenantItems = useMemo(
    () => filterItemMastersForTenant(datasets.itemMasters, isRentalEnabled),
    [datasets.itemMasters, isRentalEnabled]
  );

  const tradeItems = useMemo(() => {
    const matched = tenantItems.filter(
      (i) => i.itemDomain === 'TRADE' || i.itemDomain === 'BOTH'
    );
    return matched.length > 0 ? matched : tenantItems;
  }, [tenantItems]);

  const initialPaymentDefaults = resolvePartnerPaymentDefaults(customers[0]);
  const [selectedId, setSelectedId] = useState<string | null>(tradeContracts[0]?.id || null);
  const [partnerId, setPartnerId] = useState(customers[0]?.id || '');
  const [itemId, setItemId] = useState(tradeItems[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [unitPriceKrw, setUnitPriceKrw] = useState(
    tradeItems[0]?.retailPriceKrw || 0
  );
  const [contractDate, setContractDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(
    initialPaymentDefaults.paymentMethod
  );
  const [closingDay, setClosingDay] = useState<number>(initialPaymentDefaults.closingDay);
  const [paymentCycle, setPaymentCycle] = useState<PaymentCycleType>(
    initialPaymentDefaults.paymentCycle
  );
  const [paymentDueDay, setPaymentDueDay] = useState<number>(initialPaymentDefaults.paymentDueDay);
  const [specialTerms, setSpecialTerms] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState<number>(12);
  const [warrantyNote, setWarrantyNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterPartnerId, setFilterPartnerId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const tradePartnerFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of tradeContracts) {
      if (c.partnerId && !seen.has(c.partnerId)) {
        seen.set(c.partnerId, c.partnerName);
      }
    }
    return [
      { value: '', label: '전체 매출처' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [tradeContracts]);

  const filteredTradeContracts = useMemo(() => {
    const kw = filterKeyword.trim().toLowerCase();
    return tradeContracts.filter((c) => {
      if (filterStartDate && c.contractDate < filterStartDate) return false;
      if (filterEndDate && c.contractDate > filterEndDate) return false;
      if (filterPartnerId && c.partnerId !== filterPartnerId) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (kw) {
        const text = `${c.contractNo} ${c.partnerName} ${c.memo || ''}`.toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    });
  }, [tradeContracts, filterStartDate, filterEndDate, filterPartnerId, filterStatus, filterKeyword]);

  const handleCreateContract = async () => {
    const partner = customers.find((c) => c.id === (partnerId || customers[0]?.id));
    const item = tradeItems.find((i) => i.id === (itemId || tradeItems[0]?.id));
    if (!partner || !item) {
      notifyToast('매출처와 품목을 선택해 주세요.', 'error');
      return;
    }
    const cleanQty = Math.max(1, Number(qty || 1));
    const supply = Math.round(cleanQty * Number(unitPriceKrw || 0));
    const vat = Math.round(supply * 0.1);
    const ctrId = newId('CTR');
    const contractNo = await allocateNextContractNo('TRADE', contractDate);
    const resolvedDueDay = paymentCycle === '선입금' ? 0 : Math.min(31, Math.max(1, Number(paymentDueDay || 10)));
    const ctr: FlContract = {
      id: ctrId,
      tenantId: DEFAULT_TENANT_ID,
      contractNo,
      contractDomain: 'TRADE',
      partnerId: partner.id,
      partnerName: partner.name,
      salespersonId: currentUser?.id || 'USR_ADMIN',
      salespersonName: currentUser?.name || '영업담당',
      contractDate,
      startDate: contractDate,
      endDate: addDaysIso(contractDate, 14),
      closingDay: Math.min(31, Math.max(1, Number(closingDay || 31))),
      paymentCycle,
      paymentDueDay: resolvedDueDay,
      paymentMonthOffset: cycleToMonthOffset(paymentCycle),
      paymentMethod: normalizePaymentMethod(paymentMethod),
      supplyAmountKrw: supply,
      vatAmountKrw: vat,
      totalAmountKrw: supply + vat,
      monthlyRentalKrw: 0,
      dailyRentalKrw: 0,
      status: 'DRAFT',
      specialTerms: specialTerms.trim() || null,
    };
    const line: FlContractLine = {
      id: newId('CL'),
      tenantId: DEFAULT_TENANT_ID,
      contractId: ctrId,
      lineNo: 1,
      itemId: item.id,
      sku: item.sku,
      itemName: item.name,
      itemCategory: item.itemCategory,
      managementType: item.managementType,
      quantity: cleanQty,
      fulfilledQty: 0,
      unitPriceKrw: Math.round(unitPriceKrw || 0),
      supplyAmountKrw: supply,
      vatAmountKrw: vat,
      totalAmountKrw: supply + vat,
      warrantyMonths: Math.max(0, Number(warrantyMonths || 0)),
      warrantyNote: warrantyNote.trim() || null,
      lineStatus: 'ACTIVE',
      effectiveStartDate: contractDate,
      effectiveEndDate: addDaysIso(contractDate, 14),
    };
    setBusy(true);
    try {
      await execDbMutation('유통 계약 등록', () =>
        flSupabase.from('contracts').insert(camelToSnakeRow({ ...ctr }))
      );
      await execDbMutation('유통 계약 품목 등록', () =>
        flSupabase.from('contract_lines').insert(camelToSnakeRow({ ...line }))
      );
      setSelectedId(ctrId);
      await refreshAll();
      notifyToast('유통 계약 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '유통 계약 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedContract =
    tradeContracts.find((c) => c.id === selectedId) || tradeContracts[0] || null;
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

  const handleRequestFulfillment = async () => {
    if (!selectedContract) return;
    if (selectedContract.status === 'DRAFT') {
      notifyToast('먼저 계약 확정을 진행해 주세요.', 'error');
      return;
    }
    const requestedQtyByLine = new Map<string, number>();
    for (const f of datasets.fulfillments) {
      if (
        f.contractId === selectedContract.id &&
        f.actionType === '유통출고' &&
        f.status === 'REQUESTED'
      ) {
        requestedQtyByLine.set(
          f.contractLineId,
          (requestedQtyByLine.get(f.contractLineId) || 0) + Number(f.quantity || 0)
        );
      }
    }
    const openLines = selectedLines
      .map((l) => ({
        line: l,
        remainingQty: l.quantity - l.fulfilledQty - (requestedQtyByLine.get(l.id) || 0),
      }))
      .filter((x) => x.line.lineStatus !== 'CANCELLED' && x.remainingQty > 0);
    if (openLines.length === 0) {
      notifyToast('출고 의뢰할 잔여 품목이 없습니다.', 'error');
      return;
    }
    setBusy(true);
    try {
      const totalFulNeeded = openLines.reduce((s, { line, remainingQty }) => {
        const splitSerial = line.managementType === 'SERIAL' && remainingQty > 1;
        return s + (splitSerial ? Math.round(remainingQty) : 1);
      }, 0);
      const fulNos = await allocateNextFulfillmentNos(today, totalFulNeeded);
      let fulNoCursor = 0;
      for (const { line, remainingQty } of openLines) {
        const splitSerial = line.managementType === 'SERIAL' && remainingQty > 1;
        const count = splitSerial ? Math.round(remainingQty) : 1;
        for (let k = 0; k < count; k++) {
          const reqQty = splitSerial ? 1 : remainingQty;
          const ful: FlFulfillment = {
            id: newId('FUL'),
            tenantId: DEFAULT_TENANT_ID,
            fulfillmentNo: fulNos[fulNoCursor++] || newId('FUL'),
            fulfillmentDomain: 'TRADE',
            actionType: '유통출고',
            contractId: selectedContract.id,
            contractLineId: line.id,
            partnerId: selectedContract.partnerId,
            partnerName: selectedContract.partnerName,
            siteId: selectedContract.siteId || null,
            itemId: line.itemId,
            quantity: reqQty,
            cogsAmountKrw: 0,
            status: 'REQUESTED',
            effectiveDate: selectedContract.contractDate,
          };
          await execDbMutation('유통 출고의뢰 발행', () =>
            flSupabase.from('fulfillments').insert(camelToSnakeRow({ ...ful }))
          );
        }
      }
      if (selectedContract.status === 'ACTIVE') {
        await execDbMutation('계약 출고진행 상태 갱신', () =>
          flSupabase
            .from('contracts')
            .update({ status: 'FULFILLING', updated_at: new Date().toISOString() })
            .eq('id', selectedContract.id)
        );
      }
      await refreshAll();
      notifyToast('출고의뢰 발행 완료', 'success');
      navigateTo('trade_fulfillment');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '출고의뢰 발행 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && (
        <SectionPanel
          title="유통 계약 등록"
          manualId="tc-form"
          rightSlot={
            <button
              type="button"
              disabled={busy}
              onClick={handleCreateContract}
              style={actionBtnStyle('primary', true)}
            >
              계약 저장
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="매출처" required>
              <SearchableSelect
                value={partnerId || customers[0]?.id || ''}
                options={toPartnerSelectOptions(customers)}
                onChange={(nextId) => {
                  setPartnerId(nextId);
                  const pt = customers.find((p) => p.id === nextId);
                  if (pt) {
                    const defaults = resolvePartnerPaymentDefaults(pt);
                    setPaymentMethod(defaults.paymentMethod);
                    setClosingDay(defaults.closingDay);
                    setPaymentCycle(defaults.paymentCycle);
                    setPaymentDueDay(defaults.paymentDueDay);
                  }
                }}
                placeholder="매출처 선택"
                searchPlaceholder="매출처명 · 초성 · 사업자번호 검색"
                minDropdownWidth={280}
              />
            </VerticalField>
            <VerticalField label="품목" required minWidth={220}>
              <SearchableSelect
                value={itemId || tradeItems[0]?.id || ''}
                options={toItemMasterSelectOptions(tradeItems)}
                onChange={(id) => {
                  setItemId(id);
                  const it = tradeItems.find((x) => x.id === id);
                  if (it) setUnitPriceKrw(it.retailPriceKrw);
                }}
                placeholder="품목 선택"
                searchPlaceholder="품명 · 초성 · 품번 · 제조사 검색"
                minDropdownWidth={320}
              />
            </VerticalField>
            <VerticalField label="수량">
              <CommaNumberInput min={1} value={qty} onChange={setQty} />
            </VerticalField>
            <VerticalField label="계약단가">
              <CommaNumberInput
                disabled={Boolean(currentUser?.maskSalesPrice)}
                value={currentUser?.maskSalesPrice ? 0 : unitPriceKrw}
                onChange={setUnitPriceKrw}
              />
            </VerticalField>
            <VerticalField label="계약일자">
              <input
                type="date"
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
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
            <VerticalField label="보증기간(개월)" width={115}>
              <input
                type="number"
                min={0}
                value={warrantyMonths}
                onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="보증 특약">
              <input
                type="text"
                value={warrantyNote}
                onChange={(e) => setWarrantyNote(e.target.value)}
                placeholder="배터리 24개월 등"
                style={controlInputStyle}
              />
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
          title={`선택 유통 계약 · ${selectedContract.contractNo} · ${selectedContract.partnerName}`}
          rightSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
              {canEdit && selectedContract.status === 'DRAFT' && (
                <CommitActionButton
                  actionCode="TRADE_CONTRACT_CONFIRM"
                  targetTable="fl_contracts"
                  targetId={selectedContract.id}
                  title={`유통계약 확정 · ${selectedContract.contractNo}`}
                  buildPayload={() => ({ contractId: selectedContract.id })}
                  onExecuteDirect={async () => {
                    await execDbMutation('유통 계약 확정', () =>
                      flSupabase
                        .from('contracts')
                        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
                        .eq('id', selectedContract.id)
                    );
                    await refreshAll();
                    notifyToast('유통 계약 확정 완료', 'success');
                  }}
                  label="계약 확정"
                />
              )}
              <DocumentActionBar
                manualId="tc-docs"
                docLabel="유통 계약서"
                defaultEmail={selectedPartner?.email || selectedPartner?.taxEmail || ''}
                defaultSubject={`[${tenantProfile.corporateName}] ${selectedContract.contractNo} 물품공급 계약서`}
                defaultBody={`${selectedContract.partnerName} 귀중\n\n체결하신 물품공급 계약서를 첨부하여 송부드립니다.`}
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
                <button
                  type="button"
                  data-manual-id="tc-req"
                  disabled={busy}
                  onClick={handleRequestFulfillment}
                  style={actionBtnStyle('primary', true)}
                >
                  출고의뢰 발행
                </button>
              )}
            </div>
          }
        >
          <DataGrid
            columns={[
              { key: 'sku', header: '품목코드', width: 130, render: (l) => l.sku },
              { key: 'itemName', header: '품명', render: (l) => l.itemName },
              { key: 'qty', header: '계약수량', width: 85, align: 'right', render: (l) => l.quantity },
              { key: 'ful', header: '출고완료', width: 85, align: 'right', render: (l) => l.fulfilledQty },
              {
                key: 'total',
                header: '합계금액',
                width: 135,
                align: 'right',
                render: (l) => formatMoney(l.totalAmountKrw, { salesSensitive: true }),
              },
              {
                key: 'st',
                header: '상태',
                width: 95,
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

      <SectionPanel
        title={`유통 계약 원장 · ${filteredTradeContracts.length}건`}
        rightSlot={
          (filterStartDate || filterEndDate || filterPartnerId || filterStatus || filterKeyword) ? (
            <button
              type="button"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterPartnerId('');
                setFilterStatus('');
                setFilterKeyword('');
              }}
              style={actionBtnStyle('secondary', true)}
            >
              필터 초기화
            </button>
          ) : undefined
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
            gap: 'var(--space-field-grid-gap)',
            marginBottom: 'var(--space-stack-gap)',
            alignItems: 'end',
          }}
        >
          <VerticalField label="조회 시작일" minWidth={0}>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="조회 종료일" minWidth={0}>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="매출처" minWidth={0}>
            <SearchableSelect
              value={filterPartnerId}
              onChange={setFilterPartnerId}
              options={tradePartnerFilterOptions}
              placeholder="전체 매출처"
              searchPlaceholder="매출처명 · 초성 검색"
            />
          </VerticalField>
          <VerticalField label="상태" minWidth={0}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={controlInputStyle}
            >
              <option value="">전체 상태</option>
              <option value="DRAFT">임시저장</option>
              <option value="ACTIVE">진행중</option>
              <option value="FULFILLING">출고진행</option>
              <option value="COMPLETED">완료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </VerticalField>
          <VerticalField label="계약번호 검색" minWidth={0}>
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="계약번호, 비고"
              style={controlInputStyle}
            />
          </VerticalField>
        </div>

        <DataGrid
          columns={[
            {
              key: 'contractNo',
              header: '계약번호',
              width: 140,
              sortable: true,
              sortValue: (r) => r.contractNo,
              render: (r) => <span style={{ fontWeight: 700 }}>{r.contractNo}</span>,
            },
            {
              key: 'partnerName',
              header: '매출처',
              sortable: true,
              sortValue: (r) => r.partnerName,
              render: (r) => r.partnerName,
            },
            {
              key: 'contractDate',
              header: '계약일',
              width: 105,
              sortable: true,
              sortValue: (r) => r.contractDate,
              render: (r) => r.contractDate,
            },
            {
              key: 'paymentTerms',
              header: '결제 · 지급기일',
              width: 155,
              sortable: true,
              sortValue: (r) =>
                `${normalizePaymentMethod(r.paymentMethod)} · ${formatPaymentTermsLabel(
                  r.paymentCycle,
                  r.paymentDueDay,
                  r.paymentMonthOffset
                )}`,
              render: (r) =>
                `${normalizePaymentMethod(r.paymentMethod)} · ${formatPaymentTermsLabel(
                  r.paymentCycle,
                  r.paymentDueDay,
                  r.paymentMonthOffset
                )}`,
            },
            {
              key: 'total',
              header: '계약합계',
              width: 135,
              align: 'right',
              sortable: true,
              sortValue: (r) => Number(r.totalAmountKrw || 0),
              render: (r) => formatMoney(r.totalAmountKrw, { salesSensitive: true }),
            },
            {
              key: 'status',
              header: '상태',
              width: 100,
              align: 'center',
              sortable: true,
              sortValue: (r) => CONTRACT_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status),
              render: (r) => (
                <StatusBadge
                  label={CONTRACT_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status)}
                  tone={koStatusTone(r.status)}
                />
              ),
            },
          ]}
          rows={filteredTradeContracts}
          rowKey={(r) => r.id}
          selectedRowId={selectedContract?.id || null}
          onRowClick={(r) => setSelectedId(r.id)}
          maxHeight="clamp(240px, calc(100vh - 495px), 680px)"
        />
      </SectionPanel>
    </div>
  );
};
