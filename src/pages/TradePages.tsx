import React, { useMemo, useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { CommitActionButton } from '../core/ActionCommandGateway';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../core/supabase';
import {
  addDaysIso,
  completeFulfillment,
  executeAccountTransfer,
  recordTradeAftercare,
  sortUnitsFifo,
} from '../services/domainEngine';
import {
  generateContractExcel,
  generateQuotationExcel,
} from '../services/documentService';
import {
  ConservationBar,
  DataGrid,
  DocumentActionBar,
  SearchableSelect,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  toPartnerSelectOptions,
} from '../components/UiPrimitives';
import {
  CONTRACT_LINE_STATUS_KO_LABELS,
  CONTRACT_STATUS_KO_LABELS,
  FULFILLMENT_STATUS_KO_LABELS,
  QUOTATION_STATUS_KO_LABELS,
  formatKoStatus,
  koStatusTone,
  type FlContract,
  type FlContractLine,
  type FlFulfillment,
  type FlInventoryUnit,
  type FlQuotation,
  type FlTradeAftercareCase,
  type ItemCategory,
  type QuotationLine,
} from '../types/domain';

export const QuotationsPage: React.FC = () => {
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
  const canEdit = canEditPage('quotations');
  const today = new Date().toISOString().slice(0, 10);

  const customers = useMemo(() => {
    const matched = datasets.partners.filter(
      (p) => p.partnerRoles.includes('매출처') || p.partnerRoles.includes('대리점')
    );
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

  const [quoteDomain, setQuoteDomain] = useState<'TRADE' | 'RENTAL'>('TRADE');
  const domainItems = useMemo(() => {
    const matched = datasets.itemMasters.filter(
      (it) => it.itemDomain === quoteDomain || it.itemDomain === 'BOTH'
    );
    return matched.length > 0 ? matched : datasets.itemMasters;
  }, [datasets.itemMasters, quoteDomain]);

  const [partnerId, setPartnerId] = useState(customers[0]?.id || '');
  const [quoteDate, setQuoteDate] = useState(today);
  const [validUntil, setValidUntil] = useState(addDaysIso(today, 30));
  const [rentalMonths, setRentalMonths] = useState(12);
  const [itemId, setItemId] = useState(domainItems[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [unitPriceKrw, setUnitPriceKrw] = useState<number>(
    domainItems[0]?.retailPriceKrw || 0
  );
  const [memo, setMemo] = useState('');
  const [draftLines, setDraftLines] = useState<QuotationLine[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(
    datasets.quotations[0]?.id || null
  );
  const [busy, setBusy] = useState(false);

  const handleSelectItem = (nextId: string, nextDomain: 'TRADE' | 'RENTAL' = quoteDomain) => {
    setItemId(nextId);
    const it = datasets.itemMasters.find((x) => x.id === nextId);
    if (it) {
      setUnitPriceKrw(
        nextDomain === 'RENTAL' ? it.standardMonthlyRentalKrw : it.retailPriceKrw
      );
    }
  };

  const addLine = () => {
    const it = domainItems.find((x) => x.id === (itemId || domainItems[0]?.id));
    if (!it) return;
    const supply = Math.round(Number(qty || 1) * Number(unitPriceKrw || 0));
    setDraftLines((prev) => [
      ...prev,
      {
        itemId: it.id,
        sku: it.sku,
        itemName: it.name,
        itemCategory: it.itemCategory,
        managementType: it.managementType,
        qty: Math.max(1, Number(qty || 1)),
        unitPriceKrw: Math.round(Number(unitPriceKrw || 0)),
        supplyAmountKrw: supply,
        optionSummary: it.specSummary || undefined,
      },
    ]);
  };

  const handleSaveQuote = async () => {
    const partner = customers.find((c) => c.id === (partnerId || customers[0]?.id));
    if (!partner) {
      notifyToast('거래처를 선택해 주세요.', 'error');
      return;
    }
    const useLines =
      draftLines.length > 0
        ? draftLines
        : (() => {
            const it = domainItems.find(
              (x) => x.id === (itemId || domainItems[0]?.id)
            );
            if (!it) return [];
            const supply = Math.round(Math.max(1, qty) * Number(unitPriceKrw || 0));
            return [
              {
                itemId: it.id,
                sku: it.sku,
                itemName: it.name,
                itemCategory: it.itemCategory,
                managementType: it.managementType,
                qty: Math.max(1, qty),
                unitPriceKrw: Math.round(unitPriceKrw),
                supplyAmountKrw: supply,
                optionSummary: it.specSummary || undefined,
              },
            ];
          })();
    if (useLines.length === 0) {
      notifyToast('품목을 추가해 주세요.', 'error');
      return;
    }

    const supply = useLines.reduce((s, l) => s + l.supplyAmountKrw, 0);
    const vat = Math.round(supply * 0.1);
    const id = newId('QT');
    const rec: FlQuotation = {
      id,
      tenantId: DEFAULT_TENANT_ID,
      quoteNo: id,
      quoteDomain,
      partnerId: partner.id,
      partnerName: partner.name,
      salespersonId: currentUser?.id || 'USR_ADMIN',
      salespersonName: currentUser?.name || '담당자',
      quoteDate,
      validUntil,
      rentalMonths: quoteDomain === 'RENTAL' ? Math.max(1, rentalMonths) : 1,
      supplyAmountKrw: supply,
      vatAmountKrw: vat,
      totalAmountKrw: supply + vat,
      lines: useLines,
      status: 'DRAFT',
      memo: memo.trim() || null,
    };
    setBusy(true);
    try {
      await execDbMutation('견적 등록', () =>
        flSupabase.from('quotations').insert(camelToSnakeRow({ ...rec }))
      );
      setDraftLines([]);
      setSelectedQuoteId(id);
      await refreshAll();
      notifyToast('견적서 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '견적 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedQuote = useMemo(
    () =>
      datasets.quotations.find((q) => q.id === selectedQuoteId) ||
      datasets.quotations[0] ||
      null,
    [datasets.quotations, selectedQuoteId]
  );

  const selectedPartner = useMemo(
    () =>
      selectedQuote
        ? datasets.partners.find((p) => p.id === selectedQuote.partnerId)
        : undefined,
    [datasets.partners, selectedQuote]
  );

  const handleConvertToContract = async (qt: FlQuotation) => {
    if (qt.status === 'CONVERTED') {
      notifyToast('이미 계약으로 전환된 견적서입니다.', 'error');
      return;
    }
    const partner = datasets.partners.find((p) => p.id === qt.partnerId);
    setBusy(true);
    try {
      const ctrId = newId('CTR');
      const endDt =
        qt.quoteDomain === 'RENTAL'
          ? addDaysIso(today, Math.max(30, qt.rentalMonths * 30))
          : addDaysIso(today, 14);
      const monthly =
        qt.quoteDomain === 'RENTAL'
          ? qt.lines.reduce((s, l) => s + l.supplyAmountKrw, 0)
          : 0;

      const ctr: FlContract = {
        id: ctrId,
        tenantId: DEFAULT_TENANT_ID,
        contractNo: ctrId,
        contractDomain: qt.quoteDomain,
        quotationId: qt.id,
        partnerId: qt.partnerId,
        partnerName: qt.partnerName,
        salespersonId: qt.salespersonId,
        salespersonName: qt.salespersonName,
        contractDate: today,
        startDate: today,
        endDate: endDt,
        closingDay: partner?.defaultClosingDay || 31,
        paymentDueDay: partner?.defaultPaymentDueDay || 15,
        paymentMonthOffset: partner?.defaultPaymentMonthOffset ?? 1,
        paymentMethod: partner?.paymentMethod || '계좌이체',
        supplyAmountKrw: qt.supplyAmountKrw,
        vatAmountKrw: qt.vatAmountKrw,
        totalAmountKrw: qt.totalAmountKrw,
        monthlyRentalKrw: monthly,
        dailyRentalKrw: Math.round(monthly / 30),
        status: 'DRAFT',
        specialTerms: qt.memo || null,
      };
      await execDbMutation('계약 전환 생성', () =>
        flSupabase.from('contracts').insert(camelToSnakeRow({ ...ctr }))
      );

      for (let i = 0; i < qt.lines.length; i++) {
        const l = qt.lines[i];
        const vat = Math.round(l.supplyAmountKrw * 0.1);
        const lineRec: FlContractLine = {
          id: newId('CL'),
          tenantId: DEFAULT_TENANT_ID,
          contractId: ctrId,
          lineNo: i + 1,
          itemId: l.itemId,
          sku: l.sku,
          itemName: l.itemName,
          itemCategory: l.itemCategory || '완제품',
          managementType: l.managementType || 'SERIAL',
          quantity: l.qty,
          fulfilledQty: 0,
          unitPriceKrw: l.unitPriceKrw,
          supplyAmountKrw: l.supplyAmountKrw,
          vatAmountKrw: vat,
          totalAmountKrw: l.supplyAmountKrw + vat,
          optionSummary: l.optionSummary || null,
          lineStatus: 'ACTIVE',
          effectiveStartDate: today,
          effectiveEndDate: endDt,
        };
        await execDbMutation('계약 품목 생성', () =>
          flSupabase.from('contract_lines').insert(camelToSnakeRow({ ...lineRec }))
        );
      }

      await execDbMutation('견적 전환상태 갱신', () =>
        flSupabase
          .from('quotations')
          .update(
            camelToSnakeRow({
              status: 'CONVERTED',
              convertedContractId: ctrId,
              updatedAt: new Date().toISOString(),
            })
          )
          .eq('id', qt.id)
      );

      await refreshAll();
      notifyToast('계약서 전환 완료', 'success');
      navigateTo(qt.quoteDomain === 'RENTAL' ? 'rental_contracts' : 'trade_contracts');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '계약 전환 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {canEdit && (
        <SectionPanel
          title="신규 견적 작성"
          manualId="qt-create"
          rightSlot={
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={addLine} style={actionBtnStyle('secondary', true)}>
                품목 행 추가
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveQuote}
                style={actionBtnStyle('primary', true)}
              >
                견적 저장
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <VerticalField label="견적 구분" required>
              <select
                value={quoteDomain}
                onChange={(e) => {
                  const next = e.target.value as 'TRADE' | 'RENTAL';
                  setQuoteDomain(next);
                  const nextItems = datasets.itemMasters.filter(
                    (it) => it.itemDomain === next || it.itemDomain === 'BOTH'
                  );
                  const candidate =
                    nextItems.find((it) => it.id === itemId) || nextItems[0] || datasets.itemMasters[0];
                  handleSelectItem(candidate?.id || '', next);
                }}
                style={controlInputStyle}
              >
                <option value="TRADE">유통 판매</option>
                <option value="RENTAL">렌탈 임대</option>
              </select>
            </VerticalField>
            <VerticalField label="거래처" required>
              <SearchableSelect
                value={partnerId || customers[0]?.id || ''}
                options={toPartnerSelectOptions(customers)}
                onChange={(nextId) => setPartnerId(nextId)}
                placeholder="거래처 선택"
                searchPlaceholder="거래처명 · 초성 · 사업자번호 검색"
                minDropdownWidth={280}
              />
            </VerticalField>
            <VerticalField label="견적일자" required>
              <input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="유효기한" required>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            {quoteDomain === 'RENTAL' && (
              <VerticalField label="임대 개월수">
                <input
                  type="number"
                  min={1}
                  value={rentalMonths}
                  onChange={(e) => setRentalMonths(Number(e.target.value))}
                  style={controlInputStyle}
                />
              </VerticalField>
            )}
            <VerticalField label="품목" minWidth={220}>
              <select
                value={itemId || domainItems[0]?.id || ''}
                onChange={(e) => handleSelectItem(e.target.value)}
                style={controlInputStyle}
              >
                {domainItems.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.sku} · {it.name}
                  </option>
                ))}
              </select>
            </VerticalField>
            <VerticalField label="수량">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label={quoteDomain === 'RENTAL' ? '월 임대단가' : '판매단가'}>
              <input
                type="number"
                disabled={Boolean(currentUser?.maskSalesPrice)}
                value={currentUser?.maskSalesPrice ? 0 : unitPriceKrw}
                onChange={(e) => setUnitPriceKrw(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="특이사항">
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>

          {draftLines.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              추가된 견적 행: {draftLines.map((l) => `${l.itemName} ${l.qty}건`).join(' / ')}
            </div>
          )}
        </SectionPanel>
      )}

      {selectedQuote && (
        <SectionPanel
          title={`선택 견적 · ${selectedQuote.quoteNo} · ${selectedQuote.partnerName}`}
          rightSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <DocumentActionBar
                manualId="qt-docs"
                docLabel={selectedQuote.quoteDomain === 'TRADE' ? '유통 견적서' : '렌탈 견적서'}
                defaultEmail={selectedPartner?.email || selectedPartner?.taxEmail || ''}
                defaultSubject={`[${tenantProfile.corporateName}] ${selectedQuote.quoteNo} 견적서 송부`}
                defaultBody={`${selectedQuote.partnerName} 귀중\n\n요청하신 ${selectedQuote.quoteDomain === 'TRADE' ? '유통' : '렌탈'} 견적서를 첨부하여 송부드립니다.\n총 합계금액: ${selectedQuote.totalAmountKrw.toLocaleString('ko-KR')}원`}
                onGenerate={() =>
                  generateQuotationExcel({
                    quotation: selectedQuote,
                    partner: selectedPartner,
                    tenant: tenantProfile,
                    templates: datasets.documentTemplates,
                  })
                }
              />
              {canEdit && selectedQuote.status !== 'CONVERTED' && (
                <button
                  type="button"
                  data-manual-id="qt-convert"
                  disabled={busy}
                  onClick={() => handleConvertToContract(selectedQuote)}
                  style={actionBtnStyle('success', true)}
                >
                  계약 전환
                </button>
              )}
            </div>
          }
        >
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px' }}>
            <span>구분: {selectedQuote.quoteDomain === 'TRADE' ? '유통' : '렌탈'}</span>
            <span>견적일자: {selectedQuote.quoteDate}</span>
            <span>공급가액: {formatMoney(selectedQuote.supplyAmountKrw, { salesSensitive: true })}</span>
            <span>합계금액: {formatMoney(selectedQuote.totalAmountKrw, { salesSensitive: true })}</span>
            <span>상태: {QUOTATION_STATUS_KO_LABELS[selectedQuote.status] || formatKoStatus(selectedQuote.status)}</span>
          </div>
        </SectionPanel>
      )}

      <DataGrid
        columns={[
          { key: 'quoteNo', header: '견적번호', width: 140, render: (r) => <span style={{ fontWeight: 700 }}>{r.quoteNo}</span> },
          {
            key: 'domain',
            header: '구분',
            width: 85,
            align: 'center',
            render: (r) => <StatusBadge label={r.quoteDomain === 'RENTAL' ? '렌탈' : '유통'} tone="info" />,
          },
          { key: 'partnerName', header: '거래처', render: (r) => r.partnerName },
          { key: 'quoteDate', header: '견적일', width: 105, render: (r) => r.quoteDate },
          {
            key: 'total',
            header: '합계금액',
            width: 130,
            align: 'right',
            render: (r) => formatMoney(r.totalAmountKrw, { salesSensitive: true }),
          },
          {
            key: 'status',
            header: '상태',
            width: 95,
            align: 'center',
            render: (r) => (
              <StatusBadge
                label={QUOTATION_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status)}
                tone={koStatusTone(r.status)}
              />
            ),
          },
        ]}
        rows={[...datasets.quotations].sort((a, b) => b.quoteDate.localeCompare(a.quoteDate))}
        rowKey={(r) => r.id}
        selectedRowId={selectedQuote?.id || null}
        onRowClick={(r) => setSelectedQuoteId(r.id)}
        maxHeight="360px"
      />
    </div>
  );
};

export const TradeContractsPage: React.FC = () => {
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
  const canEdit = canEditPage('trade_contracts');
  const today = new Date().toISOString().slice(0, 10);

  const tradeContracts = useMemo(
    () =>
      datasets.contracts
        .filter((c) => c.contractDomain === 'TRADE')
        .sort((a, b) => b.contractDate.localeCompare(a.contractDate)),
    [datasets.contracts]
  );

  const customers = useMemo(() => {
    const matched = datasets.partners.filter(
      (p) => p.partnerRoles.includes('매출처') || p.partnerRoles.includes('대리점')
    );
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

  const tradeItems = useMemo(() => {
    const matched = datasets.itemMasters.filter(
      (i) => i.itemDomain === 'TRADE' || i.itemDomain === 'BOTH'
    );
    return matched.length > 0 ? matched : datasets.itemMasters;
  }, [datasets.itemMasters]);

  const [selectedId, setSelectedId] = useState<string | null>(tradeContracts[0]?.id || null);
  const [partnerId, setPartnerId] = useState(customers[0]?.id || '');
  const [itemId, setItemId] = useState(tradeItems[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [unitPriceKrw, setUnitPriceKrw] = useState(
    tradeItems[0]?.retailPriceKrw || 0
  );
  const [contractDate, setContractDate] = useState(today);
  const [specialTerms, setSpecialTerms] = useState('');
  const [busy, setBusy] = useState(false);

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
    const ctr: FlContract = {
      id: ctrId,
      tenantId: DEFAULT_TENANT_ID,
      contractNo: ctrId,
      contractDomain: 'TRADE',
      partnerId: partner.id,
      partnerName: partner.name,
      salespersonId: currentUser?.id || 'USR_ADMIN',
      salespersonName: currentUser?.name || '영업담당',
      contractDate,
      startDate: contractDate,
      endDate: addDaysIso(contractDate, 14),
      closingDay: partner.defaultClosingDay || 31,
      paymentDueDay: partner.defaultPaymentDueDay || 15,
      paymentMonthOffset: partner.defaultPaymentMonthOffset ?? 1,
      paymentMethod: partner.paymentMethod || '계좌이체',
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
    const openLines = selectedLines.filter((l) => l.fulfilledQty < l.quantity);
    if (openLines.length === 0) {
      notifyToast('출고 의뢰할 잔여 품목이 없습니다.', 'error');
      return;
    }
    setBusy(true);
    try {
      for (const line of openLines) {
        const ful: FlFulfillment = {
          id: newId('FUL'),
          tenantId: DEFAULT_TENANT_ID,
          fulfillmentNo: `FUL-${Date.now().toString(36).toUpperCase()}`,
          fulfillmentDomain: 'TRADE',
          actionType: '유통출고',
          contractId: selectedContract.id,
          contractLineId: line.id,
          partnerId: selectedContract.partnerId,
          partnerName: selectedContract.partnerName,
          siteId: selectedContract.siteId || null,
          itemId: line.itemId,
          quantity: line.quantity - line.fulfilledQty,
          cogsAmountKrw: 0,
          status: 'REQUESTED',
          effectiveDate: selectedContract.contractDate,
        };
        await execDbMutation('유통 출고의뢰 발행', () =>
          flSupabase.from('fulfillments').insert(camelToSnakeRow({ ...ful }))
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <VerticalField label="매출처" required>
              <SearchableSelect
                value={partnerId || customers[0]?.id || ''}
                options={toPartnerSelectOptions(customers)}
                onChange={(nextId) => setPartnerId(nextId)}
                placeholder="매출처 선택"
                searchPlaceholder="매출처명 · 초성 · 사업자번호 검색"
                minDropdownWidth={280}
              />
            </VerticalField>
            <VerticalField label="품목" required minWidth={220}>
              <select
                value={itemId || tradeItems[0]?.id || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setItemId(id);
                  const it = tradeItems.find((x) => x.id === id);
                  if (it) setUnitPriceKrw(it.retailPriceKrw);
                }}
                style={controlInputStyle}
              >
                {tradeItems.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.sku} · {it.name}
                  </option>
                ))}
              </select>
            </VerticalField>
            <VerticalField label="수량">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="계약단가">
              <input
                type="number"
                disabled={Boolean(currentUser?.maskSalesPrice)}
                value={currentUser?.maskSalesPrice ? 0 : unitPriceKrw}
                onChange={(e) => setUnitPriceKrw(Number(e.target.value))}
                style={controlInputStyle}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

      <DataGrid
        columns={[
          { key: 'contractNo', header: '계약번호', width: 140, render: (r) => <span style={{ fontWeight: 700 }}>{r.contractNo}</span> },
          { key: 'partnerName', header: '매출처', render: (r) => r.partnerName },
          { key: 'contractDate', header: '계약일', width: 105, render: (r) => r.contractDate },
          {
            key: 'total',
            header: '계약합계',
            width: 135,
            align: 'right',
            render: (r) => formatMoney(r.totalAmountKrw, { salesSensitive: true }),
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
        rows={tradeContracts}
        rowKey={(r) => r.id}
        selectedRowId={selectedContract?.id || null}
        onRowClick={(r) => setSelectedId(r.id)}
        maxHeight="340px"
      />
    </div>
  );
};

export const TradeInventoryPage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('trade_inventory');
  const today = new Date().toISOString().slice(0, 10);

  const [catFilter, setCatFilter] = useState<'ALL' | ItemCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | '보유중' | '판매완료'>('보유중');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [transferDate, setTransferDate] = useState(today);

  const tradeUnits = useMemo(() => {
    const base = datasets.inventoryUnits.filter((u) => u.ownershipDomain === '유통재고');
    const filtered = base.filter((u) => {
      if (catFilter !== 'ALL' && u.itemCategory !== catFilter) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      return true;
    });
    return sortUnitsFifo(filtered);
  }, [catFilter, datasets.inventoryUnits, statusFilter]);

  const selectedUnit =
    tradeUnits.find((u) => u.id === selectedUnitId) || tradeUnits[0] || null;

  const canTransfer =
    canEdit &&
    selectedUnit &&
    selectedUnit.status === '보유중' &&
    (selectedUnit.itemCategory === '완제품' || selectedUnit.itemCategory === '어태치먼트');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel title="유통재고 선입선출 조회 · 계정대체" manualId="tinv-filter">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체 품목' },
              { id: '완제품', label: '완제품' },
              { id: '어태치먼트', label: '어태치먼트' },
              { id: '부품', label: '부품' },
              { id: '소모품', label: '소모품' },
            ]}
            activeId={catFilter}
            onChange={(id) => setCatFilter(id as typeof catFilter)}
          />
          <SegmentedTabs
            tabs={[
              { id: '보유중', label: '보유중' },
              { id: '판매완료', label: '판매완료' },
              { id: 'ALL', label: '전체상태' },
            ]}
            activeId={statusFilter}
            onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          />
        </div>
      </SectionPanel>

      <DataGrid
        manualId="tinv-grid"
        columns={[
          { key: 'acqDate', header: '입고일 순번', width: 105, render: (u) => u.acquisitionDate },
          { key: 'unitCode', header: '재고번호', width: 135, render: (u) => <span style={{ fontWeight: 700 }}>{u.unitCode}</span> },
          { key: 'cat', header: '품목군', width: 95, render: (u) => <StatusBadge label={u.itemCategory} /> },
          { key: 'sku', header: '품목코드', width: 125, render: (u) => u.sku },
          { key: 'itemName', header: '품명', render: (u) => u.itemName },
          {
            key: 'serialOrLot',
            header: '시리얼 · 로트',
            width: 140,
            render: (u) => u.serialNo || u.lotNo || '-',
          },
          { key: 'qty', header: '가용수량', width: 85, align: 'right', render: (u) => u.qtyOnHand },
          {
            key: 'cost',
            header: '장부단가',
            width: 120,
            align: 'right',
            render: (u) => formatMoney(u.unitCostKrw),
          },
          {
            key: 'status',
            header: '상태',
            width: 90,
            align: 'center',
            render: (u) => (
              <StatusBadge label={formatKoStatus(u.status)} tone={u.status === '보유중' ? 'success' : 'neutral'} />
            ),
          },
        ]}
        rows={tradeUnits}
        rowKey={(u) => u.id}
        selectedRowId={selectedUnit?.id || null}
        onRowClick={(u) => setSelectedUnitId(u.id)}
        maxHeight="470px"
      />

      <ConservationBar
        manualId="tinv-xfer"
        items={[
          { label: '선택 재고', value: selectedUnit ? `${selectedUnit.unitCode} · ${selectedUnit.itemName}` : '선택 없음' },
          {
            label: '보유 장부가액',
            value: selectedUnit ? formatMoney(selectedUnit.unitCostKrw * Math.max(1, selectedUnit.qtyOnHand)) : '₩0',
            tone: 'primary',
          },
        ]}
      >
        {canTransfer && selectedUnit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              style={{ ...controlInputStyle, width: '145px' }}
            />
            <CommitActionButton
              actionCode="ACCOUNT_TRANSFER"
              targetTable="fl_inventory_units"
              targetId={selectedUnit.id}
              title={`유통재고 렌탈자산 계정대체 · ${selectedUnit.unitCode}`}
              buildPayload={() => ({
                unitId: selectedUnit.id,
                toDomain: '렌탈자산',
                effectiveDate: transferDate,
              })}
              onExecuteDirect={async () => {
                if (!currentUser) return;
                await executeAccountTransfer({
                  unit: selectedUnit,
                  toDomain: '렌탈자산',
                  effectiveDate: transferDate,
                  actorId: currentUser.id,
                  actorName: currentUser.name,
                });
                await refreshAll();
                notifyToast('렌탈자산 계정대체 완료', 'success');
              }}
              label="렌탈자산 전환"
            />
          </div>
        )}
      </ConservationBar>
    </div>
  );
};

export const TradeFulfillmentPage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('trade_fulfillment');
  const today = new Date().toISOString().slice(0, 10);

  const tradeFulfillments = useMemo(
    () => datasets.fulfillments.filter((f) => f.fulfillmentDomain === 'TRADE'),
    [datasets.fulfillments]
  );

  const [selectedFulId, setSelectedFulId] = useState<string | null>(
    tradeFulfillments.find((f) => f.status === 'REQUESTED')?.id || tradeFulfillments[0]?.id || null
  );
  const selectedFul =
    tradeFulfillments.find((f) => f.id === selectedFulId) || tradeFulfillments[0] || null;

  const candidateUnits = useMemo<FlInventoryUnit[]>(() => {
    if (!selectedFul) return [];
    const matching = datasets.inventoryUnits.filter(
      (u) =>
        u.ownershipDomain === '유통재고' &&
        u.status === '보유중' &&
        u.itemId === selectedFul.itemId &&
        u.qtyOnHand > 0
    );
    return sortUnitsFifo(matching);
  }, [datasets.inventoryUnits, selectedFul]);

  const [chosenUnitId, setChosenUnitId] = useState<string>('');
  const resolvedUnit =
    candidateUnits.find((u) => u.id === chosenUnitId) || candidateUnits[0] || null;

  const [effectiveDate, setEffectiveDate] = useState(today);
  const [fulMemo, setFulMemo] = useState('');

  // 사후처리 상태
  const completedTradeUnits = useMemo(
    () =>
      datasets.inventoryUnits.filter(
        (u) => u.ownershipDomain === '유통재고' && u.status === '판매완료'
      ),
    [datasets.inventoryUnits]
  );
  const dealers = useMemo(() => {
    const matched = datasets.partners.filter(
      (p) => p.partnerRoles.includes('대리점') || p.partnerRoles.includes('매입처')
    );
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

  const [acCaseType, setAcCaseType] =
    useState<FlTradeAftercareCase['caseType']>('공급사 정비중개');
  const [acUnitId, setAcUnitId] = useState(completedTradeUnits[0]?.id || '');
  const [acSupplierId, setAcSupplierId] = useState(dealers[0]?.id || '');
  const [acRefundSupply, setAcRefundSupply] = useState(0);
  const [acReplacementId, setAcReplacementId] = useState('');
  const [acDate, setAcDate] = useState(today);
  const [acMemo, setAcMemo] = useState('');

  const selectedAcUnit =
    completedTradeUnits.find((u) => u.id === (acUnitId || completedTradeUnits[0]?.id)) || null;
  const selectedAcContract = useMemo(
    () =>
      selectedAcUnit?.currentContractId
        ? datasets.contracts.find((c) => c.id === selectedAcUnit.currentContractId) || null
        : datasets.contracts.find((c) => c.contractDomain === 'TRADE') || null,
    [datasets.contracts, selectedAcUnit]
  );

  const replacementCandidates = useMemo(
    () =>
      sortUnitsFifo(
        datasets.inventoryUnits.filter(
          (u) => u.ownershipDomain === '유통재고' && u.status === '보유중' && u.qtyOnHand > 0
        )
      ),
    [datasets.inventoryUnits]
  );

  const selectedLine = selectedFul
    ? datasets.contractLines.find((l) => l.id === selectedFul.contractLineId)
    : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel title="유통 출고의뢰 실행완료 · 희망완료일과 입력일시 분리 저장" manualId="tful-exec">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <DataGrid
            columns={[
              { key: 'no', header: '의뢰번호', width: 140, render: (f) => <span style={{ fontWeight: 700 }}>{f.fulfillmentNo}</span> },
              { key: 'partnerName', header: '매출처', render: (f) => f.partnerName },
              { key: 'qty', header: '수량', width: 70, align: 'right', render: (f) => f.quantity },
              { key: 'eff', header: '희망완료일', width: 110, render: (f) => f.effectiveDate || '-' },
              { key: 'rec', header: '입력일시', width: 150, render: (f) => f.recordedAt ? f.recordedAt.slice(0, 16).replace('T', ' ') : '-' },
              {
                key: 'cogs',
                header: '인식매출원가',
                width: 120,
                align: 'right',
                render: (f) => formatMoney(f.cogsAmountKrw),
              },
              {
                key: 'st',
                header: '상태',
                width: 90,
                align: 'center',
                render: (f) => (
                  <StatusBadge
                    label={FULFILLMENT_STATUS_KO_LABELS[f.status] || formatKoStatus(f.status)}
                    tone={koStatusTone(f.status)}
                  />
                ),
              },
            ]}
            rows={tradeFulfillments}
            rowKey={(f) => f.id}
            selectedRowId={selectedFul?.id || null}
            onRowClick={(f) => {
              setSelectedFulId(f.id);
              setChosenUnitId('');
            }}
            maxHeight="260px"
          />

          {canEdit && selectedFul && selectedFul.status === 'REQUESTED' && selectedLine && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'flex-end',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-header)',
              }}
            >
              <VerticalField label="출고 재고 선입선출 우선 · 수동선택" required minWidth={280} flex={1}>
                <select
                  value={resolvedUnit?.id || ''}
                  onChange={(e) => setChosenUnitId(e.target.value)}
                  style={controlInputStyle}
                >
                  {candidateUnits.length === 0 ? (
                    <option value="">출고 가능한 유통재고가 없습니다</option>
                  ) : (
                    candidateUnits.map((u, idx) => (
                      <option key={u.id} value={u.id}>
                        {idx === 0 ? '[선입선출] ' : '[수동선택] '}
                        {u.unitCode} · {u.serialNo || u.lotNo || '단품'} · 잔여 {u.qtyOnHand} · 원가{' '}
                        {u.unitCostKrw.toLocaleString('ko-KR')}원
                      </option>
                    ))
                  )}
                </select>
              </VerticalField>
              <VerticalField label="희망완료일 귀속기준" required width={150}>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="출고 비고" minWidth={180} flex={1}>
                <input
                  type="text"
                  value={fulMemo}
                  onChange={(e) => setFulMemo(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <CommitActionButton
                actionCode="FULFILLMENT_COMPLETE"
                targetTable="fl_fulfillments"
                targetId={selectedFul.id}
                title={`유통 출고 실행완료 · ${selectedFul.fulfillmentNo}`}
                disabled={!resolvedUnit}
                buildPayload={() =>
                  resolvedUnit
                    ? {
                        fulfillmentId: selectedFul.id,
                        unitId: resolvedUnit.id,
                        effectiveDate,
                        memo: fulMemo.trim() || undefined,
                      }
                    : null
                }
                onExecuteDirect={async () => {
                  if (!currentUser || !resolvedUnit) return;
                  await completeFulfillment({
                    fulfillment: selectedFul,
                    contractLine: selectedLine,
                    unit: resolvedUnit,
                    effectiveDate,
                    actorId: currentUser.id,
                    actorName: currentUser.name,
                    memo: fulMemo.trim() || undefined,
                  });
                  await refreshAll();
                  notifyToast('유통 출고 실행완료 처리됨', 'success');
                }}
                label="출고 실행완료"
              />
            </div>
          )}
        </div>
      </SectionPanel>

      <SectionPanel title="유통 사후처리 · 공급사 정비중개 · 반품환불 · 반품교환" manualId="tful-aftercare">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {canEdit && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}>
              <VerticalField label="처리유형" required>
                <select
                  value={acCaseType}
                  onChange={(e) =>
                    setAcCaseType(e.target.value as FlTradeAftercareCase['caseType'])
                  }
                  style={controlInputStyle}
                >
                  <option value="공급사 정비중개">공급사 정비중개</option>
                  <option value="반품환불">반품환불</option>
                  <option value="반품교환">반품교환</option>
                </select>
              </VerticalField>
              <VerticalField label="판매완료 대상 장비" required>
                <select
                  value={selectedAcUnit?.id || ''}
                  onChange={(e) => setAcUnitId(e.target.value)}
                  style={controlInputStyle}
                >
                  {completedTradeUnits.length === 0 ? (
                    <option value="">판매완료 장비 없음</option>
                  ) : (
                    completedTradeUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitCode} · {u.itemName} · {u.serialNo || u.lotNo || ''}
                      </option>
                    ))
                  )}
                </select>
              </VerticalField>
              {acCaseType === '공급사 정비중개' && (
                <VerticalField label="연결 대리점·공급사">
                  <SearchableSelect
                    value={acSupplierId || dealers[0]?.id || ''}
                    options={toPartnerSelectOptions(dealers)}
                    onChange={(nextId) => setAcSupplierId(nextId)}
                    placeholder="대리점·공급사 선택"
                    searchPlaceholder="거래처명 · 초성 · 사업자번호 검색"
                    minDropdownWidth={280}
                  />
                </VerticalField>
              )}
              {acCaseType === '반품환불' && (
                <VerticalField label="환불 공급가액">
                  <input
                    type="number"
                    value={acRefundSupply}
                    onChange={(e) => setAcRefundSupply(Number(e.target.value))}
                    style={controlInputStyle}
                  />
                </VerticalField>
              )}
              {acCaseType === '반품교환' && (
                <VerticalField label="대체 출고 재고">
                  <select
                    value={acReplacementId || replacementCandidates[0]?.id || ''}
                    onChange={(e) => setAcReplacementId(e.target.value)}
                    style={controlInputStyle}
                  >
                    {replacementCandidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitCode} · {u.itemName} · {u.serialNo || u.lotNo || ''}
                      </option>
                    ))}
                  </select>
                </VerticalField>
              )}
              <VerticalField label="처리 기준일">
                <input
                  type="date"
                  value={acDate}
                  onChange={(e) => setAcDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="내용">
                <input
                  type="text"
                  value={acMemo}
                  onChange={(e) => setAcMemo(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <CommitActionButton
                actionCode="TRADE_REFUND"
                targetTable="fl_trade_aftercare_cases"
                targetId={selectedAcUnit?.id || 'NEW'}
                title={`유통 사후처리 · ${acCaseType}`}
                disabled={!selectedAcUnit || !selectedAcContract}
                buildPayload={() =>
                  selectedAcUnit && selectedAcContract
                    ? {
                        contractId: selectedAcContract.id,
                        unitId: selectedAcUnit.id,
                        caseType: acCaseType,
                        supplierPartnerId: acSupplierId || undefined,
                        refundSupplyKrw: acRefundSupply,
                        replacementUnitId: acReplacementId || replacementCandidates[0]?.id,
                        effectiveDate: acDate,
                        memo: acMemo.trim() || undefined,
                      }
                    : null
                }
                onExecuteDirect={async () => {
                  if (!currentUser || !selectedAcUnit || !selectedAcContract) return;
                  const sup = dealers.find((d) => d.id === acSupplierId) || null;
                  const rep =
                    acCaseType === '반품교환'
                      ? replacementCandidates.find(
                          (r) => r.id === (acReplacementId || replacementCandidates[0]?.id)
                        ) || null
                      : null;
                  await recordTradeAftercare({
                    contract: selectedAcContract,
                    unit: selectedAcUnit,
                    caseType: acCaseType,
                    supplier: sup,
                    refundSupplyKrw: acRefundSupply,
                    replacementUnit: rep,
                    effectiveDate: acDate,
                    actorId: currentUser.id,
                    actorName: currentUser.name,
                    memo: acMemo.trim() || undefined,
                  });
                  await refreshAll();
                  notifyToast(`${acCaseType} 처리 완료`, 'success');
                }}
                label="사후처리 확정"
              />
            </div>
          )}

          <DataGrid
            columns={[
              { key: 'caseNo', header: '사건번호', width: 135, render: (r) => r.caseNo },
              { key: 'effectiveDate', header: '기준일', width: 100, render: (r) => r.effectiveDate },
              { key: 'caseType', header: '처리유형', width: 120, render: (r) => <StatusBadge label={r.caseType} tone="info" /> },
              { key: 'partnerName', header: '고객사', render: (r) => r.partnerName },
              { key: 'supplierName', header: '연결공급사', width: 135, render: (r) => r.supplierName || '-' },
              {
                key: 'refund',
                header: '환불공급가',
                width: 120,
                align: 'right',
                render: (r) => formatMoney(r.refundSupplyKrw, { salesSensitive: true }),
              },
            ]}
            rows={[...datasets.tradeAftercareCases].sort((a, b) =>
              b.effectiveDate.localeCompare(a.effectiveDate)
            )}
            rowKey={(r) => r.id}
            maxHeight="240px"
          />
        </div>
      </SectionPanel>
    </div>
  );
};

