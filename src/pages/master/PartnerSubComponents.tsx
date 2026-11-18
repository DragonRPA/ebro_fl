import React from 'react';
import { ExternalLink, RotateCcw, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import {
  DataGrid,
  ModalDialog,
  SectionPanel,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  controlTextareaStyle,
} from '../../components/UiPrimitives';
import {
  DAY_OF_MONTH_OPTIONS,
  PAYMENT_CYCLES,
  PAYMENT_METHODS,
  normalizePaymentMethod,
  offsetToPaymentCycle,
  type FlPartner,
  type FlPartnerSite,
  type PaymentMethodType,
} from '../../types/domain';

export const PartnerPaymentTermsRow: React.FC<{
  value: Partial<FlPartner>;
  onChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>;
  onCycleChange: (setter: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>, cycle: string) => void;
  testIdPrefix?: string;
  columns?: string;
}> = ({ value, onChange, onCycleChange, testIdPrefix = 'prt', columns = 'repeat(4, minmax(110px, 1fr))' }) => {
  const resolvedCycle = offsetToPaymentCycle(value.defaultPaymentMonthOffset, value.defaultPaymentCycle);
  const isPrepay = resolvedCycle === '선입금';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 'var(--space-field-grid-gap)' }}>
      <VerticalField label="결제수단" minWidth={0}>
        <select
          data-testid={`${testIdPrefix}-payment-method`}
          value={normalizePaymentMethod(value.paymentMethod)}
          onChange={(e) =>
            onChange((p) => ({ ...p, paymentMethod: e.target.value as PaymentMethodType }))
          }
          style={controlInputStyle}
        >
          {PAYMENT_METHODS.map((pm) => (
            <option key={pm} value={pm}>
              {pm}
            </option>
          ))}
        </select>
      </VerticalField>
      <VerticalField label="청구마감일" minWidth={0}>
        <select
          data-testid={`${testIdPrefix}-closing-day`}
          value={Number(value.defaultClosingDay ?? 31)}
          onChange={(e) =>
            onChange((p) => ({ ...p, defaultClosingDay: Number(e.target.value) }))
          }
          style={controlInputStyle}
        >
          {DAY_OF_MONTH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </VerticalField>
      <VerticalField label="지급기일 월구분" minWidth={0}>
        <select
          data-testid={`${testIdPrefix}-payment-cycle`}
          value={resolvedCycle}
          onChange={(e) => onCycleChange(onChange, e.target.value)}
          style={controlInputStyle}
        >
          {PAYMENT_CYCLES.map((cy) => (
            <option key={cy} value={cy}>
              {cy}
            </option>
          ))}
        </select>
      </VerticalField>
      <VerticalField label="지급기일 일자" minWidth={0}>
        <select
          data-testid={`${testIdPrefix}-payment-due-day`}
          disabled={isPrepay}
          value={isPrepay ? 0 : Number(value.defaultPaymentDueDay || 10)}
          onChange={(e) =>
            onChange((p) => ({ ...p, defaultPaymentDueDay: Number(e.target.value) }))
          }
          style={controlInputStyle}
        >
          {isPrepay ? (
            <option value={0}>출고 전 선입금</option>
          ) : (
            DAY_OF_MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          )}
        </select>
      </VerticalField>
    </div>
  );
};

