import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
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
  type GridColumn,
} from '../../components/UiPrimitives';
import {
  type FlItemMaster,
  type ItemCategory,
  type ItemDomain,
  type ManagementType,
} from '../../types/domain';
import { matchesKoreanQuery } from '../../utils/hangulSearch';

const ITEM_CATEGORIES: ItemCategory[] = ['완제품', '어태치먼트', '부품', '소모품'];
const CATEGORY_PRIORITY: Record<ItemCategory, number> = {
  완제품: 0,
  어태치먼트: 1,
  부품: 2,
  소모품: 3,
};

const ItemMastersWorkspace: React.FC<{ domainMode: 'TRADE' | 'RENTAL' }> = ({ domainMode }) => {
  const { isRentalEnabled, datasets, currentUser, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const pageId = domainMode === 'TRADE' ? 'trade_item_masters' : 'rental_item_masters';
  const canEdit = canEditPage(pageId);
  const maskPrice = Boolean(currentUser?.maskSalesPrice);
  const isTrade = domainMode === 'TRADE';
  const showDomainSplit = isRentalEnabled;

  const [catFilter, setCatFilter] = useState<'ALL' | ItemCategory>('ALL');
  const [domainFilter, setDomainFilter] = useState<'ALL' | 'DEDICATED' | 'BOTH'>('ALL');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Partial<FlItemMaster> | null>(null);
  const [saving, setSaving] = useState(false);

  const domainScoped = useMemo(() => {
    return [...datasets.itemMasters]
      .filter((it) => it.itemDomain === domainMode || it.itemDomain === 'BOTH')
      .sort((a, b) => {
        const diff = (CATEGORY_PRIORITY[a.itemCategory] ?? 9) - (CATEGORY_PRIORITY[b.itemCategory] ?? 9);
        return diff !== 0 ? diff : a.sku.localeCompare(b.sku);
      });
  }, [datasets.itemMasters, domainMode]);

  const filtered = useMemo(() => {
    const q = keyword.trim();
    return domainScoped.filter((it) => {
      if (showDomainSplit) {
        if (domainFilter === 'DEDICATED' && it.itemDomain !== domainMode) return false;
        if (domainFilter === 'BOTH' && it.itemDomain !== 'BOTH') return false;
      }
      if (catFilter !== 'ALL' && it.itemCategory !== catFilter) return false;
      if (!q) return true;
      const target = [it.sku, it.name, it.manufacturer, it.modelName, it.specSummary]
        .filter(Boolean)
        .join(' ');
      return matchesKoreanQuery(target, q);
    });
  }, [catFilter, domainFilter, domainMode, domainScoped, keyword, showDomainSplit]);

  const summaryCounts = useMemo(() => {
    let equip = 0;
    let attach = 0;
    let parts = 0;
    for (const it of filtered) {
      if (it.itemCategory === '완제품') equip++;
      else if (it.itemCategory === '어태치먼트') attach++;
      else parts++;
    }
    return { equip, attach, parts };
  }, [filtered]);

  const openNew = () => {
    setEditing({
      sku: '',
      name: '',
      itemCategory: '완제품',
      itemDomain: domainMode,
      managementType: 'SERIAL',
      manufacturer: '',
      modelName: '',
      powerType: '',
      specSummary: '',
      unitName: '대',
      standardCostKrw: 0,
      dealerPriceKrw: 0,
      retailPriceKrw: 0,
      standardMonthlyRentalKrw: 0,
      standardDailyRentalKrw: 0,
      depreciationMonths: 60,
      residualValueKrw: 0,
      warehouseLocation: '평택 주기장',
      isActive: true,
    });
  };

  const handleCategoryChange = (nextCat: ItemCategory) => {
    setEditing((prev) => {
      if (!prev) return prev;
      if (prev.id) {
        return { ...prev, itemCategory: nextCat };
      }
      const nextMgmt: ManagementType = nextCat === '완제품' ? 'SERIAL' : 'LOT';
      const nextUnit = nextCat === '완제품' ? '대' : nextCat === '어태치먼트' ? '식' : 'EA';
      return { ...prev, itemCategory: nextCat, managementType: nextMgmt, unitName: nextUnit };
    });
  };

  const handleSave = async () => {
    if (!editing || !editing.sku?.trim() || !editing.name?.trim()) {
      notifyToast('품목코드와 품명을 입력해 주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenantId: DEFAULT_TENANT_ID,
        sku: editing.sku.trim(),
        name: editing.name.trim(),
        itemCategory: editing.itemCategory || '완제품',
        itemDomain: showDomainSplit
          ? ((editing.itemDomain as ItemDomain) || domainMode)
          : (editing.id ? (editing.itemDomain as ItemDomain) || 'TRADE' : 'TRADE'),
        managementType: (editing.managementType as ManagementType) || 'LOT',
        manufacturer: editing.manufacturer || null,
        modelName: editing.modelName || null,
        tonnage: editing.tonnage ? Number(editing.tonnage) : null,
        powerType: editing.powerType || null,
        specSummary: editing.specSummary || null,
        unitName: editing.unitName || 'EA',
        standardCostKrw: Math.round(Number(editing.standardCostKrw || 0)),
        // 유통 화면에서는 렌탈 단가·상각 속성을 보존하고, 렌탈 화면에서는 유통 판매가를 보존한다.
        dealerPriceKrw: Math.round(Number(editing.dealerPriceKrw || 0)),
        retailPriceKrw: Math.round(Number(editing.retailPriceKrw || 0)),
        standardMonthlyRentalKrw: Math.round(Number(editing.standardMonthlyRentalKrw || 0)),
        standardDailyRentalKrw: Math.round(Number(editing.standardDailyRentalKrw || 0)),
        depreciationMonths: Number(editing.depreciationMonths || 60),
        residualValueKrw: Math.round(Number(editing.residualValueKrw || 0)),
        warehouseLocation: editing.warehouseLocation || '평택 주기장',
        vdiSpecs: editing.vdiSpecs || [],
        mastSpecs: editing.mastSpecs || [],
        batteryOptions: editing.batteryOptions || [],
        oemCrossRefCodes: editing.oemCrossRefCodes || [],
        compatibleModels: editing.compatibleModels || [],
        isActive: editing.isActive ?? true,
        memo: editing.memo || null,
        updatedAt: new Date().toISOString(),
      };
      if (editing.id) {
        await execDbMutation('품목 정보 수정', () =>
          flSupabase.from('item_masters').update(camelToSnakeRow(payload)).eq('id', editing.id!)
        );
      } else {
        const id = newId('ITM');
        await execDbMutation('품목 신규 등록', () =>
          flSupabase.from('item_masters').insert(camelToSnakeRow({ id, ...payload }))
        );
      }
      setEditing(null);
      await refreshAll();
      notifyToast('품목 저장 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '품목 저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns: GridColumn<FlItemMaster>[] = [
    {
      key: 'edit',
      header: '관리',
      width: 68,
      align: 'center',
      stickyLeft: true,
      render: (r) =>
        canEdit ? (
          <button type="button" onClick={() => setEditing({ ...r })} style={actionBtnStyle('secondary', true)}>
            수정
          </button>
        ) : (
          '-'
        ),
    },
    {
      key: 'sku',
      header: '품목코드',
      width: 135,
      sortable: true,
      sortValue: (r) => r.sku,
      render: (r) => <span style={{ fontWeight: 700 }}>{r.sku}</span>,
    },
    {
      key: 'itemCategory',
      header: '품목군',
      width: 92,
      sortable: true,
      sortValue: (r) => r.itemCategory,
      render: (r) => <StatusBadge label={r.itemCategory} />,
    },
    ...(showDomainSplit
      ? ([
          {
            key: 'itemDomain',
            header: '운용구분',
            width: 112,
            align: 'center',
            sortable: true,
            sortValue: (r) =>
              r.itemDomain === 'BOTH'
                ? '유통·렌탈 공용'
                : isTrade
                  ? '유통 전용'
                  : '렌탈 전용',
            render: (r) => (
              <StatusBadge
                label={
                  r.itemDomain === 'BOTH'
                    ? '유통·렌탈 공용'
                    : isTrade
                      ? '유통 전용'
                      : '렌탈 전용'
                }
                tone={r.itemDomain === 'BOTH' ? 'primary' : 'neutral'}
              />
            ),
          },
        ] as GridColumn<FlItemMaster>[])
      : []),
    {
      key: 'managementType',
      header: '추적방식',
      width: 86,
      align: 'center',
      sortable: true,
      sortValue: (r) => (r.managementType === 'SERIAL' ? '시리얼' : '로트'),
      render: (r) => <StatusBadge label={r.managementType === 'SERIAL' ? '시리얼' : '로트'} tone="info" />,
    },
    {
      key: 'name',
      header: '품명',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: 'manufacturer',
      header: '제조사',
      width: 100,
      sortable: true,
      sortValue: (r) => r.manufacturer || null,
      render: (r) => r.manufacturer || '-',
    },
    ...(isTrade
      ? ([
          {
            key: 'standardCostKrw',
            header: '표준원가',
            width: 115,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.standardCostKrw || 0),
            render: (r) => formatMoney(r.standardCostKrw),
          },
          {
            key: 'dealerPriceKrw',
            header: '대리점가',
            width: 115,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.dealerPriceKrw || 0),
            render: (r) => formatMoney(r.dealerPriceKrw, { salesSensitive: true }),
          },
          {
            key: 'retailPriceKrw',
            header: '판매정가',
            width: 115,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.retailPriceKrw || 0),
            render: (r) => formatMoney(r.retailPriceKrw, { salesSensitive: true }),
          },
        ] as GridColumn<FlItemMaster>[])
      : ([
          {
            key: 'standardCostKrw',
            header: '취득기준원가',
            width: 120,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.standardCostKrw || 0),
            render: (r) => formatMoney(r.standardCostKrw),
          },
          {
            key: 'standardMonthlyRentalKrw',
            header: '월 렌탈료',
            width: 118,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.standardMonthlyRentalKrw || 0),
            render: (r) => formatMoney(r.standardMonthlyRentalKrw, { salesSensitive: true }),
          },
          {
            key: 'standardDailyRentalKrw',
            header: '일 렌탈료',
            width: 110,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.standardDailyRentalKrw || 0),
            render: (r) => formatMoney(r.standardDailyRentalKrw, { salesSensitive: true }),
          },
          {
            key: 'depreciationMonths',
            header: '상각기간',
            width: 85,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.depreciationMonths || 60),
            render: (r) => `${Number(r.depreciationMonths || 60)}개월`,
          },
          {
            key: 'residualValueKrw',
            header: '잔존가치',
            width: 110,
            align: 'right',
            sortable: true,
            sortValue: (r) => Number(r.residualValueKrw || 0),
            render: (r) => formatMoney(r.residualValueKrw),
          },
        ] as GridColumn<FlItemMaster>[])),
  ];

  const domainScopedCounts = useMemo(
    () => ({
      dedicated: domainScoped.filter((i) => i.itemDomain === domainMode).length,
      both: domainScoped.filter((i) => i.itemDomain === 'BOTH').length,
    }),
    [domainMode, domainScoped]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title={isTrade ? '유통 품목 · 판매단가 검색' : '렌탈 품목 · 임대료 기준 검색'}
        manualId="itm-filter"
        rightSlot={
          canEdit && (
            <button
              type="button"
              data-manual-id="itm-form"
              onClick={openNew}
              style={actionBtnStyle('primary', true)}
            >
              {isTrade ? '유통 품목 추가' : '렌탈 품목 추가'}
            </button>
          )
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-stack-gap)', alignItems: 'flex-end' }}>
          <VerticalField label="품명 · 품번 · 초성 검색" minWidth={220} flex={1}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="품목코드, 품명, 제조사, 모델명, 초성"
              style={controlInputStyle}
            />
          </VerticalField>
          {showDomainSplit && (
            <SegmentedTabs
              tabs={[
                { id: 'ALL', label: '전체', count: domainScoped.length },
                {
                  id: 'DEDICATED',
                  label: isTrade ? '유통 전용' : '렌탈 전용',
                  count: domainScopedCounts.dedicated,
                },
                { id: 'BOTH', label: '유통·렌탈 공용', count: domainScopedCounts.both },
              ]}
              activeId={domainFilter}
              onChange={(id) => setDomainFilter(id as typeof domainFilter)}
            />
          )}
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체 품목군', count: domainScoped.length },
              ...ITEM_CATEGORIES.map((c) => ({
                id: c,
                label: c,
                count: domainScoped.filter((i) => i.itemCategory === c).length,
              })),
            ]}
            activeId={catFilter}
            onChange={(id) => setCatFilter(id as typeof catFilter)}
          />
        </div>
      </SectionPanel>

      <DataGrid
        manualId="itm-grid"
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        maxHeight="calc(100vh - 200px)"
      />

      <ConservationBar
        manualId="itm-sum"
        items={[
          {
            label: isTrade ? '조회 유통 품목' : '조회 렌탈 품목',
            value: `${filtered.length.toLocaleString('ko-KR')}종`,
            tone: 'primary',
          },
          { label: '완제품', value: `${summaryCounts.equip.toLocaleString('ko-KR')}종` },
          { label: '어태치먼트', value: `${summaryCounts.attach.toLocaleString('ko-KR')}종` },
          {
            label: isTrade ? '부품·소모품' : '정비부품·소모품',
            value: `${summaryCounts.parts.toLocaleString('ko-KR')}종`,
          },
        ]}
        balanced
        balanceMessage={isTrade ? '유통 품목 원장 정상' : '렌탈 품목 원장 정상'}
      />

      <ModalDialog
        open={Boolean(editing)}
        title={
          editing?.id
            ? `${isTrade ? '유통' : '렌탈'} 품목 수정 · ${editing.name}`
            : `신규 ${isTrade ? '유통' : '렌탈'} 품목 등록`
        }
        onClose={() => setEditing(null)}
        width={720}
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: showDomainSplit ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr',
                gap: 'var(--space-field-grid-gap)',
              }}
            >
              <VerticalField label="품목코드" required>
                <input
                  type="text"
                  value={editing.sku || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, sku: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              {showDomainSplit && (
                <VerticalField label="운용 구분" required>
                  <select
                    value={editing.itemDomain || domainMode}
                    onChange={(e) =>
                      setEditing((p) => ({ ...p, itemDomain: e.target.value as ItemDomain }))
                    }
                    style={controlInputStyle}
                  >
                    <option value={domainMode}>{isTrade ? '유통 전용' : '렌탈 전용'}</option>
                    <option value="BOTH">유통·렌탈 공용</option>
                  </select>
                </VerticalField>
              )}
              <VerticalField label="품목군" required>
                <select
                  value={editing.itemCategory || '완제품'}
                  onChange={(e) => handleCategoryChange(e.target.value as ItemCategory)}
                  style={controlInputStyle}
                >
                  {ITEM_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <VerticalField label="추적방식" required>
                <select
                  value={editing.managementType || 'SERIAL'}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, managementType: e.target.value as ManagementType }))
                  }
                  style={controlInputStyle}
                >
                  <option value="SERIAL">시리얼 개별추적</option>
                  <option value="LOT">로트 수량추적</option>
                </select>
              </VerticalField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
              <VerticalField label="품명" required>
                <input
                  type="text"
                  value={editing.name || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="제조사">
                <input
                  type="text"
                  value={editing.manufacturer || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, manufacturer: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="모델명">
                <input
                  type="text"
                  value={editing.modelName || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, modelName: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="보관창고">
                <input
                  type="text"
                  value={editing.warehouseLocation || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, warehouseLocation: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>

            {isTrade ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="표준원가">
                  <CommaNumberInput
                    value={Number(editing.standardCostKrw ?? 0)}
                    onChange={(val) => setEditing((p) => ({ ...p, standardCostKrw: val }))}
                    min={0}
                  />
                </VerticalField>
                <VerticalField label="대리점가">
                  <CommaNumberInput
                    disabled={maskPrice}
                    value={maskPrice ? 0 : Number(editing.dealerPriceKrw ?? 0)}
                    onChange={(val) => setEditing((p) => ({ ...p, dealerPriceKrw: val }))}
                    min={0}
                  />
                </VerticalField>
                <VerticalField label="판매정가">
                  <CommaNumberInput
                    disabled={maskPrice}
                    value={maskPrice ? 0 : Number(editing.retailPriceKrw ?? 0)}
                    onChange={(val) => setEditing((p) => ({ ...p, retailPriceKrw: val }))}
                    min={0}
                  />
                </VerticalField>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="취득기준원가">
                  <CommaNumberInput
                    value={Number(editing.standardCostKrw ?? 0)}
                    onChange={(val) => setEditing((p) => ({ ...p, standardCostKrw: val }))}
                    min={0}
                  />
                </VerticalField>
                <VerticalField label="월 렌탈료">
                  <CommaNumberInput
                    disabled={maskPrice}
                    value={maskPrice ? 0 : Number(editing.standardMonthlyRentalKrw ?? 0)}
                    onChange={(val) =>
                      setEditing((p) => {
                        if (!p) return p;
                        const prevAutoDaily = Math.round(Number(p.standardMonthlyRentalKrw || 0) / 30);
                        const shouldAutoSync =
                          !p.standardDailyRentalKrw || Number(p.standardDailyRentalKrw) === prevAutoDaily;
                        return {
                          ...p,
                          standardMonthlyRentalKrw: val,
                          standardDailyRentalKrw: shouldAutoSync
                            ? Math.round(val / 30)
                            : Number(p.standardDailyRentalKrw || 0),
                        };
                      })
                    }
                    min={0}
                  />
                </VerticalField>
                <VerticalField label="일 렌탈료">
                  <CommaNumberInput
                    disabled={maskPrice}
                    value={maskPrice ? 0 : Number(editing.standardDailyRentalKrw ?? 0)}
                    onChange={(val) => setEditing((p) => ({ ...p, standardDailyRentalKrw: val }))}
                    min={0}
                  />
                </VerticalField>
                <VerticalField label="상각기간 · 개월">
                  <CommaNumberInput
                    value={Number(editing.depreciationMonths ?? 60)}
                    onChange={(val) => setEditing((p) => ({ ...p, depreciationMonths: Math.max(1, val) }))}
                    min={1}
                  />
                </VerticalField>
                <VerticalField label="잔존가치">
                  <CommaNumberInput
                    value={Number(editing.residualValueKrw ?? 0)}
                    onChange={(val) => setEditing((p) => ({ ...p, residualValueKrw: val }))}
                    min={0}
                  />
                </VerticalField>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)', marginTop: 'var(--space-tight-gap)' }}>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={actionBtnStyle('secondary')}
              >
                취소
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                style={actionBtnStyle('primary')}
              >
                {saving ? '저장중' : '품목 저장'}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};

export const TradeItemMastersPage: React.FC = () => <ItemMastersWorkspace domainMode="TRADE" />;
export const RentalItemMastersPage: React.FC = () => <ItemMastersWorkspace domainMode="RENTAL" />;
