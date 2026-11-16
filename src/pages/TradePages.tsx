import React, { useMemo, useState } from 'react';
import { matchesKoreanQuery } from '../utils/hangulSearch';
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
  CommaNumberInput,
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
  toItemMasterSelectOptions,
  toPartnerSelectOptions,
} from '../components/UiPrimitives';
import {
  CONTRACT_LINE_STATUS_KO_LABELS,
  CONTRACT_STATUS_KO_LABELS,
  DAY_OF_MONTH_OPTIONS,
  FULFILLMENT_STATUS_KO_LABELS,
  PAYMENT_CYCLES,
  PAYMENT_METHODS,
  QUOTATION_STATUS_KO_LABELS,
  cycleToMonthOffset,
  formatKoStatus,
  formatPaymentTermsLabel,
  koStatusTone,
  normalizePaymentMethod,
  offsetToPaymentCycle,
  type FlContract,
  type FlContractLine,
  type FlFulfillment,
  type FlInventoryUnit,
  type FlQuotation,
  type FlTradeAftercareCase,
  type ItemCategory,
  type PaymentCycleType,
  type PaymentMethodType,
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
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterPartnerId, setFilterPartnerId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const quotePartnerFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const q of datasets.quotations) {
      if (q.partnerId && !seen.has(q.partnerId)) {
        seen.set(q.partnerId, q.partnerName);
      }
    }
    return [
      { value: '', label: '전체 거래처' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [datasets.quotations]);

  const filteredQuotations = useMemo(() => {
    const kw = filterKeyword.trim().toLowerCase();
    return datasets.quotations
      .filter((q) => {
        if (filterStartDate && q.quoteDate < filterStartDate) return false;
        if (filterEndDate && q.quoteDate > filterEndDate) return false;
        if (filterDomain && q.quoteDomain !== filterDomain) return false;
        if (filterPartnerId && q.partnerId !== filterPartnerId) return false;
        if (filterStatus && q.status !== filterStatus) return false;
        if (kw) {
          const text = `${q.quoteNo} ${q.partnerName} ${q.memo || ''}`.toLowerCase();
          if (!text.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => b.quoteDate.localeCompare(a.quoteDate));
  }, [
    datasets.quotations,
    filterDomain,
    filterEndDate,
    filterKeyword,
    filterPartnerId,
    filterStartDate,
    filterStatus,
  ]);

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
    const ptCycle = offsetToPaymentCycle(
      partner?.defaultPaymentMonthOffset,
      partner?.defaultPaymentCycle
    );
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
        paymentCycle: ptCycle,
        paymentDueDay: ptCycle === '선입금' ? 0 : partner?.defaultPaymentDueDay || 10,
        paymentMonthOffset: cycleToMonthOffset(ptCycle),
        paymentMethod: normalizePaymentMethod(partner?.paymentMethod),
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

      let lineSeq = 1;
      for (let i = 0; i < qt.lines.length; i++) {
        const l = qt.lines[i];
        const isSplitRentalSerial =
          qt.quoteDomain === 'RENTAL' &&
          (l.managementType || 'SERIAL') === 'SERIAL' &&
          l.qty > 1;
        const unitCount = isSplitRentalSerial ? Math.max(1, Math.round(l.qty)) : 1;
        for (let k = 0; k < unitCount; k++) {
          const lineQty = isSplitRentalSerial ? 1 : l.qty;
          const lineSupply = isSplitRentalSerial ? Math.round(l.unitPriceKrw) : l.supplyAmountKrw;
          const vat = Math.round(lineSupply * 0.1);
          const lineRec: FlContractLine = {
            id: newId('CL'),
            tenantId: DEFAULT_TENANT_ID,
            contractId: ctrId,
            lineNo: lineSeq++,
            itemId: l.itemId,
            sku: l.sku,
            itemName: l.itemName,
            itemCategory: l.itemCategory || '완제품',
            managementType: l.managementType || 'SERIAL',
            quantity: lineQty,
            fulfilledQty: 0,
            unitPriceKrw: l.unitPriceKrw,
            supplyAmountKrw: lineSupply,
            vatAmountKrw: vat,
            totalAmountKrw: lineSupply + vat,
            optionSummary: l.optionSummary || null,
            lineStatus: 'ACTIVE',
            effectiveStartDate: today,
            effectiveEndDate: endDt,
          };
          await execDbMutation('계약 품목 생성', () =>
            flSupabase.from('contract_lines').insert(camelToSnakeRow({ ...lineRec }))
          );
        }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && (
        <SectionPanel
          title="신규 견적 작성"
          manualId="qt-create"
          rightSlot={
            <div style={{ display: 'flex', gap: 'var(--space-inline-gap)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
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
                <CommaNumberInput
                  min={1}
                  value={rentalMonths}
                  onChange={setRentalMonths}
                />
              </VerticalField>
            )}
            <VerticalField label="품목" minWidth={220}>
              <SearchableSelect
                value={itemId || domainItems[0]?.id || ''}
                options={toItemMasterSelectOptions(domainItems)}
                onChange={(nextId) => handleSelectItem(nextId)}
                placeholder="품목 선택"
                searchPlaceholder="품명 · 초성 · 품번 · 제조사 검색"
                minDropdownWidth={320}
              />
            </VerticalField>
            <VerticalField label="수량">
              <CommaNumberInput min={1} value={qty} onChange={setQty} />
            </VerticalField>
            <VerticalField label={quoteDomain === 'RENTAL' ? '월 임대단가' : '판매단가'}>
              <CommaNumberInput
                disabled={Boolean(currentUser?.maskSalesPrice)}
                value={currentUser?.maskSalesPrice ? 0 : unitPriceKrw}
                onChange={setUnitPriceKrw}
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
            <div style={{ marginTop: 'var(--space-compact-pad-x)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              추가된 견적 행: {draftLines.map((l) => `${l.itemName} ${l.qty}건`).join(' / ')}
            </div>
          )}
        </SectionPanel>
      )}

      {selectedQuote && (
        <SectionPanel
          title={`선택 견적 · ${selectedQuote.quoteNo} · ${selectedQuote.partnerName}`}
          rightSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: 'var(--space-conservation-gap)', flexWrap: 'wrap', fontSize: '13px' }}>
            <span>구분: {selectedQuote.quoteDomain === 'TRADE' ? '유통' : '렌탈'}</span>
            <span>견적일자: {selectedQuote.quoteDate}</span>
            <span>공급가액: {formatMoney(selectedQuote.supplyAmountKrw, { salesSensitive: true })}</span>
            <span>합계금액: {formatMoney(selectedQuote.totalAmountKrw, { salesSensitive: true })}</span>
            <span>상태: {QUOTATION_STATUS_KO_LABELS[selectedQuote.status] || formatKoStatus(selectedQuote.status)}</span>
          </div>
        </SectionPanel>
      )}

      <SectionPanel
        title={`견적 원장 · ${filteredQuotations.length}건`}
        rightSlot={
          (filterStartDate || filterEndDate || filterDomain || filterPartnerId || filterStatus || filterKeyword) ? (
            <button
              type="button"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterDomain('');
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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
          <VerticalField label="견적 구분" minWidth={0}>
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              style={controlInputStyle}
            >
              <option value="">전체 구분</option>
              <option value="TRADE">유통</option>
              <option value="RENTAL">렌탈</option>
            </select>
          </VerticalField>
          <VerticalField label="거래처" minWidth={0}>
            <SearchableSelect
              value={filterPartnerId}
              onChange={setFilterPartnerId}
              options={quotePartnerFilterOptions}
              placeholder="전체 거래처"
              searchPlaceholder="거래처명 · 초성 검색"
            />
          </VerticalField>
          <VerticalField label="상태" minWidth={0}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={controlInputStyle}
            >
              <option value="">전체 상태</option>
              <option value="DRAFT">작성중</option>
              <option value="SENT">발송완료</option>
              <option value="ACCEPTED">수주확정</option>
              <option value="CONVERTED">계약전환</option>
              <option value="CANCELLED">취소</option>
            </select>
          </VerticalField>
          <VerticalField label="견적번호 검색" minWidth={0}>
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="견적번호, 비고"
              style={controlInputStyle}
            />
          </VerticalField>
        </div>

        <DataGrid
          columns={[
            {
              key: 'quoteNo',
              header: '견적번호',
              width: 140,
              sortable: true,
              sortValue: (r) => r.quoteNo,
              render: (r) => <span style={{ fontWeight: 700 }}>{r.quoteNo}</span>,
            },
            {
              key: 'domain',
              header: '구분',
              width: 85,
              align: 'center',
              sortable: true,
              sortValue: (r) => (r.quoteDomain === 'RENTAL' ? '렌탈' : '유통'),
              render: (r) => <StatusBadge label={r.quoteDomain === 'RENTAL' ? '렌탈' : '유통'} tone="info" />,
            },
            {
              key: 'partnerName',
              header: '거래처',
              sortable: true,
              sortValue: (r) => r.partnerName,
              render: (r) => r.partnerName,
            },
            {
              key: 'quoteDate',
              header: '견적일',
              width: 105,
              sortable: true,
              sortValue: (r) => r.quoteDate,
              render: (r) => r.quoteDate,
            },
            {
              key: 'total',
              header: '합계금액',
              width: 130,
              align: 'right',
              sortable: true,
              sortValue: (r) => Number(r.totalAmountKrw || 0),
              render: (r) => formatMoney(r.totalAmountKrw, { salesSensitive: true }),
            },
            {
              key: 'status',
              header: '상태',
              width: 95,
              align: 'center',
              sortable: true,
              sortValue: (r) => QUOTATION_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status),
              render: (r) => (
                <StatusBadge
                  label={QUOTATION_STATUS_KO_LABELS[r.status] || formatKoStatus(r.status)}
                  tone={koStatusTone(r.status)}
                />
              ),
            },
          ]}
          rows={filteredQuotations}
          rowKey={(r) => r.id}
          selectedRowId={selectedQuote?.id || null}
          onRowClick={(r) => setSelectedQuoteId(r.id)}
          maxHeight="clamp(280px, calc(100vh - 420px), 680px)"
        />
      </SectionPanel>
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(() =>
    normalizePaymentMethod(customers[0]?.paymentMethod)
  );
  const [closingDay, setClosingDay] = useState<number>(() => customers[0]?.defaultClosingDay || 31);
  const [paymentCycle, setPaymentCycle] = useState<PaymentCycleType>(() =>
    offsetToPaymentCycle(customers[0]?.defaultPaymentMonthOffset, customers[0]?.defaultPaymentCycle)
  );
  const [paymentDueDay, setPaymentDueDay] = useState<number>(() => {
    const cy = offsetToPaymentCycle(
      customers[0]?.defaultPaymentMonthOffset,
      customers[0]?.defaultPaymentCycle
    );
    return cy === '선입금' ? 0 : customers[0]?.defaultPaymentDueDay || 10;
  });
  const [specialTerms, setSpecialTerms] = useState('');
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
    const resolvedDueDay = paymentCycle === '선입금' ? 0 : Math.min(31, Math.max(1, Number(paymentDueDay || 10)));
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
      let seq = 1;
      const baseTs = Date.now().toString(36).toUpperCase();
      for (const { line, remainingQty } of openLines) {
        const splitSerial = line.managementType === 'SERIAL' && remainingQty > 1;
        const count = splitSerial ? Math.round(remainingQty) : 1;
        for (let k = 0; k < count; k++) {
          const reqQty = splitSerial ? 1 : remainingQty;
          const ful: FlFulfillment = {
            id: newId('FUL'),
            tenantId: DEFAULT_TENANT_ID,
            fulfillmentNo: `FUL-${baseTs}-${seq++}`,
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
                    const cy = offsetToPaymentCycle(pt.defaultPaymentMonthOffset, pt.defaultPaymentCycle);
                    setPaymentMethod(normalizePaymentMethod(pt.paymentMethod));
                    setClosingDay(pt.defaultClosingDay || 31);
                    setPaymentCycle(cy);
                    setPaymentDueDay(cy === '선입금' ? 0 : pt.defaultPaymentDueDay || 10);
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
          maxHeight="clamp(280px, calc(100vh - 440px), 680px)"
        />
      </SectionPanel>
    </div>
  );
};

export const TradeInventoryPage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('trade_inventory');
  const today = new Date().toISOString().slice(0, 10);

  const [catFilter, setCatFilter] = useState<'ALL' | ItemCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | '보유중' | '판매완료'>('보유중');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [transferDate, setTransferDate] = useState(today);

  const tradeItemFilterOptions = useMemo(() => {
    const seen = new Map<string, { label: string; searchText: string }>();
    for (const u of datasets.inventoryUnits) {
      if (u.ownershipDomain !== '유통재고') continue;
      if (!seen.has(u.itemId)) {
        seen.set(u.itemId, {
          label: `${u.sku} · ${u.itemName}`,
          searchText: `${u.itemName} ${u.sku}`,
        });
      }
    }
    return [
      { value: '', label: '전체 품목' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ko'))
        .map(([value, info]) => ({ value, label: info.label, searchText: info.searchText })),
    ];
  }, [datasets.inventoryUnits]);

  const tradeUnits = useMemo(() => {
    const kw = filterKeyword.trim().toLowerCase();
    const base = datasets.inventoryUnits.filter((u) => u.ownershipDomain === '유통재고');
    const filtered = base.filter((u) => {
      if (catFilter !== 'ALL' && u.itemCategory !== catFilter) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (filterStartDate && u.acquisitionDate < filterStartDate) return false;
      if (filterEndDate && u.acquisitionDate > filterEndDate) return false;
      if (filterItemId && u.itemId !== filterItemId) return false;
      if (kw) {
        const text = `${u.unitCode} ${u.sku} ${u.itemName} ${u.serialNo || ''} ${u.lotNo || ''}`.toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    });
    return sortUnitsFifo(filtered);
  }, [catFilter, datasets.inventoryUnits, filterEndDate, filterItemId, filterKeyword, filterStartDate, statusFilter]);

  const selectedUnit =
    tradeUnits.find((u) => u.id === selectedUnitId) || tradeUnits[0] || null;

  const canTransfer =
    canEdit &&
    selectedUnit &&
    selectedUnit.status === '보유중' &&
    (selectedUnit.itemCategory === '완제품' || selectedUnit.itemCategory === '어태치먼트');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="유통재고 선입선출 조회 · 계정대체"
        manualId="tinv-filter"
        rightSlot={
          (filterStartDate || filterEndDate || filterItemId || filterKeyword) ? (
            <button
              type="button"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterItemId('');
                setFilterKeyword('');
              }}
              style={actionBtnStyle('secondary', true)}
            >
              필터 초기화
            </button>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-stack-gap)', alignItems: 'flex-end' }}>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'var(--space-field-grid-gap)',
              alignItems: 'end',
            }}
          >
            <VerticalField label="입고 시작일" minWidth={0}>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="입고 종료일" minWidth={0}>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="품명 · 모델" minWidth={0}>
              <SearchableSelect
                value={filterItemId}
                onChange={setFilterItemId}
                options={tradeItemFilterOptions}
                placeholder="전체 품목"
                searchPlaceholder="품명 · 품번 · 초성 검색"
              />
            </VerticalField>
            <VerticalField label="시리얼 · 로트 · 재고번호" minWidth={0}>
              <input
                type="text"
                value={filterKeyword}
                onChange={(e) => setFilterKeyword(e.target.value)}
                placeholder="시리얼, 로트, 재고번호"
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
        </div>
      </SectionPanel>

      <DataGrid
        manualId="tinv-grid"
        columns={[
          {
            key: 'acqDate',
            header: '입고일 순번',
            width: 105,
            sortable: true,
            sortValue: (u) => u.acquisitionDate,
            render: (u) => u.acquisitionDate,
          },
          {
            key: 'unitCode',
            header: '재고번호',
            width: 135,
            sortable: true,
            sortValue: (u) => u.unitCode,
            render: (u) => <span style={{ fontWeight: 700 }}>{u.unitCode}</span>,
          },
          {
            key: 'cat',
            header: '품목군',
            width: 95,
            sortable: true,
            sortValue: (u) => u.itemCategory,
            render: (u) => <StatusBadge label={u.itemCategory} />,
          },
          {
            key: 'sku',
            header: '품목코드',
            width: 125,
            sortable: true,
            sortValue: (u) => u.sku,
            render: (u) => u.sku,
          },
          {
            key: 'itemName',
            header: '품명',
            sortable: true,
            sortValue: (u) => u.itemName,
            render: (u) => u.itemName,
          },
          {
            key: 'serialOrLot',
            header: '시리얼 · 로트',
            width: 140,
            sortable: true,
            sortValue: (u) => u.serialNo || u.lotNo || '',
            render: (u) => u.serialNo || u.lotNo || '-',
          },
          {
            key: 'qty',
            header: '가용수량',
            width: 85,
            align: 'right',
            sortable: true,
            sortValue: (u) => Number(u.qtyOnHand || 0),
            render: (u) => u.qtyOnHand,
          },
          {
            key: 'cost',
            header: '장부단가',
            width: 120,
            align: 'right',
            sortable: true,
            sortValue: (u) => Number(u.unitCostKrw || 0),
            render: (u) => formatMoney(u.unitCostKrw),
          },
          {
            key: 'status',
            header: '상태',
            width: 90,
            align: 'center',
            sortable: true,
            sortValue: (u) => formatKoStatus(u.status),
            render: (u) => (
              <StatusBadge label={formatKoStatus(u.status)} tone={u.status === '보유중' ? 'success' : 'neutral'} />
            ),
          },
        ]}
        rows={tradeUnits}
        rowKey={(u) => u.id}
        selectedRowId={selectedUnit?.id || null}
        onRowClick={(u) => setSelectedUnitId(u.id)}
        maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)' }}>
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

  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [pendingKeyword, setPendingKeyword] = useState('');
  const [completedKeyword, setCompletedKeyword] = useState('');
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [historyPartnerId, setHistoryPartnerId] = useState('');

  const contractMap = useMemo(
    () => new Map(datasets.contracts.map((c) => [c.id, c])),
    [datasets.contracts]
  );
  const itemMap = useMemo(
    () => new Map(datasets.itemMasters.map((it) => [it.id, it])),
    [datasets.itemMasters]
  );

  const tradeFulfillments = useMemo(
    () => datasets.fulfillments.filter((f) => f.fulfillmentDomain === 'TRADE'),
    [datasets.fulfillments]
  );

  const pendingFulfillments = useMemo(() => {
    const base = tradeFulfillments.filter((f) => f.status !== 'COMPLETED');
    const q = pendingKeyword.trim();
    if (!q) return base;
    return base.filter((f) => {
      const ctr = contractMap.get(f.contractId);
      const it = itemMap.get(f.itemId);
      return matchesKoreanQuery(
        `${f.fulfillmentNo} ${f.partnerName} ${ctr?.contractNo || ''} ${it?.modelName || ''} ${it?.itemCategory || ''}`,
        q
      );
    });
  }, [tradeFulfillments, pendingKeyword, contractMap, itemMap]);

  const historyPartnerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const f of tradeFulfillments) {
      if (f.status === 'COMPLETED' && f.partnerId && !seen.has(f.partnerId)) {
        seen.set(f.partnerId, f.partnerName);
      }
    }
    return [
      { value: '', label: '전체 매출처' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [tradeFulfillments]);

  const completedFulfillments = useMemo(() => {
    const base = tradeFulfillments.filter((f) => {
      if (f.status !== 'COMPLETED') return false;
      const d = f.effectiveDate || '';
      if (historyStartDate && d < historyStartDate) return false;
      if (historyEndDate && d > historyEndDate) return false;
      if (historyPartnerId && f.partnerId !== historyPartnerId) return false;
      return true;
    });
    const q = completedKeyword.trim();
    if (!q) return base;
    return base.filter((f) => {
      const ctr = contractMap.get(f.contractId);
      const it = itemMap.get(f.itemId);
      const unit = datasets.inventoryUnits.find(
        (u) => u.currentContractId === f.contractId && u.itemId === f.itemId
      );
      return matchesKoreanQuery(
        `${f.fulfillmentNo} ${f.partnerName} ${ctr?.contractNo || ''} ${it?.modelName || ''} ${it?.itemCategory || ''} ${unit?.unitCode || ''} ${unit?.serialNo || ''}`,
        q
      );
    });
  }, [tradeFulfillments, completedKeyword, contractMap, itemMap, datasets.inventoryUnits, historyStartDate, historyEndDate, historyPartnerId]);

  const [selectedFulId, setSelectedFulId] = useState<string | null>(null);
  const selectedFul =
    pendingFulfillments.find((f) => f.id === selectedFulId) || pendingFulfillments[0] || null;

  const [selectedCompletedFulId, setSelectedCompletedFulId] = useState<string | null>(null);
  const selectedCompletedFul =
    completedFulfillments.find((f) => f.id === selectedCompletedFulId) ||
    completedFulfillments[0] ||
    null;

  const candidateUnits = useMemo<FlInventoryUnit[]>(() => {
    if (!selectedFul) return [];
    const reqQty = Math.max(1, Number(selectedFul.quantity || 1));
    const matching = datasets.inventoryUnits.filter(
      (u) =>
        u.ownershipDomain === '유통재고' &&
        u.status === '보유중' &&
        u.itemId === selectedFul.itemId &&
        u.qtyOnHand >= reqQty
    );
    return sortUnitsFifo(matching);
  }, [datasets.inventoryUnits, selectedFul]);

  const [chosenUnitId, setChosenUnitId] = useState<string>('');
  const resolvedUnit =
    candidateUnits.find((u) => u.id === chosenUnitId) || candidateUnits[0] || null;

  const [effectiveDate, setEffectiveDate] = useState(today);
  const [fulMemo, setFulMemo] = useState('');

  // 사후처리 상태 (출고완료된 건 기준 자동 매핑)
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
  const [acSupplierId, setAcSupplierId] = useState(dealers[0]?.id || '');
  const [acRefundSupply, setAcRefundSupply] = useState(0);
  const [acReplacementId, setAcReplacementId] = useState('');
  const [acDate, setAcDate] = useState(today);
  const [acMemo, setAcMemo] = useState('');

  const selectedAcUnit = useMemo(() => {
    if (!selectedCompletedFul) return null;
    return (
      completedTradeUnits.find(
        (u) =>
          u.currentContractId === selectedCompletedFul.contractId &&
          u.itemId === selectedCompletedFul.itemId
      ) ||
      completedTradeUnits.find((u) => u.itemId === selectedCompletedFul.itemId) ||
      completedTradeUnits[0] ||
      null
    );
  }, [selectedCompletedFul, completedTradeUnits]);

  const selectedAcContract = useMemo(() => {
    if (selectedCompletedFul) {
      return contractMap.get(selectedCompletedFul.contractId) || null;
    }
    return selectedAcUnit?.currentContractId
      ? contractMap.get(selectedAcUnit.currentContractId) || null
      : null;
  }, [selectedCompletedFul, selectedAcUnit, contractMap]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-stack-gap)' }}>
        <SegmentedTabs
          tabs={[
            { id: 'PENDING', label: '유통출고', count: pendingFulfillments.length },
            { id: 'HISTORY', label: '유통출고이력', count: completedFulfillments.length },
          ]}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as 'PENDING' | 'HISTORY')}
        />
      </div>

      {activeTab === 'PENDING' && (
      <SectionPanel
        title="출고 대기 유통 계약 · 초성·키워드 검색 및 출고 완료 처리"
        manualId="tful-exec"
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StatusBadge label={`대기 ${pendingFulfillments.length}건`} tone="warning" />
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
            <VerticalField label="출고 대기 계약 검색" minWidth={280} flex={1}>
              <input
                type="text"
                data-testid="tful-pending-search"
                value={pendingKeyword}
                onChange={(e) => setPendingKeyword(e.target.value)}
                placeholder="매출처, 의뢰번호, 계약번호, 품목명, 초성 검색"
                style={controlInputStyle}
              />
            </VerticalField>
          </div>

          <DataGrid
            columns={[
              { key: 'no', header: '의뢰번호', width: 140, render: (f) => <span style={{ fontWeight: 700 }}>{f.fulfillmentNo}</span> },
              {
                key: 'contractNo',
                header: '계약번호',
                width: 135,
                render: (f) => contractMap.get(f.contractId)?.contractNo || '-',
              },
              { key: 'partnerName', header: '매출처', render: (f) => f.partnerName },
              {
                key: 'itemName',
                header: '품목명',
                render: (f) => itemMap.get(f.itemId)?.modelName || '-',
              },
              { key: 'qty', header: '수량', width: 70, align: 'right', render: (f) => f.quantity },
              { key: 'eff', header: '희망완료일', width: 110, render: (f) => f.effectiveDate || '-' },
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
            rows={pendingFulfillments}
            rowKey={(f) => f.id}
            selectedRowId={selectedFul?.id || null}
            onRowClick={(f) => {
              setSelectedFulId(f.id);
              setChosenUnitId('');
            }}
            emptyText="출고 대기 중인 유통 계약이 없습니다."
            maxHeight="clamp(300px, calc(100vh - 380px), 700px)"
          />

          {canEdit && selectedFul && selectedLine && (
            <div
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
      )}

      {activeTab === 'HISTORY' && (
        <SectionPanel
          title="출고 완료 건 조회 · 공급사 정비중개 · 반품환불 · 반품교환"
          manualId="tful-aftercare"
          rightSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(historyStartDate || historyEndDate || historyPartnerId || completedKeyword) && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryStartDate('');
                    setHistoryEndDate('');
                    setHistoryPartnerId('');
                    setCompletedKeyword('');
                  }}
                  style={actionBtnStyle('secondary', true)}
                >
                  필터 초기화
                </button>
              )}
              <StatusBadge label={`완료 ${completedFulfillments.length}건`} tone="success" />
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
                gap: 'var(--space-field-grid-gap)',
                alignItems: 'end',
              }}
            >
              <VerticalField label="완료 시작일" minWidth={0}>
                <input
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="완료 종료일" minWidth={0}>
                <input
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => setHistoryEndDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="매출처" minWidth={0}>
                <SearchableSelect
                  value={historyPartnerId}
                  onChange={setHistoryPartnerId}
                  options={historyPartnerOptions}
                  placeholder="전체 매출처"
                  searchPlaceholder="매출처명 · 초성 검색"
                />
              </VerticalField>
              <VerticalField label="출고 완료 건 검색" minWidth={0}>
                <input
                  type="text"
                  data-testid="tful-completed-search"
                  value={completedKeyword}
                  onChange={(e) => setCompletedKeyword(e.target.value)}
                  placeholder="매출처, 의뢰번호, 계약번호, 품목명, 제조번호, 초성"
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>

          <DataGrid
            columns={[
              { key: 'no', header: '의뢰번호', width: 140, render: (f) => <span style={{ fontWeight: 700 }}>{f.fulfillmentNo}</span> },
              {
                key: 'contractNo',
                header: '계약번호',
                width: 135,
                render: (f) => contractMap.get(f.contractId)?.contractNo || '-',
              },
              { key: 'partnerName', header: '매출처', render: (f) => f.partnerName },
              {
                key: 'itemName',
                header: '품목명',
                render: (f) => itemMap.get(f.itemId)?.modelName || '-',
              },
              { key: 'qty', header: '수량', width: 65, align: 'right', render: (f) => f.quantity },
              { key: 'eff', header: '완료기준일', width: 105, render: (f) => f.effectiveDate || '-' },
              {
                key: 'cogs',
                header: '인식매출원가',
                width: 115,
                align: 'right',
                render: (f) => formatMoney(f.cogsAmountKrw),
              },
              {
                key: 'st',
                header: '상태',
                width: 85,
                align: 'center',
                render: (f) => (
                  <StatusBadge
                    label={FULFILLMENT_STATUS_KO_LABELS[f.status] || formatKoStatus(f.status)}
                    tone={koStatusTone(f.status)}
                  />
                ),
              },
            ]}
            rows={completedFulfillments}
            rowKey={(f) => f.id}
            selectedRowId={selectedCompletedFul?.id || null}
            onRowClick={(f) => setSelectedCompletedFulId(f.id)}
            emptyText="출고 완료된 유통 건이 없습니다."
            maxHeight="200px"
          />

          {canEdit && selectedCompletedFul && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 'var(--space-field-grid-gap)',
                alignItems: 'end',
                padding: 'var(--space-subbox-pad-x)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-header)',
              }}
            >
              <VerticalField label="선택된 출고완료 건">
                <div
                  style={{
                    ...controlInputStyle,
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 700,
                    backgroundColor: 'var(--bg-card)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedCompletedFul.fulfillmentNo} · {selectedCompletedFul.partnerName}
                </div>
              </VerticalField>
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
                  <CommaNumberInput min={0} value={acRefundSupply} onChange={setAcRefundSupply} />
                </VerticalField>
              )}
              {acCaseType === '반품교환' && (
                <VerticalField label="대체 출고 재고">
                  <SearchableSelect
                    value={acReplacementId || replacementCandidates[0]?.id || ''}
                    options={replacementCandidates.map((u) => ({
                      value: u.id,
                      label: `${u.unitCode} · ${u.itemName} · ${u.serialNo || u.lotNo || ''}`,
                      searchText: `${u.unitCode} ${u.itemName} ${u.serialNo || ''} ${u.lotNo || ''}`,
                    }))}
                    onChange={(nextId) => setAcReplacementId(nextId)}
                    placeholder="대체 출고 재고 선택"
                    searchPlaceholder="품명 · 초성 · 차대번호 검색"
                    minDropdownWidth={320}
                  />
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
                targetId={selectedAcUnit?.id || selectedCompletedFul.id}
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
            maxHeight="220px"
          />
        </div>
      </SectionPanel>
      )}
    </div>
  );
};

