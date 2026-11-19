import React, { useEffect, useState } from 'react';
import {
  buildDefaultPopbillDraft,
  issuePopbillTaxInvoiceForBilling,
  type PopbillIssueDraft,
  type PopbillIssueResult,
  type PopbillLiveStatus,
} from '../services/popbillTaxInvoiceService';
import type { FlBilling, FlPartner, TenantProfile } from '../types/domain';
import {
  ModalDialog,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from './UiPrimitives';

export const PopbillTaxInvoiceModal: React.FC<{
  open: boolean;
  onClose: () => void;
  billing: FlBilling | null;
  partner?: FlPartner;
  tenant: TenantProfile;
  liveStatus: PopbillLiveStatus | null;
  onIssued: (res: PopbillIssueResult) => Promise<void> | void;
}> = ({ open, onClose, billing, partner, tenant, liveStatus, onIssued }) => {
  const [draft, setDraft] = useState<PopbillIssueDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open && billing) {
      setDraft(buildDefaultPopbillDraft({ billing, partner, tenant }));
      setErrorMsg(null);
    }
  }, [open, billing, partner, tenant]);

  if (!billing || !draft) return null;

  const isClosedBiz = partner?.ntsStatus === '폐업';
  const cleanBuyerBiz = draft.customerBizNo.replace(/[^0-9]/g, '');
  const isBuyerBizValid =
    cleanBuyerBiz.length === 10 && cleanBuyerBiz !== '0000000000' && cleanBuyerBiz !== '1000000000';
  const isTestMode =
    liveStatus?.isTest ?? tenant.features?.popbillConfig?.isTest ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await issuePopbillTaxInvoiceForBilling({
        tenant,
        billing,
        partner,
        draft,
      });
      await onIssued(res);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '팝빌 전자세금계산서 발행 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={`팝빌 전자세금계산서 발행 · ${billing.billingNo}`}
      width={760}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-inline-gap)',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            fontSize: '12.5px',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              공급자: {tenant.corporateName}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              사업자번호 {liveStatus?.corpNum || tenant.businessNumber}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              대표자 {tenant.representativeName}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <StatusBadge
              label={isTestMode ? '테스트 연동' : '실운영 연동'}
              tone={isTestMode ? 'warning' : 'success'}
            />
            {liveStatus && (
              <StatusBadge
                label={liveStatus.certRegistered ? '인증서 정상' : '인증서 미등록'}
                tone={liveStatus.certRegistered ? 'success' : 'danger'}
              />
            )}
          </div>
        </div>

        {(isClosedBiz || !isBuyerBizValid || (liveStatus && !liveStatus.certRegistered)) && (
          <div
            role="alert"
            style={{
              padding: '9px 12px',
              borderRadius: '6px',
              border: '1px solid var(--warning)',
              backgroundColor: 'var(--bg-app)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}
          >
            {isClosedBiz && <span>거래처가 폐업 상태로 확인되어 발행이 제한됩니다.</span>}
            {!isBuyerBizValid && <span>공급받는자 사업자등록번호 10자리를 정확히 입력해 주세요.</span>}
            {liveStatus && !liveStatus.certRegistered && (
              <span>공동인증서가 미등록된 경우 팝빌 임시문서함으로 저장됩니다.</span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)' }}>
          <VerticalField label="공급받는자 상호" required flex={1} minWidth={190}>
            <input
              type="text"
              value={draft.customerName}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerName: e.target.value } : prev))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="사업자등록번호" required width={160}>
            <input
              type="text"
              value={draft.customerBizNo}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerBizNo: e.target.value } : prev))}
              placeholder="10자리 숫자"
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="대표자명" width={120}>
            <input
              type="text"
              value={draft.customerCeoName}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerCeoName: e.target.value } : prev))}
              style={controlInputStyle}
            />
          </VerticalField>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)' }}>
          <VerticalField label="업태" flex={1} minWidth={150}>
            <input
              type="text"
              value={draft.customerBizType}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerBizType: e.target.value } : prev))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="종목" flex={1} minWidth={150}>
            <input
              type="text"
              value={draft.customerBizClass}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerBizClass: e.target.value } : prev))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="작성일자" required width={145}>
            <input
              type="date"
              value={draft.writeDate}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, writeDate: e.target.value } : prev))}
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="영수 청구 구분" required width={115}>
            <select
              value={draft.purposeType}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, purposeType: e.target.value === '영수' ? '영수' : '청구' } : prev
                )
              }
              style={controlInputStyle}
            >
              <option value="청구">청구</option>
              <option value="영수">영수</option>
            </select>
          </VerticalField>
        </div>

        <VerticalField label="사업장 주소">
          <input
            type="text"
            value={draft.customerAddr}
            onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerAddr: e.target.value } : prev))}
            style={controlInputStyle}
          />
        </VerticalField>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)' }}>
          <VerticalField label="수신 이메일 기본" flex={1} minWidth={200}>
            <input
              type="email"
              value={draft.customerEmail}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerEmail: e.target.value } : prev))}
              placeholder="계산서 수신 이메일"
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="수신 이메일 참조" flex={1} minWidth={200}>
            <input
              type="email"
              value={draft.customerEmail2}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, customerEmail2: e.target.value } : prev))}
              placeholder="선택 입력"
              style={controlInputStyle}
            />
          </VerticalField>
          <VerticalField label="비고" flex={1} minWidth={180}>
            <input
              type="text"
              value={draft.memo}
              onChange={(e) => setDraft((prev) => (prev ? { ...prev, memo: e.target.value } : prev))}
              style={controlInputStyle}
            />
          </VerticalField>
        </div>

        <div
          style={{
            border: '1px solid var(--table-border-color)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--table-border-color)' }}>
                <th style={{ padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>품목</th>
                <th style={{ padding: '7px 10px', textAlign: 'center', width: '70px', whiteSpace: 'nowrap' }}>수량</th>
                <th style={{ padding: '7px 10px', textAlign: 'right', width: '120px', whiteSpace: 'nowrap' }}>단가</th>
                <th style={{ padding: '7px 10px', textAlign: 'right', width: '125px', whiteSpace: 'nowrap' }}>공급가액</th>
                <th style={{ padding: '7px 10px', textAlign: 'right', width: '110px', whiteSpace: 'nowrap' }}>세액</th>
              </tr>
            </thead>
            <tbody>
              {draft.taxItems.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--table-border-color)' }}>
                  <td style={{ padding: '6px 10px' }}>{item.itemName}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {item.qty.toLocaleString('ko-KR')}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₩{item.unitPrice.toLocaleString('ko-KR')}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₩{item.supplyAmount.toLocaleString('ko-KR')}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    ₩{item.vatAmount.toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: '18px',
              padding: '9px 12px',
              backgroundColor: 'var(--bg-app)',
              fontSize: '12.5px',
              fontWeight: 700,
            }}
          >
            <span>공급가액 ₩{billing.supplyAmountKrw.toLocaleString('ko-KR')}</span>
            <span>부가세 ₩{billing.vatAmountKrw.toLocaleString('ko-KR')}</span>
            <span style={{ color: 'var(--primary)' }}>
              합계금액 ₩{billing.totalAmountKrw.toLocaleString('ko-KR')}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            style={{
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid var(--danger)',
              backgroundColor: 'var(--bg-app)',
              color: 'var(--danger)',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
          <button type="button" onClick={onClose} style={actionBtnStyle('secondary')}>
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || isClosedBiz || !isBuyerBizValid}
            style={actionBtnStyle('primary')}
          >
            {submitting ? '발행 처리중' : '전자세금계산서 발행'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
};
