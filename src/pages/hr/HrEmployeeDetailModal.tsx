import React, { useMemo } from 'react';
import {
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import type { ToastItem } from '../../core/AppShellContext';
import {
  TIER_LABELS,
  type EmploymentStatus,
  type FlHrHistory,
  type FlUser,
  type TierLevel,
} from '../../types/domain';
import {
  CommaNumberInput,
  DataGrid,
  ModalDialog,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type GridColumn,
} from '../../components/UiPrimitives';
import {
  INSURANCE_FIELDS,
  buildEmployeeHrPatch,
  formatLeaveRemain,
  hasEmployeeAppointmentChanged,
  maskResidentRegNo,
  openAttachmentPreview,
  readScanAttachment,
  resizeAvatarImageToDataUrl,
  type DeptNode,
  type EmployeeDetailFormState,
} from './hrHelpers';

export interface HrEmployeeDetailModalProps {
  open: boolean;
  busy: boolean;
  detailTab: 'HR' | 'PAYROLL' | 'PW' | 'LOG';
  selectedUser: FlUser | null;
  canEdit: boolean;
  canViewPayroll: boolean;
  canResetPassword: boolean;
  deptTree: DeptNode[];
  form: EmployeeDetailFormState;
  resetPw1: string;
  resetPw2: string;
  resetPwReason: string;
  selectedUserHistories: FlHrHistory[];
  historyColumns: GridColumn<FlHrHistory>[];
  formatMoney: (amount: number | null | undefined, options?: { salesSensitive?: boolean }) => string;
  notifyToast: (message: string, kind?: ToastItem['kind']) => void;
  onClose: () => void;
  onChangeTab: (tab: 'HR' | 'PAYROLL' | 'PW' | 'LOG') => void;
  onPatchForm: (patch: Partial<EmployeeDetailFormState>) => void;
  onChangeResetPw1: (val: string) => void;
  onChangeResetPw2: (val: string) => void;
  onChangeResetPwReason: (val: string) => void;
  onSaveBasicHr: () => void;
  onExecuteAppointment: () => Promise<void>;
  onSavePayroll: (e: React.FormEvent) => void;
  onResetPassword: (e: React.FormEvent) => void;
}

export const HrEmployeeDetailModal: React.FC<HrEmployeeDetailModalProps> = ({
  open,
  busy,
  detailTab,
  selectedUser,
  canEdit,
  canViewPayroll,
  canResetPassword,
  deptTree,
  form,
  resetPw1,
  resetPw2,
  resetPwReason,
  selectedUserHistories,
  historyColumns,
  formatMoney,
  notifyToast,
  onClose,
  onChangeTab,
  onPatchForm,
  onChangeResetPw1,
  onChangeResetPw2,
  onChangeResetPwReason,
  onSaveBasicHr,
  onExecuteAppointment,
  onSavePayroll,
  onResetPassword,
}) => {
  const appointmentChanged = useMemo(
    () => hasEmployeeAppointmentChanged(selectedUser, form),
    [form, selectedUser]
  );

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeAvatarImageToDataUrl(file);
      onPatchForm({ profileImageUrl: dataUrl });
      notifyToast('프로필 사진을 불러왔습니다. 저장 시 반영됩니다.', 'info');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '프로필 사진 처리 실패', 'error');
    }
  };

  const handlePledgeScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { name, dataUrl } = await readScanAttachment(file);
      onPatchForm({
        pledgeScanName: name,
        pledgeScanUrl: dataUrl,
        ...(form.pledgeDate ? {} : { pledgeDate: new Date().toISOString().slice(0, 10) }),
      });
      notifyToast('보안서약서 첨부 파일을 불러왔습니다. 저장 시 반영됩니다.', 'info');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '서약서 첨부 처리 실패', 'error');
    }
  };

  const detailTabs: { id: 'HR' | 'PAYROLL' | 'PW' | 'LOG'; label: string; icon?: React.ReactNode }[] = [
    { id: 'HR', label: '인사정보 · 발령' },
    { id: 'PAYROLL', label: '급여 · 계좌', icon: <ShieldCheck size={13} /> },
    { id: 'PW', label: '비밀번호 초기화', icon: <KeyRound size={13} /> },
    { id: 'LOG', label: `개인 이력 · ${selectedUserHistories.length}건`, icon: <History size={13} /> },
  ];

  return (
    <ModalDialog
      open={open && Boolean(selectedUser)}
      title={selectedUser ? `인사 카드 · ${selectedUser.name} · ${selectedUser.employeeNo || '-'}` : '인사 카드'}
      width={800}
      onClose={onClose}
    >
      {selectedUser && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-inline-gap)',
              paddingBottom: 'var(--space-compact-pad-x)',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--space-tight-gap)', flexWrap: 'wrap' }}>
              {detailTabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChangeTab(t.id)}
                  style={actionBtnStyle(detailTab === t.id ? 'primary' : 'secondary', true)}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>
            <StatusBadge
              label={`${selectedUser.name} · ${TIER_LABELS[selectedUser.tierLevel]}`}
              tone="primary"
            />
          </div>

          {detailTab === 'HR' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--space-stack-gap)',
                  padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-stack-gap)' }}>
                  {form.profileImageUrl ? (
                    <img
                      src={form.profileImageUrl}
                      alt={form.name}
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '1px solid var(--border-color)',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--primary-light)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: 800,
                        border: '1px solid var(--border-color)',
                        flexShrink: 0,
                      }}
                    >
                      {(form.name || selectedUser.name).slice(0, 1)}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                      {selectedUser.name} · {selectedUser.employeeNo || '사번 미지정'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      잔여 연차 {formatLeaveRemain(Number(form.leaveGrant || 0), Number(form.leaveUsed || 0)).toFixed(1)}일 · 보안서약{' '}
                      {form.pledgeDate || form.pledgeScanUrl ? '제출' : '미제출'}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-tight-gap)' }}>
                    <label style={{ ...actionBtnStyle('secondary', true), cursor: 'pointer' }}>
                      <Upload size={12} />
                      사진 첨부
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                    </label>
                    {form.profileImageUrl && (
                      <button
                        type="button"
                        onClick={() => onPatchForm({ profileImageUrl: '' })}
                        style={actionBtnStyle('secondary', true)}
                      >
                        <Trash2 size={12} />
                        사진 삭제
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="사번">
                  <input type="text" disabled={!canEdit} value={form.empNo} onChange={(e) => onPatchForm({ empNo: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="성명" required>
                  <input type="text" disabled={!canEdit} value={form.name} onChange={(e) => onPatchForm({ name: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="소속 부서">
                  <select disabled={!canEdit} value={form.deptId} onChange={(e) => onPatchForm({ deptId: e.target.value })} style={controlInputStyle}>
                    <option value="">미배정</option>
                    {deptTree.map(({ dept, depth }) => (
                      <option key={dept.id} value={dept.id}>
                        {'  '.repeat(depth)}
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </VerticalField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="직책">
                  <input type="text" disabled={!canEdit} value={form.position} onChange={(e) => onPatchForm({ position: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="담당 직무">
                  <input type="text" disabled={!canEdit} value={form.duty} onChange={(e) => onPatchForm({ duty: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="직급 티어">
                  <select disabled={!canEdit} value={form.tier} onChange={(e) => onPatchForm({ tier: Number(e.target.value) as TierLevel })} style={controlInputStyle}>
                    {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                      <option key={t} value={t}>
                        {TIER_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </VerticalField>
                <VerticalField label="재직 상태">
                  <select disabled={!canEdit} value={form.status} onChange={(e) => onPatchForm({ status: e.target.value as EmploymentStatus })} style={controlInputStyle}>
                    <option value="ACTIVE">재직</option>
                    <option value="LEAVE_OF_ABSENCE">휴직</option>
                    <option value="RETIRED">퇴사</option>
                  </select>
                </VerticalField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="입사일">
                  <input type="date" disabled={!canEdit} value={form.joinDate} onChange={(e) => onPatchForm({ joinDate: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="퇴사일">
                  <input type="date" disabled={!canEdit || form.status !== 'RETIRED'} value={form.retireDate} onChange={(e) => onPatchForm({ retireDate: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="생년월일">
                  <input type="date" disabled={!canEdit} value={form.birthDate} onChange={(e) => onPatchForm({ birthDate: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="주민등록번호">
                  {!canResetPassword ? (
                    <div style={{ ...controlInputStyle, display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                      권한 제한
                    </div>
                  ) : !form.residentVisible && form.residentRegNo ? (
                    <div style={{ display: 'flex', gap: 'var(--space-label-gap)', alignItems: 'center' }}>
                      <div
                        style={{
                          ...controlInputStyle,
                          display: 'flex',
                          alignItems: 'center',
                          backgroundColor: 'var(--bg-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                        }}
                      >
                        {maskResidentRegNo(form.residentRegNo)}
                      </div>
                      <button
                        type="button"
                        onClick={() => onPatchForm({ residentVisible: true })}
                        title="주민등록번호 표시"
                        style={actionBtnStyle('secondary', true)}
                      >
                        <Eye size={13} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 'var(--space-label-gap)', alignItems: 'center' }}>
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={form.residentRegNo}
                        onChange={(e) => onPatchForm({ residentRegNo: e.target.value })}
                        placeholder="000000-0000000"
                        style={controlInputStyle}
                      />
                      {form.residentRegNo && (
                        <button
                          type="button"
                          onClick={() => onPatchForm({ residentVisible: false })}
                          title="주민등록번호 숨김"
                          style={actionBtnStyle('secondary', true)}
                        >
                          <EyeOff size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </VerticalField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="연락처">
                  <input type="text" disabled={!canEdit} value={form.phone} onChange={(e) => onPatchForm({ phone: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="이메일">
                  <input type="email" disabled={!canEdit} value={form.email} onChange={(e) => onPatchForm({ email: e.target.value })} style={controlInputStyle} />
                </VerticalField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="주소">
                  <input type="text" disabled={!canEdit} value={form.address} onChange={(e) => onPatchForm({ address: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="비상연락처">
                  <input type="text" disabled={!canEdit} value={form.emergency} onChange={(e) => onPatchForm({ emergency: e.target.value })} style={controlInputStyle} />
                </VerticalField>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)', alignItems: 'end' }}>
                <VerticalField label="부여 연차일수">
                  <input type="number" step="0.5" min={0} disabled={!canEdit} value={form.leaveGrant} onChange={(e) => onPatchForm({ leaveGrant: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="사용 연차일수">
                  <input type="number" step="0.5" min={0} disabled={!canEdit} value={form.leaveUsed} onChange={(e) => onPatchForm({ leaveUsed: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="잔여 연차일수">
                  <div
                    style={{
                      ...controlInputStyle,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      fontWeight: 700,
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  >
                    {formatLeaveRemain(Number(form.leaveGrant || 0), Number(form.leaveUsed || 0)).toFixed(1)}일
                  </div>
                </VerticalField>
                <VerticalField label="보안서약일">
                  <input type="date" disabled={!canEdit} value={form.pledgeDate} onChange={(e) => onPatchForm({ pledgeDate: e.target.value })} style={controlInputStyle} />
                </VerticalField>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--space-field-grid-gap)',
                  padding: 'var(--space-compact-pad-y) var(--space-subbox-pad-x)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', fontSize: '12.5px' }}>
                  <FileText size={14} />
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>보안서약서 스캔본</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{form.pledgeScanName || '미첨부'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-tight-gap)' }}>
                  {form.pledgeScanUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        void openAttachmentPreview(form.pledgeScanUrl, form.pledgeScanName).catch((err) =>
                          notifyToast(err instanceof Error ? err.message : '파일 열람 실패', 'error')
                        );
                      }}
                      style={actionBtnStyle('secondary', true)}
                    >
                      열람
                    </button>
                  )}
                  {canEdit && (
                    <>
                      <label style={{ ...actionBtnStyle('secondary', true), cursor: 'pointer' }}>
                        <Upload size={12} />
                        파일 첨부
                        <input type="file" accept="image/*,.pdf" onChange={handlePledgeScanUpload} style={{ display: 'none' }} />
                      </label>
                      {form.pledgeScanUrl && (
                        <button
                          type="button"
                          onClick={() => onPatchForm({ pledgeScanName: '', pledgeScanUrl: '' })}
                          style={actionBtnStyle('secondary', true)}
                        >
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
                <VerticalField label="발령 시행일">
                  <input type="date" disabled={!canEdit} value={form.effectiveDate} onChange={(e) => onPatchForm({ effectiveDate: e.target.value })} style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="변경 사유">
                  <input type="text" disabled={!canEdit} value={form.reason} onChange={(e) => onPatchForm({ reason: e.target.value })} placeholder="발령 또는 수정 사유" style={controlInputStyle} />
                </VerticalField>
                <VerticalField label="인사 메모">
                  <input type="text" disabled={!canEdit} value={form.memo} onChange={(e) => onPatchForm({ memo: e.target.value })} style={controlInputStyle} />
                </VerticalField>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', paddingTop: 'var(--space-label-gap)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-page-gap)' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" disabled={!canEdit} checked={form.maskPrice} onChange={(e) => onPatchForm({ maskPrice: e.target.checked })} />
                    판매 단가 비공개 적용
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" disabled={!canEdit} checked={form.mustChangePw} onChange={(e) => onPatchForm({ mustChangePw: e.target.checked })} />
                    비밀번호 변경 필요 상태
                  </label>
                </div>

                {canEdit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)' }}>
                    <button type="button" onClick={onClose} style={actionBtnStyle('secondary')}>
                      닫기
                    </button>
                    {appointmentChanged ? (
                      <CommitActionButton
                        actionCode="HR_APPOINTMENT"
                        targetTable="fl_users"
                        targetId={selectedUser.id}
                        title={`인사 발령 · ${selectedUser.name}`}
                        label="인사 발령 실행"
                        disabled={busy}
                        buildPayload={() => ({
                          userId: selectedUser.id,
                          patch: buildEmployeeHrPatch(selectedUser, form, canResetPassword),
                          effectiveDate: form.effectiveDate,
                          reason: form.reason || '조직·직책·티어·재직상태 인사 발령',
                        })}
                        onExecuteDirect={onExecuteAppointment}
                      />
                    ) : (
                      <button type="button" disabled={busy} onClick={onSaveBasicHr} style={actionBtnStyle('primary')}>
                        {busy ? '저장 중' : '기본 정보 저장'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {detailTab === 'PAYROLL' && (
            canViewPayroll ? (
              <form onSubmit={onSavePayroll} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 'var(--space-field-grid-gap)',
                    padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    fontSize: '12.5px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>현재 등록 월 기본급</div>
                    <strong style={{ whiteSpace: 'nowrap' }}>{formatMoney(Number(selectedUser.baseSalaryKrw || 0))}</strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>현재 등록 통상임금</div>
                    <strong style={{ whiteSpace: 'nowrap' }}>
                      {Number(selectedUser.hourlyWageKrw || 0) > 0
                        ? formatMoney(Number(selectedUser.hourlyWageKrw))
                        : '미입력 · 0원'}
                    </strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>월 고정급 합계</div>
                    <strong style={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(
                        Number(selectedUser.baseSalaryKrw || 0) +
                          Number(selectedUser.mealAllowanceKrw || 0) +
                          Number(selectedUser.vehicleAllowanceKrw || 0)
                      )}
                    </strong>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>4대보험 가입</div>
                    <strong style={{ whiteSpace: 'nowrap' }}>
                      {[
                        selectedUser.insNationalPension,
                        selectedUser.insHealthInsurance,
                        selectedUser.insEmploymentInsurance,
                        selectedUser.insIndustrialAccident,
                      ].filter(Boolean).length}
                      종 가입
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
                  <VerticalField label="월 기본급" required>
                    <CommaNumberInput min={0} value={Number(form.salary || 0)} onChange={(v) => onPatchForm({ salary: String(v) })} />
                  </VerticalField>
                  <VerticalField label="통상임금 · 수동 입력">
                    <CommaNumberInput
                      min={0}
                      value={Number(form.hourlyWage || 0)}
                      onChange={(v) => onPatchForm({ hourlyWage: v > 0 ? String(v) : '' })}
                      placeholder="시간당 통상임금 직접 입력"
                      dataManualWage
                    />
                  </VerticalField>
                  <VerticalField label="용역계약금액">
                    <CommaNumberInput min={0} value={Number(form.serviceContract || 0)} onChange={(v) => onPatchForm({ serviceContract: String(v) })} />
                  </VerticalField>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
                  <VerticalField label="식대">
                    <CommaNumberInput min={0} value={Number(form.mealAllowance || 0)} onChange={(v) => onPatchForm({ mealAllowance: String(v) })} />
                  </VerticalField>
                  <VerticalField label="차량보조금">
                    <CommaNumberInput min={0} value={Number(form.vehicleAllowance || 0)} onChange={(v) => onPatchForm({ vehicleAllowance: String(v) })} />
                  </VerticalField>
                </div>

                <div
                  style={{
                    padding: 'var(--space-compact-pad-y) var(--space-subbox-pad-x)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {Number(form.hourlyWage || 0) > 0
                    ? `수동 입력 통상임금 기준 참고 단가 · 평일연장 1.5배 ${formatMoney(Math.round(Number(form.hourlyWage) * 1.5))} · 휴일 8시간 이내 1.5배 ${formatMoney(Math.round(Number(form.hourlyWage) * 1.5))} · 휴일 8시간 초과 2.0배 ${formatMoney(Math.round(Number(form.hourlyWage) * 2))} · 야간가산 0.5배 ${formatMoney(Math.round(Number(form.hourlyWage) * 0.5))}`
                    : '통상임금은 자동계산되지 않으며 직접 입력한 금액만 저장됩니다.'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
                  <VerticalField label="급여 은행명">
                    <input type="text" list="fl-payroll-banks" value={form.bank} onChange={(e) => onPatchForm({ bank: e.target.value })} placeholder="선택 또는 직접 입력" style={controlInputStyle} />
                  </VerticalField>
                  <VerticalField label="예금주">
                    <input type="text" value={form.accountHolder} onChange={(e) => onPatchForm({ accountHolder: e.target.value })} style={controlInputStyle} />
                  </VerticalField>
                  <VerticalField label="급여 계좌번호">
                    <input type="text" value={form.account} onChange={(e) => onPatchForm({ account: e.target.value })} style={controlInputStyle} />
                  </VerticalField>
                </div>

                <div
                  style={{
                    padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-inline-gap)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      4대보험 가입여부
                    </span>
                    <div style={{ display: 'flex', gap: 'var(--space-tight-gap)' }}>
                      <button
                        type="button"
                        onClick={() => onPatchForm({ insPension: true, insHealth: true, insEmployment: true, insAccident: true })}
                        style={actionBtnStyle('secondary', true)}
                      >
                        전체 선택
                      </button>
                      <button
                        type="button"
                        onClick={() => onPatchForm({ insPension: false, insHealth: false, insEmployment: false, insAccident: false })}
                        style={actionBtnStyle('secondary', true)}
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-inline-gap)' }}>
                    {INSURANCE_FIELDS.map(({ key, label }) => (
                      <label
                        key={key}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                      >
                        <input type="checkbox" checked={form[key]} onChange={(e) => onPatchForm({ [key]: e.target.checked })} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 'var(--space-field-grid-gap)' }}>
                  <VerticalField label="적용일">
                    <input type="date" value={form.effectiveDate} onChange={(e) => onPatchForm({ effectiveDate: e.target.value })} style={controlInputStyle} />
                  </VerticalField>
                  <VerticalField label="변경 사유">
                    <input type="text" value={form.reason} onChange={(e) => onPatchForm({ reason: e.target.value })} placeholder="급여 조정, 통상임금, 계좌 또는 4대보험 변경 사유" style={controlInputStyle} />
                  </VerticalField>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
                  <button type="submit" disabled={busy} style={actionBtnStyle('primary')}>
                    {busy ? '저장 중' : '급여 · 계좌 저장'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ padding: 'calc(24px - 2pt)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                급여 및 계좌 정보는 6단계 본부장급 이상 또는 최고 관리자만 조회 및 수정할 수 있습니다.
              </div>
            )
          )}

          {detailTab === 'PW' && (
            canResetPassword ? (
              <form onSubmit={onResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
                  <VerticalField label="새 임시 비밀번호" required>
                    <input type="password" value={resetPw1} onChange={(e) => onChangeResetPw1(e.target.value)} placeholder="4자 이상 입력" style={controlInputStyle} />
                  </VerticalField>
                  <VerticalField label="새 임시 비밀번호 확인" required>
                    <input type="password" value={resetPw2} onChange={(e) => onChangeResetPw2(e.target.value)} placeholder="비밀번호 재입력" style={controlInputStyle} />
                  </VerticalField>
                </div>
                <VerticalField label="초기화 사유">
                  <input type="text" value={resetPwReason} onChange={(e) => onChangeResetPwReason(e.target.value)} style={controlInputStyle} />
                </VerticalField>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
                  <button type="submit" disabled={busy} style={actionBtnStyle('danger')}>
                    {busy ? '처리 중' : '비밀번호 초기화 실행'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ padding: 'calc(24px - 2pt)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                비밀번호 초기화는 4단계 부서장급 이상 권한이 필요합니다.
              </div>
            )
          )}

          {detailTab === 'LOG' && (
            <DataGrid
              columns={historyColumns.filter((c) => c.key !== 'userName')}
              rows={selectedUserHistories}
              rowKey={(h) => h.id}
              maxHeight="clamp(280px, calc(100vh - 340px), 700px)"
            />
          )}
        </div>
      )}
    </ModalDialog>
  );
};
