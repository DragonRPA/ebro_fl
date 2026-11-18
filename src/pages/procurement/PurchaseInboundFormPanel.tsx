import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { confirmPurchaseInbound } from '../../services/domainProcurementLeaseEngine';
import { todayIso } from '../../services/domainMath';
import { resolveManagedRateForDate } from '../../utils/fxRateUtils';
import {
  SearchableSelect,
  toPartnerSelectOptions,
  type SearchableSelectOption,
} from '../../components/SearchableSelect';
import {
  CommaNumberInput,
  ConservationBar,
  SectionPanel,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  filterItemMastersForTenant,
  filterPartnersForTenant,
  formatKoCurrency,
  type CurrencyCode,
  type ItemCategory,
  type ManagementType,
} from '../../types/domain';

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

/**
 * 수입 통관 및 내수 매입 입고 등록, 환율·부대비용 원가배분과 품목 행 편집 패널을 렌더링한다.
 */
export const PurchaseInboundFormPanel: React.FC = () => {
  const { currentUser, isRentalEnabled, datasets, formatMoney, refreshAll, notifyToast } = useAppShell();
  const today = todayIso();

  const tenantPartners = useMemo(
    () => filterPartnersForTenant(datasets.partners, isRentalEnabled),
    [datasets.partners, isRentalEnabled]
  );

  const suppliers = useMemo(() => {
    const matched = tenantPartners.filter(
      (p) => p.partnerRoles.includes('매입처') || p.partnerRoles.includes('대리점')
    );
    return matched.length > 0 ? matched : tenantPartners;
  }, [tenantPartners]);

  const supplierOptions = useMemo<SearchableSelectOption[]>(
    () => toPartnerSelectOptions(suppliers),
    [suppliers]
  );

  const [purchaseType, setPurchaseType] = useState<'IMPORT' | 'DOMESTIC'>('IMPORT');
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [targetDomain, setTargetDomain] = useState<'TRADE' | 'RENTAL'>('TRADE');
  const effectiveDomain: 'TRADE' | 'RENTAL' = isRentalEnabled ? targetDomain : 'TRADE';

  const tenantItems = useMemo(
    () => filterItemMastersForTenant(datasets.itemMasters, isRentalEnabled),
    [datasets.itemMasters, isRentalEnabled]
  );

  const scopedItems = useMemo(() => {
    const matched = tenantItems.filter(
      (it) => it.itemDomain === effectiveDomain || it.itemDomain === 'BOTH'
    );
    return matched.length > 0 ? matched : tenantItems;
  }, [effectiveDomain, tenantItems]);

  const itemOptions = useMemo<SearchableSelectOption[]>(
    () =>
      scopedItems.map((it) => ({
        value: it.id,
        label: `${it.sku} · ${it.name} [${it.managementType === 'SERIAL' ? '시리얼' : '로트'}]`,
        subLabel: it.manufacturer || it.itemCategory,
        searchText: [it.sku, it.name, it.manufacturer, it.modelName, it.itemCategory]
          .filter(Boolean)
          .join(' '),
      })),
    [scopedItems]
  );

  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('USD');
  const [fxDate, setFxDate] = useState(today);
  const [fxRate, setFxRate] = useState<number>(() =>
    resolveManagedRateForDate(datasets.exchangeRates, 'USD', today).rate
  );
  const fxRateManuallyEdited = useRef(false);
  const fxFetchSeqRef = useRef(0);
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [blNo, setBlNo] = useState('');
  const [lcNo, setLcNo] = useState('');
  const [customsDutyKrw, setCustomsDutyKrw] = useState(0);
  const [oceanFreightKrw, setOceanFreightKrw] = useState(0);
  const [clearanceFeeKrw, setClearanceFeeKrw] = useState(0);
  const [inlandFreightKrw, setInlandFreightKrw] = useState(0);
  const [memo, setMemo] = useState('');

  const [lines, setLines] = useState<DraftPurchaseLine[]>(() => {
    const firstItem = scopedItems[0];
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

  useEffect(() => {
    if (fxRateManuallyEdited.current || currencyCode === 'KRW') return;
    const resolved = resolveManagedRateForDate(datasets.exchangeRates, currencyCode, fxDate);
    if (resolved.rate > 0) {
      setFxRate(resolved.rate);
    }
  }, [currencyCode, datasets.exchangeRates, fxDate]);

  const applyDefaultRateFor = (nextCur: CurrencyCode, nextFxDate: string) => {
    fxRateManuallyEdited.current = false;
    const reqSeq = ++fxFetchSeqRef.current;
    if (nextCur === 'KRW') {
      setFxRate(1);
      return;
    }
    const resolved = resolveManagedRateForDate(datasets.exchangeRates, nextCur, nextFxDate);
    setFxRate(resolved.rate);
    if (!resolved.exactMatch && /^\d{4}-\d{2}-\d{2}$/.test(nextFxDate)) {
      void fetch(`/api/exchange-rate?currency=${encodeURIComponent(nextCur)}&date=${encodeURIComponent(nextFxDate)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json: { success?: boolean; data?: { baseRate?: number } } | null) => {
          if (reqSeq !== fxFetchSeqRef.current || fxRateManuallyEdited.current) return;
          const fetchedRate = Number(json?.data?.baseRate || 0);
          if (fetchedRate > 0) {
            setFxRate(fetchedRate);
          }
        })
        .catch(() => {
          // 오프라인·프리뷰 환경에서는 관리 환율 원장 최근접값 유지
        });
    }
  };

  const handleCurrencyChange = (nextCur: CurrencyCode) => {
    setCurrencyCode(nextCur);
    applyDefaultRateFor(nextCur, fxDate);
  };

  const handleFxDateChange = (nextFxDate: string) => {
    setFxDate(nextFxDate);
    applyDefaultRateFor(currencyCode, nextFxDate);
  };

  const addDraftLine = () => {
    const item = scopedItems[0];
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

  const updateDraftLine = (key: string, patch: Partial<DraftPurchaseLine>) => {
    setLines((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  };

  const removeDraftLine = (key: string) => {
    setLines((prev) => prev.filter((x) => x.key !== key));
  };

  const handleDomainChange = (nextDomain: 'TRADE' | 'RENTAL') => {
    setTargetDomain(nextDomain);
    const nextScoped = datasets.itemMasters.filter(
      (it) => it.itemDomain === nextDomain || it.itemDomain === 'BOTH'
    );
    const fallbackItem = nextScoped[0];
    if (!fallbackItem) return;
    const validIds = new Set(nextScoped.map((i) => i.id));
    setLines((prev) =>
      prev.map((l) =>
        validIds.has(l.itemId)
          ? l
          : {
              ...l,
              itemId: fallbackItem.id,
              sku: fallbackItem.sku,
              itemName: fallbackItem.name,
              itemCategory: fallbackItem.itemCategory,
              managementType: fallbackItem.managementType,
              foreignUnitPrice: fallbackItem.standardCostKrw || l.foreignUnitPrice,
              warehouseLocation: fallbackItem.warehouseLocation || '본사창고',
            }
      )
    );
  };

  const updateLineItem = (key: string, itemId: string) => {
    const item = datasets.itemMasters.find((i) => i.id === itemId);
    if (!item) return;
    updateDraftLine(key, {
      itemId: item.id,
      sku: item.sku,
      itemName: item.name,
      itemCategory: item.itemCategory,
      managementType: item.managementType,
      warehouseLocation: item.warehouseLocation || '본사창고',
    });
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
      targetDomain: effectiveDomain,
      blNo: blNo.trim() || undefined,
      lcNo: lcNo.trim() || undefined,
      currencyCode,
      fxRate: currencyCode === 'KRW' ? 1 : Number(fxRate || 1),
      fxDate: currencyCode === 'KRW' ? effectiveDate : fxDate || effectiveDate,
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

  return (
    <SectionPanel
      title="신규 매입 · 수입 통관 입고 등록"
      manualId="pur-form"
      rightSlot={
        <button type="button" onClick={addDraftLine} style={actionBtnStyle('secondary', true)}>
          품목 행 추가
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
          <VerticalField label="매입구분" minWidth={0} required>
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
          <VerticalField label="매입처" minWidth={0} required>
            <SearchableSelect
              value={supplierId || suppliers[0]?.id || ''}
              options={supplierOptions}
              onChange={(nextId) => setSupplierId(nextId)}
              placeholder="매입처 선택"
              searchPlaceholder="매입처명 · 초성 · 사업자번호 검색"
              minDropdownWidth={280}
            />
          </VerticalField>
          {isRentalEnabled && (
            <VerticalField label="귀속계정" minWidth={0} required>
              <select
                value={targetDomain}
                onChange={(e) => handleDomainChange(e.target.value as 'TRADE' | 'RENTAL')}
                style={controlInputStyle}
              >
                <option value="TRADE">유통재고</option>
                <option value="RENTAL">렌탈자산</option>
              </select>
            </VerticalField>
          )}
          <VerticalField label="입고기준일" minWidth={0} required>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="통화" minWidth={0} required>
            <select
              data-testid="pur-currency"
              value={currencyCode}
              onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
              style={controlInputStyle}
            >
              <option value="USD">미국 달러</option>
              <option value="CNY">중국 위안</option>
              <option value="EUR">유럽 유로</option>
              <option value="JPY">일본 엔</option>
              <option value="KRW">원화</option>
            </select>
          </VerticalField>
          <VerticalField label="환율적용일" minWidth={0} required>
            <input
              type="date"
              data-testid="pur-fx-date"
              disabled={currencyCode === 'KRW'}
              value={currencyCode === 'KRW' ? effectiveDate : fxDate}
              onChange={(e) => handleFxDateChange(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="적용환율" minWidth={0} required>
            <CommaNumberInput
              dataTestId="pur-fx-rate"
              allowDecimal
              maxDecimals={4}
              min={0}
              disabled={currencyCode === 'KRW'}
              value={currencyCode === 'KRW' ? 1 : fxRate}
              onChange={(val) => {
                fxRateManuallyEdited.current = true;
                setFxRate(val);
              }}
            />
          </VerticalField>
          <VerticalField label="선하증권 번호" minWidth={0}>
            <input
              type="text"
              value={blNo}
              onChange={(e) => setBlNo(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="신용장 번호" minWidth={0}>
            <input
              type="text"
              value={lcNo}
              onChange={(e) => setLcNo(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
          <VerticalField label="관세" minWidth={0}>
            <CommaNumberInput
              allowDecimal={false}
              min={0}
              value={customsDutyKrw}
              onChange={setCustomsDutyKrw}
            />
          </VerticalField>
          <VerticalField label="해상운임" minWidth={0}>
            <CommaNumberInput
              allowDecimal={false}
              min={0}
              value={oceanFreightKrw}
              onChange={setOceanFreightKrw}
            />
          </VerticalField>
          <VerticalField label="통관수수료" minWidth={0}>
            <CommaNumberInput
              allowDecimal={false}
              min={0}
              value={clearanceFeeKrw}
              onChange={setClearanceFeeKrw}
            />
          </VerticalField>
          <VerticalField label="국내내륙운임" minWidth={0}>
            <CommaNumberInput
              allowDecimal={false}
              min={0}
              value={inlandFreightKrw}
              onChange={setInlandFreightKrw}
            />
          </VerticalField>
          <VerticalField label="비고" minWidth={0}>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-inline-gap)', overflowX: 'auto' }}>
          {lines.map((l) => (
            <div
              key={l.key}
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'minmax(220px, 2.1fr) minmax(104px, 0.75fr) minmax(150px, 1.05fr) minmax(170px, 1.35fr) minmax(130px, 0.9fr) 68px',
                minWidth: '890px',
                gap: 'var(--space-field-grid-gap)',
                alignItems: 'end',
                padding: 'var(--space-compact-pad-y) var(--space-compact-pad-x)',
                borderRadius: '6px',
                border: '1px solid var(--table-row-border)',
                backgroundColor: 'var(--bg-app)',
              }}
            >
              <VerticalField label="입고 품목" minWidth={0}>
                <SearchableSelect
                  value={l.itemId}
                  options={itemOptions}
                  onChange={(nextItemId) => updateLineItem(l.key, nextItemId)}
                  placeholder="입고 품목 선택"
                  searchPlaceholder="품명 · 초성 · 품번 · 제조사 검색"
                  minDropdownWidth={360}
                />
              </VerticalField>
              <VerticalField label="수량" minWidth={0}>
                <CommaNumberInput
                  dataTestId="pur-line-qty"
                  allowDecimal={false}
                  min={1}
                  value={l.quantity}
                  onChange={(val) => updateDraftLine(l.key, { quantity: val })}
                />
              </VerticalField>
              <VerticalField label={`단가 · ${formatKoCurrency(currencyCode)}`} minWidth={0}>
                <CommaNumberInput
                  dataTestId="pur-line-price"
                  allowDecimal={currencyCode !== 'KRW'}
                  maxDecimals={4}
                  min={0}
                  value={l.foreignUnitPrice}
                  onChange={(val) => updateDraftLine(l.key, { foreignUnitPrice: val })}
                />
              </VerticalField>
              <VerticalField
                label={l.managementType === 'SERIAL' ? '시리얼번호 쉼표구분' : '로트번호'}
                minWidth={0}
              >
                {l.managementType === 'SERIAL' ? (
                  <input
                    type="text"
                    value={l.serialText}
                    onChange={(e) => updateDraftLine(l.key, { serialText: e.target.value })}
                    placeholder="미입력 시 번호 자동채번"
                    style={controlInputStyle}
                  />
                ) : (
                  <input
                    type="text"
                    value={l.lotNo}
                    onChange={(e) => updateDraftLine(l.key, { lotNo: e.target.value })}
                    placeholder="로트번호"
                    style={controlInputStyle}
                  />
                )}
              </VerticalField>
              <VerticalField label="입고창고" minWidth={0}>
                <input
                  type="text"
                  value={l.warehouseLocation}
                  onChange={(e) => updateDraftLine(l.key, { warehouseLocation: e.target.value })}
                  style={controlInputStyle}
                />
              </VerticalField>
              <button
                type="button"
                onClick={() => removeDraftLine(l.key)}
                style={{ ...actionBtnStyle('danger', true), height: 'var(--space-control-h)' }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>

        <ConservationBar
          manualId="pur-commit"
          items={[
            { label: `외화물품액 · ${formatKoCurrency(currencyCode)}`, value: summary.foreignTotal.toLocaleString('ko-KR') },
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
  );
};
