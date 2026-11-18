import React from 'react';
import {
  CommaNumberInput,
  ModalDialog,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import { TIER_LABELS, type FlUser, type TierLevel } from '../../types/domain';
import {
  INSURANCE_FIELDS,
  type DeptFormState,
  type DeptNode,
  type NewEmployeeFormState,
} from './hrHelpers';

export interface HrNewEmployeeModalProps {
  open: boolean;
  busy: boolean;
  canResetPassword: boolean;
  canViewPayroll: boolean;
  deptTree: DeptNode[];
  form: NewEmployeeFormState;
  onPatchForm: (patch: Partial<NewEmployeeFormState>) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const HrNewEmployeeModal: React.FC<HrNewEmployeeModalProps> = ({
  open,
  busy,
  canResetPassword,
  canViewPayroll,
  deptTree,
  form,
  onPatchForm,
  onClose,
  onSubmit,
}) => (
  <ModalDialog open={open} title="신규 입사 임직원 등록" width={760} onClose={onClose}>
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
        <VerticalField label="로그인 아이디" required>
          <input
            type="text"
            value={form.loginId}
            onChange={(e) => onPatchForm({ loginId: e.target.value })}
            placeholder="로그인 아이디"
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="초기 비밀번호" required>
          <input
            type="password"
            value={form.password}
            onChange={(e) => onPatchForm({ password: e.target.value })}
            placeholder="4자 이상"
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="사번" required>
          <input
            type="text"
            value={form.empNo}
            onChange={(e) => onPatchForm({ empNo: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
        <VerticalField label="성명" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onPatchForm({ name: e.target.value })}
            placeholder="임직원 성명"
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="소속 부서">
          <select
            value={form.deptId}
            onChange={(e) => onPatchForm({ deptId: e.target.value })}
            style={controlInputStyle}
          >
            <option value="">미배정</option>
            {deptTree.map(({ dept, depth }) => (
              <option key={dept.id} value={dept.id}>
                {'  '.repeat(depth)}
                {dept.name}
              </option>
            ))}
          </select>
        </VerticalField>
        <VerticalField label="직책">
          <input
            type="text"
            value={form.position}
            onChange={(e) => onPatchForm({ position: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
        <VerticalField label="직급 티어" required>
          <select
            value={form.tier}
            onChange={(e) => onPatchForm({ tier: Number(e.target.value) as TierLevel })}
            style={controlInputStyle}
          >
            {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </VerticalField>
        <VerticalField label="담당 직무">
          <input
            type="text"
            value={form.duty}
            onChange={(e) => onPatchForm({ duty: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="입사일" required>
          <input
            type="date"
            value={form.joinDate}
            onChange={(e) => onPatchForm({ joinDate: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
        <VerticalField label="연락처">
          <input
            type="text"
            value={form.phone}
            onChange={(e) => onPatchForm({ phone: e.target.value })}
            placeholder="010-0000-0000"
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="이메일">
          <input
            type="email"
            value={form.email}
            onChange={(e) => onPatchForm({ email: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="생년월일">
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => onPatchForm({ birthDate: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
        {canResetPassword ? (
          <VerticalField label="주민등록번호">
            <input
              type="text"
              value={form.residentRegNo}
              onChange={(e) => onPatchForm({ residentRegNo: e.target.value })}
              placeholder="000000-0000000"
              style={controlInputStyle}
            />
          </VerticalField>
        ) : (
          <VerticalField label="비상연락처">
            <input
              type="text"
              value={form.emergency}
              onChange={(e) => onPatchForm({ emergency: e.target.value })}
              style={controlInputStyle}
            />
          </VerticalField>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: canResetPassword ? '2fr 1fr' : '1fr', gap: 'var(--space-field-grid-gap)' }}>
        <VerticalField label="주소">
          <input
            type="text"
            value={form.address}
            onChange={(e) => onPatchForm({ address: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
        {canResetPassword && (
          <VerticalField label="비상연락처">
            <input
              type="text"
              value={form.emergency}
              onChange={(e) => onPatchForm({ emergency: e.target.value })}
              style={controlInputStyle}
            />
          </VerticalField>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
        <VerticalField label="부여 연차일수">
          <input
            type="number"
            step="0.5"
            min={0}
            value={form.leaveGrant}
            onChange={(e) => onPatchForm({ leaveGrant: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="보안서약일">
          <input
            type="date"
            value={form.pledgeDate}
            onChange={(e) => onPatchForm({ pledgeDate: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
      </div>

      {canViewPayroll && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-field-grid-gap)',
            padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            초기 급여 · 수동 통상임금 · 4대보험 · 계좌
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="월 기본급">
              <CommaNumberInput
                min={0}
                value={Number(form.salary || 0)}
                onChange={(v) => onPatchForm({ salary: String(v) })}
              />
            </VerticalField>
            <VerticalField label="통상임금 · 수동 입력">
              <CommaNumberInput
                min={0}
                value={Number(form.hourlyWage || 0)}
                onChange={(v) => onPatchForm({ hourlyWage: v > 0 ? String(v) : '' })}
                placeholder="직접 입력"
              />
            </VerticalField>
            <VerticalField label="용역계약금액">
              <CommaNumberInput
                min={0}
                value={Number(form.serviceContract || 0)}
                onChange={(v) => onPatchForm({ serviceContract: String(v) })}
              />
            </VerticalField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="식대">
              <CommaNumberInput
                min={0}
                value={Number(form.mealAllowance || 0)}
                onChange={(v) => onPatchForm({ mealAllowance: String(v) })}
              />
            </VerticalField>
            <VerticalField label="차량보조금">
              <CommaNumberInput
                min={0}
                value={Number(form.vehicleAllowance || 0)}
                onChange={(v) => onPatchForm({ vehicleAllowance: String(v) })}
              />
            </VerticalField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="급여 은행명">
              <input
                type="text"
                list="fl-payroll-banks"
                value={form.bank}
                onChange={(e) => onPatchForm({ bank: e.target.value })}
                placeholder="선택 또는 직접 입력"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="예금주">
              <input
                type="text"
                value={form.accountHolder}
                onChange={(e) => onPatchForm({ accountHolder: e.target.value })}
                placeholder="미입력 시 성명 동일"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="급여 계좌번호">
              <input
                type="text"
                value={form.account}
                onChange={(e) => onPatchForm({ account: e.target.value })}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-page-gap)', paddingTop: '1px' }}>
            {INSURANCE_FIELDS.map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'max(2px, calc(5px - 2pt))',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => onPatchForm({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-conservation-gap)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={form.maskPrice}
            onChange={(e) => onPatchForm({ maskPrice: e.target.checked })}
          />
          판매 단가 비공개 대상 지정
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={form.mustChangePw}
            onChange={(e) => onPatchForm({ mustChangePw: e.target.checked })}
          />
          최초 로그인 비밀번호 변경 권장
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)', marginTop: 'var(--space-label-gap)' }}>
        <button type="button" onClick={onClose} style={actionBtnStyle('secondary')}>
          취소
        </button>
        <button type="submit" disabled={busy} style={actionBtnStyle('primary')}>
          {busy ? '등록 중' : '입사 등록 확정'}
        </button>
      </div>
    </form>
  </ModalDialog>
);

export interface HrDepartmentModalProps {
  open: boolean;
  busy: boolean;
  editDeptId: string | null;
  deptTree: DeptNode[];
  blockedParentDeptIds: Set<string>;
  users: FlUser[];
  visibleDeptFuncTags: string[];
  form: DeptFormState;
  onPatchForm: (patch: Partial<DeptFormState>) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const HrDepartmentModal: React.FC<HrDepartmentModalProps> = ({
  open,
  busy,
  editDeptId,
  deptTree,
  blockedParentDeptIds,
  users,
  visibleDeptFuncTags,
  form,
  onPatchForm,
  onClose,
  onSubmit,
}) => (
  <ModalDialog
    open={open}
    title={editDeptId ? '부서 정보 수정' : '신규 부서 등록'}
    width={580}
    onClose={onClose}
  >
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-field-grid-gap)' }}>
        <VerticalField label="부서명" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onPatchForm({ name: e.target.value })}
            placeholder="부서명 입력"
            style={controlInputStyle}
          />
        </VerticalField>
        <VerticalField label="상위 부서">
          <select
            value={form.parentId}
            onChange={(e) => onPatchForm({ parentId: e.target.value })}
            style={controlInputStyle}
          >
            <option value="">최상위 조직</option>
            {deptTree
              .filter(({ dept }) => !blockedParentDeptIds.has(dept.id))
              .map(({ dept, depth }) => (
                <option key={dept.id} value={dept.id}>
                  {'  '.repeat(depth)}
                  {dept.name}
                </option>
              ))}
          </select>
        </VerticalField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 'var(--space-field-grid-gap)', alignItems: 'end' }}>
        <VerticalField label="부서장 지정">
          <select
            value={form.managerId}
            onChange={(e) => onPatchForm({ managerId: e.target.value })}
            style={controlInputStyle}
          >
            <option value="">미지정</option>
            {users
              .filter((u) => u.status === 'ACTIVE')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.position || '-'}
                </option>
              ))}
          </select>
        </VerticalField>
        <VerticalField label="정렬 순서">
          <input
            type="number"
            value={form.sortOrder}
            onChange={(e) => onPatchForm({ sortOrder: e.target.value })}
            style={controlInputStyle}
          />
        </VerticalField>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', height: 'var(--space-control-h)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => onPatchForm({ active: e.target.checked })}
          />
          부서 사용
        </label>
      </div>

      <VerticalField label="담당 업무 기능">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-inline-gap)', paddingTop: 'var(--space-label-gap)' }}>
          {visibleDeptFuncTags.map((tag) => {
            const checked = form.tags.includes(tag);
            return (
              <label
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'max(2px, calc(5px - 2pt))',
                  padding: 'max(1px, calc(4px - 2pt)) var(--space-compact-pad-x)',
                  borderRadius: '4px',
                  border: `1px solid ${checked ? 'var(--primary)' : 'var(--border-color)'}`,
                  backgroundColor: checked ? 'var(--primary-light)' : 'var(--bg-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    onPatchForm({
                      tags: e.target.checked ? [...form.tags, tag] : form.tags.filter((x) => x !== tag),
                    })
                  }
                />
                {tag}
              </label>
            );
          })}
        </div>
      </VerticalField>

      <VerticalField label="부서 비고">
        <input
          type="text"
          value={form.memo}
          onChange={(e) => onPatchForm({ memo: e.target.value })}
          style={controlInputStyle}
        />
      </VerticalField>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-inline-gap)' }}>
        <button type="button" onClick={onClose} style={actionBtnStyle('secondary')}>
          취소
        </button>
        <button type="submit" disabled={busy} style={actionBtnStyle('primary')}>
          {busy ? '저장 중' : '부서 저장'}
        </button>
      </div>
    </form>
  </ModalDialog>
);
