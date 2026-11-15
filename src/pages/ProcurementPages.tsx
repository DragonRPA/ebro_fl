import React, { useMemo, useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { CommitActionButton } from '../core/ActionCommandGateway';
import { confirmPurchaseInbound, recordLogisticsDispatch } from '../services/domainEngine';
import {
  ConservationBar,
  DataGrid,
  ModalDialog,
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type GridColumn,
} from '../components/UiPrimitives';
import type {
  CurrencyCode,
  FlLogisticsDispatch,
  FlPurchase,
  FlPurchaseLine,
  ItemCategory,
  ManagementType,
} from '../types/domain';

interface DraftPurchaseLine {
  key: string;
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory: ItemCategory;
  managementType: ManagementType;
  quantity: number;
  foreignUnitPrice: number;
  serialText: string;
  lotNo: string;
  warehouseLocation: string;
}

export const PurchasesPage: React.FC = () => {
  const { currentUser, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('purchases');
  const today = new Date().toISOString().slice(0, 10);

  const suppliers = useMemo(() => {
    const matched = datasets.partners.filter(
      (p) => p.partnerRoles.includes('매입처') || p.partnerRoles.includes('대리점')
    );
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

  const [purchaseType, setPurchaseType] = useState<'IMPORT' | 'DOMESTIC'>('IMPORT');
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [targetDomain, setTargetDomain] = useState<'TRADE' | 'RENTAL'>('TRADE');
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('USD');
  const [fxRate, setFxRate] = useState<number>(1380);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [blNo, setBlNo] = useState('');
  const [lcNo, setLcNo] = useState('');
  const [customsDutyKrw, setCustomsDutyKrw] = useState(0);
  const [oceanFreightKrw, setOceanFreightKrw] = useState(0);
  const [clearanceFeeKrw, setClearanceFeeKrw] = useState(0);
  const [inlandFreightKrw, setInlandFreightKrw] = useState(0);
  const [memo, setMemo] = useState('');

  const [lines, setLines] = useState<DraftPurchaseLine[]>(() => {
    const firstItem = datasets.itemMasters[0];
    if (!firstItem) return [];
    return [
      {
        key: 'L1',
        itemId: firstItem.id,
        sku: firstItem.sku,
        itemName: firstItem.name,
        itemCategory: firstItem.itemCategory,
        managementType: firstItem.managementType,
        quantity: 1,
        foreignUnitPrice: firstItem.standardCostKrw || 10000,
        serialText: '',
        lotNo: '',
        warehouseLocation: firstItem.warehouseLocation || '본사창고',
      },
    ];
  });

  const [detailPurchase, setDetailPurchase] = useState<FlPurchase | null>(null);

  const handleCurrencyChange = (nextCur: CurrencyCode) => {
    setCurrencyCode(nextCur);
    if (nextCur === 'KRW') {
      setFxRate(1);
      return;
    }
    const latest = [...datasets.exchangeRates]
      .filter((r) => r.currencyCode === nextCur)
      .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
    if (latest) {
      setFxRate(Number(latest.baseRateKrw));
    }
  };

  const addDraftLine = () => {
    const item = datasets.itemMasters[0];
    if (!item) return;
    setLines((prev) => [
      ...prev,
      {
        key: `L-${Date.now()}-${prev.length}`,
        itemId: item.id,
        sku: item.sku,
        itemName: item.name,
        itemCategory: item.itemCategory,
        managementType: item.managementType,
        quantity: 1,
        foreignUnitPrice: item.standardCostKrw,
        serialText: '',
        lotNo: '',
        warehouseLocation: item.warehouseLocation || '본사창고',
      },
    ]);
  };

  const updateLineItem = (key: string, itemId: string) => {
    const item = datasets.itemMasters.find((i) => i.id === itemId);
    if (!item) return;
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              itemId: item.id,
              sku: item.sku,
              itemName: item.name,
              itemCategory: item.itemCategory,
              managementType: item.managementType,
              warehouseLocation: item.warehouseLocation || '본사창고',
            }
          : l
      )
    );
  };

  const summary = useMemo(() => {
    const effFx = currencyCode === 'KRW' ? 1 : Number(fxRate || 1);
    const foreignTotal = lines.reduce(
      (s, l) => s + Number(l.quantity || 0) * Number(l.foreignUnitPrice || 0),
      0
    );
    const krwMerchandise = Math.round(foreignTotal * effFx);
    const ancillary =
      Math.round(customsDutyKrw || 0) +
      Math.round(oceanFreightKrw || 0) +
      Math.round(clearanceFeeKrw || 0) +
      Math.round(inlandFreightKrw || 0);
    return {
      foreignTotal,
      krwMerchandise,
      ancillary,
      totalLanded: krwMerchandise + ancillary,
    };
  }, [clearanceFeeKrw, currencyCode, customsDutyKrw, fxRate, inlandFreightKrw, lines, oceanFreightKrw]);

  const buildPayload = () => {
    const sup = suppliers.find((s) => s.id === (supplierId || suppliers[0]?.id));
    if (!sup) {
      notifyToast('매입처를 선택해 주세요.', 'error');
      return null;
    }
    if (lines.length === 0) {
      notifyToast('최소 1개 이상의 입고 품목을 추가해 주세요.', 'error');
      return null;
    }
    return {
      purchaseType,
      supplierId: sup.id,
      targetDomain,
      blNo: blNo.trim() || undefined,
      lcNo: lcNo.trim() || undefined,
      currencyCode,
      fxRate: currencyCode === 'KRW' ? 1 : Number(fxRate || 1),
      fxDate: effectiveDate,
      customsDutyKrw: Math.round(customsDutyKrw || 0),
      oceanFreightKrw: Math.round(oceanFreightKrw || 0),
      clearanceFeeKrw: Math.round(clearanceFeeKrw || 0),
      inlandFreightKrw: Math.round(inlandFreightKrw || 0),
      effectiveDate,
      memo: memo.trim() || undefined,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        sku: l.sku,
        itemName: l.itemName,
        itemCategory: l.itemCategory,
        managementType: l.managementType,
        quantity: Number(l.quantity || 1),
        foreignUnitPrice: Number(l.foreignUnitPrice || 0),
        serialList: l.serialText
          ? l.serialText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        lotNo: l.lotNo.trim() || undefined,
        warehouseLocation: l.warehouseLocation || '본사창고',
      })),
    };
  };

  const handleExecuteDirect = async () => {
    if (!currentUser) return;
    const p = buildPayload();
    if (!p) return;
    const sup = suppliers.find((s) => s.id === p.supplierId)!;
    await confirmPurchaseInbound({
      ...p,
      supplier: sup,
      actorId: currentUser.id,
      actorName: currentUser.name,
    });
    await refreshAll();
    notifyToast('매입 입고 확정 및 원가배분 완료', 'success');
  };

  const detailLines = useMemo<FlPurchaseLine[]>(() => {
    if (!detailPurchase) return [];
    return datasets.purchaseLines.filter((l) => l.purchaseId === detailPurchase.id);
  }, [datasets.purchaseLines, detailPurchase]);

  const purchaseCols: GridColumn<FlPurchase>[] = [
    {
      key: 'view',
      header: '상세',
      width: 72,
      align: 'center',
      stickyLeft: true,
      render: (r) => (
        <button type="button" onClick={() => setDetailPurchase(r)} style={actionBtnStyle('secondary', true)}>
          보기
        </button>
      ),
    },
    { key: 'purchaseNo', header: '전표번호', width: 145, render: (r) => <span style={{ fontWeight: 700 }}>{r.purchaseNo}</span> },
    { key: 'effectiveDate', header: '입고기준일', width: 105, render: (r) => r.effectiveDate },
    {
      key: 'purchaseType',
      header: '구분',
      width: 80,
      align: 'center',
      render: (r) => <StatusBadge label={r.purchaseType === 'IMPORT' ? '수입' : '내수'} tone="info" />,
    },
    {
      key: 'targetDomain',
      header: '계정',
      width: 90,
      align: 'center',
      render: (r) => (
        <StatusBadge label={r.targetDomain === 'RENTAL' ? '렌탈자산' : '유통재고'} tone="primary" />
      ),
    },
    { key: 'supplierName', header: '매입처', render: (r) => r.supplierName },
    { key: 'currencyCode', header: '통화', width: 70, align: 'center', render: (r) => r.currencyCode },
    {
      key: 'fxRate',
      header: '적용환율',
      width: 95,
      align: 'right',
      render: (r) => Number(r.fxRate).toLocaleString('ko-KR'),
    },
    {
      key: 'totalLandedCostKrw',
      header: '총입고원가',
      width: 135,
      align: 'right',
      render: (r) => <span style={{ fontWeight: 700 }}>{formatMoney(r.totalLandedCostKrw)}</span>,
    },
    { key: 'status', header: '상태', width: 85, align: 'center', render: (r) => <StatusBadge label={r.status} tone="success" /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {canEdit && (
        <SectionPanel
          title="신규 매입 · 수입 통관 입고 등록"
          manualId="pur-form"
          rightSlot={
            <button type="button" onClick={addDraftLine} style={actionBtnStyle('secondary', true)}>
              품목 행 추가
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
              <VerticalField label="매입구분" required>
                <select
                  value={purchaseType}
                  onChange={(e) => {
                    const next = e.target.value as 'IMPORT' | 'DOMESTIC';
                    setPurchaseType(next);
                    if (next === 'DOMESTIC') handleCurrencyChange('KRW');
                  }}
                  style={controlInputStyle}
                >
                  <option value="IMPORT">수입 통관</option>
                  <option value="DOMESTIC">내수 매입</option>
                </select>
              </VerticalField>
              <VerticalField label="매입처" required>
                <select
                  value={supplierId || suppliers[0]?.id || ''}
                  onChange={(e) => setSupplierId(e.target.value)}
                  style={controlInputStyle}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <VerticalField label="귀속계정" required>
                <select
                  value={targetDomain}
                  onChange={(e) => setTargetDomain(e.target.value as 'TRADE' | 'RENTAL')}
                  style={controlInputStyle}
                >
                  <option value="TRADE">유통재고</option>
                  <option value="RENTAL">렌탈자산</option>
                </select>
              </VerticalField>
              <VerticalField label="입고기준일" required>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="통화" required>
                <select
                  value={currencyCode}
                  onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
                  style={controlInputStyle}
                >
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                  <option value="EUR">EUR</option>
                  <option value="JPY">JPY</option>
                  <option value="KRW">KRW</option>
                </select>
              </VerticalField>
              <VerticalField label="적용환율" required>
                <input
                  type="number"
                  step="0.01"
                  disabled={currencyCode === 'KRW'}
                  value={currencyCode === 'KRW' ? 1 : fxRate}
                  onChange={(e) => setFxRate(Number(e.target.value))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="BL 번호">
                <input
                  type="text"
                  value={blNo}
                  onChange={(e) => setBlNo(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="LC 번호">
                <input
                  type="text"
                  value={lcNo}
                  onChange={(e) => setLcNo(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
              <VerticalField label="관세">
                <input
                  type="number"
                  value={customsDutyKrw}
                  onChange={(e) => setCustomsDutyKrw(Number(e.target.value))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="해상운임">
                <input
                  type="number"
                  value={oceanFreightKrw}
                  onChange={(e) => setOceanFreightKrw(Number(e.target.value))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="통관수수료">
                <input
                  type="number"
                  value={clearanceFeeKrw}
                  onChange={(e) => setClearanceFeeKrw(Number(e.target.value))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="국내내륙운임">
                <input
                  type="number"
                  value={inlandFreightKrw}
                  onChange={(e) => setInlandFreightKrw(Number(e.target.value))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="비고">
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lines.map((l) => (
                <div
                  key={l.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 80px 130px 1.4fr 110px 65px',
                    gap: '8px',
                    alignItems: 'end',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--table-row-border)',
                    backgroundColor: 'var(--bg-app)',
                  }}
                >
                  <VerticalField label="입고 품목">
                    <select
                      value={l.itemId}
                      onChange={(e) => updateLineItem(l.key, e.target.value)}
                      style={controlInputStyle}
                    >
                      {datasets.itemMasters.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.sku} · {it.name} [{it.managementType === 'SERIAL' ? '시리얼' : '로트'}]
                        </option>
                      ))}
                    </select>
                  </VerticalField>
                  <VerticalField label="수량">
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.key === l.key ? { ...x, quantity: Number(e.target.value) } : x
                          )
                        )
                      }
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label={`단가 ${currencyCode}`}>
                    <input
                      type="number"
                      step="0.01"
                      value={l.foreignUnitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.key === l.key
                              ? { ...x, foreignUnitPrice: Number(e.target.value) }
                              : x
                          )
                        )
                      }
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField
                    label={l.managementType === 'SERIAL' ? '시리얼번호 쉼표구분' : '로트번호'}
                  >
                    {l.managementType === 'SERIAL' ? (
                      <input
                        type="text"
                        value={l.serialText}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) =>
                              x.key === l.key ? { ...x, serialText: e.target.value } : x
                            )
                          )
                        }
                        placeholder="미입력 시 번호 자동채번"
                        style={controlInputStyle}
                      />
                    ) : (
                      <input
                        type="text"
                        value={l.lotNo}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) => (x.key === l.key ? { ...x, lotNo: e.target.value } : x))
                          )
                        }
                        placeholder="로트번호"
                        style={controlInputStyle}
                      />
                    )}
                  </VerticalField>
                  <VerticalField label="입고창고">
                    <input
                      type="text"
                      value={l.warehouseLocation}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.key === l.key ? { ...x, warehouseLocation: e.target.value } : x
                          )
                        )
                      }
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    style={actionBtnStyle('danger', true)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>

            <ConservationBar
              manualId="pur-commit"
              items={[
                { label: `외화물품액 ${currencyCode}`, value: summary.foreignTotal.toLocaleString('ko-KR') },
                { label: '원화환산물품액', value: formatMoney(summary.krwMerchandise) },
                { label: '부대비용합계', value: formatMoney(summary.ancillary), tone: 'warning' },
                { label: '총입고원가', value: formatMoney(summary.totalLanded), tone: 'primary' },
              ]}
              balanceMessage="원가배분 단수 일치 대상"
            >
              <CommitActionButton
                actionCode="PURCHASE_CONFIRM"
                targetTable="fl_purchases"
                targetId="NEW_PURCHASE"
                title={`매입입고 확정 · ${summary.totalLanded.toLocaleString('ko-KR')}원`}
                buildPayload={buildPayload}
                onExecuteDirect={handleExecuteDirect}
                label="입고 확정"
              />
            </ConservationBar>
          </div>
        </SectionPanel>
      )}

      <SectionPanel title={`매입 통관 원장 · ${datasets.purchases.length}건`} manualId="pur-grid">
        <DataGrid
          columns={purchaseCols}
          rows={[...datasets.purchases].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))}
          rowKey={(r) => r.id}
          maxHeight="420px"
        />
      </SectionPanel>

      <ModalDialog
        open={Boolean(detailPurchase)}
        title={detailPurchase ? `매입 배분 상세 · ${detailPurchase.purchaseNo}` : ''}
        onClose={() => setDetailPurchase(null)}
        width={760}
      >
        {detailPurchase && (
          <DataGrid
            columns={[
              { key: 'sku', header: '품목코드', width: 120, render: (l) => l.sku },
              { key: 'itemName', header: '품명', render: (l) => l.itemName },
              { key: 'qty', header: '수량', width: 65, align: 'right', render: (l) => l.quantity },
              {
                key: 'merch',
                header: '배분물품대',
                width: 115,
                align: 'right',
                render: (l) => formatMoney(l.allocatedMerchandiseKrw),
              },
              {
                key: 'anc',
                header: '배분부대비',
                width: 115,
                align: 'right',
                render: (l) => formatMoney(l.allocatedAncillaryKrw),
              },
              {
                key: 'unitCost',
                header: '단가',
                width: 115,
                align: 'right',
                render: (l) => formatMoney(l.landedUnitCostKrw),
              },
              {
                key: 'totalCost',
                header: '배분총원가',
                width: 125,
                align: 'right',
                render: (l) => formatMoney(l.landedTotalCostKrw),
              },
            ]}
            rows={detailLines}
            rowKey={(l) => l.id}
            maxHeight="340px"
          />
        )}
      </ModalDialog>
    </div>
  );
};

