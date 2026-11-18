import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { recordLogisticsDispatch } from '../../services/domainProcurementLeaseEngine';
import { todayIso } from '../../services/domainMath';
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
import {
  SETTLEMENT_STATUS_KO_LABELS,
  filterPartnersForTenant,
  formatKoStatus,
  koStatusTone,
  type FlLogisticsDispatch,
} from '../../types/domain';

export const LogisticsCostsPage: React.FC = () => {
  const { isRentalEnabled, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('logistics_costs');
  const today = todayIso();

  const rentalRelatedRefIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of datasets.contracts) {
      if (c.contractDomain === 'RENTAL') ids.add(c.id);
    }
    for (const f of datasets.fulfillments) {
      if (f.fulfillmentDomain === 'RENTAL') ids.add(f.id);
    }
    return ids;
  }, [datasets.contracts, datasets.fulfillments]);

  const visibleDispatches = useMemo(() => {
    if (isRentalEnabled) return datasets.logisticsDispatches;
    return datasets.logisticsDispatches.filter(
      (d) => d.dispatchPurpose !== '교환' && !(d.relatedRefId && rentalRelatedRefIds.has(d.relatedRefId))
    );
  }, [datasets.logisticsDispatches, isRentalEnabled, rentalRelatedRefIds]);

  const tenantLogisticsPartners = useMemo(
    () => filterPartnersForTenant(datasets.partners, isRentalEnabled),
    [datasets.partners, isRentalEnabled]
  );

  const carriers = useMemo(() => {
    const matched = tenantLogisticsPartners.filter((p) => p.partnerRoles.includes('운송사'));
    return matched.length > 0 ? matched : tenantLogisticsPartners;
  }, [tenantLogisticsPartners]);

  const [dispatchPurpose, setDispatchPurpose] =
    useState<FlLogisticsDispatch['dispatchPurpose']>('납품운송');
  const [carrierPartnerId, setCarrierPartnerId] = useState(carriers[0]?.id || '');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [originAddress, setOriginAddress] = useState('본사 주기장');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [transportCostKrw, setTransportCostKrw] = useState<number>(250000);
  const [costBearer, setCostBearer] = useState<FlLogisticsDispatch['costBearer']>('OURS');
  const [customerChargeKrw, setCustomerChargeKrw] = useState<number>(0);
  const [dispatchDate, setDispatchDate] = useState(today);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const carrier = carriers.find((c) => c.id === (carrierPartnerId || carriers[0]?.id));
    if (!carrier) {
      notifyToast('운송사를 선택해 주세요.', 'error');
      return;
    }
    if (!originAddress.trim() || !destinationAddress.trim()) {
      notifyToast('출발지와 도착지를 입력해 주세요.', 'error');
      return;
    }
    if (transportCostKrw <= 0) {
      notifyToast('운송비는 0원보다 커야 합니다.', 'error');
      return;
    }
    setSaving(true);
    try {
      await recordLogisticsDispatch({
        dispatchPurpose: !isRentalEnabled && dispatchPurpose === '교환' ? '납품운송' : dispatchPurpose,
        carrier,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        vehicleNo: vehicleNo.trim() || undefined,
        originAddress: originAddress.trim(),
        destinationAddress: destinationAddress.trim(),
        transportCostKrw,
        costBearer,
        customerChargeKrw: costBearer === 'CUSTOMER' ? customerChargeKrw || transportCostKrw : 0,
        dispatchDate,
        memo: memo.trim() || undefined,
      });
      setDestinationAddress('');
      setMemo('');
      await refreshAll();
      notifyToast('물류 운송비 및 운송사 채무 기록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '물류비 저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterPurpose, setFilterPurpose] = useState('');
  const [filterCarrierId, setFilterCarrierId] = useState('');
  const [filterBearer, setFilterBearer] = useState('');
  const [filterRouteKeyword, setFilterRouteKeyword] = useState('');

  const carrierFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of visibleDispatches) {
      if (d.carrierPartnerId && !seen.has(d.carrierPartnerId)) {
        seen.set(d.carrierPartnerId, d.carrierName);
      }
    }
    return [
      { value: '', label: '전체 운송사' },
      ...[...seen.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ko'))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [visibleDispatches]);

  const effectiveFilterPurpose = !isRentalEnabled && filterPurpose === '교환' ? '' : filterPurpose;

  const filteredDispatches = useMemo(() => {
    const kw = filterRouteKeyword.trim().toLowerCase();
    return visibleDispatches
      .filter((d) => {
        if (filterStartDate && d.dispatchDate < filterStartDate) return false;
        if (filterEndDate && d.dispatchDate > filterEndDate) return false;
        if (effectiveFilterPurpose && d.dispatchPurpose !== effectiveFilterPurpose) return false;
        if (filterCarrierId && d.carrierPartnerId !== filterCarrierId) return false;
        if (filterBearer && d.costBearer !== filterBearer) return false;
        if (kw) {
          const text = `${d.dispatchNo} ${d.originAddress} ${d.destinationAddress} ${d.memo || ''}`.toLowerCase();
          if (!text.includes(kw)) return false;
        }
        return true;
      })
      .sort((a, b) => b.dispatchDate.localeCompare(a.dispatchDate));
  }, [
    effectiveFilterPurpose,
    filterBearer,
    filterCarrierId,
    filterEndDate,
    filterRouteKeyword,
    filterStartDate,
    visibleDispatches,
  ]);

  const totals = useMemo(() => {
    const supply = filteredDispatches.reduce((s, d) => s + d.transportCostKrw, 0);
    const ours = filteredDispatches
      .filter((d) => d.costBearer === 'OURS')
      .reduce((s, d) => s + d.transportCostKrw, 0);
    const customer = filteredDispatches.reduce((s, d) => s + d.customerChargeKrw, 0);
    return { supply, ours, customer };
  }, [filteredDispatches]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && (
        <SectionPanel
          title="물류 운송비 등록 · 비용 정산 전용"
          manualId="log-form"
          rightSlot={
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              style={actionBtnStyle('primary', true)}
            >
              {saving ? '저장중' : '운송비 저장'}
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="운송목적" required>
              <select
                value={!isRentalEnabled && dispatchPurpose === '교환' ? '납품운송' : dispatchPurpose}
                onChange={(e) =>
                  setDispatchPurpose(e.target.value as FlLogisticsDispatch['dispatchPurpose'])
                }
                style={controlInputStyle}
              >
                <option value="납품운송">납품운송</option>
                <option value="회수운송">회수운송</option>
                {isRentalEnabled && <option value="교환">교환</option>}
                <option value="일반운송">일반운송</option>
                <option value="자체이동">자체이동</option>
              </select>
            </VerticalField>
            <VerticalField label="운송사" required>
              <SearchableSelect
                value={carrierPartnerId || carriers[0]?.id || ''}
                options={toPartnerSelectOptions(carriers)}
                onChange={(nextId) => setCarrierPartnerId(nextId)}
                placeholder="운송사 선택"
                searchPlaceholder="운송사명 · 초성 · 사업자번호 검색"
                minDropdownWidth={260}
              />
            </VerticalField>
            <VerticalField label="배차일자" required>
              <input
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="출발지" required>
              <input
                type="text"
                value={originAddress}
                onChange={(e) => setOriginAddress(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="도착지" required>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                placeholder="현장 주소"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="차량번호">
              <input
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="운송기사">
              <input
                type="text"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="기사 연락처">
              <input
                type="text"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="운송비 공급가액" required>
              <CommaNumberInput
                allowDecimal={false}
                min={0}
                value={transportCostKrw}
                onChange={setTransportCostKrw}
              />
            </VerticalField>
            <VerticalField label="부담주체" required>
              <select
                value={costBearer}
                onChange={(e) =>
                  setCostBearer(e.target.value as FlLogisticsDispatch['costBearer'])
                }
                style={controlInputStyle}
              >
                <option value="OURS">당사부담</option>
                <option value="CUSTOMER">고객청구</option>
                <option value="SUPPLIER">공급사부담</option>
              </select>
            </VerticalField>
            {costBearer === 'CUSTOMER' && (
              <VerticalField label="고객 청구금액">
                <CommaNumberInput
                  allowDecimal={false}
                  min={0}
                  value={customerChargeKrw || transportCostKrw}
                  onChange={setCustomerChargeKrw}
                />
              </VerticalField>
            )}
            <VerticalField label="메모">
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

      <SectionPanel
        title={`물류 배차 원장 · ${filteredDispatches.length}건`}
        rightSlot={
          (filterStartDate || filterEndDate || filterPurpose || filterCarrierId || filterBearer || filterRouteKeyword) ? (
            <button
              type="button"
              onClick={() => {
                setFilterStartDate('');
                setFilterEndDate('');
                setFilterPurpose('');
                setFilterCarrierId('');
                setFilterBearer('');
                setFilterRouteKeyword('');
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
          <VerticalField label="운송목적" minWidth={0}>
            <select
              value={effectiveFilterPurpose}
              onChange={(e) => setFilterPurpose(e.target.value)}
              style={controlInputStyle}
            >
              <option value="">전체 목적</option>
              <option value="납품운송">납품운송</option>
              <option value="회수운송">회수운송</option>
              {isRentalEnabled && <option value="교환">교환</option>}
              <option value="자체이동">자체이동</option>
              <option value="일반운송">일반운송</option>
            </select>
          </VerticalField>
          <VerticalField label="운송사" minWidth={0}>
            <SearchableSelect
              value={filterCarrierId}
              onChange={setFilterCarrierId}
              options={carrierFilterOptions}
              placeholder="전체 운송사"
              searchPlaceholder="운송사명 · 초성 검색"
            />
          </VerticalField>
          <VerticalField label="부담주체" minWidth={0}>
            <select
              value={filterBearer}
              onChange={(e) => setFilterBearer(e.target.value)}
              style={controlInputStyle}
            >
              <option value="">전체</option>
              <option value="OURS">당사부담</option>
              <option value="CUSTOMER">고객청구</option>
              <option value="SUPPLIER">공급사부담</option>
            </select>
          </VerticalField>
          <VerticalField label="구간 · 배차번호 검색" minWidth={0}>
            <input
              type="text"
              value={filterRouteKeyword}
              onChange={(e) => setFilterRouteKeyword(e.target.value)}
              placeholder="출발지, 도착지, 배차번호"
              style={controlInputStyle}
            />
          </VerticalField>
        </div>

        <DataGrid
          manualId="log-grid"
          columns={[
            {
              key: 'dispatchNo',
              header: '배차번호',
              width: 145,
              sortable: true,
              sortValue: (r) => r.dispatchNo,
              render: (r) => <span style={{ fontWeight: 700 }}>{r.dispatchNo}</span>,
            },
            {
              key: 'dispatchDate',
              header: '일자',
              width: 100,
              sortable: true,
              sortValue: (r) => r.dispatchDate,
              render: (r) => r.dispatchDate,
            },
            {
              key: 'purpose',
              header: '목적',
              width: 95,
              sortable: true,
              sortValue: (r) => r.dispatchPurpose,
              render: (r) => <StatusBadge label={r.dispatchPurpose} tone="info" />,
            },
            {
              key: 'carrierName',
              header: '운송사',
              width: 130,
              sortable: true,
              sortValue: (r) => r.carrierName,
              render: (r) => r.carrierName,
            },
            {
              key: 'route',
              header: '구간',
              sortable: true,
              sortValue: (r) => `${r.originAddress} · ${r.destinationAddress}`,
              render: (r) => `${r.originAddress} · ${r.destinationAddress}`,
            },
            {
              key: 'cost',
              header: '운송비',
              width: 115,
              align: 'right',
              sortable: true,
              sortValue: (r) => Number(r.transportCostKrw || 0),
              render: (r) => formatMoney(r.transportCostKrw),
            },
            {
              key: 'bearer',
              header: '부담주체',
              width: 95,
              align: 'center',
              sortable: true,
              sortValue: (r) => (r.costBearer === 'OURS' ? '당사부담' : r.costBearer === 'CUSTOMER' ? '고객청구' : '공급사'),
              render: (r) => (
                <StatusBadge
                  label={r.costBearer === 'OURS' ? '당사부담' : r.costBearer === 'CUSTOMER' ? '고객청구' : '공급사'}
                  tone={r.costBearer === 'OURS' ? 'warning' : 'success'}
                />
              ),
            },
            {
              key: 'status',
              header: '정산',
              width: 95,
              align: 'center',
              sortable: true,
              sortValue: (r) => SETTLEMENT_STATUS_KO_LABELS[r.settlementStatus] || formatKoStatus(r.settlementStatus),
              render: (r) => (
                <StatusBadge
                  label={SETTLEMENT_STATUS_KO_LABELS[r.settlementStatus] || formatKoStatus(r.settlementStatus)}
                  tone={koStatusTone(r.settlementStatus)}
                />
              ),
            },
          ]}
          rows={filteredDispatches}
          rowKey={(r) => r.id}
          maxHeight="calc(100vh - 230px)"
        />
      </SectionPanel>

      <ConservationBar
        items={[
          { label: '총 발생운송비', value: formatMoney(totals.supply) },
          { label: '당사 판관비 귀속', value: formatMoney(totals.ours), tone: 'warning' },
          { label: '고객 청구 대상', value: formatMoney(totals.customer), tone: 'primary' },
        ]}
      />
    </div>
  );
};
