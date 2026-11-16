import React, { useMemo, useRef, useState } from 'react';
import { ExternalLink, Eye, RotateCcw, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../core/supabase';
import { upsertManagedExchangeRates } from '../services/domainEngine';
import {
  analyzeBusinessLicenseFile,
  uploadBusinessLicenseImageToR2,
} from '../services/businessLicenseOcrService';
import {
  ConservationBar,
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
  const [isDraggingBizCert, setIsDraggingBizCert] = useState(false);
  const [analyzingBizCert, setAnalyzingBizCert] = useState(false);
  const [bizCertFileName, setBizCertFileName] = useState<string>('');
  const [isBizCertModalOpen, setIsBizCertModalOpen] = useState(false);
  const [bizCertZoom, setBizCertZoom] = useState(100);
  const [modalForm, setModalForm] = useState<Partial<FlPartner>>({});
  const bizCertInputRef = useRef<HTMLInputElement | null>(null);

  const handleBizLicenseFile = async (file: File) => {
    if (!canEdit) return;
    const lowerName = file.name.toLowerCase();
    const isSupported =
      file.type.startsWith('image/') ||
      file.type === 'application/pdf' ||
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.webp');

    if (!isSupported) {
      notifyToast('이미지 또는 PDF 형식의 사업자등록증 파일을 올려주세요.', 'error');
      return;
    }

    setAnalyzingBizCert(true);
    setBizCertFileName(file.name);
    notifyToast(`사업자등록증 판독 중 · ${file.name}`, 'info');

    try {
      const res = await analyzeBusinessLicenseFile(file);
      const previewUrl = res.previewImageDataUrl;

      if (previewUrl) {
        setForm((prev) => ({
          ...prev,
          bizCertUrl: previewUrl,
          bizCertName: file.name,
        }));
        setModalForm((prev) => ({
          ...prev,
          bizCertUrl: previewUrl,
          bizCertName: file.name,
        }));

        void uploadBusinessLicenseImageToR2(file.name, previewUrl).then((storedUrl) => {
          if (storedUrl && storedUrl !== previewUrl) {
            setForm((prev) =>
              prev.bizCertUrl === previewUrl ? { ...prev, bizCertUrl: storedUrl } : prev
            );
            setModalForm((prev) =>
              prev.bizCertUrl === previewUrl ? { ...prev, bizCertUrl: storedUrl } : prev
            );
          }
        });
      }

      if (!res.success) {
        notifyToast(
          res.error || '사업자등록증 판독에 실패했습니다. 모달에서 직접 수정할 수 있습니다.',
          'error'
        );
        return;
      }

      const applyOcr = (prev: Partial<FlPartner>): Partial<FlPartner> => ({
        ...prev,
        name: res.companyName || prev.name || '',
        bizRegNo: res.bizRegNo || prev.bizRegNo || '',
        representative: res.representative || prev.representative || '',
        phone: res.repContact || prev.phone || '',
        bizType: res.bizType || prev.bizType || '',
        bizItem: res.bizItem || prev.bizItem || '',
        taxEmail: res.taxEmail || prev.taxEmail || '',
        address: res.address || res.headOfficeAddress || prev.address || '',
      });

      setForm(applyOcr);
      setModalForm(applyOcr);

      notifyToast(
        `${res.companyName || '사업자등록증'} 정보 자동 입력 완료 · 확인 후 저장해 주세요.`,
        'success'
      );
    } catch (err) {
      notifyToast(
        err instanceof Error ? err.message : '사업자등록증 판독 중 오류가 발생했습니다.',
        'error'
      );
    } finally {
      setAnalyzingBizCert(false);
    }
  };

  const selectPartner = (p: FlPartner) => {
    setSelectedId(p.id);
    setForm({ ...p });
    setBizCertFileName(p.bizCertName || '');
  };

  const resetToNew = () => {
    setSelectedId(null);
    setBizCertFileName('');
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
      bizCertUrl: null,
      bizCertName: null,
      isActive: true,
    });
  };

  const toggleRole = (role: PartnerRole) => {
    const cur = form.partnerRoles || [];
    const next = cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role];
    setForm((p) => ({ ...p, partnerRoles: next }));
  };

  const handleSavePartner = async (overrideForm?: Partial<FlPartner>): Promise<boolean> => {
    const target = overrideForm || form;
    if (!target.name?.trim()) {
      notifyToast('상호명을 입력해 주세요.', 'error');
      return false;
    }
    const roles = target.partnerRoles && target.partnerRoles.length > 0 ? target.partnerRoles : ['매출처' as PartnerRole];
    setSaving(true);
    try {
      const payload = {
        tenantId: DEFAULT_TENANT_ID,
        name: target.name.trim(),
        bizRegNo: target.bizRegNo || null,
        representative: target.representative || null,
        bizType: target.bizType || null,
        bizItem: target.bizItem || null,
        address: target.address || null,
        phone: target.phone || null,
        email: target.email || null,
        taxEmail: target.taxEmail || null,
        partnerRoles: roles,
        defaultClosingDay: Number(target.defaultClosingDay || 31),
        defaultPaymentDueDay: Number(target.defaultPaymentDueDay || 15),
        defaultPaymentMonthOffset: Number(target.defaultPaymentMonthOffset || 1),
        paymentMethod: target.paymentMethod || '계좌이체',
        bankName: target.bankName || null,
        bankAccount: target.bankAccount || null,
        bankHolder: target.bankHolder || null,
        creditGrade: target.creditGrade || '정상',
        memo: target.memo || null,
        bizCertUrl: target.bizCertUrl || null,
        bizCertName: target.bizCertName || null,
        isActive: target.isActive ?? true,
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
      setForm((prev) => ({ ...prev, ...target, partnerRoles: roles }));
      await refreshAll();
      notifyToast('거래처 저장 완료', 'success');
      return true;
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '거래처 저장 실패', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openBizCertModal = () => {
    setModalForm({ ...form });
    setBizCertZoom(100);
    setIsBizCertModalOpen(true);
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

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDraggingBizCert) setIsDraggingBizCert(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setIsDraggingBizCert(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingBizCert(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) {
              void handleBizLicenseFile(file);
            }
          }}
        >
          <input
            ref={bizCertInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleBizLicenseFile(file);
              }
              e.target.value = '';
            }}
          />
          <SectionPanel
            title={selectedId ? `거래처 상세 · ${form.name || ''}` : '신규 거래처 등록'}
            style={
              isDraggingBizCert
                ? {
                    border: '2px dashed var(--primary)',
                    backgroundColor: 'var(--primary-light)',
                  }
                : undefined
            }
            titleSlot={
              canEdit ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => bizCertInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      bizCertInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDraggingBizCert) setIsDraggingBizCert(true);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingBizCert(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file) {
                      void handleBizLicenseFile(file);
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: `1px dashed ${isDraggingBizCert ? 'var(--primary)' : '#2563eb'}`,
                    backgroundColor: isDraggingBizCert ? '#dbeafe' : '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: analyzingBizCert ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                  }}
                >
                  <Upload size={13} />
                  <span>
                    {analyzingBizCert
                      ? `사업자등록증 판독 중 · ${bizCertFileName}`
                      : '사업자등록증 파일을 끌어다 놓으세요'}
                  </span>
                </div>
              ) : undefined
            }
            rightSlot={
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  data-manual-id="prt-view-bizcert"
                  onClick={openBizCertModal}
                  style={{
                    ...actionBtnStyle('secondary', true),
                    borderColor: form.bizCertUrl ? '#2563eb' : 'var(--border-color)',
                    backgroundColor: form.bizCertUrl ? '#eff6ff' : 'var(--bg-card)',
                    color: form.bizCertUrl ? '#1d4ed8' : 'var(--text-secondary)',
                  }}
                >
                  <Eye size={13} />
                  사업자등록증 보기
                </button>
                {canEdit && (
                  <button
                    type="button"
                    data-manual-id="prt-save"
                    disabled={saving || analyzingBizCert}
                    onClick={() => {
                      void handleSavePartner();
                    }}
                    style={actionBtnStyle('primary', true)}
                  >
                    {saving ? '저장중' : '거래처 저장'}
                  </button>
                )}
              </div>
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

      <ModalDialog
        open={isBizCertModalOpen}
        title={`사업자등록증 보기 · ${modalForm.name || form.name || '신규 거래처'}`}
        onClose={() => setIsBizCertModalOpen(false)}
        width={1020}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 1.15fr) minmax(320px, 1fr)',
            gap: '16px',
            alignItems: 'start',
          }}
        >
          {/* 좌측: 사업자등록증 원본 뷰어 */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer?.files?.[0];
              if (file) {
                void handleBizLicenseFile(file);
              }
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px',
              backgroundColor: 'var(--bg-app)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {modalForm.bizCertName || form.bizCertName || '사업자등록증 사본'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setBizCertZoom((z) => Math.max(50, z - 25))}
                  style={actionBtnStyle('secondary', true)}
                  title="축소"
                >
                  <ZoomOut size={13} />
                </button>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    minWidth: '42px',
                    textAlign: 'center',
                    color: 'var(--text-main)',
                  }}
                >
                  {bizCertZoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setBizCertZoom((z) => Math.min(250, z + 25))}
                  style={actionBtnStyle('secondary', true)}
                  title="확대"
                >
                  <ZoomIn size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setBizCertZoom(100)}
                  style={actionBtnStyle('secondary', true)}
                  title="원래 크기"
                >
                  <RotateCcw size={12} />
                </button>
                {(modalForm.bizCertUrl || form.bizCertUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      const url = modalForm.bizCertUrl || form.bizCertUrl;
                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                    style={actionBtnStyle('secondary', true)}
                  >
                    <ExternalLink size={12} />
                    새창
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => bizCertInputRef.current?.click()}
                    disabled={analyzingBizCert}
                    style={actionBtnStyle('secondary', true)}
                  >
                    <Upload size={12} />
                    {analyzingBizCert ? '판독중' : '파일 등록'}
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                height: '470px',
                overflow: 'auto',
                border: '1px solid var(--table-border-color)',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
              }}
            >
              {modalForm.bizCertUrl || form.bizCertUrl ? (
                <img
                  src={modalForm.bizCertUrl || form.bizCertUrl || ''}
                  alt="사업자등록증 사본"
                  style={{
                    width: `${bizCertZoom}%`,
                    maxWidth: 'none',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: '4px',
                  }}
                />
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '12.5px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '24px',
                  }}
                >
                  <span>등록된 사업자등록증 파일이 없습니다.</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => bizCertInputRef.current?.click()}
                      style={actionBtnStyle('primary', true)}
                    >
                      <Upload size={13} />
                      사업자등록증 파일 선택
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 우측: 거래처 정보 수정 · 저장 폼 (판독 오류 대비) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <VerticalField label="상호" required>
                <input
                  type="text"
                  value={modalForm.name || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, name: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="사업자등록번호">
                <input
                  type="text"
                  value={modalForm.bizRegNo || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, bizRegNo: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="대표자">
                <input
                  type="text"
                  value={modalForm.representative || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, representative: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="대표 전화">
                <input
                  type="text"
                  value={modalForm.phone || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, phone: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="업태">
                <input
                  type="text"
                  value={modalForm.bizType || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, bizType: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="종목">
                <input
                  type="text"
                  value={modalForm.bizItem || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, bizItem: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="계산서 이메일">
                <input
                  type="email"
                  value={modalForm.taxEmail || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, taxEmail: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
              <VerticalField label="결제수단">
                <input
                  type="text"
                  value={modalForm.paymentMethod || ''}
                  onChange={(e) => setModalForm((p) => ({ ...p, paymentMethod: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>

            <VerticalField label="주소">
              <input
                type="text"
                value={modalForm.address || ''}
                onChange={(e) => setModalForm((p) => ({ ...p, address: e.target.value }))}
                style={controlInputStyle}
              />
            </VerticalField>

            <VerticalField label="특이 메모">
              <textarea
                rows={3}
                value={modalForm.memo || ''}
                onChange={(e) => setModalForm((p) => ({ ...p, memo: e.target.value }))}
                style={controlTextareaStyle}
              />
            </VerticalField>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                paddingTop: '10px',
                borderTop: '1px solid var(--table-row-border)',
              }}
            >
              <button
                type="button"
                onClick={() => setIsBizCertModalOpen(false)}
                style={actionBtnStyle('secondary')}
              >
                닫기
              </button>
              {canEdit && (
                <button
                  type="button"
                  disabled={saving || analyzingBizCert}
                  onClick={async () => {
                    const ok = await handleSavePartner(modalForm);
                    if (ok) {
                      setIsBizCertModalOpen(false);
                    }
                  }}
                  style={actionBtnStyle('primary')}
                >
                  {saving ? '저장중' : '수정 내용 저장'}
                </button>
              )}
            </div>
          </div>
        </div>
      </ModalDialog>
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

const FX_CURRENCIES: Array<{
  code: Exclude<CurrencyCode, 'KRW'>;
  name: string;
  decimals: number;
}> = [
  { code: 'USD', name: '미국 달러', decimals: 2 },
  { code: 'CNY', name: '중국 위안', decimals: 2 },
  { code: 'EUR', name: '유럽 유로', decimals: 2 },
  { code: 'JPY', name: '일본 엔', decimals: 4 },
];

const FX_PERIOD_OPTIONS: Array<{ days: 30 | 60 | 90; label: string }> = [
  { days: 30, label: '1개월' },
  { days: 60, label: '2개월' },
  { days: 90, label: '3개월' },
];

function formatFxRate(value: number, currencyCode: Exclude<CurrencyCode, 'KRW'>): string {
  const maxFrac = currencyCode === 'JPY' ? 4 : 2;
  return Number(value || 0).toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  });
}

function shiftIsoDays(baseIso: string, deltaDays: number): string {
  const parts = baseIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return baseIso;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export const ExchangeRatesPage: React.FC = () => {
  const { datasets, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('exchange_rates');

  const today = new Date().toISOString().slice(0, 10);
  const [rateDate, setRateDate] = useState(today);
  const [currencyCode, setCurrencyCode] = useState<Exclude<CurrencyCode, 'KRW'>>('USD');
  const [baseRateKrw, setBaseRateKrw] = useState<number>(1395.5);
  const [ttSellingRate, setTtSellingRate] = useState<number>(1409.5);
  const [source, setSource] = useState('한국수출입은행');
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90>(90);
  const [showTtsLine, setShowTtsLine] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [gridFilter, setGridFilter] = useState<'ALL' | Exclude<CurrencyCode, 'KRW'>>('ALL');
  const [busy, setBusy] = useState(false);

  const selectCurrency = (nextCode: Exclude<CurrencyCode, 'KRW'>) => {
    setCurrencyCode(nextCode);
    setHoverIdx(null);
    const sameDateRow = datasets.exchangeRates.find(
      (r) => r.currencyCode === nextCode && r.rateDate === rateDate
    );
    const latestRow =
      sameDateRow ||
      [...datasets.exchangeRates]
        .filter((r) => r.currencyCode === nextCode)
        .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
    if (latestRow) {
      setBaseRateKrw(Number(latestRow.baseRateKrw));
      setTtSellingRate(
        Number(latestRow.ttSellingRate || Math.round(Number(latestRow.baseRateKrw) * 101) / 100)
      );
      setSource(latestRow.source || '외환시장 고시환율');
    }
  };

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

  const handleSync3MonthRates = async () => {
    setBusy(true);
    try {
      const endDateStr = rateDate <= today ? rateDate : today;
      const startDateStr = shiftIsoDays(endDateStr, -90);
      let series: Array<{ date: string; baseRate: number; ttsRate: number }> = [];
      let fetchedSource = '국제외환시장 고시환율';

      try {
        const apiResp = await fetch(
          `/api/exchange-rate?currency=${encodeURIComponent(currencyCode)}&date=${encodeURIComponent(endDateStr)}&days=90`
        );
        if (apiResp.ok) {
          const apiJson = (await apiResp.json()) as {
            success?: boolean;
            data?: {
              source?: string;
              series?: Array<{ date: string; baseRate: number; ttsRate?: number }>;
            };
          };
          if (apiJson.success && Array.isArray(apiJson.data?.series) && apiJson.data.series.length > 0) {
            series = apiJson.data.series.map((pt) => ({
              date: pt.date,
              baseRate: Number(pt.baseRate),
              ttsRate: Number(pt.ttsRate || Number(pt.baseRate) * 1.01),
            }));
            if (apiJson.data.source) fetchedSource = apiJson.data.source;
          }
        }
      } catch {
        // 정적 프리뷰 등 로컬 API 미지원 환경에서는 직접 시계열 조회
      }

      if (series.length === 0) {
        const directResp = await fetch(
          `https://api.frankfurter.dev/v1/${startDateStr}..${endDateStr}?base=${encodeURIComponent(currencyCode)}&symbols=KRW`
        );
        if (directResp.ok) {
          const directJson = (await directResp.json()) as {
            rates?: Record<string, { KRW?: number }>;
          };
          const rateMap = directJson?.rates || {};
          const factor = currencyCode === 'JPY' ? 10000 : 100;
          series = Object.keys(rateMap)
            .sort()
            .map((dt) => {
              const baseRate = Math.round(Number(rateMap[dt]?.KRW || 0) * factor) / factor;
              return {
                date: dt,
                baseRate,
                ttsRate: Math.round(baseRate * 1.01 * factor) / factor,
              };
            })
            .filter((pt) => pt.baseRate > 0);
        }
      }

      if (series.length === 0) {
        throw new Error('3개월 고시환율 시계열 데이터를 수신하지 못했습니다.');
      }

      const savedCount = await upsertManagedExchangeRates({
        rows: series.map((pt) => ({
          rateDate: pt.date,
          currencyCode,
          baseRateKrw: pt.baseRate,
          ttSellingRate: pt.ttsRate,
          source: fetchedSource,
        })),
      });
      const lastPt = series[series.length - 1];
      setRateDate(lastPt.date);
      setBaseRateKrw(lastPt.baseRate);
      setTtSellingRate(lastPt.ttsRate);
      setSource(fetchedSource);
      await refreshAll();
      notifyToast(`${currencyCode} 최근 3개월 관리 환율 ${savedCount}건 적재 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '3개월 환율 적재 실패', 'error');
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

  const currencySeriesMap = useMemo(() => {
    const grouped: Record<Exclude<CurrencyCode, 'KRW'>, FlExchangeRate[]> = {
      USD: [],
      CNY: [],
      EUR: [],
      JPY: [],
    };
    const byKey = new Map<string, FlExchangeRate>();
    for (const r of datasets.exchangeRates) {
      const key = `${r.currencyCode}__${r.rateDate}`;
      if (!byKey.has(key)) byKey.set(key, r);
    }
    for (const r of byKey.values()) {
      if (grouped[r.currencyCode]) {
        grouped[r.currencyCode].push(r);
      }
    }
    for (const cur of Object.keys(grouped) as Array<Exclude<CurrencyCode, 'KRW'>>) {
      grouped[cur].sort((a, b) => a.rateDate.localeCompare(b.rateDate));
    }
    return grouped;
  }, [datasets.exchangeRates]);

  const currencyCountsInPeriod = useMemo(() => {
    const out: Record<Exclude<CurrencyCode, 'KRW'>, number> = {
      USD: 0,
      CNY: 0,
      EUR: 0,
      JPY: 0,
    };
    for (const cur of FX_CURRENCIES) {
      const rows = currencySeriesMap[cur.code];
      if (rows.length === 0) continue;
      const latestDt = rows[rows.length - 1].rateDate;
      const cutoff = shiftIsoDays(latestDt, -(periodDays - 1));
      out[cur.code] = rows.filter((r) => r.rateDate >= cutoff).length;
    }
    return out;
  }, [currencySeriesMap, periodDays]);

  const activeChartSeries = useMemo(() => {
    const rows = currencySeriesMap[currencyCode] || [];
    if (rows.length === 0) return [];
    const latestDt = rows[rows.length - 1].rateDate;
    const cutoff = shiftIsoDays(latestDt, -(periodDays - 1));
    return rows.filter((r) => r.rateDate >= cutoff).map((r) => {
      const base = Number(r.baseRateKrw || 0);
      const tts = Number(r.ttSellingRate || Math.round(base * 101) / 100);
      return {
        rateDate: r.rateDate,
        baseRate: base,
        ttsRate: tts,
        source: r.source,
      };
    });
  }, [currencyCode, currencySeriesMap, periodDays]);

  const chartStats = useMemo(() => {
    if (activeChartSeries.length === 0) {
      return null;
    }
    let minIdx = 0;
    let maxIdx = 0;
    let sum = 0;
    activeChartSeries.forEach((pt, idx) => {
      sum += pt.baseRate;
      if (pt.baseRate < activeChartSeries[minIdx].baseRate) minIdx = idx;
      if (pt.baseRate > activeChartSeries[maxIdx].baseRate) maxIdx = idx;
    });
    const factor = currencyCode === 'JPY' ? 10000 : 100;
    const avgRate = Math.round((sum / activeChartSeries.length) * factor) / factor;
    const startRate = activeChartSeries[0].baseRate;
    const endRate = activeChartSeries[activeChartSeries.length - 1].baseRate;
    const diffRate = Math.round((endRate - startRate) * factor) / factor;
    const diffPct = startRate > 0 ? Math.round(((endRate - startRate) / startRate) * 10000) / 100 : 0;
    return {
      minPoint: { ...activeChartSeries[minIdx], index: minIdx },
      maxPoint: { ...activeChartSeries[maxIdx], index: maxIdx },
      avgRate,
      startRate,
      endRate,
      diffRate,
      diffPct,
    };
  }, [activeChartSeries, currencyCode]);

  const svgWidth = 960;
  const svgHeight = 240;
  const padLeft = 72;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 32;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const yDomain = useMemo(() => {
    const vals: number[] = [];
    for (const pt of activeChartSeries) {
      vals.push(pt.baseRate);
      if (showTtsLine) vals.push(pt.ttsRate);
    }
    const minVal = vals.length > 0 ? Math.min(...vals) : 0;
    const maxVal = vals.length > 0 ? Math.max(...vals) : 100;
    const minFloor = currencyCode === 'JPY' ? 0.05 : 1;
    const span = Math.max(minFloor, maxVal - minVal);
    const yMin = minVal - span * 0.16;
    const yMax = maxVal + span * 0.16;
    return { yMin, yMax, ySpan: Math.max(minFloor, yMax - yMin) };
  }, [activeChartSeries, currencyCode, showTtsLine]);

  const getX = (idx: number) => {
    if (activeChartSeries.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (activeChartSeries.length - 1)) * plotW;
  };

  const getY = (val: number) => padTop + plotH - ((val - yDomain.yMin) / yDomain.ySpan) * plotH;

  const basePolyline = activeChartSeries
    .map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.baseRate).toFixed(1)}`)
    .join(' ');

  const ttsPolyline = activeChartSeries
    .map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.ttsRate).toFixed(1)}`)
    .join(' ');

  const baseAreaPath =
    activeChartSeries.length < 2
      ? ''
      : `M ${getX(0).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${activeChartSeries
          .map((pt, i) => `${getX(i).toFixed(1)},${getY(pt.baseRate).toFixed(1)}`)
          .join(' L ')} L ${getX(activeChartSeries.length - 1).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;

  const inspectedPoint = useMemo(() => {
    if (activeChartSeries.length === 0) return null;
    const targetIdx =
      hoverIdx !== null && activeChartSeries[hoverIdx]
        ? hoverIdx
        : activeChartSeries.length - 1;
    const pt = activeChartSeries[targetIdx];
    const prevPt = targetIdx > 0 ? activeChartSeries[targetIdx - 1] : null;
    const factor = currencyCode === 'JPY' ? 10000 : 100;
    const prevDiff = prevPt
      ? Math.round((pt.baseRate - prevPt.baseRate) * factor) / factor
      : 0;
    return { ...pt, index: targetIdx, prevDiff };
  }, [activeChartSeries, currencyCode, hoverIdx]);

  const sorted = useMemo(() => {
    return [...datasets.exchangeRates]
      .filter((r) => gridFilter === 'ALL' || r.currencyCode === gridFilter)
      .sort((a, b) => b.rateDate.localeCompare(a.rateDate) || a.currencyCode.localeCompare(b.currencyCode));
  }, [datasets.exchangeRates, gridFilter]);

  const currentCurrencyMeta = FX_CURRENCIES.find((c) => c.code === currencyCode) || FX_CURRENCIES[0];
  const currentPeriodLabel = FX_PERIOD_OPTIONS.find((p) => p.days === periodDays)?.label || '3개월';

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
          <VerticalField label="통화코드" width={140}>
            <select
              value={currencyCode}
              onChange={(e) =>
                selectCurrency(e.target.value as Exclude<CurrencyCode, 'KRW'>)
              }
              style={controlInputStyle}
            >
              {FX_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </VerticalField>
          <VerticalField label="매매기준율" width={135}>
            <input
              type="number"
              step="0.0001"
              value={baseRateKrw}
              onChange={(e) => setBaseRateKrw(Number(e.target.value))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="전신환매도율" width={135}>
            <input
              type="number"
              step="0.0001"
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
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleSync3MonthRates}
                style={actionBtnStyle('secondary')}
              >
                3개월 고시환율 적재
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSaveRate}
                style={actionBtnStyle('primary')}
              >
                환율 저장
              </button>
            </>
          )}
        </div>
      </SectionPanel>

      <SectionPanel
        title={`관리 환율 ${currentPeriodLabel} 추이 차트 · ${currentCurrencyMeta.code} · ${currentCurrencyMeta.name}`}
        manualId="fx-chart"
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <SegmentedTabs
              tabs={FX_CURRENCIES.map((c) => ({
                id: c.code,
                label: c.code,
                count: currencyCountsInPeriod[c.code],
              }))}
              activeId={currencyCode}
              onChange={(id) => selectCurrency(id as Exclude<CurrencyCode, 'KRW'>)}
            />
            <SegmentedTabs
              tabs={FX_PERIOD_OPTIONS.map((p) => ({
                id: String(p.days),
                label: p.label,
              }))}
              activeId={String(periodDays)}
              onChange={(id) => {
                setPeriodDays(Number(id) as 30 | 60 | 90);
                setHoverIdx(null);
              }}
            />
            <button
              type="button"
              onClick={() => setShowTtsLine((v) => !v)}
              style={actionBtnStyle(showTtsLine ? 'primary' : 'secondary', true)}
            >
              전신환매도율 {showTtsLine ? '표시' : '숨김'}
            </button>
          </div>
        }
      >
        {activeChartSeries.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px',
            }}
          >
            등록된 관리 환율 데이터가 없습니다. 상단 3개월 고시환율 적재 또는 환율 저장을 실행하십시오.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--table-row-border)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              {chartStats && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    구간 {activeChartSeries[0].rateDate} ~ {activeChartSeries[activeChartSeries.length - 1].rateDate}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    최저 <strong style={{ color: 'var(--success)' }}>{formatFxRate(chartStats.minPoint.baseRate, currencyCode)} 원</strong>
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    최고 <strong style={{ color: 'var(--danger)' }}>{formatFxRate(chartStats.maxPoint.baseRate, currencyCode)} 원</strong>
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    평균 <strong style={{ color: 'var(--primary)' }}>{formatFxRate(chartStats.avgRate, currencyCode)} 원</strong>
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    변동{' '}
                    <strong style={{ color: chartStats.diffRate >= 0 ? 'var(--danger)' : 'var(--primary)' }}>
                      {chartStats.diffRate >= 0 ? '+' : ''}
                      {formatFxRate(chartStats.diffRate, currencyCode)} 원 · {chartStats.diffPct >= 0 ? '+' : ''}
                      {chartStats.diffPct.toFixed(2)}%
                    </strong>
                  </span>
                </div>
              )}

              {inspectedPoint && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 700, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-main)', whiteSpace: 'nowrap' }}>일자 {inspectedPoint.rateDate}</span>
                  <span style={{ color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                    매매기준율 {formatFxRate(inspectedPoint.baseRate, currencyCode)} 원
                  </span>
                  <span style={{ color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                    전신환매도율 {formatFxRate(inspectedPoint.ttsRate, currencyCode)} 원
                  </span>
                  <span
                    style={{
                      color: inspectedPoint.prevDiff >= 0 ? 'var(--danger)' : 'var(--primary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    직전대비 {inspectedPoint.prevDiff >= 0 ? '+' : ''}
                    {formatFxRate(inspectedPoint.prevDiff, currencyCode)} 원
                  </span>
                </div>
              )}
            </div>

            <div style={{ width: '100%', overflowX: 'auto' }}>
              <svg
                data-fx-chart="svg"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ width: '100%', minWidth: '640px', height: '240px', display: 'block', userSelect: 'none' }}
                onMouseLeave={() => setHoverIdx(null)}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const val = yDomain.yMax - ratio * yDomain.ySpan;
                  const y = padTop + ratio * plotH;
                  return (
                    <g key={idx}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={svgWidth - padRight}
                        y2={y}
                        stroke="var(--table-row-border)"
                        strokeDasharray={ratio === 0 || ratio === 1 ? undefined : '3 3'}
                        strokeWidth={1}
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fontWeight="600"
                        fill="var(--text-secondary)"
                      >
                        {formatFxRate(val, currencyCode)}
                      </text>
                    </g>
                  );
                })}

                {chartStats && (
                  <g>
                    <line
                      x1={padLeft}
                      y1={getY(chartStats.avgRate)}
                      x2={svgWidth - padRight}
                      y2={getY(chartStats.avgRate)}
                      stroke="var(--text-muted)"
                      strokeDasharray="5 4"
                      strokeWidth={1.2}
                    />
                    <text
                      x={svgWidth - padRight - 4}
                      y={Math.max(padTop + 12, getY(chartStats.avgRate) - 5)}
                      textAnchor="end"
                      fontSize="10.5"
                      fontWeight="700"
                      fill="var(--text-secondary)"
                    >
                      평균 {formatFxRate(chartStats.avgRate, currencyCode)}
                    </text>
                  </g>
                )}

                {baseAreaPath && (
                  <path d={baseAreaPath} fill="var(--primary)" fillOpacity={0.09} />
                )}

                {showTtsLine && activeChartSeries.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="var(--danger)"
                    strokeWidth="1.6"
                    strokeDasharray="4 3"
                    points={ttsPolyline}
                  />
                )}

                {activeChartSeries.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={basePolyline}
                  />
                )}

                {activeChartSeries.length === 1 && (
                  <circle
                    cx={getX(0)}
                    cy={getY(activeChartSeries[0].baseRate)}
                    r={5}
                    fill="var(--primary)"
                    stroke="var(--bg-card)"
                    strokeWidth={2}
                  />
                )}

                {chartStats && activeChartSeries.length > 1 && (
                  <>
                    <g>
                      <circle
                        cx={getX(chartStats.minPoint.index)}
                        cy={getY(chartStats.minPoint.baseRate)}
                        r={4.5}
                        fill="var(--success)"
                        stroke="var(--bg-card)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={Math.min(svgWidth - padRight - 36, Math.max(padLeft + 36, getX(chartStats.minPoint.index)))}
                        y={Math.min(padTop + plotH - 4, getY(chartStats.minPoint.baseRate) + 15)}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="700"
                        fill="var(--success)"
                      >
                        최저 {formatFxRate(chartStats.minPoint.baseRate, currencyCode)}
                      </text>
                    </g>
                    <g>
                      <circle
                        cx={getX(chartStats.maxPoint.index)}
                        cy={getY(chartStats.maxPoint.baseRate)}
                        r={4.5}
                        fill="var(--danger)"
                        stroke="var(--bg-card)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={Math.min(svgWidth - padRight - 36, Math.max(padLeft + 36, getX(chartStats.maxPoint.index)))}
                        y={Math.max(padTop + 12, getY(chartStats.maxPoint.baseRate) - 8)}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight="700"
                        fill="var(--danger)"
                      >
                        최고 {formatFxRate(chartStats.maxPoint.baseRate, currencyCode)}
                      </text>
                    </g>
                  </>
                )}

                {activeChartSeries.map((pt, idx) => {
                  const step = Math.max(1, Math.floor((activeChartSeries.length - 1) / 6));
                  const showLabel =
                    activeChartSeries.length <= 7 ||
                    idx === 0 ||
                    idx === activeChartSeries.length - 1 ||
                    idx % step === 0;
                  if (!showLabel) return null;
                  return (
                    <text
                      key={pt.rateDate}
                      x={getX(idx)}
                      y={svgHeight - 8}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight="600"
                      fill="var(--text-secondary)"
                    >
                      {pt.rateDate.slice(5)}
                    </text>
                  );
                })}

                {activeChartSeries.map((pt, idx) => {
                  if (pt.rateDate !== rateDate) return null;
                  return (
                    <circle
                      key={`selected-${pt.rateDate}`}
                      cx={getX(idx)}
                      cy={getY(pt.baseRate)}
                      r={6.5}
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth={1.8}
                    />
                  );
                })}

                {hoverIdx !== null && activeChartSeries[hoverIdx] && (
                  <g>
                    <line
                      x1={getX(hoverIdx)}
                      y1={padTop}
                      x2={getX(hoverIdx)}
                      y2={padTop + plotH}
                      stroke="var(--text-secondary)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={getX(hoverIdx)}
                      cy={getY(activeChartSeries[hoverIdx].baseRate)}
                      r={5}
                      fill="var(--primary)"
                      stroke="var(--bg-card)"
                      strokeWidth={2}
                    />
                    {showTtsLine && (
                      <circle
                        cx={getX(hoverIdx)}
                        cy={getY(activeChartSeries[hoverIdx].ttsRate)}
                        r={4}
                        fill="var(--danger)"
                        stroke="var(--bg-card)"
                        strokeWidth={1.5}
                      />
                    )}
                  </g>
                )}

                {activeChartSeries.map((pt, idx) => {
                  const sliceW = plotW / Math.max(1, activeChartSeries.length);
                  const x = getX(idx) - sliceW / 2;
                  return (
                    <rect
                      key={pt.rateDate}
                      x={Math.max(padLeft, x)}
                      y={padTop}
                      width={Math.max(4, sliceW)}
                      height={plotH}
                      fill="transparent"
                      style={{ cursor: 'crosshair' }}
                      onMouseEnter={() => setHoverIdx(idx)}
                      onClick={() => {
                        setRateDate(pt.rateDate);
                        setBaseRateKrw(pt.baseRate);
                        setTtSellingRate(pt.ttsRate);
                        setSource(pt.source);
                      }}
                    />
                  );
                })}
              </svg>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
              }}
            >
              <span>기준 단위: 1 {currencyCode} 당 원화 · 차트 일자 클릭 시 상단 편집칸 반영</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--primary)' }}>
                  <span style={{ width: '14px', height: '2.5px', backgroundColor: 'var(--primary)', display: 'inline-block' }} />
                  매매기준율
                </span>
                {showTtsLine && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--danger)' }}>
                    <span style={{ width: '14px', height: '2px', borderTop: '2px dashed var(--danger)', display: 'inline-block' }} />
                    전신환매도율
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <span style={{ width: '14px', height: '2px', borderTop: '2px dashed var(--text-muted)', display: 'inline-block' }} />
                  {currentPeriodLabel} 평균선
                </span>
              </div>
            </div>
          </div>
        )}
      </SectionPanel>

      <SectionPanel
        title="고시환율 원장"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'ALL', label: '전체', count: datasets.exchangeRates.length },
              ...FX_CURRENCIES.map((c) => ({
                id: c.code,
                label: c.code,
                count: (currencySeriesMap[c.code] || []).length,
              })),
            ]}
            activeId={gridFilter}
            onChange={(id) => {
              setGridFilter(id as typeof gridFilter);
              if (id !== 'ALL') {
                selectCurrency(id as Exclude<CurrencyCode, 'KRW'>);
              }
            }}
          />
        }
      >
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
              render: (r) => `${formatFxRate(Number(r.baseRateKrw), r.currencyCode)} 원`,
            },
            {
              key: 'ttSellingRate',
              header: '전신환매도율',
              width: 140,
              align: 'right',
              render: (r) =>
                r.ttSellingRate ? `${formatFxRate(Number(r.ttSellingRate), r.currencyCode)} 원` : '-',
            },
            { key: 'source', header: '출처', render: (r) => r.source },
          ]}
          rows={sorted}
          rowKey={(r) => r.id}
          onRowClick={(r) => {
            setCurrencyCode(r.currencyCode);
            setRateDate(r.rateDate);
            setBaseRateKrw(Number(r.baseRateKrw));
            setTtSellingRate(Number(r.ttSellingRate || 0));
            setSource(r.source);
            setHoverIdx(null);
          }}
          maxHeight="420px"
        />
      </SectionPanel>

      <ConservationBar
        manualId="fx-conservation"
        balanced={activeChartSeries.length > 0}
        balanceMessage={activeChartSeries.length > 0 ? '관리 환율 원장 정상' : '환율 데이터 미등록'}
        items={[
          { label: '관리 통화', value: `${FX_CURRENCIES.length}종`, tone: 'neutral' },
          { label: '전체 원장', value: `${datasets.exchangeRates.length}건`, tone: 'primary' },
          { label: `${currencyCode} ${currentPeriodLabel}`, value: `${activeChartSeries.length}건`, tone: 'success' },
          {
            label: `${currencyCode} 최신 매매기준율`,
            value:
              chartStats
                ? `${formatFxRate(chartStats.endRate, currencyCode)} 원`
                : `${formatFxRate(baseRateKrw, currencyCode)} 원`,
            tone: 'primary',
          },
        ]}
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
