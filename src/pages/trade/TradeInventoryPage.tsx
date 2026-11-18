import React, { useMemo, useState } from 'react';
import { matchesKoreanQuery } from '../../utils/hangulSearch';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { camelToSnakeRow, execDbMutation, flSupabase } from '../../core/supabase';
import { diffDaysInclusive, sortUnitsFifo, todayIso } from '../../services/domainMath';
import { executeAccountTransfer } from '../../services/domainFulfillmentEngine';
import { SearchableSelect } from '../../components/SearchableSelect';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  formatKoStatus,
  isEffectiveTradeUnitForTenant,
  type FlInventoryUnit,
  type ItemCategory,
} from '../../types/domain';

function computeElapsedDays(acquisitionDate: string, refDate: string): number {
  if (!acquisitionDate || !refDate) return 0;
  const inclusive = diffDaysInclusive(acquisitionDate.slice(0, 10), refDate.slice(0, 10));
  if (!Number.isFinite(inclusive)) return 0;
  return Math.max(0, inclusive - 1);
}

function agingTone(days: number): 'danger' | 'warning' | 'info' | 'primary' | 'neutral' {
  if (days >= 180) return 'danger';
  if (days >= 90) return 'warning';
  if (days >= 60) return 'info';
  if (days >= 30) return 'primary';
  return 'neutral';
}

function getWarrantyStatus(u: FlInventoryUnit, today: string): { label: string; tone: 'success' | 'danger' | 'neutral' } {
  if (!u.warrantyEndDate) return { label: '미개시', tone: 'neutral' };
  return u.warrantyEndDate >= today
    ? { label: '무상보증', tone: 'success' }
    : { label: '보증만료', tone: 'danger' };
}