export const PartnerDocViewerPane: React.FC<{
  docTitle: string;
  fileName: string;
  imageUrl: string | null | undefined;
  zoom: number;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  analyzing: boolean;
  canEdit: boolean;
  emptyText: string;
  selectBtnLabel: string;
  onSelectFileClick: () => void;
  onFileDrop: (file: File) => void;
}> = ({
  docTitle,
  fileName,
  imageUrl,
  zoom,
  onZoomChange,
  analyzing,
  canEdit,
  emptyText,
  selectBtnLabel,
  onSelectFileClick,
  onFileDrop,
}) => (
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
        onFileDrop(file);
      }
    }}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-inline-gap)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: 'var(--space-compact-pad-x)',
      backgroundColor: 'var(--bg-app)',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-tight-gap)',
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
        {fileName || docTitle}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-label-gap)' }}>
        <button
          type="button"
          onClick={() => onZoomChange((z) => Math.max(50, z - 25))}
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
          {zoom}%
        </span>
        <button
          type="button"
          onClick={() => onZoomChange((z) => Math.min(250, z + 25))}
          style={actionBtnStyle('secondary', true)}
          title="확대"
        >
          <ZoomIn size={13} />
        </button>
        <button
          type="button"
          onClick={() => onZoomChange(100)}
          style={actionBtnStyle('secondary', true)}
          title="원래 크기"
        >
          <RotateCcw size={12} />
        </button>
        {imageUrl && (
          <button
            type="button"
            onClick={() => {
              window.open(imageUrl, '_blank', 'noopener,noreferrer');
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
            onClick={onSelectFileClick}
            disabled={analyzing}
            style={actionBtnStyle('secondary', true)}
          >
            <Upload size={12} />
            {analyzing ? '판독중' : '파일 등록'}
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
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-compact-pad-y)',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={docTitle}
          style={{
            width: `${zoom}%`,
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
            gap: 'var(--space-field-grid-gap)',
            padding: 'calc(24px - 2pt)',
          }}
        >
          <span>{emptyText}</span>
          {canEdit && (
            <button
              type="button"
              onClick={onSelectFileClick}
              style={actionBtnStyle('primary', true)}
            >
              <Upload size={13} />
              {selectBtnLabel}
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

export const PartnerDocDropButton: React.FC<{
  testId: string;
  isDragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  analyzing: boolean;
  label: string;
  borderColor: string;
  textColor: string;
  onClick: () => void;
  onFileDrop: (file: File) => void;
}> = ({
  testId,
  isDragging,
  onDraggingChange,
  analyzing,
  label,
  borderColor,
  textColor,
  onClick,
  onFileDrop,
}) => (
  <div
    role="button"
    tabIndex={0}
    data-testid={testId}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    }}
    onDragOver={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) onDraggingChange(true);
    }}
    onDragLeave={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onDraggingChange(false);
    }}
    onDrop={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onDraggingChange(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        onFileDrop(file);
      }
    }}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'max(2px, calc(5px - 2pt))',
      padding: 'max(1px, calc(4px - 2pt)) var(--space-compact-pad-x)',
      borderRadius: '6px',
      border: `1px dashed ${borderColor}`,
      backgroundColor: isDragging ? 'var(--primary-light)' : 'var(--bg-app)',
      color: textColor,
      fontSize: '12px',
      fontWeight: 700,
      cursor: analyzing ? 'wait' : 'pointer',
      whiteSpace: 'nowrap',
      userSelect: 'none',
    }}
  >
    <Upload size={13} />
    <span>{label}</span>
  </div>
);

export interface PartnerSiteDraft {
  siteName: string;
  address: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

export const PartnerSitesSection: React.FC<{
  partnerSites: FlPartnerSite[];
  selectedId: string | null;
  canEdit: boolean;
  saving: boolean;
  siteForm: PartnerSiteDraft;
  onSiteFormChange: React.Dispatch<React.SetStateAction<PartnerSiteDraft>>;
  onAddSite: () => void;
}> = ({
  partnerSites,
  selectedId,
  canEdit,
  saving,
  siteForm,
  onSiteFormChange,
  onAddSite,
}) => (
  <SectionPanel title={`소속 사업장 · 현장 목록 · ${partnerSites.length}건`}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-field-grid-gap)' }}>
      {canEdit && selectedId && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr auto',
            gap: 'var(--space-inline-gap)',
            alignItems: 'end',
          }}
        >
          <VerticalField label="현장명" required>
            <input
              type="text"
              value={siteForm.siteName}
              onChange={(e) => onSiteFormChange((p) => ({ ...p, siteName: e.target.value }))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="현장주소">
            <input
              type="text"
              value={siteForm.address}
              onChange={(e) => onSiteFormChange((p) => ({ ...p, address: e.target.value }))}
              style={controlInputStyle}
            />
          </VerticalField>
          <button
            type="button"
            disabled={saving}
            onClick={onAddSite}
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
);