export const TradePerformancePage: React.FC = () => {
  const { datasets, formatMoney } = useAppShell();
  const ymStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const today = new Date().toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(ymStart);
  const [endDate, setEndDate] = useState(today);
  const [filterPartnerName, setFilterPartnerName] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

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
      const sales = line
        ? f.quantity === line.quantity
          ? Math.round(line.supplyAmountKrw)
          : Math.round((line.supplyAmountKrw * f.quantity) / Math.max(1, line.quantity))
        : 0;
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

    for (const b of datasets.billings) {
      if (b.status === 'CANCELLED' || b.billingDomain !== 'TRADE') continue;
      const bYm = b.billingYm;
      if (bYm < startDate.slice(0, 7) || bYm > endDate.slice(0, 7)) continue;
      for (const bl of b.lines || []) {
        if (!bl.dispatchId) continue;
        out.push({
          id: `${b.id}-${bl.dispatchId}`,
          date: b.billingDate,
          partnerName: b.partnerName,
          itemName: bl.description,
          salesKrw: bl.supplyAmountKrw,
          cogsKrw: 0,
          refundKrw: 0,
          grossProfit: bl.supplyAmountKrw,
        });
      }
    }

    for (const ac of datasets.tradeAftercareCases) {
      if (ac.status !== 'COMPLETED') continue;
      if (ac.effectiveDate < startDate || ac.effectiveDate > endDate) continue;
      const u = datasets.inventoryUnits.find((x) => x.id === ac.unitId);
      const revCogs = u ? u.unitCostKrw : 0;
      if (ac.caseType === '반품환불') {
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
      } else if (ac.caseType === '반품교환') {
        const rep = ac.replacementUnitId
          ? datasets.inventoryUnits.find((x) => x.id === ac.replacementUnitId)
          : undefined;
        const repCogs = rep ? rep.unitCostKrw : 0;
        const netCogsDelta = repCogs - revCogs;
        out.push({
          id: ac.id,
          date: ac.effectiveDate,
          partnerName: ac.partnerName,
          itemName: `반품교환 · ${u?.itemName || ac.caseNo}`,
          salesKrw: 0,
          cogsKrw: netCogsDelta,
          refundKrw: 0,
          grossProfit: -netCogsDelta,
        });
      }
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [datasets, endDate, startDate]);

  const partnerFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.partnerName) seen.add(r.partnerName);
    }
    return [
      { value: '', label: '전체 매출처' },
      ...[...seen].sort((a, b) => a.localeCompare(b, 'ko')).map((name) => ({ value: name, label: name })),
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const kw = filterKeyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterPartnerName && r.partnerName !== filterPartnerName) return false;
      if (kw && !`${r.partnerName} ${r.itemName}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [filterKeyword, filterPartnerName, rows]);

  const totals = useMemo(() => {
    const netSales = filteredRows.reduce((s, r) => s + r.salesKrw - r.refundKrw, 0);
    const netCogs = filteredRows.reduce((s, r) => s + r.cogsKrw, 0);
    return {
      sales: filteredRows.reduce((s, r) => s + r.salesKrw, 0),
      refund: filteredRows.reduce((s, r) => s + r.refundKrw, 0),
      cogs: netCogs,
      gp: netSales - netCogs,
    };
  }, [filteredRows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="유통 실적 조회 조건"
        manualId="tperf-period"
        rightSlot={
          (filterPartnerName || filterKeyword) ? (
            <button
              type="button"
              onClick={() => {
                setFilterPartnerName('');
                setFilterKeyword('');
              }}
              style={actionBtnStyle('secondary', true)}
            >
              필터 초기화
            </button>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', gap: 'var(--space-stack-gap)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
          <VerticalField label="매출처" width={220}>
            <SearchableSelect
              value={filterPartnerName}
              onChange={setFilterPartnerName}
              options={partnerFilterOptions}
              placeholder="전체 매출처"
              searchPlaceholder="매출처명 · 초성 검색"
            />
          </VerticalField>
          <VerticalField label="품명 · 내역 검색" width={240}>
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="품명, 모델, 반품/운송 내역"
              style={controlInputStyle}
            />
          </VerticalField>
        </div>
      </SectionPanel>

      <DataGrid
        manualId="tperf-grid"
        columns={[
          {
            key: 'date',
            header: '귀속기준일',
            width: 105,
            sortable: true,
            sortValue: (r) => r.date,
            render: (r) => r.date,
          },
          {
            key: 'partnerName',
            header: '매출처',
            width: 160,
            sortable: true,
            sortValue: (r) => r.partnerName,
            render: (r) => r.partnerName,
          },
          {
            key: 'itemName',
            header: '품명 · 내역',
            sortable: true,
            sortValue: (r) => r.itemName,
            render: (r) => r.itemName,
          },
          {
            key: 'sales',
            header: '유통매출액',
            width: 125,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.salesKrw || 0),
            render: (r) => formatMoney(r.salesKrw, { salesSensitive: true }),
          },
          {
            key: 'refund',
            header: '반품차감',
            width: 115,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.refundKrw || 0),
            render: (r) => formatMoney(r.refundKrw, { salesSensitive: true }),
          },
          {
            key: 'cogs',
            header: '매출원가',
            width: 125,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.cogsKrw || 0),
            render: (r) => formatMoney(r.cogsKrw),
          },
          {
            key: 'gp',
            header: '매출총이익',
            width: 125,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.grossProfit || 0),
            render: (r) => (
              <span style={{ fontWeight: 700, color: r.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatMoney(r.grossProfit, { salesSensitive: true })}
              </span>
            ),
          },
        ]}
        rows={filteredRows}
        rowKey={(r) => r.id}
        maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
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
