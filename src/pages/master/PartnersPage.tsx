import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppShell } from '../../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import { syncPartnerNameAcrossTables } from '../../services/domainHrAdminEngine';
import {
  queryBatchPartnerNtsStatus,
  querySinglePartnerNtsStatus,
} from '../../services/ntsBusinessService';
import {
  ConservationBar,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type GridColumn,
} from '../../components/UiPrimitives';
import {
  cycleToMonthOffset,
  filterPartnersForTenant,
  formatPartnerNtsStatus,
  formatPaymentTermsLabel,
  getPartnerRolesForTenant,
  normalizePaymentMethod,
  offsetToPaymentCycle,
  partnerNtsStatusTone,
  type FlPartner,
  type FlPartnerSite,
  type PartnerNtsStatus,
  type PartnerRole,
  type PaymentCycleType,
} from '../../types/domain';
import {
  PartnerBankbookModal,
  PartnerBizCertModal,
  type PartnerSiteDraft,
} from './PartnerSubComponents';
import { PartnerEditorPanel, type PartnerDocActions } from './PartnerEditorPanel';

const createEmptyPartnerForm = (): Partial<FlPartner> => ({
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
  defaultPaymentCycle: '익월',
  defaultPaymentDueDay: 10,
  defaultPaymentMonthOffset: 1,
  paymentMethod: '계좌이체',
  bankName: '',
  bankAccount: '',
  bankHolder: '',
  creditGrade: '정상',
  memo: '',
  bizCertUrl: null,
  bizCertName: null,
  bankbookUrl: null,
  bankbookName: null,
  ntsStatus: null,
  ntsClosedDate: null,
  ntsTaxType: null,
  ntsCheckedAt: null,
  isActive: true,
});

const applyPaymentCycleChange = (
  setter: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>,
  nextCycleRaw: string
): void => {
  const nextCycle = nextCycleRaw as PaymentCycleType;
  setter((p) => ({
    ...p,
    defaultPaymentCycle: nextCycle,
    defaultPaymentMonthOffset: cycleToMonthOffset(nextCycle),
    defaultPaymentDueDay:
      nextCycle === '선입금'
        ? 0
        : p.defaultPaymentDueDay && p.defaultPaymentDueDay >= 1
          ? p.defaultPaymentDueDay
          : 10,
  }));
};

