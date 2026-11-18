import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import { computeUnitDepreciationAsOf, currentYm, todayIso } from '../../services/domainMath';
import { allocateSequentialUnitCodes, createFinanceLeaseWithAsset } from '../../services/domainProcurementLeaseEngine';
import { executeAccountTransfer } from '../../services/domainFulfillmentEngine';
import {
  SearchableSelect,
  toItemMasterSelectOptions,
  toPartnerSelectOptions,
} from '../../components/SearchableSelect';
import {
  CommaNumberInput,
  ConservationBar,
  DataGrid,
  ModalDialog,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  formatKoAcquisitionType,
  formatKoStatus,
  type FlInventoryUnit,
} from '../../types/domain';

export const RentalAssetsPage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('rental_assets');
  const today = todayIso();

  const [tab, setTab] = useState<'LEDGER' | 'LEASE'>('LEDGER');

  const rentalAssets = useMemo(
    () =>
      datasets.inventoryUnits.filter(
        (u) => u.ownershipDomain === '렌탈자산' || u.ownershipDomain === '전대자산'
      ),
    [datasets.inventoryUnits]
  );

  const curYm = currentYm();
  const depByUnitId = useMemo(() => {
    const map = new Map<string, { accumDep: number; endingBookValue: number }>();
    for (const u of rentalAssets) {
      const res = computeUnitDepreciationAsOf(u, curYm, curYm, datasets.stockMovements);
      map.set(u.id, { accumDep: res.accumDep, endingBookValue: res.endingBookValue });
    }
    return map;
  }, [curYm, datasets.stockMovements, rentalAssets]);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(rentalAssets[0]?.id || null);
  const selectedAsset =
    rentalAssets.find((u) => u.id === selectedAssetId) || rentalAssets[0] || null;
  const selectedAssetDep = selectedAsset ? depByUnitId.get(selectedAsset.id) : undefined;
  const [transferDate, setTransferDate] = useState(today);

  // 전대자산 등록 모달 상태
  const [subleaseOpen, setSubleaseOpen] = useState(false);
  const subleaseSuppliers = useMemo(() => {
    const matched = datasets.partners.filter((p) => p.partnerRoles.includes('전대공급처'));
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);
  const equipItems = useMemo(() => {
    const matched = datasets.itemMasters.filter(
      (i) => (i.itemDomain === 'RENTAL' || i.itemDomain === 'BOTH') && i.itemCategory === '완제품'
    );
    return matched.length > 0 ? matched : datasets.itemMasters;
  }, [datasets.itemMasters]);

  const [subItemId, setSubItemId] = useState(equipItems[0]?.id || '');
  const [subSupplierId, setSubSupplierId] = useState(subleaseSuppliers[0]?.id || '');
  const [subSerial, setSubSerial] = useState('');
  const [subCost, setSubCost] = useState(500000);
  const [subBusy, setSubBusy] = useState(false);

  // 금융리스 폼 상태
  const lenders = useMemo(() => {
    const matched = datasets.partners.filter((p) => p.partnerRoles.includes('금융사'));
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

  const [lenderId, setLenderId] = useState(lenders[0]?.id || '');
  const [leaseItemId, setLeaseItemId] = useState(equipItems[0]?.id || '');
  const [leaseSerial, setLeaseSerial] = useState('');
  const [principal, setPrincipal] = useState(32000000);
  const [annualRate, setAnnualRate] = useState(5.4);
  const [termMonths, setTermMonths] = useState(36);
  const [repayMethod, setRepayMethod] = useState<'원리금균등' | '원금균등'>('원리금균등');
  const [leaseStart, setLeaseStart] = useState(today);
  const [paymentDay, setPaymentDay] = useState(25);
  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(
    datasets.financeLeases[0]?.id || null
  );

  const activeLease =
    datasets.financeLeases.find((l) => l.id === selectedLeaseId) ||
    datasets.financeLeases[0] ||
    null;

  const activeSchedules = useMemo(
    () =>
      activeLease
        ? datasets.financeLeaseSchedules
            .filter((s) => s.leaseId === activeLease.id)
            .sort((a, b) => a.installmentNo - b.installmentNo)
        : [],
    [activeLease, datasets.financeLeaseSchedules]
  );

  const handleCreateSublease = async () => {
    const item = equipItems.find((i) => i.id === (subItemId || equipItems[0]?.id));
    const sup = subleaseSuppliers.find((s) => s.id === (subSupplierId || subleaseSuppliers[0]?.id));
    if (!item || !sup || !subSerial.trim()) {
      notifyToast('기종, 전대공급처, 시리얼번호를 입력해 주세요.', 'error');
      return;
    }
    setSubBusy(true);
    try {
      const id = newId('UNIT');
      const [unitCode] = await allocateSequentialUnitCodes(today, 1);
      const unit: FlInventoryUnit = {
        id,
        tenantId: DEFAULT_TENANT_ID,
        unitCode,
        itemId: item.id,
        sku: item.sku,
        itemName: item.name,
        itemCategory: item.itemCategory,
        managementType: 'SERIAL',
        ownershipDomain: '전대자산',
        serialNo: subSerial.trim(),
        qtyOnHand: 1,
        qtyReserved: 0,
        unitCostKrw: 0,
        accumulatedDepreciationKrw: 0,
        bookValueKrw: 0,
        depreciationMonths: 0,
        residualValueKrw: 0,
        status: '보유중',
        acquisitionType: 'SUBLEASE',
        acquisitionDate: today,
        subleaseSupplierId: sup.id,
        subleaseSupplierName: sup.name,
        subleaseMonthlyCostKrw: Math.round(subCost || 0),
        warehouseLocation: '전대입고',
        operatingHours: 0,
        monthlyRentalFeeKrw: item.standardMonthlyRentalKrw,
        dailyRentalFeeKrw: item.standardDailyRentalKrw,
      };
      await execDbMutation('전대자산 등록', () =>
        flSupabase.from('inventory_units').insert(camelToSnakeRow({ ...unit }))
      );
      setSubleaseOpen(false);
      setSubSerial('');
      await refreshAll();
      notifyToast('전대자산 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '전대자산 등록 실패', 'error');
    } finally {
      setSubBusy(false);
    }
  };

  const buildLeasePayload = () => {
    const lender = lenders.find((l) => l.id === (lenderId || lenders[0]?.id));
    const item = equipItems.find((i) => i.id === (leaseItemId || equipItems[0]?.id));
    if (!lender || !item || !leaseSerial.trim()) {
      notifyToast('금융사, 기종, 차대 시리얼번호를 입력해 주세요.', 'error');
      return null;
    }
    return {
      lenderPartnerId: lender.id,
      itemId: item.id,
      sku: item.sku,
      itemName: item.name,
      serialNo: leaseSerial.trim(),
      principalAmountKrw: Math.round(principal),
      annualInterestRate: Number(annualRate),
      termMonths: Number(termMonths),
      repaymentMethod: repayMethod,
      startDate: leaseStart,
      paymentDay: Number(paymentDay || 25),
      monthlyRentalFeeKrw: item.standardMonthlyRentalKrw,
      dailyRentalFeeKrw: item.standardDailyRentalKrw,
    };
  };

  const canTransferToTrade =
    canEdit &&
    selectedAsset &&
    selectedAsset.ownershipDomain === '렌탈자산' &&
    selectedAsset.status === '보유중' &&
    selectedAsset.acquisitionType !== 'FINANCE_LEASE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="렌탈 자산 · 금융리스 관리"
        manualId="rast-tabs"
        rightSlot={
          <div style={{ display: 'flex', gap: 'var(--space-inline-gap)', alignItems: 'center', flexWrap: 'wrap' }}>
            {canEdit && tab === 'LEDGER' && (
              <button
                type="button"
                onClick={() => setSubleaseOpen(true)}
                style={actionBtnStyle('secondary', true)}
              >
                전대자산 입고
              </button>
            )}
            <SegmentedTabs
              tabs={[
                { id: 'LEDGER', label: '렌탈 · 전대 자산원장', count: rentalAssets.length },
                { id: 'LEASE', label: '금융리스 상환스케줄', count: datasets.financeLeases.length },
              ]}
              activeId={tab}
              onChange={(id) => setTab(id as typeof tab)}
            />
          </div>
        }
      >
        {tab === 'LEDGER' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <DataGrid
              columns={[
                { key: 'unitCode', header: '자산번호', width: 130, render: (u) => <span style={{ fontWeight: 700 }}>{u.unitCode}</span> },
                {
                  key: 'domain',
                  header: '소유구분',
                  width: 90,
                  align: 'center',
                  render: (u) => (
                    <StatusBadge
                      label={u.ownershipDomain}
                      tone={u.ownershipDomain === '렌탈자산' ? 'primary' : 'info'}
                    />
                  ),
                },
                { key: 'itemName', header: '모델명', render: (u) => u.itemName },
                { key: 'serialNo', header: '시리얼', width: 140, render: (u) => u.serialNo || '-' },
                { key: 'acqType', header: '취득방식', width: 115, render: (u) => formatKoAcquisitionType(u.acquisitionType) },
                {
                  key: 'cost',
                  header: '취득원가',
                  width: 120,
                  align: 'right',
                  render: (u) => formatMoney(u.unitCostKrw),
                },
                {
                  key: 'dep',
                  header: '상각누계',
                  width: 115,
                  align: 'right',
                  render: (u) =>
                    formatMoney(depByUnitId.get(u.id)?.accumDep ?? u.accumulatedDepreciationKrw),
                },
                {
                  key: 'bv',
                  header: '장부가액',
                  width: 120,
                  align: 'right',
                  render: (u) => (
                    <span style={{ fontWeight: 700 }}>
                      {formatMoney(depByUnitId.get(u.id)?.endingBookValue ?? u.bookValueKrw)}
                    </span>
                  ),
                },
                {
                  key: 'hours',
                  header: '가동시간',
                  width: 85,
                  align: 'right',
                  render: (u) => `${u.operatingHours}시간`,
                },
                {
                  key: 'status',
                  header: '상태',
                  width: 85,
                  align: 'center',
                  render: (u) => (
                    <StatusBadge
                      label={formatKoStatus(u.status)}
                      tone={
                        u.status === '대여중'
                          ? 'primary'
                          : u.status === '보유중'
                            ? 'success'
                            : 'warning'
                      }
                    />
                  ),
                },
              ]}
              rows={rentalAssets}
              rowKey={(u) => u.id}
              selectedRowId={selectedAsset?.id || null}
              onRowClick={(u) => setSelectedAssetId(u.id)}
              maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
            />

            <ConservationBar
              manualId="rast-xfer"
              items={[
                {
                  label: '선택 자산',
                  value: selectedAsset ? `${selectedAsset.unitCode} · ${selectedAsset.serialNo || selectedAsset.itemName}` : '선택 없음',
                },
                {
                  label: '승계 장부가액',
                  value: selectedAsset
                    ? formatMoney(selectedAssetDep?.endingBookValue ?? selectedAsset.bookValueKrw)
                    : '₩0',
                  tone: 'primary',
                },
              ]}
            >
              {canTransferToTrade && selectedAsset && (
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
                    targetId={selectedAsset.id}
                    title={`렌탈자산 유통재고 계정대체 · ${selectedAsset.unitCode}`}
                    buildPayload={() => ({
                      unitId: selectedAsset.id,
                      toDomain: '유통재고',
                      effectiveDate: transferDate,
                    })}
                    onExecuteDirect={async () => {
                      if (!currentUser) return;
                      const exactUnit: FlInventoryUnit = {
                        ...selectedAsset,
                        accumulatedDepreciationKrw:
                          selectedAssetDep?.accumDep ?? selectedAsset.accumulatedDepreciationKrw,
                        bookValueKrw:
                          selectedAssetDep?.endingBookValue ?? selectedAsset.bookValueKrw,
                      };
                      await executeAccountTransfer({
                        unit: exactUnit,
                        toDomain: '유통재고',
                        effectiveDate: transferDate,
                        actorId: currentUser.id,
                        actorName: currentUser.name,
                      });
                      await refreshAll();
                      notifyToast('유통재고 계정대체 완료', 'success');
                    }}
                    label="유통재고 전환"
                  />
                </div>
              )}
            </ConservationBar>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
            {canEdit && (
              <div
                data-manual-id="rast-lease"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                  gap: 'var(--space-field-grid-gap)',
                  alignItems: 'end',
                  padding: 'var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--table-border-color)',
                  backgroundColor: 'var(--bg-header)',
                }}
              >
                <VerticalField label="금융사" required>
                  <SearchableSelect
                    value={lenderId || lenders[0]?.id || ''}
                    options={toPartnerSelectOptions(lenders)}
                    onChange={(nextId) => setLenderId(nextId)}
                    placeholder="금융사 선택"
                    searchPlaceholder="금융사명 · 초성 · 사업자번호 검색"
                    minDropdownWidth={260}
                  />
                </VerticalField>
                <VerticalField label="취득 장비 기종" required>
                  <SearchableSelect
                    value={leaseItemId || equipItems[0]?.id || ''}
                    options={toItemMasterSelectOptions(equipItems)}
                    onChange={(nextId) => setLeaseItemId(nextId)}
                    placeholder="취득 장비 기종 선택"
                    searchPlaceholder="품명 · 초성 · 품번 · 제조사 검색"
                    minDropdownWidth={300}
                  />
                </VerticalField>
                <VerticalField label="시리얼번호" required>
                  <input
                    type="text"
                    value={leaseSerial}
                    onChange={(e) => setLeaseSerial(e.target.value)}
                    placeholder="차대번호 입력"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="리스원금" required>
                  <CommaNumberInput min={0} value={principal} onChange={setPrincipal} />
                </VerticalField>
                <VerticalField label="연이자율 %" required>
                  <input
                    type="number"
                    step="0.01"
                    value={annualRate}
                    onChange={(e) => setAnnualRate(Number(e.target.value))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="상환개월수" required>
                  <CommaNumberInput min={1} value={termMonths} onChange={setTermMonths} />
                </VerticalField>
                <VerticalField label="상환방식" required>
                  <select
                    value={repayMethod}
                    onChange={(e) => setRepayMethod(e.target.value as '원리금균등' | '원금균등')}
                    style={controlInputStyle}
                  >
                    <option value="원리금균등">원리금균등</option>
                    <option value="원금균등">원금균등</option>
                  </select>
                </VerticalField>
                <VerticalField label="실행시작일" required>
                  <input
                    type="date"
                    value={leaseStart}
                    onChange={(e) => setLeaseStart(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="월납입일">
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={paymentDay}
                    onChange={(e) => setPaymentDay(Number(e.target.value))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <CommitActionButton
                  actionCode="LEASE_CREATE"
                  targetTable="fl_finance_leases"
                  targetId="NEW_LEASE"
                  title={`금융리스 등록 · ${leaseSerial || '장비'}`}
                  buildPayload={buildLeasePayload}
                  onExecuteDirect={async () => {
                    if (!currentUser) return;
                    const p = buildLeasePayload();
                    if (!p) return;
                    const lender = lenders.find((l) => l.id === p.lenderPartnerId)!;
                    const res = await createFinanceLeaseWithAsset({
                      lender,
                      itemId: p.itemId,
                      sku: p.sku,
                      itemName: p.itemName,
                      serialNo: p.serialNo,
                      principalAmountKrw: p.principalAmountKrw,
                      annualInterestRate: p.annualInterestRate,
                      termMonths: p.termMonths,
                      repaymentMethod: p.repaymentMethod,
                      startDate: p.startDate,
                      paymentDay: p.paymentDay,
                      monthlyRentalFeeKrw: p.monthlyRentalFeeKrw,
                      dailyRentalFeeKrw: p.dailyRentalFeeKrw,
                      actorName: currentUser.name,
                    });
                    setLeaseSerial('');
                    setSelectedLeaseId(res.lease.id);
                    await refreshAll();
                    notifyToast('금융리스 및 36회차 상환표 생성 완료', 'success');
                  }}
                  label="리스 등록"
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.4fr)', gap: 'var(--space-stack-gap)' }}>
              <DataGrid
                columns={[
                  { key: 'leaseNo', header: '리스번호', width: 120, render: (l) => l.leaseNo },
                  { key: 'lenderName', header: '금융사', render: (l) => l.lenderName },
                  { key: 'serialNo', header: '시리얼', width: 120, render: (l) => l.serialNo || '-' },
                  {
                    key: 'rate',
                    header: '금리 · 방식',
                    width: 115,
                    render: (l) => `${l.annualInterestRate}% · ${l.repaymentMethod}`,
                  },
                  {
                    key: 'rem',
                    header: '잔여원금',
                    width: 120,
                    align: 'right',
                    render: (l) => formatMoney(l.remainingPrincipalKrw),
                  },
                ]}
                rows={datasets.financeLeases}
                rowKey={(l) => l.id}
                selectedRowId={activeLease?.id || null}
                onRowClick={(l) => setSelectedLeaseId(l.id)}
                maxHeight="calc(100vh - 260px)"
              />

              <DataGrid
                columns={[
                  { key: 'no', header: '회차', width: 55, align: 'center', render: (s) => s.installmentNo },
                  { key: 'dueDate', header: '납입일', width: 100, render: (s) => s.dueDate },
                  {
                    key: 'prin',
                    header: '원금상환',
                    width: 105,
                    align: 'right',
                    render: (s) => formatMoney(s.principalPaymentKrw),
                  },
                  {
                    key: 'int',
                    header: '이자비용',
                    width: 100,
                    align: 'right',
                    render: (s) => formatMoney(s.interestExpenseKrw),
                  },
                  {
                    key: 'tot',
                    header: '납입합계',
                    width: 110,
                    align: 'right',
                    render: (s) => formatMoney(s.totalInstallmentKrw),
                  },
                  {
                    key: 'end',
                    header: '잔여원금',
                    width: 110,
                    align: 'right',
                    render: (s) => formatMoney(s.endingPrincipalKrw),
                  },
                  {
                    key: 'paid',
                    header: '상태',
                    width: 75,
                    align: 'center',
                    render: (s) => (
                      <StatusBadge label={s.isPaid ? '납입' : '미납'} tone={s.isPaid ? 'success' : 'neutral'} />
                    ),
                  },
                ]}
                rows={activeSchedules}
                rowKey={(s) => s.id}
                maxHeight="calc(100vh - 260px)"
              />
            </div>
          </div>
        )}
      </SectionPanel>

      <ModalDialog
        open={subleaseOpen}
        title="외부 전대자산 등록"
        onClose={() => setSubleaseOpen(false)}
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <VerticalField label="전대공급처" required>
            <SearchableSelect
              value={subSupplierId || subleaseSuppliers[0]?.id || ''}
              options={toPartnerSelectOptions(subleaseSuppliers)}
              onChange={(nextId) => setSubSupplierId(nextId)}
              placeholder="전대공급처 선택"
              searchPlaceholder="전대공급처명 · 초성 · 사업자번호 검색"
              minDropdownWidth={280}
            />
          </VerticalField>
          <VerticalField label="기종 품목" required>
            <SearchableSelect
              value={subItemId || equipItems[0]?.id || ''}
              options={toItemMasterSelectOptions(equipItems)}
              onChange={(nextId) => setSubItemId(nextId)}
              placeholder="기종 품목 선택"
              searchPlaceholder="품명 · 초성 · 품번 · 제조사 검색"
              minDropdownWidth={300}
            />
          </VerticalField>
          <VerticalField label="장비 시리얼" required>
            <input
              type="text"
              value={subSerial}
              onChange={(e) => setSubSerial(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="월 전대임차원가" required>
            <CommaNumberInput min={0} value={subCost} onChange={setSubCost} />
          </VerticalField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
            <button
              type="button"
              onClick={() => setSubleaseOpen(false)}
              style={actionBtnStyle('secondary')}
            >
              취소
            </button>
            <button
              type="button"
              disabled={subBusy}
              onClick={handleCreateSublease}
              style={actionBtnStyle('primary')}
            >
              전대자산 저장
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
