import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import {
  analyzeBankbookFile,
  analyzeBusinessLicenseFile,
  uploadBankbookImageToR2,
  uploadBusinessLicenseImageToR2,
} from '../../services/businessLicenseOcrService';
import { querySinglePartnerNtsStatus } from '../../services/ntsBusinessService';
import {
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  controlTextareaStyle,
} from '../../components/UiPrimitives';
import {
  KOREAN_BANK_LIST,
  formatClosingDayLabel,
  formatPartnerNtsStatus,
  formatPaymentTermsLabel,
  normalizePaymentMethod,
  partnerNtsStatusTone,
  type FlPartner,
  type FlPartnerSite,
  type PartnerRole,
} from '../../types/domain';
import {
  PartnerDocDropButton,
  PartnerPaymentTermsRow,
  PartnerSitesSection,
  type PartnerSiteDraft,
} from './PartnerSubComponents';

export type PartnerNotifyToastFn = (
  message: string,
  kind?: 'info' | 'success' | 'error'
) => void;

export interface PartnerDocActions {
  handleBankbookFile: (file: File) => void;
  handleBizLicenseFile: (file: File) => void;
}

const isSupportedDocFile = (file: File): boolean => {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp')
  );
};

function syncUploadedDocPreview(
  urlKey: 'bankbookUrl' | 'bizCertUrl',
  nameKey: 'bankbookName' | 'bizCertName',
  fileName: string,
  previewUrl: string,
  uploadFn: (name: string, dataUrl: string) => Promise<string>,
  onFormChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>,
  onModalFormChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>
): void {
  const applyPreview = (prev: Partial<FlPartner>): Partial<FlPartner> => ({
    ...prev,
    [urlKey]: previewUrl,
    [nameKey]: fileName,
  });
  onFormChange(applyPreview);
  onModalFormChange(applyPreview);

  void uploadFn(fileName, previewUrl).then((storedUrl) => {
    if (!storedUrl || storedUrl === previewUrl) return;
    const replaceUrl = (prev: Partial<FlPartner>): Partial<FlPartner> =>
      prev[urlKey] === previewUrl ? { ...prev, [urlKey]: storedUrl } : prev;
    onFormChange(replaceUrl);
    onModalFormChange(replaceUrl);
  });
}

type PartnerTextFieldKey =
  | 'name'
  | 'bizRegNo'
  | 'representative'
  | 'phone'
  | 'bizType'
  | 'bizItem'
  | 'taxEmail'
  | 'email';

const BASIC_PARTNER_FIELDS: ReadonlyArray<{
  key: PartnerTextFieldKey;
  label: string;
  required?: boolean;
  type?: 'text' | 'email';
}> = [
  { key: 'name', label: '상호', required: true },
  { key: 'bizRegNo', label: '사업자등록번호' },
  { key: 'representative', label: '대표자' },
  { key: 'phone', label: '대표 전화' },
  { key: 'bizType', label: '업태' },
  { key: 'bizItem', label: '종목' },
  { key: 'taxEmail', label: '계산서 이메일', type: 'email' },
  { key: 'email', label: '대표 이메일', type: 'email' },
];

type PartnerBankFieldKey = 'bankName' | 'bankAccount' | 'bankHolder';

const BANK_PARTNER_FIELDS: ReadonlyArray<{
  key: PartnerBankFieldKey;
  label: string;
  testId: string;
  placeholder: string;
  list?: string;
}> = [
  {
    key: 'bankName',
    label: '은행명',
    testId: 'prt-bank-name',
    placeholder: '은행 선택 또는 입력',
    list: 'kr-bank-datalist',
  },
  {
    key: 'bankAccount',
    label: '계좌번호',
    testId: 'prt-bank-account',
    placeholder: '숫자 및 하이픈 입력',
  },
  {
    key: 'bankHolder',
    label: '예금주',
    testId: 'prt-bank-holder',
    placeholder: '예금주명',
  },
];