export const TradePerformancePage: React.FC = () => {
  const { datasets, formatMoney } = useAppShell();
  const ymStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const today = new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(ymStart);
  const [endDate, setEndDate] = useState(today);

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
      const sales = line ? Math.round((line.supplyAmountKrw * f.quantity) / Math.max(1, line.quantity)) : 0;
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

    for (const ac of datasets.tradeAftercareCases) {
      if (ac.caseType !== '반품환불') continue;
      if (ac.effectiveDate < startDate || ac.effectiveDate > endDate) continue;
      const u = datasets.inventoryUnits.find((x) => x.id === ac.unitId);
      const revCogs = u ? u.unitCostKrw : 0;
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
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [datasets, endDate, startDate]);

  const totals = useMemo(() => {
    const netSales = rows.reduce((s, r) => s + r.salesKrw - r.refundKrw, 0);
    const netCogs = rows.reduce((s, r) => s + r.cogsKrw, 0);
    return {
      sales: rows.reduce((s, r) => s + r.salesKrw, 0),
      refund: rows.reduce((s, r) => s + r.refundKrw, 0),
      cogs: netCogs,
      gp: netSales - netCogs,
    };
  }, [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel title="유통 실적 조회 조건" manualId="tperf-period">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
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
        </div>
      </SectionPanel>

      <DataGrid
        manualId="tperf-grid"
        columns={[
          { key: 'date', header: '귀속기준일', width: 105, render: (r) => r.date },
          { key: 'partnerName', header: '매출처', width: 160, render: (r) => r.partnerName },
          { key: 'itemName', header: '품명 · 내역', render: (r) => r.itemName },
          {
            key: 'sales',
            header: '유통매출액',
            width: 125,
            align: 'right',
            render: (r) => formatMoney(r.salesKrw, { salesSensitive: true }),
          },
          {
            key: 'refund',
            header: '반품차감',
            width: 115,
            align: 'right',
            render: (r) => formatMoney(r.refundKrw, { salesSensitive: true }),
          },
          {
            key: 'cogs',
            header: '매출원가',
            width: 125,
            align: 'right',
            render: (r) => formatMoney(r.cogsKrw),
          },
          {
            key: 'gp',
            header: '매출총이익',
            width: 125,
            align: 'right',
            render: (r) => (
              <span style={{ fontWeight: 700, color: r.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatMoney(r.grossProfit, { salesSensitive: true })}
              </span>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        maxHeight="480px"
      />

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
        ]}
      />
    </div>
  );
};
