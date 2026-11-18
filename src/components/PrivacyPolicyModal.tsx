import React, { useState } from 'react';
import { X, ShieldCheck, Edit2, Save, UserCheck, CheckCircle2 } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';

interface PrivacyPolicyModalProps {
  isOpen?: boolean;
  onClose: () => void;
}

interface OfficerFormState {
  name: string;
  position: string;
  department: string;
  phone: string;
  email: string;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen = true, onClose }) => {
  const { tenantProfile, isRentalEnabled, currentUser, canEditPage, updateTenantConfig } = useAppShell();

  const canEdit = Boolean(
    currentUser && (currentUser.tierLevel >= 7 || canEditPage('system_settings'))
  );

  const companyName =
    tenantProfile.corporateName ||
    tenantProfile.displayName ||
    (isRentalEnabled ? '이브로지게차 렌탈' : '이브로지게차');
  const businessItem =
    tenantProfile.businessItem || (isRentalEnabled ? '지게차 렌탈' : '지게차 및 부품 도소매');

  const savedOfficer = (tenantProfile.features as Record<string, unknown> | undefined)?.privacyOfficer as
    | Partial<OfficerFormState>
    | undefined;

  const currentOfficer: OfficerFormState = {
    name: savedOfficer?.name || tenantProfile.representativeName || '대표이사',
    position: savedOfficer?.position || '대표이사 · 관리부 총괄',
    department: savedOfficer?.department || `${companyName} 관리부`,
    phone: savedOfficer?.phone || tenantProfile.tel || '-',
    email: savedOfficer?.email || tenantProfile.taxEmail || '사내 관리부 문의',
  };

  const [isEditingOfficer, setIsEditingOfficer] = useState(false);
  const [officerForm, setOfficerForm] = useState<OfficerFormState>(currentOfficer);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartEdit = () => {
    setOfficerForm(currentOfficer);
    setSaveSuccessMsg(false);
    setSaveError(null);
    setIsEditingOfficer(true);
  };

  const handleSaveOfficer = async () => {
    if (!officerForm.name.trim()) {
      setSaveError('보호책임자 성명을 입력하십시오.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateTenantConfig({
        features: {
          ...(tenantProfile.features || { bankMatchingEnabled: true }),
          privacyOfficer: {
            name: officerForm.name.trim(),
            position: officerForm.position.trim(),
            department: officerForm.department.trim(),
            phone: officerForm.phone.trim(),
            email: officerForm.email.trim(),
          },
        } as typeof tenantProfile.features,
      });
      setIsEditingOfficer(false);
      setSaveSuccessMsg(true);
      window.setTimeout(() => setSaveSuccessMsg(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '개인정보 보호책임자 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '88vh',
          backgroundColor: 'var(--bg-card)',
          color: 'var(--text-main)',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-header)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800 }}>
              개인정보처리방침 · 안전성 확보조치 고지
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            fontSize: '13px',
            lineHeight: 1.65,
            color: 'var(--text-secondary)',
          }}
        >
          <p style={{ marginTop: 0, marginBottom: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
            {companyName}(이하 회사)는 개인정보 보호법 제30조에 따라 정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보처리방침을 수립·공개합니다.
          </p>

          <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)', marginTop: '16px', marginBottom: '6px' }}>
            1. 개인정보의 처리 목적
          </h4>
          <p style={{ margin: '0 0 8px 0' }}>
            회사는 {businessItem} 전사 업무 시스템 운영을 위해 다음의 목적에 한하여 최소한의 개인정보를 처리합니다.
          </p>
          <ul style={{ margin: '0 0 12px 0', paddingLeft: '18px' }}>
            <li>임직원 인사·근태·급여 관리 및 시스템 접근 권한 인증</li>
            <li>
              {isRentalEnabled
                ? '렌탈·유통 계약 체결, 장비 출고·배차·회수 및 정비 이력 관리'
                : '유통 계약 체결, 장비·부품 출고·배차 및 사후처리 이력 관리'}
            </li>
            <li>세금계산서·거래명세서 발행, 채권·채무 정산 및 수납 대사</li>
          </ul>

          <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)', marginTop: '16px', marginBottom: '6px' }}>
            2. 처리하는 개인정보의 항목 및 보유 기간
          </h4>
          <ul style={{ margin: '0 0 12px 0', paddingLeft: '18px' }}>
            <li>임직원 정보: 성명, 사번, 아이디, 비밀번호(단방향 암호화), 부서·직책, 연락처, 이메일, 급여계좌</li>
            <li>거래처 담당자 정보: 성명, 연락처, 이메일, 현장 주소, 사업자등록 정보</li>
            <li>보유 기간: 법령에 따른 보존 기간(국세기본법 5년, 근로기준법 3년 등) 및 목적 달성 시까지</li>
          </ul>

          <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)', marginTop: '16px', marginBottom: '6px' }}>
            3. 개인정보의 안전성 확보조치
          </h4>
          <ul style={{ margin: '0 0 14px 0', paddingLeft: '18px' }}>
            <li>관리적 조치: 내부관리계획 수립·시행, 직급 티어 기반 최소 권한 부여 및 접근 통제</li>
            <li>기술적 조치: 전송 구간 암호화 적용, 비밀번호 단방향 해시 저장, 접속 기록 보관</li>
          </ul>

          <div
            style={{
              marginTop: '14px',
              padding: '14px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-app)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: 'var(--text-main)', fontSize: '13.5px' }}>
                <UserCheck size={16} color="var(--primary)" />
                <span>4. 개인정보 보호책임자 안내</span>
              </div>
              {canEdit && !isEditingOfficer && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Edit2 size={12} />
                  <span>책임자 수정</span>
                </button>
              )}
            </div>

            {saveSuccessMsg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontWeight: 700, fontSize: '12px', marginBottom: '8px' }}>
                <CheckCircle2 size={14} />
                <span>개인정보 보호책임자 정보가 저장되었습니다.</span>
              </div>
            )}

            {saveError && (
              <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '12px', marginBottom: '8px' }}>
                {saveError}
              </div>
            )}

            {isEditingOfficer ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="text"
                  value={officerForm.name}
                  onChange={(e) => setOfficerForm({ ...officerForm, name: e.target.value })}
                  placeholder="성명"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '12.5px' }}
                />
                <input
                  type="text"
                  value={officerForm.position}
                  onChange={(e) => setOfficerForm({ ...officerForm, position: e.target.value })}
                  placeholder="직책"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '12.5px' }}
                />
                <input
                  type="text"
                  value={officerForm.department}
                  onChange={(e) => setOfficerForm({ ...officerForm, department: e.target.value })}
                  placeholder="담당 부서"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '12.5px' }}
                />
                <input
                  type="text"
                  value={officerForm.phone}
                  onChange={(e) => setOfficerForm({ ...officerForm, phone: e.target.value })}
                  placeholder="연락처"
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '12.5px' }}
                />
                <input
                  type="email"
                  value={officerForm.email}
                  onChange={(e) => setOfficerForm({ ...officerForm, email: e.target.value })}
                  placeholder="이메일"
                  style={{ gridColumn: '1 / -1', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '12.5px' }}
                />
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setIsEditingOfficer(false)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveOfficer}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--primary)', color: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Save size={13} />
                    <span>{isSaving ? '저장 중' : '저장'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '12.5px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>성명: </span>
                  <strong style={{ color: 'var(--text-main)' }}>{currentOfficer.name}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>직책: </span>
                  <strong style={{ color: 'var(--text-main)' }}>{currentOfficer.position}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>담당 부서: </span>
                  <strong style={{ color: 'var(--text-main)' }}>{currentOfficer.department}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>연락처: </span>
                  <strong style={{ color: 'var(--text-main)' }}>{currentOfficer.phone}</strong>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--text-muted)' }}>이메일: </span>
                  <strong style={{ color: 'var(--text-main)' }}>{currentOfficer.email}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-header)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 18px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
