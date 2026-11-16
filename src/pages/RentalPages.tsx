import React, { useMemo, useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { CommitActionButton } from '../core/ActionCommandGateway';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../core/supabase';
import {
  addDaysIso,
  calculateRentalProRataForMonth,
  completeFulfillment,
  createFinanceLeaseWithAsset,
  executeAccountTransfer,
  executeRentalExchange,
  recordRentalMaintenance,
  sortUnitsFifo,
} from '../services/domainEngine';
import { generateContractExcel } from '../services/documentService';
import {
  ConservationBar,
  DataGrid,
  DocumentActionBar,
  ModalDialog,
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
  formatKoAcquisitionType,
  formatKoStatus,
  koStatusTone,
  type FlContract,
  type FlContractLine,
  type FlFulfillment,
  type FlInventoryUnit,
  type FlRentalMaintenance,
} from '../types/domain';

function listMonthsBetween(fromYm: string, toYm: string): string[] {
  if (!fromYm || !toYm || fromYm > toYm) return [];
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

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
  const today = new Date().toISOString().slice(0, 10);

  const rentalContracts = useMemo(
    () =>
      datasets.contracts
        .filter((c) => c.contractDomain === 'RENTAL')
        .sort((a, b) => b.contractDate.localeCompare(a.contractDate)),
    [datasets.contracts]
  );

  const customers = useMemo(() => {
    const matched = datasets.partners.filter(
      (p) => p.partnerRoles.includes('매출처') || p.partnerRoles.includes('대리점')
    );
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

  const rentalItems = useMemo(() => {
    const matched = datasets.itemMasters.filter(
      (i) =>
        (i.itemDomain === 'RENTAL' || i.itemDomain === 'BOTH') &&
        (i.itemCategory === '완제품' || i.itemCategory === '어태치먼트')
    );
    return matched.length > 0 ? matched : datasets.itemMasters;
  }, [datasets.itemMasters]);

  const [selectedId, setSelectedId] = useState<string | null>(rentalContracts[0]?.id || null);
  const [partnerId, setPartnerId] = useState(customers[0]?.id || '');
  const [itemId, setItemId] = useState(rentalItems[0]?.id || '');
  const [qty, setQty] = useState(1);
  const [monthlyPriceKrw, setMonthlyPriceKrw] = useState(
    rentalItems[0]?.standardMonthlyRentalKrw || 800000
  );
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDaysIso(today, 365));
  const [closingDay, setClosingDay] = useState(31);
  const [paymentDueDay, setPaymentDueDay] = useState(15);
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
    const ctr: FlContract = {
      id: ctrId,
      tenantId: DEFAULT_TENANT_ID,
      contractNo: ctrId,
      contractDomain: 'RENTAL',
      partnerId: partner.id,
      partnerName: partner.name,
      salespersonId: currentUser?.id || 'USR_ADMIN',
      salespersonName: currentUser?.name || '영업담당',
      contractDate: today,
      startDate,
      endDate,
      closingDay: Number(closingDay || partner.defaultClosingDay || 31),
      paymentDueDay: Number(paymentDueDay || partner.defaultPaymentDueDay || 15),
      paymentMonthOffset: partner.defaultPaymentMonthOffset ?? 1,
      paymentMethod: partner.paymentMethod || '계좌이체',
      supplyAmountKrw: monthlySupply,
      vatAmountKrw: vat,
      totalAmountKrw: monthlySupply + vat,
      monthlyRentalKrw: monthlySupply,
      dailyRentalKrw: Math.round(monthlySupply / 30),
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
      unitPriceKrw: Math.round(monthlyPriceKrw || 0),
      supplyAmountKrw: monthlySupply,
      vatAmountKrw: vat,
      totalAmountKrw: monthlySupply + vat,
      lineStatus: 'ACTIVE',
      effectiveStartDate: startDate,
      effectiveEndDate: endDate,
    };
    setBusy(true);
    try {
      await execDbMutation('렌탈 계약 등록', () =>
        flSupabase.from('contracts').insert(camelToSnakeRow({ ...ctr }))
      );
      await execDbMutation('렌탈 계약 품목 등록', () =>
        flSupabase.from('contract_lines').insert(camelToSnakeRow({ ...line }))
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
    const targetLines =
      actionType === '렌탈출고'
        ? selectedLines.filter((l) => l.lineStatus === 'ACTIVE' && l.fulfilledQty < l.quantity)
        : selectedLines.filter((l) => l.lineStatus === 'FULFILLED' && Boolean(l.assignedUnitId));
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
      for (const line of targetLines) {
        const ful: FlFulfillment = {
          id: newId('FUL'),
          tenantId: DEFAULT_TENANT_ID,
          fulfillmentNo: `FUL-${Date.now().toString(36).toUpperCase()}`,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
            <VerticalField label="임차 거래처" required>
              <SearchableSelect
                value={partnerId || customers[0]?.id || ''}
                options={toPartnerSelectOptions(customers)}
                onChange={(id) => {
                  setPartnerId(id);
                  const pt = customers.find((p) => p.id === id);
                  if (pt) {
                    setClosingDay(pt.defaultClosingDay || 31);
                    setPaymentDueDay(pt.defaultPaymentDueDay || 15);
                  }
                }}
                placeholder="임차 거래처 선택"
                searchPlaceholder="거래처명 · 초성 · 사업자번호 검색"
                minDropdownWidth={280}
              />
            </VerticalField>
            <VerticalField label="계약 기종 품목" required minWidth={210}>
              <select
                value={itemId || rentalItems[0]?.id || ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setItemId(id);
                  const it = rentalItems.find((x) => x.id === id);
                  if (it) setMonthlyPriceKrw(it.standardMonthlyRentalKrw);
                }}
                style={controlInputStyle}
              >
                {rentalItems.map((it) => (
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
            <VerticalField label="월 임대단가">
              <input
                type="number"
                disabled={Boolean(currentUser?.maskSalesPrice)}
                value={currentUser?.maskSalesPrice ? 0 : monthlyPriceKrw}
                onChange={(e) => setMonthlyPriceKrw(Number(e.target.value))}
                style={controlInputStyle}
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
            <VerticalField label="청구마감일">
              <input
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="납부기일">
              <input
                type="number"
                min={1}
                max={31}
                value={paymentDueDay}
                onChange={(e) => setPaymentDueDay(Number(e.target.value))}
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
          title={`선택 렌탈 계약 · ${selectedContract.contractNo} · ${selectedContract.partnerName}`}
          rightSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                <div data-manual-id="rctr-actions" style={{ display: 'inline-flex', gap: '6px' }}>
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
        maxHeight="340px"
      />
    </div>
  );
};

export const RentalAssetsPage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('rental_assets');
  const today = new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<'LEDGER' | 'LEASE'>('LEDGER');

  const rentalAssets = useMemo(
    () =>
      datasets.inventoryUnits.filter(
        (u) => u.ownershipDomain === '렌탈자산' || u.ownershipDomain === '전대자산'
      ),
    [datasets.inventoryUnits]
  );

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(rentalAssets[0]?.id || null);
  const selectedAsset =
    rentalAssets.find((u) => u.id === selectedAssetId) || rentalAssets[0] || null;
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
      const unit: FlInventoryUnit = {
        id,
        tenantId: DEFAULT_TENANT_ID,
        unitCode: id,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel
        title="렌탈 자산 · 금융리스 관리"
        manualId="rast-tabs"
        rightSlot={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                  render: (u) => formatMoney(u.accumulatedDepreciationKrw),
                },
                {
                  key: 'bv',
                  header: '장부가액',
                  width: 120,
                  align: 'right',
                  render: (u) => <span style={{ fontWeight: 700 }}>{formatMoney(u.bookValueKrw)}</span>,
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
              maxHeight="470px"
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
                  value: selectedAsset ? formatMoney(selectedAsset.bookValueKrw) : '₩0',
                  tone: 'primary',
                },
              ]}
            >
              {canTransferToTrade && selectedAsset && (
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
                    targetId={selectedAsset.id}
                    title={`렌탈자산 유통재고 계정대체 · ${selectedAsset.unitCode}`}
                    buildPayload={() => ({
                      unitId: selectedAsset.id,
                      toDomain: '유통재고',
                      effectiveDate: transferDate,
                    })}
                    onExecuteDirect={async () => {
                      if (!currentUser) return;
                      await executeAccountTransfer({
                        unit: selectedAsset,
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {canEdit && (
              <div
                data-manual-id="rast-lease"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                  gap: '10px',
                  alignItems: 'end',
                  padding: '12px',
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
                  <select
                    value={leaseItemId || equipItems[0]?.id || ''}
                    onChange={(e) => setLeaseItemId(e.target.value)}
                    style={controlInputStyle}
                  >
                    {equipItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.sku} · {it.name}
                      </option>
                    ))}
                  </select>
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
                  <input
                    type="number"
                    value={principal}
                    onChange={(e) => setPrincipal(Number(e.target.value))}
                    style={controlInputStyle}
                  />
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
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={termMonths}
                    onChange={(e) => setTermMonths(Number(e.target.value))}
                    style={controlInputStyle}
                  />
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

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.4fr)', gap: '12px' }}>
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
                maxHeight="390px"
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
                maxHeight="390px"
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            <select
              value={subItemId || equipItems[0]?.id || ''}
              onChange={(e) => setSubItemId(e.target.value)}
              style={controlInputStyle}
            >
              {equipItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku} · {i.name}
                </option>
              ))}
            </select>
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
            <input
              type="number"
              value={subCost}
              onChange={(e) => setSubCost(Number(e.target.value))}
              style={controlInputStyle}
            />
          </VerticalField>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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

export const RentalFulfillmentPage: React.FC = () => {
  const { currentUser, datasets, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('rental_fulfillment');
  const today = new Date().toISOString().slice(0, 10);

  const rentalFulfillments = useMemo(
    () =>
      datasets.fulfillments
        .filter((f) => f.fulfillmentDomain === 'RENTAL')
        .sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || '')),
    [datasets.fulfillments]
  );

  const [selectedFulId, setSelectedFulId] = useState<string | null>(
    rentalFulfillments.find((f) => f.status === 'REQUESTED')?.id || rentalFulfillments[0]?.id || null
  );
  const selectedFul =
    rentalFulfillments.find((f) => f.id === selectedFulId) || rentalFulfillments[0] || null;
  const selectedFulLine = selectedFul
    ? datasets.contractLines.find((l) => l.id === selectedFul.contractLineId)
    : undefined;

  const availableRentalUnits = useMemo(
    () =>
      sortUnitsFifo(
        datasets.inventoryUnits.filter(
          (u) =>
            (u.ownershipDomain === '렌탈자산' || u.ownershipDomain === '전대자산') &&
            u.status === '보유중'
        )
      ),
    [datasets.inventoryUnits]
  );

  const [chosenUnitId, setChosenUnitId] = useState('');
  const [effDate, setEffDate] = useState(today);
  const [returnToRepair, setReturnToRepair] = useState(false);

  const resolvedUnit = useMemo(() => {
    if (!selectedFul) return null;
    if (selectedFul.actionType === '렌탈회수') {
      const targetId = selectedFul.unitId || selectedFulLine?.assignedUnitId;
      return datasets.inventoryUnits.find((u) => u.id === targetId) || null;
    }
    const matching = availableRentalUnits.filter((u) => u.itemId === selectedFul.itemId);
    const pool = matching.length > 0 ? matching : availableRentalUnits;
    return pool.find((u) => u.id === chosenUnitId) || pool[0] || null;
  }, [availableRentalUnits, chosenUnitId, datasets.inventoryUnits, selectedFul, selectedFulLine]);

  // 단일 교환 섹션 상태
  const activeRentedLines = useMemo(
    () =>
      datasets.contractLines.filter((l) => {
        if (l.lineStatus !== 'FULFILLED' || !l.assignedUnitId) return false;
        const c = datasets.contracts.find((x) => x.id === l.contractId);
        return c?.contractDomain === 'RENTAL';
      }),
    [datasets.contractLines, datasets.contracts]
  );

  const [exOldLineId, setExOldLineId] = useState(activeRentedLines[0]?.id || '');
  const [exNewUnitId, setExNewUnitId] = useState(availableRentalUnits[0]?.id || '');
  const [exDate, setExDate] = useState(today);
  const [exRepair, setExRepair] = useState(true);
  const [exMemo, setExMemo] = useState('');

  const oldLineObj =
    activeRentedLines.find((l) => l.id === (exOldLineId || activeRentedLines[0]?.id)) || null;
  const oldContractObj = oldLineObj
    ? datasets.contracts.find((c) => c.id === oldLineObj.contractId) || null
    : null;
  const oldUnitObj = oldLineObj?.assignedUnitId
    ? datasets.inventoryUnits.find((u) => u.id === oldLineObj.assignedUnitId) || null
    : null;
  const newUnitObj =
    availableRentalUnits.find((u) => u.id === (exNewUnitId || availableRentalUnits[0]?.id)) ||
    null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel title="렌탈 출고 · 회수 실행완료" manualId="rful-exec">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <DataGrid
            columns={[
              { key: 'no', header: '의뢰번호', width: 140, render: (f) => <span style={{ fontWeight: 700 }}>{f.fulfillmentNo}</span> },
              {
                key: 'act',
                header: '구분',
                width: 90,
                align: 'center',
                render: (f) => (
                  <StatusBadge
                    label={f.actionType}
                    tone={f.actionType === '교환' ? 'warning' : 'primary'}
                  />
                ),
              },
              { key: 'partner', header: '임차 거래처', render: (f) => f.partnerName },
              { key: 'eff', header: '희망완료일', width: 110, render: (f) => f.effectiveDate || '-' },
              {
                key: 'rec',
                header: '입력일시',
                width: 150,
                render: (f) => (f.recordedAt ? f.recordedAt.slice(0, 16).replace('T', ' ') : '-'),
              },
              {
                key: 'status',
                header: '상태',
                width: 95,
                align: 'center',
                render: (f) => (
                  <StatusBadge
                    label={FULFILLMENT_STATUS_KO_LABELS[f.status] || formatKoStatus(f.status)}
                    tone={koStatusTone(f.status)}
                  />
                ),
              },
            ]}
            rows={rentalFulfillments}
            rowKey={(f) => f.id}
            selectedRowId={selectedFul?.id || null}
            onRowClick={(f) => {
              setSelectedFulId(f.id);
              setChosenUnitId('');
            }}
            maxHeight="250px"
          />

          {canEdit && selectedFul && selectedFul.status === 'REQUESTED' && selectedFulLine && (
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
              {selectedFul.actionType === '렌탈출고' ? (
                <VerticalField label="배정 렌탈자산 · 전대자산 선택" required minWidth={270} flex={1}>
                  <select
                    value={resolvedUnit?.id || ''}
                    onChange={(e) => setChosenUnitId(e.target.value)}
                    style={controlInputStyle}
                  >
                    {availableRentalUnits.length === 0 ? (
                      <option value="">보유중 렌탈자산이 없습니다</option>
                    ) : (
                      availableRentalUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unitCode} · {u.itemName} · {u.serialNo || '-'} [{u.ownershipDomain}]
                        </option>
                      ))
                    )}
                  </select>
                </VerticalField>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span>회수 대상 장비: {resolvedUnit?.unitCode || '-'} · {resolvedUnit?.serialNo || '-'}</span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={returnToRepair}
                      onChange={(e) => setReturnToRepair(e.target.checked)}
                    />
                    회수 후 정비중 전환
                  </label>
                </div>
              )}

              <VerticalField label="희망완료일" required width={150}>
                <input
                  type="date"
                  value={effDate}
                  onChange={(e) => setEffDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>

              <CommitActionButton
                actionCode="FULFILLMENT_COMPLETE"
                targetTable="fl_fulfillments"
                targetId={selectedFul.id}
                title={`${selectedFul.actionType} 실행완료 · ${selectedFul.fulfillmentNo}`}
                disabled={!resolvedUnit}
                buildPayload={() =>
                  resolvedUnit
                    ? {
                        fulfillmentId: selectedFul.id,
                        unitId: resolvedUnit.id,
                        effectiveDate: effDate,
                        returnToRepair,
                      }
                    : null
                }
                onExecuteDirect={async () => {
                  if (!currentUser || !resolvedUnit) return;
                  await completeFulfillment({
                    fulfillment: selectedFul,
                    contractLine: selectedFulLine,
                    unit: resolvedUnit,
                    effectiveDate: effDate,
                    actorId: currentUser.id,
                    actorName: currentUser.name,
                    returnToRepair,
                  });
                  await refreshAll();
                  notifyToast(`${selectedFul.actionType} 실행완료 처리됨`, 'success');
                }}
                label="실행완료"
              />
            </div>
          )}
        </div>
      </SectionPanel>

      <SectionPanel
        title="렌탈 단일 교환 실행 · 전일 마감 및 후장비 계약 조건 자동 상속"
        manualId="rful-exchange"
      >
        {canEdit ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <VerticalField label="교환 대상 대여중 계약 · 전자산" required>
              <select
                value={oldLineObj?.id || ''}
                onChange={(e) => setExOldLineId(e.target.value)}
                style={controlInputStyle}
              >
                {activeRentedLines.length === 0 ? (
                  <option value="">대여중 렌탈 계약 품목 없음</option>
                ) : (
                  activeRentedLines.map((l) => {
                    const c = datasets.contracts.find((x) => x.id === l.contractId);
                    return (
                      <option key={l.id} value={l.id}>
                        {c?.partnerName || ''} · {l.itemName} · {l.assignedSerialNo || l.assignedUnitId}
                      </option>
                    );
                  })
                )}
              </select>
            </VerticalField>
            <VerticalField label="교환 투입 후장비" required>
              <select
                value={newUnitObj?.id || ''}
                onChange={(e) => setExNewUnitId(e.target.value)}
                style={controlInputStyle}
              >
                {availableRentalUnits.length === 0 ? (
                  <option value="">투입 가능 보유중 장비 없음</option>
                ) : (
                  availableRentalUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitCode} · {u.itemName} · {u.serialNo || '-'}
                    </option>
                  ))
                )}
              </select>
            </VerticalField>
            <VerticalField label="교환 희망완료일" required width={150}>
              <input
                type="date"
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="비고">
              <input
                type="text"
                value={exMemo}
                onChange={(e) => setExMemo(e.target.value)}
                placeholder="현장 교환 사유"
                style={controlInputStyle}
              />
            </VerticalField>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={exRepair}
                onChange={(e) => setExRepair(e.target.checked)}
              />
              회수 전자산 정비중 전환
            </label>
            <CommitActionButton
              actionCode="EXCHANGE_EXECUTE"
              targetTable="fl_fulfillments"
              targetId={oldLineObj?.id || 'EXCHANGE'}
              title={`렌탈 장비 교환 · ${oldContractObj?.partnerName || ''}`}
              disabled={!oldContractObj || !oldLineObj || !oldUnitObj || !newUnitObj}
              buildPayload={() =>
                oldContractObj && oldLineObj && oldUnitObj && newUnitObj
                  ? {
                      contractId: oldContractObj.id,
                      oldLineId: oldLineObj.id,
                      oldUnitId: oldUnitObj.id,
                      newUnitId: newUnitObj.id,
                      exchangeDate: exDate,
                      oldUnitToRepair: exRepair,
                      memo: exMemo.trim() || undefined,
                    }
                  : null
              }
              onExecuteDirect={async () => {
                if (!currentUser || !oldContractObj || !oldLineObj || !oldUnitObj || !newUnitObj) {
                  return;
                }
                await executeRentalExchange({
                  contract: oldContractObj,
                  oldLine: oldLineObj,
                  oldUnit: oldUnitObj,
                  newUnit: newUnitObj,
                  exchangeDate: exDate,
                  actorId: currentUser.id,
                  actorName: currentUser.name,
                  oldUnitToRepair: exRepair,
                  memo: exMemo.trim() || undefined,
                });
                await refreshAll();
                notifyToast('렌탈 단일 교환 실행완료', 'success');
              }}
              label="교환 실행완료"
            />
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>편집 권한이 없습니다.</div>
        )}
      </SectionPanel>
    </div>
  );
};