export const LogisticsCostsPage: React.FC = () => {
  const { datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('logistics_costs');
  const today = new Date().toISOString().slice(0, 10);

  const carriers = useMemo(() => {
    const matched = datasets.partners.filter((p) => p.partnerRoles.includes('운송사'));
    return matched.length > 0 ? matched : datasets.partners;
  }, [datasets.partners]);

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
        dispatchPurpose,
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

  const totals = useMemo(() => {
    const supply = datasets.logisticsDispatches.reduce((s, d) => s + d.transportCostKrw, 0);
    const ours = datasets.logisticsDispatches
      .filter((d) => d.costBearer === 'OURS')
      .reduce((s, d) => s + d.transportCostKrw, 0);
    const customer = datasets.logisticsDispatches.reduce((s, d) => s + d.customerChargeKrw, 0);
    return { supply, ours, customer };
  }, [datasets.logisticsDispatches]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <VerticalField label="운송목적" required>
              <select
                value={dispatchPurpose}
                onChange={(e) =>
                  setDispatchPurpose(e.target.value as FlLogisticsDispatch['dispatchPurpose'])
                }
                style={controlInputStyle}
              >
                <option value="납품운송">납품운송</option>
                <option value="회수운송">회수운송</option>
                <option value="교환">교환</option>
                <option value="일반운송">일반운송</option>
                <option value="자체이동">자체이동</option>
              </select>
            </VerticalField>
            <VerticalField label="운송사" required>
              <select
                value={carrierPartnerId || carriers[0]?.id || ''}
                onChange={(e) => setCarrierPartnerId(e.target.value)}
                style={controlInputStyle}
              >
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
              <input
                type="number"
                value={transportCostKrw}
                onChange={(e) => setTransportCostKrw(Number(e.target.value))}
                style={controlInputStyle}
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
                <input
                  type="number"
                  value={customerChargeKrw || transportCostKrw}
                  onChange={(e) => setCustomerChargeKrw(Number(e.target.value))}
                  style={controlInputStyle}
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

      <DataGrid
        manualId="log-grid"
        columns={[
          { key: 'dispatchNo', header: '배차번호', width: 145, render: (r) => <span style={{ fontWeight: 700 }}>{r.dispatchNo}</span> },
          { key: 'dispatchDate', header: '일자', width: 100, render: (r) => r.dispatchDate },
          { key: 'purpose', header: '목적', width: 95, render: (r) => <StatusBadge label={r.dispatchPurpose} tone="info" /> },
          { key: 'carrierName', header: '운송사', width: 130, render: (r) => r.carrierName },
          { key: 'route', header: '구간', render: (r) => `${r.originAddress} -> ${r.destinationAddress}` },
          {
            key: 'cost',
            header: '운송비',
            width: 115,
            align: 'right',
            render: (r) => formatMoney(r.transportCostKrw),
          },
          {
            key: 'bearer',
            header: '부담주체',
            width: 95,
            align: 'center',
            render: (r) => (
              <StatusBadge
                label={r.costBearer === 'OURS' ? '당사부담' : r.costBearer === 'CUSTOMER' ? '고객청구' : '공급사'}
                tone={r.costBearer === 'OURS' ? 'warning' : 'success'}
              />
            ),
          },
          { key: 'status', header: '정산', width: 90, align: 'center', render: (r) => <StatusBadge label={r.settlementStatus} /> },
        ]}
        rows={[...datasets.logisticsDispatches].sort((a, b) => b.dispatchDate.localeCompare(a.dispatchDate))}
        rowKey={(r) => r.id}
        maxHeight="430px"
      />

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
