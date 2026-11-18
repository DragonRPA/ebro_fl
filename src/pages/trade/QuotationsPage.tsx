import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import { addDaysIso, todayIso } from '../../services/domainMath';
import { allocateNextContractNo } from '../../services/domainProcurementLeaseEngine';
import { generateQuotationExcel } from '../../services/documentService';
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
  QUOTATION_STATUS_KO_LABELS,
  cycleToMonthOffset,
  filterItemMastersForTenant,
  filterPartnersForTenant,
  formatKoStatus,
  koStatusTone,
  resolvePartnerPaymentDefaults,
  selectCustomerPartners,
  type FlContract,
  type FlContractLine,
  type FlQuotation,
  type QuotationLine,
} from '../../types/domain';

export const QuotationsPage: React.FC = () => {
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
  const canEdit = canEditPage('quotations');
  const today = todayIso();

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

  const [quoteDomain, setQuoteDomain] = useState<'TRADE' | 'RENTAL'>('TRADE');
  const effectiveQuoteDomain: 'TRADE' | 'RENTAL' = isRentalEnabled ? quoteDomain : 'TRADE';
  const domainItems = useMemo(() => {
    const matched = tenantItems.filter(
      (it) => it.itemDomain === effectiveQuoteDomain || it.itemDomain === 'BOTH'
    );
    return matched.length > 0 ? matched : tenantItems;
  }, [effectiveQuoteDomain, tenantItems]);

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
  const visibleQuotations = useMemo(
    () =>
      isRentalEnabled
        ? datasets.quotations
        : datasets.quotations.filter((q) => q.quoteDomain !== 'RENTAL'),
    [datasets.quotations, isRentalEnabled]
  );
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(
    visibleQuotations[0]?.id || null
  );
  const [busy, setBusy] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterPartnerId, setFilterPartnerId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const effectiveFilterDomain = isRentalEnabled ? filterDomain : '';

  const quotePartnerFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const q of visibleQuotations) {
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
  }, [visibleQuotations]);

  const filteredQuotations = useMemo(() => {
    const kw = filterKeyword.trim().toLowerCase();
    return visibleQuotations
      .filter((q) => {
        if (filterStartDate && q.quoteDate < filterStartDate) return false;
        if (filterEndDate && q.quoteDate > filterEndDate) return false;
        if (effectiveFilterDomain && q.quoteDomain !== effectiveFilterDomain) return false;
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
    effectiveFilterDomain,
    filterEndDate,
    filterKeyword,
    filterPartnerId,
    filterStartDate,
    filterStatus,
    visibleQuotations,
  ]);

  const handleSelectItem = (
    nextId: string,
    nextDomain: 'TRADE' | 'RENTAL' = effectiveQuoteDomain
  ) => {
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
      quoteDomain: effectiveQuoteDomain,
      partnerId: partner.id,
      partnerName: partner.name,
      salespersonId: currentUser?.id || 'USR_ADMIN',
      salespersonName: currentUser?.name || '담당자',
      quoteDate,
      validUntil,
      rentalMonths: effectiveQuoteDomain === 'RENTAL' ? Math.max(1, rentalMonths) : 1,
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
      visibleQuotations.find((q) => q.id === selectedQuoteId) ||
      visibleQuotations[0] ||
      null,
    [selectedQuoteId, visibleQuotations]
  );

  const selectedPartner = useMemo(
    () =>
      selectedQuote
        ? datasets.partners.find((p) => p.id === selectedQuote.partnerId)
        : undefined,
    [datasets.partners, selectedQuote]
  );

  const handleConvertToContract = async (qt: FlQuotation) => {
    if (!isRentalEnabled && qt.quoteDomain === 'RENTAL') {
      notifyToast('렌탈 영업을 영위하지 않는 테넌트에서는 실행할 수 없는 작업입니다.', 'error');
      return;
    }
    if (qt.status === 'CONVERTED') {
      notifyToast('이미 계약으로 전환된 견적서입니다.', 'error');
      return;
    }
    const partner = datasets.partners.find((p) => p.id === qt.partnerId);
    const partnerDefaults = resolvePartnerPaymentDefaults(partner);
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

      const contractNo = await allocateNextContractNo(qt.quoteDomain, today);
      const ctr: FlContract = {
        id: ctrId,
        tenantId: DEFAULT_TENANT_ID,
        contractNo,
        contractDomain: qt.quoteDomain,
        quotationId: qt.id,
        partnerId: qt.partnerId,
        partnerName: qt.partnerName,
        salespersonId: qt.salespersonId,
        salespersonName: qt.salespersonName,
        contractDate: today,
        startDate: today,
        endDate: endDt,
        closingDay: partnerDefaults.closingDay,
        paymentCycle: partnerDefaults.paymentCycle,
        paymentDueDay: partnerDefaults.paymentDueDay,
        paymentMonthOffset: cycleToMonthOffset(partnerDefaults.paymentCycle),
        paymentMethod: partnerDefaults.paymentMethod,
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
            {isRentalEnabled && (
              <VerticalField label="견적 구분" required>
                <select
                  value={effectiveQuoteDomain}
                  onChange={(e) => {
                    const next = e.target.value as 'TRADE' | 'RENTAL';
                    setQuoteDomain(next);
                    const nextItems = tenantItems.filter(
                      (it) => it.itemDomain === next || it.itemDomain === 'BOTH'
                    );
                    const candidate =
                      nextItems.find((it) => it.id === itemId) || nextItems[0] || tenantItems[0];
                    handleSelectItem(candidate?.id || '', next);
                  }}
                  style={controlInputStyle}
                >
                  <option value="TRADE">유통 판매</option>
                  <option value="RENTAL">렌탈 임대</option>
                </select>
              </VerticalField>
            )}
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
            {isRentalEnabled && effectiveQuoteDomain === 'RENTAL' && (
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
            <VerticalField label={effectiveQuoteDomain === 'RENTAL' ? '월 임대단가' : '판매단가'}>
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
                docLabel={
                  !isRentalEnabled
                    ? '유통 견적서'
                    : selectedQuote.quoteDomain === 'TRADE'
                      ? '유통 견적서'
                      : '렌탈 견적서'
                }
                defaultEmail={selectedPartner?.email || selectedPartner?.taxEmail || ''}
                defaultSubject={`[${tenantProfile.corporateName}] ${selectedQuote.quoteNo} 견적서 송부`}
                defaultBody={
                  isRentalEnabled
                    ? `${selectedQuote.partnerName} 귀중\n\n요청하신 ${selectedQuote.quoteDomain === 'TRADE' ? '유통' : '렌탈'} 견적서를 첨부하여 송부드립니다.\n총 합계금액: ${selectedQuote.totalAmountKrw.toLocaleString('ko-KR')}원`
                    : `${selectedQuote.partnerName} 귀중\n\n요청하신 유통 견적서를 첨부하여 송부드립니다.\n총 합계금액: ${selectedQuote.totalAmountKrw.toLocaleString('ko-KR')}원`
                }
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
            {isRentalEnabled && <span>구분: {selectedQuote.quoteDomain === 'TRADE' ? '유통' : '렌탈'}</span>}
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
          {isRentalEnabled && (
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
          )}
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
            ...(isRentalEnabled
              ? [
                  {
                    key: 'domain',
                    header: '구분',
                    width: 85,
                    align: 'center' as const,
                    sortable: true,
                    sortValue: (r: FlQuotation) => (r.quoteDomain === 'RENTAL' ? '렌탈' : '유통'),
                    render: (r: FlQuotation) => (
                      <StatusBadge label={r.quoteDomain === 'RENTAL' ? '렌탈' : '유통'} tone="info" />
                    ),
                  },
                ]
              : []),
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