export const RentalMaintenancePage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('rental_maintenance');
  const today = new Date().toISOString().slice(0, 10);

  const rentalAssets = useMemo(
    () => datasets.inventoryUnits.filter((u) => u.ownershipDomain !== '유통재고'),
    [datasets.inventoryUnits]
  );
  const partLots = useMemo(
    () =>
      sortUnitsFifo(
        datasets.inventoryUnits.filter(
          (u) =>
            u.ownershipDomain === '유통재고' &&
            u.status === '보유중' &&
            (u.itemCategory === '부품' || u.itemCategory === '소모품') &&
            u.qtyOnHand > 0
        )
      ),
    [datasets.inventoryUnits]
  );
  const externalVendors = useMemo(() => {
    const matched = datasets.partners.filter((p) => p.partnerRoles.includes('외주정비처'));
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

  const [maintType, setMaintType] = useState<FlRentalMaintenance['maintType']>('순회정비');
  const [unitId, setUnitId] = useState(rentalAssets[0]?.id || '');
  const [operatingHours, setOperatingHours] = useState<number>(
    rentalAssets[0]?.operatingHours || 100
  );
  const [partUnitId, setPartUnitId] = useState('');
  const [partQty, setPartQty] = useState(1);
  const [laborCostKrw, setLaborCostKrw] = useState(0);
  const [externalCostKrw, setExternalCostKrw] = useState(0);
  const [vendorPartnerId, setVendorPartnerId] = useState('');
  const [isBillable, setIsBillable] = useState(false);
  const [customerChargeKrw, setCustomerChargeKrw] = useState(0);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedUnit =
    rentalAssets.find((u) => u.id === (unitId || rentalAssets[0]?.id)) || null;

  const handleSave = async () => {
    if (!currentUser || !selectedUnit) {
      notifyToast('대상 렌탈자산을 선택해 주세요.', 'error');
      return;
    }
    const chosenPart = partLots.find((p) => p.id === partUnitId);
    const vendor = externalVendors.find((v) => v.id === vendorPartnerId) || null;
    const contract = selectedUnit.currentContractId
      ? datasets.contracts.find((c) => c.id === selectedUnit.currentContractId) || null
      : null;
    const partner = selectedUnit.currentPartnerId
      ? datasets.partners.find((p) => p.id === selectedUnit.currentPartnerId) || null
      : null;

    setSaving(true);
    try {
      await recordRentalMaintenance({
        maintType,
        unit: selectedUnit,
        contract,
        partner,
        mechanicId: currentUser.id,
        mechanicName: currentUser.name,
        vendorPartner: externalCostKrw > 0 ? vendor : null,
        operatingHours,
        partsUsed: chosenPart && partQty > 0 ? [{ unit: chosenPart, qty: partQty }] : [],
        laborCostKrw,
        externalCostKrw,
        isCustomerBillable: isBillable,
        customerChargeKrw: isBillable ? customerChargeKrw : 0,
        effectiveDate,
        memo: memo.trim() || undefined,
      });
      setMemo('');
      setPartUnitId('');
      await refreshAll();
      notifyToast('렌탈 정비 이력 및 원가 반영 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '정비 저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {canEdit && (
        <SectionPanel
          title="렌탈 장비 정비 등록 · 주기장 · 현장 · 순회정비"
          manualId="rmnt-form"
          rightSlot={
            <button
              type="button"
              disabled={saving || !selectedUnit}
              onClick={handleSave}
              style={actionBtnStyle('primary', true)}
            >
              {saving ? '저장중' : '정비 저장'}
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <VerticalField label="정비 구분" required>
              <select
                value={maintType}
                onChange={(e) => setMaintType(e.target.value as FlRentalMaintenance['maintType'])}
                style={controlInputStyle}
              >
                <option value="주기장정비">주기장정비</option>
                <option value="현장정비">현장정비</option>
                <option value="순회정비">순회정비</option>
              </select>
            </VerticalField>
            <VerticalField label="대상 렌탈 · 전대 자산" required minWidth={220}>
              <select
                value={selectedUnit?.id || ''}
                onChange={(e) => {
                  setUnitId(e.target.value);
                  const u = rentalAssets.find((x) => x.id === e.target.value);
                  if (u) setOperatingHours(u.operatingHours);
                }}
                style={controlInputStyle}
              >
                {rentalAssets.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitCode} · {u.itemName} · {u.serialNo || '-'}
                  </option>
                ))}
              </select>
            </VerticalField>
            <VerticalField label="누적 가동시간" required>
              <input
                type="number"
                value={operatingHours}
                onChange={(e) => setOperatingHours(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="정비일자" required>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="투입 부품 로트" minWidth={190}>
              <select
                value={partUnitId}
                onChange={(e) => setPartUnitId(e.target.value)}
                style={controlInputStyle}
              >
                <option value="">부품 투입 없음</option>
                {partLots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.itemName} · 잔여 {p.qtyOnHand}
                  </option>
                ))}
              </select>
            </VerticalField>
            <VerticalField label="부품 수량">
              <input
                type="number"
                min={1}
                disabled={!partUnitId}
                value={partQty}
                onChange={(e) => setPartQty(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="자사 노무비">
              <input
                type="number"
                value={laborCostKrw}
                onChange={(e) => setLaborCostKrw(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="외주 정비비">
              <input
                type="number"
                value={externalCostKrw}
                onChange={(e) => setExternalCostKrw(Number(e.target.value))}
                style={controlInputStyle}
              />
            </VerticalField>
            {externalCostKrw > 0 && (
              <VerticalField label="외주정비처">
                <SearchableSelect
                  value={vendorPartnerId || externalVendors[0]?.id || ''}
                  options={toPartnerSelectOptions(externalVendors)}
                  onChange={(nextId) => setVendorPartnerId(nextId)}
                  placeholder="외주정비처 선택"
                  searchPlaceholder="정비처명 · 초성 · 사업자번호 검색"
                  minDropdownWidth={260}
                />
              </VerticalField>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
              />
              고객 유상청구
            </label>
            {isBillable && (
              <VerticalField label="고객 청구액">
                <input
                  type="number"
                  value={customerChargeKrw}
                  onChange={(e) => setCustomerChargeKrw(Number(e.target.value))}
                  style={controlInputStyle}
                />
              </VerticalField>
            )}
            <VerticalField label="정비 내용">
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

      <DataGrid
        manualId="rmnt-grid"
        columns={[
          { key: 'maintNo', header: '정비번호', width: 135, render: (m) => m.maintNo },
          { key: 'effectiveDate', header: '정비일', width: 100, render: (m) => m.effectiveDate },
          { key: 'maintType', header: '구분', width: 95, render: (m) => <StatusBadge label={m.maintType} tone="info" /> },
          { key: 'serialNo', header: '시리얼', width: 130, render: (m) => m.serialNo || '-' },
          { key: 'hours', header: '가동시간', width: 85, align: 'right', render: (m) => `${m.operatingHours}시간` },
          { key: 'parts', header: '부품비', width: 100, align: 'right', render: (m) => formatMoney(m.partsCostKrw) },
          { key: 'labor', header: '노무비', width: 100, align: 'right', render: (m) => formatMoney(m.laborCostKrw) },
          { key: 'ext', header: '외주비', width: 100, align: 'right', render: (m) => formatMoney(m.externalCostKrw) },
          { key: 'total', header: '총정비원가', width: 115, align: 'right', render: (m) => formatMoney(m.totalCostKrw) },
          { key: 'memo', header: '정비내역', render: (m) => m.memo || '-' },
        ]}
        rows={[...datasets.rentalMaintenances].sort((a, b) =>
          b.effectiveDate.localeCompare(a.effectiveDate)
        )}
        rowKey={(m) => m.id}
        maxHeight="420px"
      />
    </div>
  );
};

export const RentalPerformancePage: React.FC = () => {
  const { datasets, formatMoney } = useAppShell();
  const curYm = new Date().toISOString().slice(0, 7);
  const [startYm, setStartYm] = useState(curYm);
  const [endYm, setEndYm] = useState(curYm);

  const months = useMemo(() => listMonthsBetween(startYm, endYm), [endYm, startYm]);

  const rows = useMemo(() => {
    const rentalAssets = datasets.inventoryUnits.filter((u) => u.ownershipDomain !== '유통재고');
    const revByUnit = new Map<string, number>();

    for (const c of datasets.contracts) {
      if (c.contractDomain !== 'RENTAL' || c.status === 'CANCELLED') continue;
      for (const ym of months) {
        const res = calculateRentalProRataForMonth({
          contract: c,
          lines: datasets.contractLines,
          ym,
        });
        for (const r of res) {
          if (r.unitId) {
            revByUnit.set(r.unitId, (revByUnit.get(r.unitId) || 0) + r.supplyAmountKrw);
          }
        }
      }
    }

    return rentalAssets.map((u) => {
      const revenueKrw = revByUnit.get(u.id) || 0;
      const monthlyDep =
        u.ownershipDomain === '렌탈자산' && u.depreciationMonths > 0
          ? Math.round(Math.max(0, u.unitCostKrw - u.residualValueKrw) / u.depreciationMonths)
          : 0;
      const depKrw = monthlyDep * months.length;
      const subleaseKrw =
        u.ownershipDomain === '전대자산' ? Math.round(u.subleaseMonthlyCostKrw * months.length) : 0;
      const maintKrw = datasets.rentalMaintenances
        .filter((m) => m.unitId === u.id && months.includes(m.effectiveDate.slice(0, 7)))
        .reduce((s, m) => s + m.totalCostKrw, 0);

      const leaseInterestKrw = datasets.financeLeases
        .filter((fl) => fl.unitId === u.id || fl.unitIds.includes(u.id))
        .flatMap((fl) =>
          datasets.financeLeaseSchedules.filter(
            (s) => s.leaseId === fl.id && months.includes(s.dueYm)
          )
        )
        .reduce((s, sch) => s + sch.interestExpenseKrw, 0);

      const contributionKrw = revenueKrw - depKrw - subleaseKrw - maintKrw - leaseInterestKrw;
      return {
        id: u.id,
        unitCode: u.unitCode,
        itemName: u.itemName,
        serialNo: u.serialNo || '-',
        revenueKrw,
        depKrw,
        subleaseKrw,
        maintKrw,
        leaseInterestKrw,
        contributionKrw,
      };
    });
  }, [datasets, months]);

  const totals = useMemo(() => {
    const rev = rows.reduce((s, r) => s + r.revenueKrw, 0);
    const dep = rows.reduce((s, r) => s + r.depKrw, 0);
    const sub = rows.reduce((s, r) => s + r.subleaseKrw, 0);
    const maint = rows.reduce((s, r) => s + r.maintKrw, 0);
    const interest = rows.reduce((s, r) => s + r.leaseInterestKrw, 0);
    return {
      rev,
      dep,
      sub,
      maint,
      interest,
      net: rev - dep - sub - maint - interest,
    };
  }, [rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel title="렌탈 실적 조회 연월" manualId="rperf-period">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <VerticalField label="시작 연월" width={150}>
            <input
              type="month"
              value={startYm}
              onChange={(e) => setStartYm(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="종료 연월" width={150}>
            <input
              type="month"
              value={endYm}
              onChange={(e) => setEndYm(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
        </div>
      </SectionPanel>

      <DataGrid
        manualId="rperf-grid"
        columns={[
          { key: 'code', header: '자산번호', width: 125, render: (r) => r.unitCode },
          { key: 'itemName', header: '기종명', render: (r) => r.itemName },
          { key: 'serial', header: '시리얼', width: 130, render: (r) => r.serialNo },
          {
            key: 'rev',
            header: '일할 임대매출',
            width: 120,
            align: 'right',
            render: (r) => formatMoney(r.revenueKrw, { salesSensitive: true }),
          },
          { key: 'dep', header: '감가상각비', width: 110, align: 'right', render: (r) => formatMoney(r.depKrw) },
          { key: 'sub', header: '전대임차료', width: 110, align: 'right', render: (r) => formatMoney(r.subleaseKrw) },
          { key: 'maint', header: '정비비', width: 100, align: 'right', render: (r) => formatMoney(r.maintKrw) },
          { key: 'int', header: '리스이자', width: 100, align: 'right', render: (r) => formatMoney(r.leaseInterestKrw) },
          {
            key: 'net',
            header: '자산 순기여액',
            width: 125,
            align: 'right',
            render: (r) => (
              <span style={{ fontWeight: 700, color: r.contributionKrw >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatMoney(r.contributionKrw, { salesSensitive: true })}
              </span>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        maxHeight="470px"
      />

      <ConservationBar
        items={[
          { label: '총 임대매출', value: formatMoney(totals.rev, { salesSensitive: true }) },
          { label: '상각·전대·정비', value: formatMoney(totals.dep + totals.sub + totals.maint), tone: 'warning' },
          { label: '리스이자비용', value: formatMoney(totals.interest), tone: 'warning' },
          {
            label: '순기여합계',
            value: formatMoney(totals.net, { salesSensitive: true }),
            tone: totals.net >= 0 ? 'success' : 'danger',
          },
        ]}
      />
    </div>
  );
};