export const PartnersPage: React.FC = () => {
  const { isRentalEnabled, datasets, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('partners');
  const visibleRoles = useMemo(() => getPartnerRolesForTenant(isRentalEnabled), [isRentalEnabled]);
  const visibleRoleSet = useMemo(() => new Set<PartnerRole>(visibleRoles), [visibleRoles]);
  const tenantPartners = useMemo(
    () => filterPartnersForTenant(datasets.partners, isRentalEnabled),
    [datasets.partners, isRentalEnabled]
  );

  const [roleFilter, setRoleFilter] = useState<'ALL' | PartnerRole>('ALL');
  const [keyword, setKeyword] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(datasets.partners[0]?.id || null);

  const [form, setForm] = useState<Partial<FlPartner>>(() =>
    datasets.partners[0] ? { ...datasets.partners[0] } : createEmptyPartnerForm()
  );

  const [siteForm, setSiteForm] = useState<PartnerSiteDraft>({
    siteName: '',
    address: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
  });
  const [saving, setSaving] = useState(false);
  const [analyzingBizCert, setAnalyzingBizCert] = useState(false);
  const [bizCertFileName, setBizCertFileName] = useState<string>(datasets.partners[0]?.bizCertName || '');
  const [isBizCertModalOpen, setIsBizCertModalOpen] = useState(false);
  const [bizCertZoom, setBizCertZoom] = useState(100);
  const [analyzingBankbook, setAnalyzingBankbook] = useState(false);
  const [bankbookFileName, setBankbookFileName] = useState<string>(datasets.partners[0]?.bankbookName || '');
  const [isBankbookModalOpen, setIsBankbookModalOpen] = useState(false);
  const [bankbookZoom, setBankbookZoom] = useState(100);
  const [modalForm, setModalForm] = useState<Partial<FlPartner>>({});
  const [checkingNts, setCheckingNts] = useState(false);
  const [ntsProgressText, setNtsProgressText] = useState('');
  const bizCertInputRef = useRef<HTMLInputElement | null>(null);
  const bankbookInputRef = useRef<HTMLInputElement | null>(null);
  const docActionsRef = useRef<PartnerDocActions | null>(null);
  const didInitPartnerRef = useRef(Boolean(datasets.partners[0]));

  useEffect(() => {
    if (!didInitPartnerRef.current && datasets.partners.length > 0) {
      didInitPartnerRef.current = true;
      const first = datasets.partners[0];
      setSelectedId(first.id);
      setForm({ ...first });
      setBizCertFileName(first.bizCertName || '');
      setBankbookFileName(first.bankbookName || '');
    }
  }, [datasets.partners]);

  const selectPartner = (p: FlPartner) => {
    setSelectedId(p.id);
    setForm({ ...p });
    setBizCertFileName(p.bizCertName || '');
    setBankbookFileName(p.bankbookName || '');
  };

  const resetToNew = () => {
    setSelectedId(null);
    setBizCertFileName('');
    setBankbookFileName('');
    setForm(createEmptyPartnerForm());
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
    const visibleSelectedRoles = (target.partnerRoles || []).filter((r) => visibleRoleSet.has(r));
    if (visibleSelectedRoles.length === 0) {
      notifyToast('거래처 역할을 최소 1개 이상 선택해 주세요.', 'error');
      return false;
    }
    const roles = target.partnerRoles!;
    const resolvedCycle = offsetToPaymentCycle(
      target.defaultPaymentMonthOffset,
      target.defaultPaymentCycle
    );
    const resolvedOffset = cycleToMonthOffset(resolvedCycle);
    const resolvedDueDay =
      resolvedCycle === '선입금'
        ? 0
        : Math.min(31, Math.max(1, Number(target.defaultPaymentDueDay || 10)));
    const resolvedMethod = normalizePaymentMethod(target.paymentMethod);

    setSaving(true);
    try {
      const prevPartner = selectedId ? datasets.partners.find((p) => p.id === selectedId) : undefined;
      const trimmedBizNo = String(target.bizRegNo || '').trim();
      let resolvedNtsStatus: PartnerNtsStatus | string | null = target.ntsStatus || null;
      let resolvedNtsClosedDate: string | null = target.ntsClosedDate || null;
      let resolvedNtsTaxType: string | null = target.ntsTaxType || null;
      let resolvedNtsCheckedAt: string | null = target.ntsCheckedAt || null;

      if (!trimmedBizNo) {
        resolvedNtsStatus = null;
        resolvedNtsClosedDate = null;
        resolvedNtsTaxType = null;
        resolvedNtsCheckedAt = null;
      } else if (
        trimmedBizNo !== String(prevPartner?.bizRegNo || '').trim() ||
        !resolvedNtsStatus
      ) {
        const ntsRes = await querySinglePartnerNtsStatus(trimmedBizNo);
        if (ntsRes) {
          resolvedNtsStatus = ntsRes.ntsStatus;
          resolvedNtsClosedDate = ntsRes.ntsClosedDate;
          resolvedNtsTaxType = ntsRes.ntsTaxType;
          resolvedNtsCheckedAt = ntsRes.ntsCheckedAt;
        }
      }

      const payload = {
        tenantId: DEFAULT_TENANT_ID,
        name: target.name.trim(),
        bizRegNo: trimmedBizNo || null,
        representative: target.representative || null,
        bizType: target.bizType || null,
        bizItem: target.bizItem || null,
        address: target.address || null,
        phone: target.phone || null,
        email: target.email || null,
        taxEmail: target.taxEmail || null,
        partnerRoles: roles,
        defaultClosingDay: Math.min(31, Math.max(1, Number(target.defaultClosingDay || 31))),
        defaultPaymentCycle: resolvedCycle,
        defaultPaymentDueDay: resolvedDueDay,
        defaultPaymentMonthOffset: resolvedOffset,
        paymentMethod: resolvedMethod,
        bankName: target.bankName || null,
        bankAccount: target.bankAccount || null,
        bankHolder: target.bankHolder || null,
        creditGrade: target.creditGrade || '정상',
        memo: target.memo || null,
        bizCertUrl: target.bizCertUrl || null,
        bizCertName: target.bizCertName || null,
        bankbookUrl: target.bankbookUrl || null,
        bankbookName: target.bankbookName || null,
        ntsStatus: resolvedNtsStatus,
        ntsClosedDate: resolvedNtsClosedDate,
        ntsTaxType: resolvedNtsTaxType,
        ntsCheckedAt: resolvedNtsCheckedAt,
        isActive: target.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };
      if (selectedId) {
        await execDbMutation('거래처 정보 수정', () =>
          flSupabase.from('partners').update(camelToSnakeRow(payload)).eq('id', selectedId)
        );
        if (prevPartner && prevPartner.name !== payload.name) {
          await syncPartnerNameAcrossTables({
            partnerId: selectedId,
            newName: payload.name,
            prevName: prevPartner.name,
          });
        }
      } else {
        const id = newId('PRT');
        await execDbMutation('거래처 신규 등록', () =>
          flSupabase.from('partners').insert(camelToSnakeRow({ id, ...payload }))
        );
        setSelectedId(id);
      }
      setForm((prev) => ({
        ...prev,
        ...target,
        partnerRoles: roles,
        defaultClosingDay: payload.defaultClosingDay,
        defaultPaymentCycle: resolvedCycle,
        defaultPaymentDueDay: resolvedDueDay,
        defaultPaymentMonthOffset: resolvedOffset,
        paymentMethod: resolvedMethod,
        ntsStatus: resolvedNtsStatus,
        ntsClosedDate: resolvedNtsClosedDate,
        ntsTaxType: resolvedNtsTaxType,
        ntsCheckedAt: resolvedNtsCheckedAt,
      }));
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

  const handleBatchNtsCheck = async () => {
    const targets = tenantPartners.filter((p) => String(p.bizRegNo || '').trim().length > 0);
    if (targets.length === 0) {
      notifyToast('사업자등록번호가 등록된 거래처가 없습니다.', 'info');
      return;
    }
    setCheckingNts(true);
    setNtsProgressText(`0/${targets.length}`);
    try {
      const resultMap = await queryBatchPartnerNtsStatus(
        targets.map((p) => String(p.bizRegNo || '')),
        (done, total) => setNtsProgressText(`${done}/${total}`)
      );

      let normalCnt = 0;
      let suspendedCnt = 0;
      let closedCnt = 0;
      let unregCnt = 0;
      const updates: {
        id: string;
        ntsStatus: PartnerNtsStatus;
        ntsClosedDate: string | null;
        ntsTaxType: string | null;
        ntsCheckedAt: string;
      }[] = [];

      for (const p of targets) {
        const raw = String(p.bizRegNo || '').trim();
        const digits = raw.replace(/[^0-9]/g, '');
        const matched = resultMap.get(digits) || resultMap.get(raw);
        if (!matched) continue;
        if (matched.ntsStatus === '정상') normalCnt += 1;
        else if (matched.ntsStatus === '휴업') suspendedCnt += 1;
        else if (matched.ntsStatus === '폐업') closedCnt += 1;
        else unregCnt += 1;

        updates.push({
          id: p.id,
          ntsStatus: matched.ntsStatus,
          ntsClosedDate: matched.ntsClosedDate,
          ntsTaxType: matched.ntsTaxType,
          ntsCheckedAt: matched.ntsCheckedAt,
        });
      }

      if (canEdit && updates.length > 0) {
        const CHUNK = 15;
        await execDbMutation('사업자휴폐업조회 결과 저장', async () => {
          for (let i = 0; i < updates.length; i += CHUNK) {
            const slice = updates.slice(i, i + CHUNK);
            const results = await Promise.all(
              slice.map((u) =>
                flSupabase
                  .from('partners')
                  .update(
                    camelToSnakeRow({
                      ntsStatus: u.ntsStatus,
                      ntsClosedDate: u.ntsClosedDate,
                      ntsTaxType: u.ntsTaxType,
                      ntsCheckedAt: u.ntsCheckedAt,
                    })
                  )
                  .eq('id', u.id)
              )
            );
            const firstErr = results.find((r) => r.error)?.error;
            if (firstErr) {
              return { data: null, error: firstErr };
            }
          }
          return { data: updates.length, error: null };
        });
      }

      if (selectedId) {
        const matchedSel = updates.find((u) => u.id === selectedId);
        if (matchedSel) {
          setForm((prev) => ({
            ...prev,
            ntsStatus: matchedSel.ntsStatus,
            ntsClosedDate: matchedSel.ntsClosedDate,
            ntsTaxType: matchedSel.ntsTaxType,
            ntsCheckedAt: matchedSel.ntsCheckedAt,
          }));
        }
      }

      await refreshAll();
      notifyToast(
        `사업자휴폐업조회 완료 · 정상 ${normalCnt}건 · 휴업 ${suspendedCnt}건 · 폐업 ${closedCnt}건${unregCnt > 0 ? ` · 미등록 ${unregCnt}건` : ''}`,
        closedCnt > 0 || suspendedCnt > 0 ? 'info' : 'success'
      );
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '사업자휴폐업조회 실패', 'error');
    } finally {
      setCheckingNts(false);
      setNtsProgressText('');
    }
  };

  const openBizCertModal = () => {
    setModalForm({ ...form });
    setBizCertZoom(100);
    setIsBizCertModalOpen(true);
  };

  const openBankbookModal = () => {
    setModalForm({ ...form });
    setBankbookZoom(100);
    setIsBankbookModalOpen(true);
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

  const effectiveRoleFilter = roleFilter !== 'ALL' && !visibleRoleSet.has(roleFilter) ? 'ALL' : roleFilter;

  const filteredPartners = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return tenantPartners.filter((p) => {
      if (effectiveRoleFilter !== 'ALL' && !p.partnerRoles.includes(effectiveRoleFilter)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.bizRegNo || '').toLowerCase().includes(q) ||
        (p.representative || '').toLowerCase().includes(q)
      );
    });
  }, [effectiveRoleFilter, keyword, tenantPartners]);

  const partnerSites = useMemo(
    () => datasets.partnerSites.filter((s) => s.partnerId === selectedId),
    [datasets.partnerSites, selectedId]
  );

  const ntsSummary = useMemo(() => {
    let normal = 0;
    let suspended = 0;
    let closed = 0;
    let other = 0;
    for (const p of tenantPartners) {
      if (p.ntsStatus === '정상') normal += 1;
      else if (p.ntsStatus === '휴업') suspended += 1;
      else if (p.ntsStatus === '폐업') closed += 1;
      else other += 1;
    }
    return { normal, suspended, closed, other };
  }, [tenantPartners]);

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
    {
      key: 'name',
      header: '상호명',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => <span style={{ fontWeight: 700 }}>{r.name}</span>,
    },
    {
      key: 'ntsStatus',
      header: '사업자상태',
      width: 132,
      align: 'center',
      sortable: true,
      sortValue: (r) => (r.ntsStatus ? formatPartnerNtsStatus(r.ntsStatus, r.ntsClosedDate) : null),
      render: (r) =>
        r.ntsStatus ? (
          <StatusBadge
            label={formatPartnerNtsStatus(r.ntsStatus, r.ntsClosedDate)}
            tone={partnerNtsStatusTone(r.ntsStatus)}
          />
        ) : (
          '-'
        ),
    },
    {
      key: 'roles',
      header: '역할',
      sortable: true,
      sortValue: (r) => r.partnerRoles.filter((role) => visibleRoleSet.has(role)).join(', ') || null,
      render: (r) => (
        <div style={{ display: 'flex', gap: 'var(--space-label-gap)' }}>
          {r.partnerRoles
            .filter((role) => visibleRoleSet.has(role))
            .slice(0, 3)
            .map((role) => (
              <StatusBadge key={role} label={role} tone="neutral" />
            ))}
        </div>
      ),
    },
    {
      key: 'paymentMethod',
      header: '결제수단',
      width: 82,
      align: 'center',
      sortable: true,
      sortValue: (r) => normalizePaymentMethod(r.paymentMethod),
      render: (r) => normalizePaymentMethod(r.paymentMethod),
    },
    {
      key: 'paymentTerms',
      header: '지급기일',
      width: 96,
      align: 'center',
      sortable: true,
      sortValue: (r) =>
        formatPaymentTermsLabel(
          r.defaultPaymentCycle,
          r.defaultPaymentDueDay,
          r.defaultPaymentMonthOffset
        ),
      render: (r) =>
        formatPaymentTermsLabel(
          r.defaultPaymentCycle,
          r.defaultPaymentDueDay,
          r.defaultPaymentMonthOffset
        ),
    },
    {
      key: 'bizRegNo',
      header: '사업자번호',
      width: 120,
      sortable: true,
      sortValue: (r) => r.bizRegNo || null,
      render: (r) => r.bizRegNo || '-',
    },
    {
      key: 'phone',
      header: '연락처',
      width: 120,
      sortable: true,
      sortValue: (r) => r.phone || null,
      render: (r) => r.phone || '-',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title="거래처 조회 · 역할 필터"
        manualId="prt-search"
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid="prt-nts-check-btn"
              data-manual-id="prt-nts-check"
              disabled={checkingNts}
              onClick={() => {
                void handleBatchNtsCheck();
              }}
              style={actionBtnStyle('secondary', true)}
            >
              <RefreshCw size={13} />
              {checkingNts ? `휴폐업 조회 중 · ${ntsProgressText || '진행'}` : '사업자휴폐업조회'}
            </button>
            {canEdit && (
              <button type="button" onClick={resetToNew} style={actionBtnStyle('primary', true)}>
                신규 거래처
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-stack-gap)', alignItems: 'flex-end' }}>
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
              { id: 'ALL', label: '전체', count: tenantPartners.length },
              ...visibleRoles.map((r) => ({
                id: r,
                label: r,
                count: tenantPartners.filter((p) => p.partnerRoles.includes(r)).length,
              })),
            ]}
            activeId={effectiveRoleFilter}
            onChange={(id) => setRoleFilter(id as typeof roleFilter)}
          />
        </div>
      </SectionPanel>

      <div
        data-manual-id="prt-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(380px, 1.15fr) minmax(360px, 1fr)',
          gap: 'var(--space-page-gap)',
          alignItems: 'start',
        }}
      >
        <DataGrid
          columns={columns}
          rows={filteredPartners}
          rowKey={(r) => r.id}
          selectedRowId={selectedId}
          onRowClick={selectPartner}
          maxHeight="calc(100vh - 280px)"
        />

        <PartnerEditorPanel
          selectedId={selectedId}
          form={form}
          onFormChange={setForm}
          onModalFormChange={setModalForm}
          onCycleChange={applyPaymentCycleChange}
          visibleRoles={visibleRoles}
          canEdit={canEdit}
          saving={saving}
          analyzingBizCert={analyzingBizCert}
          onAnalyzingBizCertChange={setAnalyzingBizCert}
          analyzingBankbook={analyzingBankbook}
          onAnalyzingBankbookChange={setAnalyzingBankbook}
          bizCertFileName={bizCertFileName}
          onBizCertFileNameChange={setBizCertFileName}
          bankbookFileName={bankbookFileName}
          onBankbookFileNameChange={setBankbookFileName}
          onBankbookZoomChange={setBankbookZoom}
          onBankbookModalOpenChange={setIsBankbookModalOpen}
          bizCertInputRef={bizCertInputRef}
          bankbookInputRef={bankbookInputRef}
          docActionsRef={docActionsRef}
          notifyToast={notifyToast}
          onOpenBizCertModal={openBizCertModal}
          onOpenBankbookModal={openBankbookModal}
          onToggleRole={toggleRole}
          onSavePartner={() => {
            void handleSavePartner();
          }}
          partnerSites={partnerSites}
          siteForm={siteForm}
          onSiteFormChange={setSiteForm}
          onAddSite={handleAddSite}
        />
      </div>

      <ConservationBar
        manualId="prt-conservation"
        balanced={ntsSummary.closed === 0 && ntsSummary.suspended === 0}
        balanceMessage={
          ntsSummary.closed > 0 || ntsSummary.suspended > 0
            ? `휴·폐업 거래처 ${ntsSummary.suspended + ntsSummary.closed}건 확인`
            : '등록 거래처 상태 정상'
        }
        items={[
          { label: '전체 거래처', value: `${datasets.partners.length}건`, tone: 'neutral' },
          { label: '정상', value: `${ntsSummary.normal}건`, tone: 'success' },
          { label: '휴업', value: `${ntsSummary.suspended}건`, tone: ntsSummary.suspended > 0 ? 'warning' : 'neutral' },
          { label: '폐업', value: `${ntsSummary.closed}건`, tone: ntsSummary.closed > 0 ? 'danger' : 'neutral' },
          { label: '미등록 · 미입력', value: `${ntsSummary.other}건`, tone: 'neutral' },
        ]}
      />

      <PartnerBizCertModal
        open={isBizCertModalOpen}
        modalForm={modalForm}
        form={form}
        zoom={bizCertZoom}
        onZoomChange={setBizCertZoom}
        analyzing={analyzingBizCert}
        canEdit={canEdit}
        saving={saving}
        onSelectFileClick={() => bizCertInputRef.current?.click()}
        onFileDrop={(file) => {
          docActionsRef.current?.handleBizLicenseFile(file);
        }}
        onModalFormChange={setModalForm}
        onCycleChange={applyPaymentCycleChange}
        onClose={() => setIsBizCertModalOpen(false)}
        onSave={async () => {
          const ok = await handleSavePartner(modalForm);
          if (ok) {
            setIsBizCertModalOpen(false);
          }
        }}
      />

      <PartnerBankbookModal
        open={isBankbookModalOpen}
        modalForm={modalForm}
        form={form}
        zoom={bankbookZoom}
        onZoomChange={setBankbookZoom}
        analyzing={analyzingBankbook}
        canEdit={canEdit}
        saving={saving}
        onSelectFileClick={() => bankbookInputRef.current?.click()}
        onFileDrop={(file) => {
          docActionsRef.current?.handleBankbookFile(file);
        }}
        onModalFormChange={setModalForm}
        onCycleChange={applyPaymentCycleChange}
        onClose={() => setIsBankbookModalOpen(false)}
        onSave={async () => {
          const ok = await handleSavePartner(modalForm);
          if (ok) {
            setIsBankbookModalOpen(false);
          }
        }}
      />
    </div>
  );
};