export const TradeInventoryPage: React.FC = () => {
  const { currentUser, isRentalEnabled, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('trade_inventory');
  const today = todayIso();

  const [catFilter, setCatFilter] = useState<'ALL' | ItemCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | '보유중' | '판매완료'>('보유중');
  const [agingFilter, setAgingFilter] = useState<'ALL' | '30' | '60' | '90' | '180'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [transferDate, setTransferDate] = useState(today);
  const [warrantySaving, setWarrantySaving] = useState(false);
  const [warrantyMonthsInput, setWarrantyMonthsInput] = useState<number>(12);
  const [warrantyStartInput, setWarrantyStartInput] = useState<string>('');
  const [warrantyEndInput, setWarrantyEndInput] = useState<string>('');
  const [warrantyNoteInput, setWarrantyNoteInput] = useState<string>('');

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

  const tradeItemFilterOptions = useMemo(() => {
    const seen = new Map<string, { label: string; searchText: string }>();
    for (const u of effectiveTradeUnits) {
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
  }, [effectiveTradeUnits]);

  const baseFilteredUnits = useMemo(() => {
    const kw = filterKeyword.trim();
    return effectiveTradeUnits.filter((u) => {
      if (catFilter !== 'ALL' && u.itemCategory !== catFilter) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (filterStartDate && u.acquisitionDate < filterStartDate) return false;
      if (filterEndDate && u.acquisitionDate > filterEndDate) return false;
      if (filterItemId && u.itemId !== filterItemId) return false;
      if (kw) {
        const text = `${u.unitCode} ${u.sku} ${u.itemName} ${u.serialNo || ''} ${u.lotNo || ''}`;
        if (!matchesKoreanQuery(text, kw)) return false;
      }
      return true;
    });
  }, [catFilter, effectiveTradeUnits, filterEndDate, filterItemId, filterKeyword, filterStartDate, statusFilter]);

  const agingCounts = useMemo(() => {
    let over30 = 0;
    let over60 = 0;
    let over90 = 0;
    let over180 = 0;
    for (const u of baseFilteredUnits) {
      const days = computeElapsedDays(u.acquisitionDate, today);
      if (days >= 30) over30 += 1;
      if (days >= 60) over60 += 1;
      if (days >= 90) over90 += 1;
      if (days >= 180) over180 += 1;
    }
    return { all: baseFilteredUnits.length, over30, over60, over90, over180 };
  }, [baseFilteredUnits, today]);

  const tradeUnits = useMemo(() => {
    const filtered =
      agingFilter === 'ALL'
        ? baseFilteredUnits
        : baseFilteredUnits.filter(
            (u) => computeElapsedDays(u.acquisitionDate, today) >= Number(agingFilter)
          );
    return sortUnitsFifo(filtered);
  }, [agingFilter, baseFilteredUnits, today]);

  const totalFilteredBookValue = useMemo(
    () =>
      tradeUnits.reduce(
        (sum, u) => sum + Number(u.unitCostKrw || 0) * Math.max(1, Number(u.qtyOnHand || 0)),
        0
      ),
    [tradeUnits]
  );

  const over90BookValue = useMemo(
    () =>
      tradeUnits
        .filter((u) => computeElapsedDays(u.acquisitionDate, today) >= 90)
        .reduce(
          (sum, u) => sum + Number(u.unitCostKrw || 0) * Math.max(1, Number(u.qtyOnHand || 0)),
          0
        ),
    [tradeUnits, today]
  );

  const selectedUnit =
    tradeUnits.find((u) => u.id === selectedUnitId) || tradeUnits[0] || null;

  const selectedUnitAftercares = useMemo(() => {
    if (!selectedUnit) return [];
    return datasets.tradeAftercareCases
      .filter((c) => c.unitId === selectedUnit.id)
      .sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''));
  }, [datasets.tradeAftercareCases, selectedUnit]);

  const handleSelectUnitRow = (u: FlInventoryUnit) => {
    setSelectedUnitId(u.id);
    setWarrantyMonthsInput(Number(u.warrantyMonths ?? 12));
    setWarrantyStartInput(u.warrantyStartDate || '');
    setWarrantyEndInput(u.warrantyEndDate || '');
    setWarrantyNoteInput(u.warrantyNote || '');
  };

  const handleSaveWarranty = async () => {
    if (!selectedUnit) return;
    setWarrantySaving(true);
    try {
      let endDt = warrantyEndInput.trim();
      if (!endDt && warrantyStartInput.trim() && warrantyMonthsInput > 0) {
        const d = new Date(`${warrantyStartInput.trim().slice(0, 10)}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() + Number(warrantyMonthsInput));
        endDt = d.toISOString().slice(0, 10);
      }
      await execDbMutation('차대번호별 보증기간 저장', () =>
        flSupabase
          .from('inventory_units')
          .update(
            camelToSnakeRow({
              warrantyMonths: Math.max(0, Number(warrantyMonthsInput || 0)),
              warrantyStartDate: warrantyStartInput.trim() || null,
              warrantyEndDate: endDt || null,
              warrantyNote: warrantyNoteInput.trim() || null,
              updatedAt: new Date().toISOString(),
            })
          )
          .eq('id', selectedUnit.id)
      );
      await refreshAll();
      notifyToast('차대번호별 보증기간이 저장되었습니다.', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '보증기간 저장 실패', 'error');
    } finally {
      setWarrantySaving(false);
    }
  };

  const selectedUnitMovements = useMemo(() => {
    if (!selectedUnit) return [];
    const rentalMovementTypes = new Set([
      'ACCOUNT_TRANSFER',
      'RENTAL_OUTBOUND',
      'RENTAL_RETURN',
      'EXCHANGE_OUT',
      'EXCHANGE_IN',
      'REPAIR_OUT',
    ]);
    return datasets.stockMovements
      .filter(
        (m) =>
          m.unitId === selectedUnit.id &&
          (isRentalEnabled || !rentalMovementTypes.has(m.movementType))
      )
      .sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''));
  }, [datasets.stockMovements, isRentalEnabled, selectedUnit]);

  const canTransfer =
    isRentalEnabled &&
    canEdit &&
    selectedUnit &&
    selectedUnit.status === '보유중' &&
    (selectedUnit.itemCategory === '완제품' || selectedUnit.itemCategory === '어태치먼트');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title={
          isRentalEnabled
            ? '유통재고 선입선출 · 경과일수 현황 · 계정대체'
            : '유통재고 선입선출 · 경과일수 현황'
        }
        manualId="tinv-filter"
        rightSlot={
          (filterStartDate || filterEndDate || filterItemId || filterKeyword || agingFilter !== 'ALL') ? (
            <button
              type="button"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterItemId('');
                setFilterKeyword('');
                setAgingFilter('ALL');
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
            <SegmentedTabs
              tabs={[
                { id: 'ALL', label: '전체 기간', count: agingCounts.all },
                { id: '30', label: '30일 이상', count: agingCounts.over30 },
                { id: '60', label: '60일 이상', count: agingCounts.over60 },
                { id: '90', label: '90일 이상', count: agingCounts.over90 },
                { id: '180', label: '180일 이상', count: agingCounts.over180 },
              ]}
              activeId={agingFilter}
              onChange={(id) => setAgingFilter(id as typeof agingFilter)}
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
            key: 'elapsedDays',
            header: '경과일',
            width: 95,
            align: 'center',
            sortable: true,
            sortValue: (u) => computeElapsedDays(u.acquisitionDate, today),
            render: (u) => {
              const days = computeElapsedDays(u.acquisitionDate, today);
              return <StatusBadge label={`${days}일`} tone={agingTone(days)} />;
            },
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
          {
            key: 'warrantyEnd',
            header: '보증만료일',
            width: 105,
            sortable: true,
            sortValue: (u) => u.warrantyEndDate || '',
            render: (u) => u.warrantyEndDate || '-',
          },
          {
            key: 'warrantyStatus',
            header: '보증상태',
            width: 90,
            align: 'center',
            render: (u) => {
              const ws = getWarrantyStatus(u, today);
              return <StatusBadge label={ws.label} tone={ws.tone} />;
            },
          },
        ]}
        rows={tradeUnits}
        rowKey={(u) => u.id}
        selectedRowId={selectedUnit?.id || null}
        onRowClick={handleSelectUnitRow}
        maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
      />

      <ConservationBar
        manualId="tinv-xfer"
        items={[
          { label: '조회 건수', value: `${tradeUnits.length}건` },
          { label: '조회 장부가액 합계', value: formatMoney(totalFilteredBookValue), tone: 'primary' },
          { label: '90일 이상 장기재고', value: formatMoney(over90BookValue), tone: over90BookValue > 0 ? 'warning' : 'neutral' },
          { label: '선택 재고', value: selectedUnit ? `${selectedUnit.unitCode} · ${selectedUnit.itemName}` : '선택 없음' },
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

      {selectedUnit && (
        <SectionPanel
          title={`차대번호별 입출고 이력 · ${selectedUnit.serialNo || selectedUnit.lotNo || selectedUnit.unitCode}`}
          manualId="tinv-history"
          rightSlot={
            <StatusBadge
              label={`이력 ${selectedUnitMovements.length}건`}
              tone={selectedUnitMovements.length > 0 ? 'primary' : 'neutral'}
            />
          }
        >
          <DataGrid
            columns={[
              {
                key: 'effDate',
                header: '발생일',
                width: 110,
                render: (m) => m.effectiveDate || '-',
              },
              {
                key: 'mType',
                header: '구분',
                width: 110,
                align: 'center',
                render: (m) => (
                  <StatusBadge
                    label={formatKoStatus(m.movementType)}
                    tone={m.qtyDelta >= 0 ? 'success' : 'warning'}
                  />
                ),
              },
              {
                key: 'qtyDelta',
                header: '변동수량',
                width: 90,
                align: 'right',
                render: (m) => (
                  <span style={{ fontWeight: 700 }}>
                    {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                  </span>
                ),
              },
              {
                key: 'unitCost',
                header: '단가',
                width: 120,
                align: 'right',
                render: (m) => formatMoney(m.unitCostKrw),
              },
              {
                key: 'totalCost',
                header: '금액',
                width: 130,
                align: 'right',
                render: (m) => formatMoney(m.amountKrw),
              },
              {
                key: 'memo',
                header: '적요',
                render: (m) => m.memo || '-',
              },
            ]}
            rows={selectedUnitMovements}
            rowKey={(m) => m.id}
            emptyText="선택한 재고의 입출고 이력이 없습니다."
            maxHeight="200px"
          />
        </SectionPanel>
      )}

      {selectedUnit && (
        <SectionPanel
          title={`차대번호별 보증기간 및 사후관리 이력 · ${selectedUnit.serialNo || selectedUnit.lotNo || selectedUnit.unitCode}`}
          manualId="tinv-warranty"
          rightSlot={
            <StatusBadge
              label={`사후처리 ${selectedUnitAftercares.length}건`}
              tone={selectedUnitAftercares.length > 0 ? 'info' : 'neutral'}
            />
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            {canEdit && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 'var(--space-field-grid-gap)',
                  alignItems: 'end',
                  padding: 'var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-header)',
                }}
              >
                <VerticalField label="보증개월">
                  <input
                    type="number"
                    min={0}
                    value={warrantyMonthsInput}
                    onChange={(e) => setWarrantyMonthsInput(Number(e.target.value))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="보증 시작일">
                  <input
                    type="date"
                    value={warrantyStartInput}
                    onChange={(e) => setWarrantyStartInput(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="보증 만료일">
                  <input
                    type="date"
                    value={warrantyEndInput}
                    onChange={(e) => setWarrantyEndInput(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="보증 특약">
                  <input
                    type="text"
                    value={warrantyNoteInput}
                    onChange={(e) => setWarrantyNoteInput(e.target.value)}
                    placeholder="배터리 24개월 등"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <button
                  type="button"
                  disabled={warrantySaving}
                  onClick={handleSaveWarranty}
                  style={actionBtnStyle('primary')}
                >
                  {warrantySaving ? '저장 중' : '보증기간 저장'}
                </button>
              </div>
            )}

            <DataGrid
              columns={[
                { key: 'caseNo', header: '사건번호', width: 135, render: (c) => c.caseNo },
                { key: 'eff', header: '기준일', width: 105, render: (c) => c.effectiveDate },
                { key: 'type', header: '처리유형', width: 120, render: (c) => <StatusBadge label={c.caseType} tone="info" /> },
                {
                  key: 'warrantyApplied',
                  header: '보증적용',
                  width: 90,
                  align: 'center',
                  render: (c) => (
                    <StatusBadge
                      label={c.warrantyApplied ? '무상보증' : '일반'}
                      tone={c.warrantyApplied ? 'success' : 'neutral'}
                    />
                  ),
                },
                { key: 'sup', header: '연결공급사', width: 140, render: (c) => c.supplierName || '-' },
                { key: 'memo', header: '내용', render: (c) => c.memo || '-' },
              ]}
              rows={selectedUnitAftercares}
              rowKey={(c) => c.id}
              emptyText="선택한 차대번호의 사후관리 이력이 없습니다."
              maxHeight="180px"
            />
          </div>
        </SectionPanel>
      )}
    </div>
  );
};
