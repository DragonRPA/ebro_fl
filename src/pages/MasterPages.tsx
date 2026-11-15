import React, { useMemo, useState } from 'react';
import { useAppShell } from '../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../core/supabase';
import {
  DataGrid,
  ModalDialog,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  controlTextareaStyle,
  type GridColumn,
} from '../components/UiPrimitives';
import type {
  CurrencyCode,
  FlCatalogPackage,
  FlExchangeRate,
  FlItemMaster,
  FlPartner,
  FlPartnerSite,
  ItemCategory,
  ManagementType,
  PartnerRole,
} from '../types/domain';
import { FL_TECHNICAL_ARCHIVE } from '../data/flTechnicalArchive';
import { COMPATIBLE_PARTS_CATALOG, PART_CATEGORIES } from '../data/compatiblePartsCatalogData';

const ALL_ROLES: PartnerRole[] = [
  '매출처',
  '대리점',
  '금융사',
  '매입처',
  '전대공급처',
  '운송사',
  '외주정비처',
];

export const PartnersPage: React.FC = () => {
  const { datasets, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('partners');

  const [roleFilter, setRoleFilter] = useState<'ALL' | PartnerRole>('ALL');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(datasets.partners[0]?.id || null);

  const [form, setForm] = useState<Partial<FlPartner>>({
    name: '',
    bizRegNo: '',
    representative: '',
    bizType: '',
    bizItem: '',
    address: '',
    phone: '',
    email: '',
    taxEmail: '',
    partnerRoles: ['매출처'],
    defaultClosingDay: 31,
    defaultPaymentDueDay: 15,
    defaultPaymentMonthOffset: 1,
    paymentMethod: '계좌이체',
    bankName: '',
    bankAccount: '',
    bankHolder: '',
    creditGrade: '정상',
    memo: '',
    isActive: true,
  });

  const [siteForm, setSiteForm] = useState({
    siteName: '',
    address: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  });
  const [saving, setSaving] = useState(false);

  const selectPartner = (p: FlPartner) => {
    setSelectedId(p.id);
    setForm({ ...p });
  };

  const resetToNew = () => {
    setSelectedId(null);
    setForm({
      name: '',
      bizRegNo: '',
      representative: '',
      bizType: '',
      bizItem: '',
      address: '',
      phone: '',
      email: '',
      taxEmail: '',
      partnerRoles: ['매출처'],
      defaultClosingDay: 31,
      defaultPaymentDueDay: 15,
      defaultPaymentMonthOffset: 1,
      paymentMethod: '계좌이체',
      bankName: '',
      bankAccount: '',
      bankHolder: '',
      creditGrade: '정상',
      memo: '',
      isActive: true,
    });
  };

  const toggleRole = (role: PartnerRole) => {
    const cur = form.partnerRoles || [];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    setForm((p) => ({ ...p, partnerRoles: next }));
  };

  const handleSavePartner = async () => {
    if (!form.name?.trim()) {
      notifyToast('상호명을 입력해 주세요.', 'error');
      return;
    }
    if (!form.partnerRoles || form.partnerRoles.length === 0) {
      notifyToast('최소 1개 이상의 거래처 역할을 선택해 주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenantId: DEFAULT_TENANT_ID,
        name: form.name.trim(),
        bizRegNo: form.bizRegNo || null,
        representative: form.representative || null,
        bizType: form.bizType || null,
        bizItem: form.bizItem || null,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        taxEmail: form.taxEmail || null,
        partnerRoles: form.partnerRoles,
        defaultClosingDay: Number(form.defaultClosingDay || 31),
        defaultPaymentDueDay: Number(form.defaultPaymentDueDay || 15),
        defaultPaymentMonthOffset: Number(form.defaultPaymentMonthOffset || 1),
        paymentMethod: form.paymentMethod || '계좌이체',
        bankName: form.bankName || null,
        bankAccount: form.bankAccount || null,
        bankHolder: form.bankHolder || null,
        creditGrade: form.creditGrade || '정상',
        memo: form.memo || null,
        isActive: form.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };
      if (selectedId) {
        await execDbMutation('거래처 정보 수정', () =>
          flSupabase.from('partners').update(camelToSnakeRow(payload)).eq('id', selectedId)
        );
      } else {
        const id = newId('PRT');
        await execDbMutation('거래처 신규 등록', () =>
          flSupabase.from('partners').insert(camelToSnakeRow({ id, ...payload }))
        );
        setSelectedId(id);
      }
      await refreshAll();
      notifyToast('거래처 저장 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '거래처 저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSite = async () => {
    if (!selectedId) {
      notifyToast('먼저 좌측 목록에서 거래처를 선택해 주세요.', 'error');
      return;
    }
    if (!siteForm.siteName.trim()) {
      notifyToast('사업장 또는 현장명을 입력해 주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      const site: FlPartnerSite = {
        id: newId('SITE'),
        tenantId: DEFAULT_TENANT_ID,
        partnerId: selectedId,
        siteName: siteForm.siteName.trim(),
        address: siteForm.address || null,
        contactName: siteForm.contactName || null,
        contactPhone: siteForm.contactPhone || null,
        contactEmail: siteForm.contactEmail || null,
        isPrimary: false,
        isActive: true,
      };
      await execDbMutation('사업장 추가', () =>
        flSupabase.from('partner_sites').insert(camelToSnakeRow({ ...site }))
      );
      setSiteForm({ siteName: '', address: '', contactName: '', contactPhone: '', contactEmail: '' });
      await refreshAll();
      notifyToast('사업장 추가 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '사업장 추가 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredPartners = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return datasets.partners.filter((p) => {
      if (roleFilter !== 'ALL' && !p.partnerRoles.includes(roleFilter)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.bizRegNo || '').toLowerCase().includes(q) ||
        (p.representative || '').toLowerCase().includes(q)
      );
    });
  }, [datasets.partners, keyword, roleFilter]);

  const partnerSites = useMemo(
    () => datasets.partnerSites.filter((s) => s.partnerId === selectedId),
    [datasets.partnerSites, selectedId]
  );

  const columns: GridColumn<FlPartner>[] = [
    {
      key: 'select',
      header: '선택',
      width: 68,
      align: 'center',
      stickyLeft: true,
      render: (r) => (
        <button type="button" onClick={() => selectPartner(r)} style={actionBtnStyle('secondary', true)}>
          조회
        </button>
      ),
    },
    { key: 'name', header: '상호명', render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span> },
    {
      key: 'roles',
      header: '역할',
      render: (r) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          {r.partnerRoles.slice(0, 3).map((role) => (
            <StatusBadge key={role} label={role} tone="neutral" />
          ))}
        </div>
      ),
    },
    { key: 'bizRegNo', header: '사업자번호', width: 120, render: (r) => r.bizRegNo || '-' },
    { key: 'phone', header: '연락처', width: 120, render: (r) => r.phone || '-' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel
        title="거래처 조회 · 역할 필터"
        manualId="prt-search"
        rightSlot={
          canEdit && (
            <button type="button" onClick={resetToNew} style={actionBtnStyle('primary', true)}>
              신규 거래처
            </button>
          )
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <VerticalField label="검색어" minWidth={220} flex={1}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="상호, 사업자등록번호, 대표자명"
              style={controlInputStyle}
            />
          </VerticalField>
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체', count: datasets.partners.length },
              ...ALL_ROLES.map((r) => ({
                id: r,
                label: r,
                count: datasets.partners.filter((p) => p.partnerRoles.includes(r)).length,
              })),
            ]}
            activeId={roleFilter}
            onChange={(id) => setRoleFilter(id as typeof roleFilter)}
          />
        </div>
      </SectionPanel>

      <div
        data-manual-id="prt-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(380px, 1.15fr) minmax(360px, 1fr)',
          gap: '14px',
          alignItems: 'start',
        }}
      >
        <DataGrid
          columns={columns}
          rows={filteredPartners}
          rowKey={(r) => r.id}
          selectedRowId={selectedId}
          onRowClick={selectPartner}
          maxHeight="620px"
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <SectionPanel
            title={selectedId ? `거래처 상세 · ${form.name || ''}` : '신규 거래처 등록'}
            rightSlot={
              canEdit && (
                <button
                  type="button"
                  data-manual-id="prt-save"
                  disabled={saving}
                  onClick={handleSavePartner}
                  style={actionBtnStyle('primary', true)}
                >
                  {saving ? '저장중' : '거래처 저장'}
                </button>
              )
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <VerticalField label="거래처 역할 다중선택" required>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ALL_ROLES.map((role) => {
                    const checked = (form.partnerRoles || []).includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '5px',
                          border: `1px solid ${checked ? 'var(--primary)' : 'var(--border-color)'}`,
                          backgroundColor: checked ? 'var(--primary-light)' : 'var(--bg-app)',
                          color: checked ? 'var(--primary)' : 'var(--text-secondary)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </VerticalField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <VerticalField label="상호" required>
                  <input
                    type="text"
                    value={form.name || ''}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="사업자등록번호">
                  <input
                    type="text"
                    value={form.bizRegNo || ''}
                    onChange={(e) => setForm((p) => ({ ...p, bizRegNo: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="대표자">
                  <input
                    type="text"
                    value={form.representative || ''}
                    onChange={(e) => setForm((p) => ({ ...p, representative: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="대표 전화">
                  <input
                    type="text"
                    value={form.phone || ''}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="업태">
                  <input
                    type="text"
                    value={form.bizType || ''}
                    onChange={(e) => setForm((p) => ({ ...p, bizType: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="종목">
                  <input
                    type="text"
                    value={form.bizItem || ''}
                    onChange={(e) => setForm((p) => ({ ...p, bizItem: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="계산서 이메일">
                  <input
                    type="email"
                    value={form.taxEmail || ''}
                    onChange={(e) => setForm((p) => ({ ...p, taxEmail: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="결제수단">
                  <input
                    type="text"
                    value={form.paymentMethod || ''}
                    onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                    style={controlInputStyle}
                  />
                </VerticalField>
              </div>

              <VerticalField label="주소">
                <input
                  type="text"
                  value={form.address || ''}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <VerticalField label="청구마감일">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.defaultClosingDay ?? 31}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, defaultClosingDay: Number(e.target.value) }))
                    }
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="지급기일">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.defaultPaymentDueDay ?? 15}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, defaultPaymentDueDay: Number(e.target.value) }))
                    }
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="익월오프셋">
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={form.defaultPaymentMonthOffset ?? 1}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, defaultPaymentMonthOffset: Number(e.target.value) }))
                    }
                    style={controlInputStyle}
                  />
                </VerticalField>
              </div>

              <VerticalField label="특이 메모">
                <textarea
                  rows={2}
                  value={form.memo || ''}
                  onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
                  style={controlTextareaStyle}
                />
              </VerticalField>
            </div>
          </SectionPanel>

          <SectionPanel title={`소속 사업장 · 현장 목록 · ${partnerSites.length}건`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {canEdit && selectedId && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                  <VerticalField label="현장명" required>
                    <input
                      type="text"
                      value={siteForm.siteName}
                      onChange={(e) => setSiteForm((p) => ({ ...p, siteName: e.target.value }))}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="현장주소">
                    <input
                      type="text"
                      value={siteForm.address}
                      onChange={(e) => setSiteForm((p) => ({ ...p, address: e.target.value }))}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleAddSite}
                    style={actionBtnStyle('secondary')}
                  >
                    현장 추가
                  </button>
                </div>
              )}

              <DataGrid
                columns={[
                  { key: 'siteName', header: '현장명', render: (s) => s.siteName },
                  { key: 'address', header: '주소', render: (s) => s.address || '-' },
                  { key: 'contactPhone', header: '연락처', width: 120, render: (s) => s.contactPhone || '-' },
                ]}
                rows={partnerSites}
                rowKey={(s) => s.id}
                maxHeight="200px"
                emptyText="등록된 현장 정보가 없습니다."
              />
            </div>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
};

const ITEM_CATEGORIES: ItemCategory[] = ['완제품', '어태치먼트', '부품', '소모품'];

export const ItemMastersPage: React.FC = () => {
  const { datasets, currentUser, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('item_masters');
  const maskPrice = Boolean(currentUser?.maskSalesPrice);

  const [catFilter, setCatFilter] = useState<'ALL' | ItemCategory>('ALL');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Partial<FlItemMaster> | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return datasets.itemMasters.filter((it) => {
      if (catFilter !== 'ALL' && it.itemCategory !== catFilter) return false;
      if (!q) return true;
      return (
        it.sku.toLowerCase().includes(q) ||
        it.name.toLowerCase().includes(q) ||
        (it.manufacturer || '').toLowerCase().includes(q) ||
        (it.modelName || '').toLowerCase().includes(q)
      );
    });
  }, [catFilter, datasets.itemMasters, keyword]);

  const openNew = () => {
    setEditing({
      sku: '',
      name: '',
      itemCategory: '부품',
      managementType: 'LOT',
      manufacturer: '',
      modelName: '',
      powerType: '',
      specSummary: '',
      unitName: 'EA',
      standardCostKrw: 0,
      dealerPriceKrw: 0,
      retailPriceKrw: 0,
      standardMonthlyRentalKrw: 0,
      standardDailyRentalKrw: 0,
      depreciationMonths: 60,
      residualValueKrw: 1000,
      safetyStock: 2,
      warehouseLocation: '본사창고',
      isActive: true,
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
        itemCategory: editing.itemCategory || '부품',
        managementType: (editing.managementType as ManagementType) || 'LOT',
        manufacturer: editing.manufacturer || null,
        modelName: editing.modelName || null,
        tonnage: editing.tonnage ? Number(editing.tonnage) : null,
        powerType: editing.powerType || null,
        specSummary: editing.specSummary || null,
        unitName: editing.unitName || 'EA',
        standardCostKrw: Math.round(Number(editing.standardCostKrw || 0)),
        dealerPriceKrw: Math.round(Number(editing.dealerPriceKrw || 0)),
        retailPriceKrw: Math.round(Number(editing.retailPriceKrw || 0)),
        standardMonthlyRentalKrw: Math.round(Number(editing.standardMonthlyRentalKrw || 0)),
        standardDailyRentalKrw: Math.round(Number(editing.standardDailyRentalKrw || 0)),
        depreciationMonths: Number(editing.depreciationMonths || 60),
        residualValueKrw: Math.round(Number(editing.residualValueKrw || 0)),
        safetyStock: Number(editing.safetyStock || 0),
        warehouseLocation: editing.warehouseLocation || '본사창고',
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
      width: 70,
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
    { key: 'sku', header: '품목코드', width: 135, render: (r) => <span style={{ fontWeight: 700 }}>{r.sku}</span> },
    { key: 'itemCategory', header: '품목군', width: 95, render: (r) => <StatusBadge label={r.itemCategory} /> },
    {
      key: 'managementType',
      header: '추적방식',
      width: 90,
      align: 'center',
      render: (r) => <StatusBadge label={r.managementType === 'SERIAL' ? '시리얼' : '로트'} tone="info" />,
    },
    { key: 'name', header: '품명', render: (r) => r.name },
    { key: 'manufacturer', header: '제조사', width: 100, render: (r) => r.manufacturer || '-' },
    {
      key: 'standardCostKrw',
      header: '표준원가',
      width: 115,
      align: 'right',
      render: (r) => formatMoney(r.standardCostKrw),
    },
    {
      key: 'dealerPriceKrw',
      header: '대리점가',
      width: 115,
      align: 'right',
      render: (r) => formatMoney(r.dealerPriceKrw, { salesSensitive: true }),
    },
    {
      key: 'retailPriceKrw',
      header: '판매정가',
      width: 115,
      align: 'right',
      render: (r) => formatMoney(r.retailPriceKrw, { salesSensitive: true }),
    },
    {
      key: 'standardMonthlyRentalKrw',
      header: '월렌탈표준단가',
      width: 120,
      align: 'right',
      render: (r) => formatMoney(r.standardMonthlyRentalKrw, { salesSensitive: true }),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel
        title="품목군 · 단가 검색"
        manualId="itm-filter"
        rightSlot={
          canEdit && (
            <button
              type="button"
              data-manual-id="itm-form"
              onClick={openNew}
              style={actionBtnStyle('primary', true)}
            >
              품목 추가
            </button>
          )
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <VerticalField label="품명 · 품번 검색" minWidth={220} flex={1}>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="품목코드, 품명, 제조사, 모델명"
              style={controlInputStyle}
            />
          </VerticalField>
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체', count: datasets.itemMasters.length },
              ...ITEM_CATEGORIES.map((c) => ({
                id: c,
                label: c,
                count: datasets.itemMasters.filter((i) => i.itemCategory === c).length,
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
        maxHeight="600px"
      />

      <ModalDialog
        open={Boolean(editing)}
        title={editing?.id ? `품목 수정 · ${editing.name}` : '신규 품목 등록'}
        onClose={() => setEditing(null)}
        width={680}
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              <VerticalField label="품목코드" required>
                <input
                  type="text"
                  value={editing.sku || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, sku: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="품목군" required>
                <select
                  value={editing.itemCategory || '부품'}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, itemCategory: e.target.value as ItemCategory }))
                  }
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
                  value={editing.managementType || 'LOT'}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '10px' }}>
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
              <VerticalField label="보관창고">
                <input
                  type="text"
                  value={editing.warehouseLocation || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, warehouseLocation: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <VerticalField label="표준원가">
                <input
                  type="number"
                  value={editing.standardCostKrw ?? 0}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, standardCostKrw: Number(e.target.value) }))
                  }
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="대리점가">
                <input
                  type="number"
                  disabled={maskPrice}
                  value={maskPrice ? 0 : (editing.dealerPriceKrw ?? 0)}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, dealerPriceKrw: Number(e.target.value) }))
                  }
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="판매정가">
                <input
                  type="number"
                  disabled={maskPrice}
                  value={maskPrice ? 0 : (editing.retailPriceKrw ?? 0)}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, retailPriceKrw: Number(e.target.value) }))
                  }
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="월렌탈표준단가">
                <input
                  type="number"
                  disabled={maskPrice}
                  value={maskPrice ? 0 : (editing.standardMonthlyRentalKrw ?? 0)}
                  onChange={(e) =>
                    setEditing((p) => ({
                      ...p,
                      standardMonthlyRentalKrw: Number(e.target.value),
                      standardDailyRentalKrw: Math.round(Number(e.target.value) / 30),
                    }))
                  }
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
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

export const ExchangeRatesPage: React.FC = () => {
  const { datasets, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('exchange_rates');

  const today = new Date().toISOString().slice(0, 10);
  const [rateDate, setRateDate] = useState(today);
  const [currencyCode, setCurrencyCode] = useState<Exclude<CurrencyCode, 'KRW'>>('USD');
  const [baseRateKrw, setBaseRateKrw] = useState<number>(1380);
  const [ttSellingRate, setTtSellingRate] = useState<number>(1394);
  const [source, setSource] = useState('수동등록');
  const [busy, setBusy] = useState(false);

  const handleFetchRate = async () => {
    setBusy(true);
    try {
      const resp = await fetch(`/api/exchange-rate?currency=${currencyCode}&date=${rateDate}`);
      if (!resp.ok) throw new Error(`환율 조회 HTTP ${resp.status}`);
      const json = (await resp.json()) as {
        success?: boolean;
        data?: { baseRate: number; ttsRate: number; baseDate: string; source: string };
      };
      if (json.success && json.data) {
        setBaseRateKrw(Number(json.data.baseRate));
        setTtSellingRate(Number(json.data.ttsRate));
        setSource(json.data.source || '고시환율조회');
        notifyToast('고시환율 조회 완료', 'success');
      } else {
        throw new Error('환율 응답 데이터가 없습니다.');
      }
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '환율 조회 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRate = async () => {
    if (baseRateKrw <= 0) {
      notifyToast('기준환율은 0보다 커야 합니다.', 'error');
      return;
    }
    setBusy(true);
    try {
      const existing = datasets.exchangeRates.find(
        (r) => r.rateDate === rateDate && r.currencyCode === currencyCode
      );
      if (existing) {
        await execDbMutation('환율 수정', () =>
          flSupabase
            .from('exchange_rates')
            .update(camelToSnakeRow({ baseRateKrw, ttSellingRate, source }))
            .eq('id', existing.id)
        );
      } else {
        const rec: FlExchangeRate = {
          id: newId('FX'),
          tenantId: DEFAULT_TENANT_ID,
          rateDate,
          currencyCode,
          baseRateKrw,
          ttSellingRate,
          source,
        };
        await execDbMutation('환율 등록', () =>
          flSupabase.from('exchange_rates').insert(camelToSnakeRow({ ...rec }))
        );
      }
      await refreshAll();
      notifyToast('환율 저장 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '환율 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sorted = useMemo(
    () => [...datasets.exchangeRates].sort((a, b) => b.rateDate.localeCompare(a.rateDate)),
    [datasets.exchangeRates]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel title="고시환율 조회 · 등록" manualId="fx-fetch">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
          <VerticalField label="적용일자" width={145}>
            <input
              type="date"
              value={rateDate}
              onChange={(e) => setRateDate(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="통화코드" width={110}>
            <select
              value={currencyCode}
              onChange={(e) =>
                setCurrencyCode(e.target.value as Exclude<CurrencyCode, 'KRW'>)
              }
              style={controlInputStyle}
            >
              <option value="USD">USD</option>
              <option value="CNY">CNY</option>
              <option value="EUR">EUR</option>
              <option value="JPY">JPY</option>
            </select>
          </VerticalField>
          <VerticalField label="매매기준율" width={135}>
            <input
              type="number"
              step="0.01"
              value={baseRateKrw}
              onChange={(e) => setBaseRateKrw(Number(e.target.value))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="전신환매도율" width={135}>
            <input
              type="number"
              step="0.01"
              value={ttSellingRate}
              onChange={(e) => setTtSellingRate(Number(e.target.value))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="출처" minWidth={140} flex={1}>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>
          <button
            type="button"
            disabled={busy}
            onClick={handleFetchRate}
            style={actionBtnStyle('secondary')}
          >
            환율 조회
          </button>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveRate}
              style={actionBtnStyle('primary')}
            >
              환율 저장
            </button>
          )}
        </div>
      </SectionPanel>

      <DataGrid
        manualId="fx-grid"
        columns={[
          { key: 'rateDate', header: '적용일자', width: 120, render: (r) => r.rateDate },
          {
            key: 'currencyCode',
            header: '통화',
            width: 90,
            align: 'center',
            render: (r) => <StatusBadge label={r.currencyCode} tone="primary" />,
          },
          {
            key: 'baseRateKrw',
            header: '매매기준율',
            width: 140,
            align: 'right',
            render: (r) => `${Number(r.baseRateKrw).toLocaleString('ko-KR')} 원`,
          },
          {
            key: 'ttSellingRate',
            header: '전신환매도율',
            width: 140,
            align: 'right',
            render: (r) =>
              r.ttSellingRate ? `${Number(r.ttSellingRate).toLocaleString('ko-KR')} 원` : '-',
          },
          { key: 'source', header: '출처', render: (r) => r.source },
        ]}
        rows={sorted}
        rowKey={(r) => r.id}
        maxHeight="520px"
      />
    </div>
  );
};

export const CatalogsPage: React.FC = () => {
  const { datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('catalogs');

  const [subTab, setSubTab] = useState<'SPECS' | 'PARTS' | 'PACKAGES'>('SPECS');
  const [specKeyword, setSpecKeyword] = useState('');
  const [selectedSpecId, setSelectedSpecId] = useState(FL_TECHNICAL_ARCHIVE[0]?.id || '');
  const [partCategory, setPartCategory] = useState('ALL');
  const [partKeyword, setPartKeyword] = useState('');

  const [pkgTitle, setPkgTitle] = useState('');
  const [pkgRole, setPkgRole] = useState('대리점');
  const [pkgSaving, setPkgSaving] = useState(false);

  const filteredSpecs = useMemo(() => {
    const q = specKeyword.trim().toLowerCase();
    if (!q) return FL_TECHNICAL_ARCHIVE;
    return FL_TECHNICAL_ARCHIVE.filter(
      (s) =>
        s.modelName.toLowerCase().includes(q) ||
        s.manufacturerName.toLowerCase().includes(q) ||
        s.seriesName.toLowerCase().includes(q)
    );
  }, [specKeyword]);

  const activeSpec =
    filteredSpecs.find((s) => s.id === selectedSpecId) || filteredSpecs[0] || null;

  const filteredParts = useMemo(() => {
    const q = partKeyword.trim().toLowerCase();
    return COMPATIBLE_PARTS_CATALOG.filter((p) => {
      if (partCategory !== 'ALL' && p.category !== partCategory) return false;
      if (!q) return true;
      return (
        p.partName.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.oemCrossRefCodes.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [partCategory, partKeyword]);

  const handleSavePackage = async () => {
    if (!pkgTitle.trim()) {
      notifyToast('카탈로그 패키지 제목을 입력해 주세요.', 'error');
      return;
    }
    setPkgSaving(true);
    try {
      const pkg: FlCatalogPackage = {
        id: newId('PKG'),
        tenantId: DEFAULT_TENANT_ID,
        catalogCode: `CAT-${Date.now().toString(36).toUpperCase()}`,
        title: pkgTitle.trim(),
        targetPartnerRole: pkgRole,
        targetModels: activeSpec ? [activeSpec.modelName] : [],
        selectedItemSkus: filteredParts.slice(0, 10).map((p) => p.sku),
        showUnitPrice: true,
        showStock: true,
        isDefault: false,
      };
      await execDbMutation('카탈로그 패키지 생성', () =>
        flSupabase.from('catalog_packages').insert(camelToSnakeRow({ ...pkg }))
      );
      setPkgTitle('');
      await refreshAll();
      notifyToast('카탈로그 패키지 저장 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '패키지 저장 실패', 'error');
    } finally {
      setPkgSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionPanel
        title="제원 · 호환 부품 카탈로그"
        manualId="cat-tabs"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'SPECS', label: '장비 제원표', count: FL_TECHNICAL_ARCHIVE.length },
              { id: 'PARTS', label: '호환부품 카탈로그', count: COMPATIBLE_PARTS_CATALOG.length },
              { id: 'PACKAGES', label: '배포 패키지', count: datasets.catalogPackages.length },
            ]}
            activeId={subTab}
            onChange={(id) => setSubTab(id as typeof subTab)}
          />
        }
      >
        {subTab === 'SPECS' && (
          <div data-manual-id="cat-detail" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <VerticalField label="장비 기종 · 제조사 검색" width={340}>
              <input
                type="text"
                value={specKeyword}
                onChange={(e) => setSpecKeyword(e.target.value)}
                placeholder="모델명 또는 제조사"
                style={controlInputStyle}
              />
            </VerticalField>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(290px, 1fr) minmax(380px, 1.5fr)',
                gap: '14px',
                alignItems: 'start',
              }}
            >
              <DataGrid
                columns={[
                  { key: 'mfg', header: '제조사', width: 90, render: (r) => r.manufacturerName },
                  { key: 'model', header: '모델명', render: (r) => <span style={{ fontWeight: 700 }}>{r.modelName}</span> },
                  {
                    key: 'cap',
                    header: '적재하중',
                    width: 85,
                    align: 'right',
                    render: (r) => `${r.ratedCapacityKg} kg`,
                  },
                ]}
                rows={filteredSpecs}
                rowKey={(r) => r.id}
                selectedRowId={activeSpec?.id || null}
                onRowClick={(r) => setSelectedSpecId(r.id)}
                maxHeight="520px"
              />

              {activeSpec && (
                <SectionPanel title={`${activeSpec.manufacturerName} · ${activeSpec.modelName}`}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <div>동력구분: {activeSpec.powerType}</div>
                      <div>정격하중: {activeSpec.ratedCapacityKg} kg</div>
                      <div>표준인상고: {activeSpec.standardLiftHeightMm} mm</div>
                      <div>최소회전반경: {activeSpec.turningRadiusMm} mm</div>
                      <div>직각적재통로폭: {activeSpec.aisleWidth1000x1200Mm} mm</div>
                      <div>헤드가드높이: {activeSpec.overheadGuardHeightMm} mm</div>
                    </div>

                    {activeSpec.mastSpecs && activeSpec.mastSpecs.length > 0 && (
                      <DataGrid
                        columns={[
                          { key: 'mastModel', header: '마스트 모델', render: (m) => m.mastModel },
                          { key: 'mastType', header: '단수', render: (m) => m.mastType },
                          { key: 'h3', header: '최대인상고', align: 'right', render: (m) => `${m.liftHeightH3Mm} mm` },
                          { key: 'h1', header: '최저전고', align: 'right', render: (m) => `${m.loweredHeightH1Mm} mm` },
                        ]}
                        rows={activeSpec.mastSpecs}
                        rowKey={(m) => `${m.mastModel}-${m.liftHeightH3Mm}`}
                        maxHeight="200px"
                      />
                    )}

                    {activeSpec.documents && activeSpec.documents.length > 0 && (
                      <DataGrid
                        columns={[
                          { key: 'cat', header: '문서구분', width: 110, render: (d) => d.docCategoryLabel },
                          { key: 'title', header: '문서제목', render: (d) => d.title },
                          {
                            key: 'link',
                            header: '열기',
                            width: 75,
                            align: 'center',
                            render: (d) => (
                              <a
                                href={d.r2Url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: 'var(--primary)', fontWeight: 700 }}
                              >
                                보기
                              </a>
                            ),
                          },
                        ]}
                        rows={activeSpec.documents}
                        rowKey={(d) => d.id}
                        maxHeight="180px"
                      />
                    )}
                  </div>
                </SectionPanel>
              )}
            </div>
          </div>
        )}

        {subTab === 'PARTS' && (
          <div data-manual-id="cat-detail" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
              <VerticalField label="부품명 · 품번 · OEM 교차코드 검색" minWidth={240} flex={1}>
                <input
                  type="text"
                  value={partKeyword}
                  onChange={(e) => setPartKeyword(e.target.value)}
                  placeholder="부품명, 품목코드, 호환품번"
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="부품 분류" width={190}>
                <select
                  value={partCategory}
                  onChange={(e) => setPartCategory(e.target.value)}
                  style={controlInputStyle}
                >
                  <option value="ALL">전체 분류</option>
                  {PART_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </VerticalField>
            </div>

            <DataGrid
              columns={[
                { key: 'sku', header: '품목코드', width: 130, render: (r) => <span style={{ fontWeight: 700 }}>{r.sku}</span> },
                { key: 'category', header: '분류', width: 145, render: (r) => r.category },
                { key: 'partName', header: '부품명', render: (r) => r.partName },
                { key: 'specSummary', header: '규격 요약', render: (r) => r.specSummary },
                { key: 'oem', header: '교차품번', render: (r) => r.oemCrossRefCodes.slice(0, 2).join(', ') || '-' },
                {
                  key: 'dealerPriceKrw',
                  header: '대리점가',
                  width: 110,
                  align: 'right',
                  render: (r) => formatMoney(r.dealerPriceKrw, { salesSensitive: true }),
                },
                {
                  key: 'retailPriceKrw',
                  header: '소비자가',
                  width: 110,
                  align: 'right',
                  render: (r) => formatMoney(r.retailPriceKrw, { salesSensitive: true }),
                },
              ]}
              rows={filteredParts}
              rowKey={(r) => r.id}
              maxHeight="520px"
            />
          </div>
        )}

        {subTab === 'PACKAGES' && (
          <div data-manual-id="cat-detail" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {canEdit && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                <VerticalField label="패키지 제목" minWidth={240} flex={1}>
                  <input
                    type="text"
                    value={pkgTitle}
                    onChange={(e) => setPkgTitle(e.target.value)}
                    placeholder="대리점 배포 카탈로그 제목"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="대상 역할" width={140}>
                  <select
                    value={pkgRole}
                    onChange={(e) => setPkgRole(e.target.value)}
                    style={controlInputStyle}
                  >
                    <option value="대리점">대리점</option>
                    <option value="매출처">매출처</option>
                  </select>
                </VerticalField>
                <button
                  type="button"
                  disabled={pkgSaving}
                  onClick={handleSavePackage}
                  style={actionBtnStyle('primary')}
                >
                  패키지 생성
                </button>
              </div>
            )}

            <DataGrid
              columns={[
                { key: 'code', header: '카탈로그코드', width: 150, render: (r) => r.catalogCode },
                { key: 'title', header: '제목', render: (r) => r.title },
                { key: 'role', header: '대상역할', width: 100, render: (r) => r.targetPartnerRole },
                {
                  key: 'cnt',
                  header: '포함품목수',
                  width: 100,
                  align: 'right',
                  render: (r) => `${r.selectedItemSkus.length}종`,
                },
              ]}
              rows={datasets.catalogPackages}
              rowKey={(r) => r.id}
              maxHeight="400px"
            />
          </div>
        )}
      </SectionPanel>
    </div>
  );
};