const PartnerDocModalFrame: React.FC<{
  open: boolean;
  title: string;
  bodyTestId?: string;
  docTitle: string;
  fileName: string;
  imageUrl: string | null | undefined;
  zoom: number;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  analyzing: boolean;
  canEdit: boolean;
  saving: boolean;
  emptyText: string;
  selectBtnLabel: string;
  onSelectFileClick: () => void;
  onFileDrop: (file: File) => void;
  modalForm: Partial<FlPartner>;
  onModalFormChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>;
  onCycleChange: (setter: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>, cycle: string) => void;
  paymentTestIdPrefix: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  fields: React.ReactNode;
}> = ({
  open,
  title,
  bodyTestId,
  docTitle,
  fileName,
  imageUrl,
  zoom,
  onZoomChange,
  analyzing,
  canEdit,
  saving,
  emptyText,
  selectBtnLabel,
  onSelectFileClick,
  onFileDrop,
  modalForm,
  onModalFormChange,
  onCycleChange,
  paymentTestIdPrefix,
  onClose,
  onSave,
  fields,
}) => (
  <ModalDialog open={open} title={title} onClose={onClose} width={1020}>
    <div
      data-testid={bodyTestId}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 1.15fr) minmax(320px, 1fr)',
        gap: 'var(--space-conservation-gap)',
        alignItems: 'start',
      }}
    >
      <PartnerDocViewerPane
        docTitle={docTitle}
        fileName={fileName}
        imageUrl={imageUrl}
        zoom={zoom}
        onZoomChange={onZoomChange}
        analyzing={analyzing}
        canEdit={canEdit}
        emptyText={emptyText}
        selectBtnLabel={selectBtnLabel}
        onSelectFileClick={onSelectFileClick}
        onFileDrop={onFileDrop}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-field-grid-gap)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-inline-gap)' }}>
          {fields}
        </div>

        <PartnerPaymentTermsRow
          value={modalForm}
          onChange={onModalFormChange}
          onCycleChange={onCycleChange}
          testIdPrefix={paymentTestIdPrefix}
          columns="1fr 1fr"
        />

        <VerticalField label="특이 메모">
          <textarea
            rows={3}
            value={modalForm.memo || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, memo: e.target.value }))}
            style={controlTextareaStyle}
          />
        </VerticalField>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-inline-gap)',
            paddingTop: 'var(--space-compact-pad-x)',
            borderTop: '1px solid var(--table-row-border)',
          }}
        >
          <button type="button" onClick={onClose} style={actionBtnStyle('secondary')}>
            닫기
          </button>
          {canEdit && (
            <button
              type="button"
              disabled={saving || analyzing}
              onClick={onSave}
              style={actionBtnStyle('primary')}
            >
              {saving ? '저장중' : '수정 내용 저장'}
            </button>
          )}
        </div>
      </div>
    </div>
  </ModalDialog>
);