export interface PartnerEditorPanelProps {
  selectedId: string | null;
  form: Partial<FlPartner>;
  onFormChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>;
  onModalFormChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>;
  onCycleChange: (setter: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>, cycle: string) => void;
  visibleRoles: PartnerRole[];
  canEdit: boolean;
  saving: boolean;
  analyzingBizCert: boolean;
  onAnalyzingBizCertChange: React.Dispatch<React.SetStateAction<boolean>>;
  analyzingBankbook: boolean;
  onAnalyzingBankbookChange: React.Dispatch<React.SetStateAction<boolean>>;
  bizCertFileName: string;
  onBizCertFileNameChange: React.Dispatch<React.SetStateAction<string>>;
  bankbookFileName: string;
  onBankbookFileNameChange: React.Dispatch<React.SetStateAction<string>>;
  onBankbookZoomChange: React.Dispatch<React.SetStateAction<number>>;
  onBankbookModalOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  bizCertInputRef: React.RefObject<HTMLInputElement | null>;
  bankbookInputRef: React.RefObject<HTMLInputElement | null>;
  docActionsRef?: React.RefObject<PartnerDocActions | null>;
  notifyToast: PartnerNotifyToastFn;
  onOpenBizCertModal: () => void;
  onOpenBankbookModal: () => void;
  onToggleRole: (role: PartnerRole) => void;
  onSavePartner: () => void;
  partnerSites: FlPartnerSite[];
  siteForm: PartnerSiteDraft;
  onSiteFormChange: React.Dispatch<React.SetStateAction<PartnerSiteDraft>>;
  onAddSite: () => void;
}

