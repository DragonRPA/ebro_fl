import React, { useMemo, useState } from 'react';
import { matchesKoreanQuery } from '../../utils/hangulSearch';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { sortUnitsFifo, todayIso } from '../../services/domainMath';
import { completeFulfillment, recordTradeAftercare } from '../../services/domainFulfillmentEngine';
import { SearchableSelect, toPartnerSelectOptions } from '../../components/SearchableSelect';
import {
  CommaNumberInput,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  FULFILLMENT_STATUS_KO_LABELS,
  filterPartnersForTenant,
  formatKoStatus,
  isEffectiveTradeUnitForTenant,
  koStatusTone,
  type FlInventoryUnit,
  type FlTradeAftercareCase,
} from '../../types/domain';

export const TradeFulfillmentPage: React.FC = () => {
  const { currentUser, isRentalEnabled, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('trade_fulfillment');
  const today = todayIso();

  const effectiveTradeUnits = useMemo(
    () =>
      datasets.inventoryUnits
        .filter((u) =>
          isEffectiveTradeUnitForTenant(
            u,
            isRentalEnabled,
            datasets.stockMovements,
            datasets.purchases,
            datasets.purchaseLines
          )
        )
        .map((u) =>
          !isRentalEnabled && (u.status === '대여중' || u.status === '정비중')
            ? { ...u, status: '보유중' as const }
            : u
        ),
    [
      datasets.inventoryUnits,
      datasets.purchaseLines,
      datasets.purchases,
      datasets.stockMovements,
      isRentalEnabled,
    ]
  );

  const tenantPartners = useMemo(
    () => filterPartnersForTenant(datasets.partners, isRentalEnabled),
    [datasets.partners, isRentalEnabled]
  );

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

  const contractLineById = useMemo(
    () => new Map(datasets.contractLines.map((l) => [l.id, l])),
    [datasets.contractLines]
  );
  const unitByContractAndItem = useMemo(() => {
    const map = new Map<string, FlInventoryUnit>();
    for (const u of datasets.inventoryUnits) {
      if (!u.currentContractId) continue;
      const key = `${u.currentContractId}:${u.itemId}`;
      if (!map.has(key)) map.set(key, u);
    }
    return map;
  }, [datasets.inventoryUnits]);

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
      const unit = unitByContractAndItem.get(`${f.contractId}:${f.itemId}`);
      return matchesKoreanQuery(
        `${f.fulfillmentNo} ${f.partnerName} ${ctr?.contractNo || ''} ${it?.modelName || ''} ${it?.itemCategory || ''} ${unit?.unitCode || ''} ${unit?.serialNo || ''}`,
        q
      );
    });
  }, [tradeFulfillments, completedKeyword, contractMap, itemMap, unitByContractAndItem, historyStartDate, historyEndDate, historyPartnerId]);

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
    const matching = effectiveTradeUnits.filter(
      (u) =>
        u.status === '보유중' &&
        u.itemId === selectedFul.itemId &&
        u.qtyOnHand >= reqQty
    );
    return sortUnitsFifo(matching);
  }, [effectiveTradeUnits, selectedFul]);

  const [chosenUnitId, setChosenUnitId] = useState<string>('');
  const resolvedUnit =
    candidateUnits.find((u) => u.id === chosenUnitId) || candidateUnits[0] || null;

  const [effectiveDate, setEffectiveDate] = useState(today);
  const [fulMemo, setFulMemo] = useState('');

  // 사후처리 상태 (출고완료된 건 기준 자동 매핑)
  const { completedTradeUnits, completedTradeByContractItem, completedTradeByItem } = useMemo(() => {
    const list: FlInventoryUnit[] = [];
    const byContractItem = new Map<string, FlInventoryUnit>();
    const byItem = new Map<string, FlInventoryUnit>();
    for (const u of effectiveTradeUnits) {
      if (u.status !== '판매완료') continue;
      list.push(u);
      if (u.currentContractId) {
        const key = `${u.currentContractId}:${u.itemId}`;
        if (!byContractItem.has(key)) byContractItem.set(key, u);
      }
      if (!byItem.has(u.itemId)) byItem.set(u.itemId, u);
    }
    return {
      completedTradeUnits: list,
      completedTradeByContractItem: byContractItem,
      completedTradeByItem: byItem,
    };
  }, [effectiveTradeUnits]);
  const dealers = useMemo(() => {
    const matched = tenantPartners.filter(
      (p) => p.partnerRoles.includes('대리점') || p.partnerRoles.includes('매입처')
    );
    return matched.length > 0 ? matched : tenantPartners;
  }, [tenantPartners]);
  const dealerOptions = useMemo(() => toPartnerSelectOptions(dealers), [dealers]);

  const [acCaseType, setAcCaseType] =
    useState<FlTradeAftercareCase['caseType']>('공급사 정비중개');
  const [acSupplierId, setAcSupplierId] = useState(dealers[0]?.id || '');
  const [acRefundSupply, setAcRefundSupply] = useState(0);
  const [acReplacementId, setAcReplacementId] = useState('');
  const [acWarrantyApplied, setAcWarrantyApplied] = useState(false);
  const [acDate, setAcDate] = useState(today);
  const [acMemo, setAcMemo] = useState('');

  const selectedAcUnit = useMemo(() => {
    if (!selectedCompletedFul) return null;
    return (
      completedTradeByContractItem.get(
        `${selectedCompletedFul.contractId}:${selectedCompletedFul.itemId}`
      ) ||
      completedTradeByItem.get(selectedCompletedFul.itemId) ||
      completedTradeUnits[0] ||
      null
    );
  }, [selectedCompletedFul, completedTradeByContractItem, completedTradeByItem, completedTradeUnits]);

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
        effectiveTradeUnits.filter((u) => u.status === '보유중' && u.qtyOnHand > 0)
      ),
    [effectiveTradeUnits]
  );
  const replacementCandidateOptions = useMemo(
    () =>
      replacementCandidates.map((u) => ({
        value: u.id,
        label: `${u.unitCode} · ${u.itemName} · ${u.serialNo || u.lotNo || ''}`,
        searchText: `${u.unitCode} ${u.itemName} ${u.serialNo || ''} ${u.lotNo || ''}`,
      })),
    [replacementCandidates]
  );
  const sortedAftercareCases = useMemo(
    () =>
      [...datasets.tradeAftercareCases].sort((a, b) =>
        b.effectiveDate.localeCompare(a.effectiveDate)
      ),
    [datasets.tradeAftercareCases]
  );

  const selectedLine = selectedFul
    ? contractLineById.get(selectedFul.contractLineId)
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
              { key: 'no', header: '의뢰번호', width: 140, sortable: true, sortValue: (f) => f.fulfillmentNo, render: (f) => <span style={{ fontWeight: 700 }}>{f.fulfillmentNo}</span> },
              {
                key: 'contractNo',
                header: '계약번호',
                width: 135,
                sortable: true,
                sortValue: (f) => contractMap.get(f.contractId)?.contractNo || null,
                render: (f) => contractMap.get(f.contractId)?.contractNo || '-',
              },
              { key: 'partnerName', header: '매출처', sortable: true, sortValue: (f) => f.partnerName, render: (f) => f.partnerName },
              {
                key: 'itemName',
                header: '품목명',
                sortable: true,
                sortValue: (f) => itemMap.get(f.itemId)?.modelName || null,
                render: (f) => itemMap.get(f.itemId)?.modelName || '-',
              },
              { key: 'qty', header: '수량', width: 70, align: 'right', sortable: true, sortValue: (f) => Number(f.quantity || 0), render: (f) => f.quantity },
              { key: 'eff', header: '희망완료일', width: 110, sortable: true, sortValue: (f) => f.effectiveDate || null, render: (f) => f.effectiveDate || '-' },
              {
                key: 'st',
                header: '상태',
                width: 90,
                align: 'center',
                sortable: true,
                sortValue: (f) => FULFILLMENT_STATUS_KO_LABELS[f.status] || formatKoStatus(f.status),
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
                    allowTradeOriginUnit: !isRentalEnabled,
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
              { key: 'no', header: '의뢰번호', width: 140, sortable: true, sortValue: (f) => f.fulfillmentNo, render: (f) => <span style={{ fontWeight: 700 }}>{f.fulfillmentNo}</span> },
              {
                key: 'contractNo',
                header: '계약번호',
                width: 135,
                sortable: true,
                sortValue: (f) => contractMap.get(f.contractId)?.contractNo || null,
                render: (f) => contractMap.get(f.contractId)?.contractNo || '-',
              },
              { key: 'partnerName', header: '매출처', sortable: true, sortValue: (f) => f.partnerName, render: (f) => f.partnerName },
              {
                key: 'itemName',
                header: '품목명',
                sortable: true,
                sortValue: (f) => itemMap.get(f.itemId)?.modelName || null,
                render: (f) => itemMap.get(f.itemId)?.modelName || '-',
              },
              { key: 'qty', header: '수량', width: 65, align: 'right', sortable: true, sortValue: (f) => Number(f.quantity || 0), render: (f) => f.quantity },
              { key: 'eff', header: '완료기준일', width: 105, sortable: true, sortValue: (f) => f.effectiveDate || null, render: (f) => f.effectiveDate || '-' },
              {
                key: 'cogs',
                header: '인식매출원가',
                width: 115,
                align: 'right',
                sortable: true,
                sortValue: (f) => Number(f.cogsAmountKrw || 0),
                render: (f) => formatMoney(f.cogsAmountKrw),
              },
              {
                key: 'st',
                header: '상태',
                width: 85,
                align: 'center',
                sortable: true,
                sortValue: (f) => FULFILLMENT_STATUS_KO_LABELS[f.status] || formatKoStatus(f.status),
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
                    options={dealerOptions}
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
                    options={replacementCandidateOptions}
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
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  height: 'var(--space-control-h)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={acWarrantyApplied}
                  onChange={(e) => setAcWarrantyApplied(e.target.checked)}
                />
                무상보증 적용
              </label>
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
                        warrantyApplied: acWarrantyApplied,
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
                    warrantyApplied: acWarrantyApplied,
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
              { key: 'caseNo', header: '사건번호', width: 135, sortable: true, sortValue: (r) => r.caseNo, render: (r) => r.caseNo },
              { key: 'serialNo', header: '차대번호', width: 130, sortable: true, sortValue: (r) => r.serialNo || null, render: (r) => r.serialNo || '-' },
              { key: 'effectiveDate', header: '기준일', width: 100, sortable: true, sortValue: (r) => r.effectiveDate, render: (r) => r.effectiveDate },
              { key: 'caseType', header: '처리유형', width: 120, sortable: true, sortValue: (r) => r.caseType, render: (r) => <StatusBadge label={r.caseType} tone="info" /> },
              {
                key: 'warrantyApplied',
                header: '보증적용',
                width: 90,
                align: 'center',
                sortable: true,
                sortValue: (r) => (r.warrantyApplied ? '무상보증' : '일반'),
                render: (r) => (
                  <StatusBadge
                    label={r.warrantyApplied ? '무상보증' : '일반'}
                    tone={r.warrantyApplied ? 'success' : 'neutral'}
                  />
                ),
              },
              { key: 'partnerName', header: '고객사', sortable: true, sortValue: (r) => r.partnerName, render: (r) => r.partnerName },
              { key: 'supplierName', header: '연결공급사', width: 135, sortable: true, sortValue: (r) => r.supplierName || null, render: (r) => r.supplierName || '-' },
              {
                key: 'refund',
                header: '환불공급가',
                width: 120,
                align: 'right',
                sortable: true,
                sortValue: (r) => Number(r.refundSupplyKrw || 0),
                render: (r) => formatMoney(r.refundSupplyKrw, { salesSensitive: true }),
              },
            ]}
            rows={sortedAftercareCases}
            rowKey={(r) => r.id}
            maxHeight="clamp(180px, calc(100vh - 580px), 420px)"
          />
        </div>
      </SectionPanel>
      )}
    </div>
  );
};