export const PartnerBizCertModal: React.FC<{
  open: boolean;
  modalForm: Partial<FlPartner>;
  form: Partial<FlPartner>;
  zoom: number;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  analyzing: boolean;
  canEdit: boolean;
  saving: boolean;
  onSelectFileClick: () => void;
  onFileDrop: (file: File) => void;
  onModalFormChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>;
  onCycleChange: (setter: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>, cycle: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}> = ({
  open,
  modalForm,
  form,
  zoom,
  onZoomChange,
  analyzing,
  canEdit,
  saving,
  onSelectFileClick,
  onFileDrop,
  onModalFormChange,
  onCycleChange,
  onClose,
  onSave,
}) => (
  <PartnerDocModalFrame
    open={open}
    title={`사업자등록증 보기 · ${modalForm.name || form.name || '신규 거래처'}`}
    docTitle="사업자등록증 사본"
    fileName={modalForm.bizCertName || form.bizCertName || '사업자등록증 사본'}
    imageUrl={modalForm.bizCertUrl || form.bizCertUrl}
    zoom={zoom}
    onZoomChange={onZoomChange}
    analyzing={analyzing}
    canEdit={canEdit}
    saving={saving}
    emptyText="등록된 사업자등록증 파일이 없습니다."
    selectBtnLabel="사업자등록증 파일 선택"
    onSelectFileClick={onSelectFileClick}
    onFileDrop={onFileDrop}
    modalForm={modalForm}
    onModalFormChange={onModalFormChange}
    onCycleChange={onCycleChange}
    paymentTestIdPrefix="prt-modal"
    onClose={onClose}
    onSave={onSave}
    fields={
      <>
        <VerticalField label="상호" required>
          <input
            type="text"
            value={modalForm.name || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, name: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="사업자등록번호">
          <input
            type="text"
            value={modalForm.bizRegNo || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, bizRegNo: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="대표자">
          <input
            type="text"
            value={modalForm.representative || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, representative: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="대표 전화">
          <input
            type="text"
            value={modalForm.phone || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, phone: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="업태">
          <input
            type="text"
            value={modalForm.bizType || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, bizType: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="종목">
          <input
            type="text"
            value={modalForm.bizItem || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, bizItem: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="계산서 이메일">
          <input
            type="email"
            value={modalForm.taxEmail || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, taxEmail: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="주소">
          <input
            type="text"
            value={modalForm.address || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, address: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
      </>
    }
  />
);

export const PartnerBankbookModal: React.FC<{
  open: boolean;
  modalForm: Partial<FlPartner>;
  form: Partial<FlPartner>;
  zoom: number;
  onZoomChange: React.Dispatch<React.SetStateAction<number>>;
  analyzing: boolean;
  canEdit: boolean;
  saving: boolean;
  onSelectFileClick: () => void;
  onFileDrop: (file: File) => void;
  onModalFormChange: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>;
  onCycleChange: (setter: React.Dispatch<React.SetStateAction<Partial<FlPartner>>>, cycle: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}> = ({
  open,
  modalForm,
  form,
  zoom,
  onZoomChange,
  analyzing,
  canEdit,
  saving,
  onSelectFileClick,
  onFileDrop,
  onModalFormChange,
  onCycleChange,
  onClose,
  onSave,
}) => (
  <PartnerDocModalFrame
    open={open}
    title={`통장사본 보기 · ${modalForm.name || form.name || '신규 거래처'}`}
    bodyTestId="prt-bankbook-modal"
    docTitle="통장사본 이미지"
    fileName={modalForm.bankbookName || form.bankbookName || '통장사본 이미지'}
    imageUrl={modalForm.bankbookUrl || form.bankbookUrl}
    zoom={zoom}
    onZoomChange={onZoomChange}
    analyzing={analyzing}
    canEdit={canEdit}
    saving={saving}
    emptyText="등록된 통장사본 파일이 없습니다."
    selectBtnLabel="통장사본 파일 선택"
    onSelectFileClick={onSelectFileClick}
    onFileDrop={onFileDrop}
    modalForm={modalForm}
    onModalFormChange={onModalFormChange}
    onCycleChange={onCycleChange}
    paymentTestIdPrefix="prt-bank-modal"
    onClose={onClose}
    onSave={onSave}
    fields={
      <>
        <VerticalField label="상호" required>
          <input
            type="text"
            value={modalForm.name || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, name: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="은행명">
          <input
            type="text"
            list="kr-bank-datalist"
            placeholder="은행 선택 또는 입력"
            value={modalForm.bankName || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, bankName: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="계좌번호">
          <input
            type="text"
            placeholder="숫자 및 하이픈 입력"
            value={modalForm.bankAccount || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, bankAccount: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="예금주">
          <input
            type="text"
            placeholder="예금주명"
            value={modalForm.bankHolder || ''}
            onChange={(e) => onModalFormChange((p) => ({ ...p, bankHolder: e.target.value }))}
            style={controlInputStyle}
          />
        </VerticalField>
      </>
    }
  />
);
