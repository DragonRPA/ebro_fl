import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { sortUnitsFifo, todayIso } from '../../services/domainMath';
import { recordRentalMaintenance } from '../../services/domainFulfillmentEngine';
import { SearchableSelect, toPartnerSelectOptions } from '../../components/SearchableSelect';
import {
  CommaNumberInput,
  ConservationBar,
  DataGrid,
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import { type FlRentalMaintenance } from '../../types/domain';

export const RentalMaintenancePage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('rental_maintenance');
  const today = todayIso();

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

  const maintSummary = useMemo(() => {
    const partUnits = partLots.filter((u) => u.itemCategory === '부품');
    const consUnits = partLots.filter((u) => u.itemCategory === '소모품');
    return {
      partLots: partUnits.length,
      partQty: partUnits.reduce((s, u) => s + Number(u.qtyOnHand || 0), 0),
      consLots: consUnits.length,
      consQty: consUnits.reduce((s, u) => s + Number(u.qtyOnHand || 0), 0),
      maintCount: datasets.rentalMaintenances.length,
      maintCost: datasets.rentalMaintenances.reduce((s, m) => s + Number(m.totalCostKrw || 0), 0),
    };
  }, [datasets.rentalMaintenances, partLots]);

  const handleSave = async () => {
    if (!currentUser || !selectedUnit) {
      notifyToast('대상 렌탈자산을 선택해 주세요.', 'error');
      return;
    }
    const chosenPart = partLots.find((p) => p.id === partUnitId);
    const resolvedVendorId = vendorPartnerId || externalVendors[0]?.id || '';
    const vendor = externalVendors.find((v) => v.id === resolvedVendorId) || null;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-field-grid-gap)', alignItems: 'end' }}>
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
              <CommaNumberInput min={0} value={operatingHours} onChange={setOperatingHours} />
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
              <SearchableSelect
                value={partUnitId}
                options={[
                  { value: '', label: '부품 투입 없음', searchText: '부품 투입 없음' },
                  ...partLots.map((p) => ({
                    value: p.id,
                    label: `${p.itemName} · 잔여 ${p.qtyOnHand.toLocaleString('ko-KR')}`,
                    subLabel: p.lotNo || p.unitCode,
                    searchText: `${p.itemName} ${p.lotNo || ''} ${p.unitCode}`,
                  })),
                ]}
                onChange={(nextId) => setPartUnitId(nextId)}
                placeholder="부품 투입 없음"
                searchPlaceholder="부품명 · 초성 · 로트 검색"
                minDropdownWidth={300}
              />
            </VerticalField>
            <VerticalField label="부품 수량">
              <CommaNumberInput
                min={1}
                disabled={!partUnitId}
                value={partQty}
                onChange={setPartQty}
              />
            </VerticalField>
            <VerticalField label="자사 노무비">
              <CommaNumberInput min={0} value={laborCostKrw} onChange={setLaborCostKrw} />
            </VerticalField>
            <VerticalField label="외주 정비비">
              <CommaNumberInput min={0} value={externalCostKrw} onChange={setExternalCostKrw} />
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
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', height: 'var(--space-control-h)', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
              />
              고객 유상청구
            </label>
            {isBillable && (
              <VerticalField label="고객 청구액">
                <CommaNumberInput min={0} value={customerChargeKrw} onChange={setCustomerChargeKrw} />
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
        maxHeight="clamp(320px, calc(100vh - 300px), 780px)"
      />

      <ConservationBar
        items={[
          {
            label: '가용 부품 재고',
            value: `${maintSummary.partLots.toLocaleString('ko-KR')}로트 · ${maintSummary.partQty.toLocaleString('ko-KR')}개`,
            tone: 'primary',
          },
          {
            label: '가용 소모품 재고',
            value: `${maintSummary.consLots.toLocaleString('ko-KR')}로트 · ${maintSummary.consQty.toLocaleString('ko-KR')}개`,
            tone: 'primary',
          },
          {
            label: '정비 누적건수',
            value: `${maintSummary.maintCount.toLocaleString('ko-KR')}건`,
          },
          {
            label: '총 정비원가',
            value: formatMoney(maintSummary.maintCost),
            tone: 'warning',
          },
        ]}
      />
    </div>
  );
};