export const PartnerEditorPanel: React.FC<PartnerEditorPanelProps> = ({
  selectedId,
  form,
  onFormChange,
  onModalFormChange,
  onCycleChange,
  visibleRoles,
  canEdit,
  saving,
  analyzingBizCert,
  onAnalyzingBizCertChange,
  analyzingBankbook,
  onAnalyzingBankbookChange,
  bizCertFileName,
  onBizCertFileNameChange,
  bankbookFileName,
  onBankbookFileNameChange,
  onBankbookZoomChange,
  onBankbookModalOpenChange,
  bizCertInputRef,
  bankbookInputRef,
  docActionsRef,
  notifyToast,
  onOpenBizCertModal,
  onOpenBankbookModal,
  onToggleRole,
  onSavePartner,
  partnerSites,
  siteForm,
  onSiteFormChange,
  onAddSite,
}) => {
  const [isDraggingBizCert, setIsDraggingBizCert] = useState(false);
  const [isDraggingBankbook, setIsDraggingBankbook] = useState(false);

  const handleBankbookFile = async (file: File) => {
    if (!canEdit) return;
    if (!isSupportedDocFile(file)) {
      notifyToast('이미지 또는 문서 형식의 통장사본 파일을 올려주세요.', 'error');
      return;
    }

    onAnalyzingBankbookChange(true);
    onBankbookFileNameChange(file.name);
    notifyToast(`통장사본 판독 중 · ${file.name}`, 'info');

    try {
      const res = await analyzeBankbookFile(file);
      const previewUrl = res.previewImageDataUrl;

      if (previewUrl) {
        syncUploadedDocPreview(
          'bankbookUrl',
          'bankbookName',
          file.name,
          previewUrl,
          uploadBankbookImageToR2,
          onFormChange,
          onModalFormChange
        );
      }

      const applyBankOcr = (prev: Partial<FlPartner>): Partial<FlPartner> => ({
        ...prev,
        bankName: res.bankName || prev.bankName || '',
        bankAccount: res.bankAccount || prev.bankAccount || '',
        bankHolder: res.bankHolder || prev.bankHolder || '',
      });
      onFormChange(applyBankOcr);
      onModalFormChange((prev) => ({
        ...(Object.keys(prev).length > 0 ? prev : form),
        ...applyBankOcr(Object.keys(prev).length > 0 ? prev : form),
        bankbookUrl: prev.bankbookUrl || previewUrl || form.bankbookUrl || null,
        bankbookName: file.name,
      }));
      onBankbookZoomChange(100);
      onBankbookModalOpenChange(true);

      if (res.success) {
        notifyToast('통장사본 등록 및 계좌 판독 완료 · 확인 후 저장해 주세요.', 'success');
      } else {
        notifyToast('통장사본 첨부 완료 · 모달에서 계좌정보를 확인·입력해 주세요.', 'info');
      }
    } catch (err) {
      notifyToast(
        err instanceof Error ? err.message : '통장사본 처리 중 오류가 발생했습니다.',
        'error'
      );
    } finally {
      onAnalyzingBankbookChange(false);
    }
  };

  const handleBizLicenseFile = async (file: File) => {
    if (!canEdit) return;
    if (!isSupportedDocFile(file)) {
      notifyToast('이미지 또는 문서 형식의 사업자등록증 파일을 올려주세요.', 'error');
      return;
    }

    onAnalyzingBizCertChange(true);
    onBizCertFileNameChange(file.name);
    notifyToast(`사업자등록증 판독 중 · ${file.name}`, 'info');

    try {
      const res = await analyzeBusinessLicenseFile(file);
      const previewUrl = res.previewImageDataUrl;

      if (previewUrl) {
        syncUploadedDocPreview(
          'bizCertUrl',
          'bizCertName',
          file.name,
          previewUrl,
          uploadBusinessLicenseImageToR2,
          onFormChange,
          onModalFormChange
        );
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

      onFormChange(applyOcr);
      onModalFormChange(applyOcr);

      if (res.bizRegNo) {
        void querySinglePartnerNtsStatus(res.bizRegNo).then((nts) => {
          if (!nts) return;
          const patchNts = (prev: Partial<FlPartner>): Partial<FlPartner> => ({
            ...prev,
            ntsStatus: nts.ntsStatus,
            ntsClosedDate: nts.ntsClosedDate,
            ntsTaxType: nts.ntsTaxType,
            ntsCheckedAt: nts.ntsCheckedAt,
          });
          onFormChange(patchNts);
          onModalFormChange(patchNts);
        });
      }

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
      onAnalyzingBizCertChange(false);
    }
  };

  useEffect(() => {
    if (!docActionsRef) return;
    docActionsRef.current = {
      handleBankbookFile: (file: File) => {
        void handleBankbookFile(file);
      },
      handleBizLicenseFile: (file: File) => {
        void handleBizLicenseFile(file);
      },
    };
    return () => {
      docActionsRef.current = null;
    };
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-page-gap)',
        maxHeight: 'calc(100vh - 280px)',
        overflowY: 'auto',
        paddingRight: '2px',
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
      <input
        ref={bankbookInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void handleBankbookFile(file);
          }
          e.target.value = '';
        }}
      />
      <datalist id="kr-bank-datalist">
        {KOREAN_BANK_LIST.map((bank) => (
          <option key={bank} value={bank} />
        ))}
      </datalist>

      <SectionPanel
        title={selectedId ? `거래처 상세 · ${form.name || ''}` : '신규 거래처 등록'}
        style={
          isDraggingBizCert || isDraggingBankbook
            ? {
                border: '2px dashed var(--primary)',
                backgroundColor: 'var(--primary-light)',
              }
            : undefined
        }
        titleSlot={
          canEdit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}>
              <PartnerDocDropButton
                testId="prt-drop-bizcert"
                isDragging={isDraggingBizCert}
                onDraggingChange={setIsDraggingBizCert}
                analyzing={analyzingBizCert}
                label={analyzingBizCert ? `사업자 판독 중 · ${bizCertFileName}` : '사업자등록증 등록'}
                borderColor="var(--primary)"
                textColor="var(--primary)"
                onClick={() => bizCertInputRef.current?.click()}
                onFileDrop={(file) => {
                  void handleBizLicenseFile(file);
                }}
              />
              <PartnerDocDropButton
                testId="prt-drop-bankbook"
                isDragging={isDraggingBankbook}
                onDraggingChange={setIsDraggingBankbook}
                analyzing={analyzingBankbook}
                label={analyzingBankbook ? `통장 판독 중 · ${bankbookFileName}` : '통장사본 등록'}
                borderColor={isDraggingBankbook ? 'var(--primary)' : 'var(--border-color)'}
                textColor={form.bankbookUrl ? 'var(--primary)' : 'var(--text-main)'}
                onClick={() => bankbookInputRef.current?.click()}
                onFileDrop={(file) => {
                  void handleBankbookFile(file);
                }}
              />
            </div>
          ) : undefined
        }
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}>
            <button
              type="button"
              data-manual-id="prt-view-bizcert"
              onClick={onOpenBizCertModal}
              style={{
                ...actionBtnStyle('secondary', true),
                borderColor: form.bizCertUrl ? 'var(--primary)' : 'var(--border-color)',
                backgroundColor: form.bizCertUrl ? 'var(--primary-light)' : 'var(--bg-card)',
                color: form.bizCertUrl ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              <Eye size={13} />
              사업자등록증 보기
            </button>
            <button
              type="button"
              data-manual-id="prt-view-bankbook"
              data-testid="prt-view-bankbook"
              onClick={onOpenBankbookModal}
              style={{
                ...actionBtnStyle('secondary', true),
                borderColor: form.bankbookUrl ? 'var(--primary)' : 'var(--border-color)',
                backgroundColor: form.bankbookUrl ? 'var(--primary-light)' : 'var(--bg-card)',
                color: form.bankbookUrl ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              <Eye size={13} />
              통장사본 보기
            </button>
            {canEdit && (
              <button
                type="button"
                data-manual-id="prt-save"
                disabled={saving || analyzingBizCert || analyzingBankbook}
                onClick={onSavePartner}
                style={actionBtnStyle('primary', true)}
              >
                {saving ? '저장중' : '거래처 저장'}
              </button>
            )}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-field-grid-gap)' }}>
          <VerticalField label="거래처 역할 다중선택" required>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-tight-gap)' }}>
              {visibleRoles.map((role) => {
                const checked = (form.partnerRoles || []).includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => onToggleRole(role)}
                    style={{
                      padding: 'var(--space-tab-item-pad-y) var(--space-compact-pad-x)',
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
            {BASIC_PARTNER_FIELDS.map((field) => (
              <VerticalField key={field.key} label={field.label} required={field.required}>
                <input
                  type={field.type || 'text'}
                  value={form[field.key] || ''}
                  onChange={(e) => onFormChange((p) => ({ ...p, [field.key]: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
            ))}
          </div>

          <VerticalField label="주소">
            <input
              type="text"
              value={form.address || ''}
              onChange={(e) => onFormChange((p) => ({ ...p, address: e.target.value }))}
              style={controlInputStyle}
            />
          </VerticalField>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            {BANK_PARTNER_FIELDS.map((field) => (
              <VerticalField key={field.key} label={field.label} minWidth={0}>
                <input
                  type="text"
                  list={field.list}
                  data-testid={field.testId}
                  placeholder={field.placeholder}
                  value={form[field.key] || ''}
                  onChange={(e) => onFormChange((p) => ({ ...p, [field.key]: e.target.value }))}
                  style={controlInputStyle}
                />
              </VerticalField>
            ))}
          </div>

          <PartnerPaymentTermsRow
            value={form}
            onChange={onFormChange}
            onCycleChange={onCycleChange}
            testIdPrefix="prt"
          />

          <div
            data-testid="prt-payment-summary"
            style={{
              padding: 'var(--space-table-td-pad-y) var(--space-compact-pad-x)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {`정산 기준: 마감 ${formatClosingDayLabel(form.defaultClosingDay)} · 지급 ${formatPaymentTermsLabel(form.defaultPaymentCycle, form.defaultPaymentDueDay, form.defaultPaymentMonthOffset)} · 결제수단 ${normalizePaymentMethod(form.paymentMethod)}`}
          </div>

          <div
            data-testid="prt-detail-nts-status"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-inline-gap)',
              padding: 'var(--space-table-td-pad-y) var(--space-compact-pad-x)',
              borderRadius: '6px',
              border: '1px solid var(--table-row-border)',
              backgroundColor: 'var(--bg-app)',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                국세청 사업자 상태
              </span>
              {form.ntsStatus ? (
                <StatusBadge
                  label={formatPartnerNtsStatus(form.ntsStatus, form.ntsClosedDate)}
                  tone={partnerNtsStatusTone(form.ntsStatus)}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>미조회</span>
              )}
              {form.ntsTaxType && (
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {form.ntsTaxType}
                </span>
              )}
            </div>
            {form.ntsCheckedAt && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {`조회일 ${String(form.ntsCheckedAt).slice(0, 10)}`}
              </span>
            )}
          </div>

          <VerticalField label="특이 메모">
            <textarea
              rows={2}
              value={form.memo || ''}
              onChange={(e) => onFormChange((p) => ({ ...p, memo: e.target.value }))}
              style={controlTextareaStyle}
            />
          </VerticalField>
        </div>
      </SectionPanel>

      <PartnerSitesSection
        partnerSites={partnerSites}
        selectedId={selectedId}
        canEdit={canEdit}
        saving={saving}
        siteForm={siteForm}
        onSiteFormChange={onSiteFormChange}
        onAddSite={onAddSite}
      />
    </div>
  );
};
