import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import {
  adminResetUserPassword,
  createEmployeeUser,
  saveDepartment,
  updateEmployeeHrRecord,
} from '../../services/domainHrAdminEngine';
import {
  TIER_LABELS,
  getDepartmentFuncTagsForTenant,
  type EmploymentStatus,
  type FlDepartment,
  type FlHrHistory,
  type FlUser,
} from '../../types/domain';
import {
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
  PAYROLL_BANK_OPTIONS,
  buildDeptTreeOrder,
  buildEmployeeHrPatch,
  collectDescendantDeptIds,
  createEmployeeDetailForm,
  createInitialDeptForm,
  createInitialNewEmployeeForm,
  exportEmployeesToExcel,
  formatLeaveRemain,
  statusBadgeTone,
  statusLabel,
  type DeptFormState,
  type EmployeeDetailFormState,
  type NewEmployeeFormState,
} from './hrHelpers';
import { HrDepartmentModal, HrNewEmployeeModal } from './HrNewAndDeptModals';
import { HrEmployeeDetailModal } from './HrEmployeeDetailModal';
import { HrDepartmentOrgPanel, HrDepartmentTreePanel } from './HrDepartmentTreePanel';

export const OrganizationHrPage: React.FC = () => {
  const { currentUser, isRentalEnabled, datasets, refreshAll, notifyToast, canEditPage, formatMoney } =
    useAppShell();
  const visibleDeptFuncTags = useMemo(
    () => getDepartmentFuncTagsForTenant(isRentalEnabled),
    [isRentalEnabled]
  );
  const canEdit = canEditPage('organization_hr');
  const canViewPayroll = Boolean(currentUser && (currentUser.tierLevel >= 6 || currentUser.loginId === 'admin'));
  const canResetPassword = Boolean(currentUser && (currentUser.tierLevel >= 4 || currentUser.loginId === 'admin'));

  const [tab, setTab] = useState<'USERS' | 'DEPTS' | 'HISTORY'>('USERS');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | EmploymentStatus>('ALL');
  const [keyword, setKeyword] = useState('');
  const [histEventFilter, setHistEventFilter] = useState<string>('ALL');
  const [histKeyword, setHistKeyword] = useState('');
  const [busy, setBusy] = useState(false);

  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState<NewEmployeeFormState>(() =>
    createInitialNewEmployeeForm([], 'ALL')
  );

  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editDeptId, setEditDeptId] = useState<string | null>(null);
  const [deptForm, setDeptForm] = useState<DeptFormState>(() => createInitialDeptForm([], 'ALL'));

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'HR' | 'PAYROLL' | 'PW' | 'LOG'>('HR');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detailForm, setDetailForm] = useState<EmployeeDetailFormState>(() =>
    createEmployeeDetailForm({
      id: '',
      tenantId: '',
      loginId: '',
      passwordHash: '',
      name: '',
      tierLevel: 1,
      maskSalesPrice: false,
      baseSalaryKrw: 0,
      annualLeaveGrant: 15,
      annualLeaveUsed: 0,
      mustChangePassword: false,
      hourlyWageKrw: 0,
      mealAllowanceKrw: 0,
      vehicleAllowanceKrw: 0,
      serviceContractKrw: 0,
      insNationalPension: true,
      insHealthInsurance: true,
      insEmploymentInsurance: true,
      insIndustrialAccident: true,
      status: 'ACTIVE',
      isActive: true,
    })
  );

  const [resetPw1, setResetPw1] = useState('');
  const [resetPw2, setResetPw2] = useState('');
  const [resetPwReason, setResetPwReason] = useState('임시 비밀번호 재발급');

  const deptTree = useMemo(() => buildDeptTreeOrder(datasets.departments), [datasets.departments]);
  const blockedParentDeptIds = useMemo(
    () => (editDeptId ? collectDescendantDeptIds(editDeptId, datasets.departments) : new Set<string>()),
    [editDeptId, datasets.departments]
  );
  const deptNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    datasets.departments.forEach((d) => {
      m[d.id] = d.name;
    });
    return m;
  }, [datasets.departments]);

  const userNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    datasets.users.forEach((u) => {
      m[u.id] = u.name;
    });
    return m;
  }, [datasets.users]);

  const deptHeadcountMap = useMemo(() => {
    const m = new Map<string, number>();
    let unassigned = 0;
    for (const u of datasets.users) {
      if (u.status === 'RETIRED') continue;
      if (!u.departmentId) {
        unassigned++;
      } else {
        m.set(u.departmentId, (m.get(u.departmentId) || 0) + 1);
      }
    }
    m.set('UNASSIGNED', unassigned);
    return m;
  }, [datasets.users]);

  const filteredUsers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const deptScope =
      selectedDeptId !== 'ALL' && selectedDeptId !== 'UNASSIGNED'
        ? collectDescendantDeptIds(selectedDeptId, datasets.departments)
        : null;

    return datasets.users.filter((u) => {
      if (selectedDeptId === 'UNASSIGNED' && u.departmentId) return false;
      if (deptScope && (!u.departmentId || !deptScope.has(u.departmentId))) return false;
      if (statusFilter !== 'ALL' && u.status !== statusFilter) return false;
      if (!kw) return true;
      return (
        u.name.toLowerCase().includes(kw) ||
        u.loginId.toLowerCase().includes(kw) ||
        (u.employeeNo || '').toLowerCase().includes(kw) ||
        (u.position || '').toLowerCase().includes(kw) ||
        (u.departmentName || '').toLowerCase().includes(kw) ||
        (u.phone || '').toLowerCase().includes(kw)
      );
    });
  }, [datasets.departments, datasets.users, keyword, selectedDeptId, statusFilter]);

  const selectedUser = useMemo(
    () => datasets.users.find((u) => u.id === selectedUserId) || null,
    [datasets.users, selectedUserId]
  );

  const selectedUserHistories = useMemo(
    () => datasets.hrHistories.filter((h) => h.userId === selectedUserId),
    [datasets.hrHistories, selectedUserId]
  );

  const filteredAllHistories = useMemo(() => {
    const kw = histKeyword.trim().toLowerCase();
    return datasets.hrHistories.filter((h) => {
      if (histEventFilter !== 'ALL' && h.eventType !== histEventFilter) return false;
      if (!kw) return true;
      const uName = userNameMap[h.userId] || '';
      return (
        uName.toLowerCase().includes(kw) ||
        (h.eventType || '').toLowerCase().includes(kw) ||
        (h.prevSummary || '').toLowerCase().includes(kw) ||
        (h.nextSummary || '').toLowerCase().includes(kw) ||
        (h.reason || '').toLowerCase().includes(kw)
      );
    });
  }, [datasets.hrHistories, histEventFilter, histKeyword, userNameMap]);

  const allEventTypes = useMemo(() => {
    const s = new Set<string>();
    datasets.hrHistories.forEach((h) => s.add(h.eventType));
    return Array.from(s);
  }, [datasets.hrHistories]);

  const patchNewUserForm = (patch: Partial<NewEmployeeFormState>) =>
    setNewUserForm((prev) => ({ ...prev, ...patch }));

  const patchDeptForm = (patch: Partial<DeptFormState>) =>
    setDeptForm((prev) => ({ ...prev, ...patch }));

  const patchDetailForm = (patch: Partial<EmployeeDetailFormState>) =>
    setDetailForm((prev) => ({ ...prev, ...patch }));

  const openNewUserModal = () => {
    setNewUserForm(createInitialNewEmployeeForm(datasets.users, selectedDeptId));
    setNewUserModalOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusy(true);
    try {
      if (datasets.users.some((u) => u.loginId === newUserForm.loginId.trim())) {
        throw new Error('이미 사용 중인 로그인 아이디입니다.');
      }
      await createEmployeeUser({
        loginId: newUserForm.loginId,
        initialPassword: newUserForm.password,
        name: newUserForm.name,
        employeeNo: newUserForm.empNo,
        departmentId: newUserForm.deptId || null,
        position: newUserForm.position,
        duty: newUserForm.duty,
        tierLevel: newUserForm.tier,
        maskSalesPrice: newUserForm.maskPrice,
        joinDate: newUserForm.joinDate,
        phone: newUserForm.phone,
        email: newUserForm.email,
        birthDate: newUserForm.birthDate,
        residentRegNo: canResetPassword ? newUserForm.residentRegNo : '',
        address: newUserForm.address,
        emergencyContact: newUserForm.emergency,
        annualLeaveGrant: Number(newUserForm.leaveGrant || 15),
        annualLeaveUsed: 0,
        pledgeDate: newUserForm.pledgeDate,
        mustChangePassword: newUserForm.mustChangePw,
        baseSalaryKrw: canViewPayroll ? Number(newUserForm.salary || 0) : 0,
        // 통상임금은 자동계산하지 않고 수동 입력값만 전달한다.
        hourlyWageKrw: canViewPayroll ? Number(newUserForm.hourlyWage || 0) : 0,
        mealAllowanceKrw: canViewPayroll ? Number(newUserForm.mealAllowance || 0) : 0,
        vehicleAllowanceKrw: canViewPayroll ? Number(newUserForm.vehicleAllowance || 0) : 0,
        serviceContractKrw: canViewPayroll ? Number(newUserForm.serviceContract || 0) : 0,
        payrollBankName: canViewPayroll ? newUserForm.bank : '',
        payrollAccountHolder: canViewPayroll ? newUserForm.accountHolder || newUserForm.name : '',
        payrollAccountNo: canViewPayroll ? newUserForm.account : '',
        insNationalPension: newUserForm.insPension,
        insHealthInsurance: newUserForm.insHealth,
        insEmploymentInsurance: newUserForm.insEmployment,
        insIndustrialAccident: newUserForm.insAccident,
        actor: { id: currentUser.id, name: currentUser.name },
      });
      await refreshAll();
      notifyToast(`${newUserForm.name.trim()} 신규 입사 등록 완료`, 'success');
      setNewUserModalOpen(false);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '임직원 등록 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openDeptModal = (dept?: FlDepartment) => {
    setEditDeptId(dept ? dept.id : null);
    setDeptForm(createInitialDeptForm(datasets.departments, selectedDeptId, dept));
    setDeptModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveDepartment({
        id: editDeptId || undefined,
        name: deptForm.name,
        parentDepartmentId: deptForm.parentId || null,
        managerId: deptForm.managerId || null,
        functionalTags: deptForm.tags,
        sortOrder: Number(deptForm.sortOrder || 100),
        memo: deptForm.memo,
        isActive: deptForm.active,
      });
      await refreshAll();
      notifyToast(`${deptForm.name.trim()} 부서 저장 완료`, 'success');
      setDeptModalOpen(false);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '부서 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openUserDetailModal = (u: FlUser) => {
    setSelectedUserId(u.id);
    setDetailTab('HR');
    setDetailForm(createEmployeeDetailForm(u));
    setResetPw1('');
    setResetPw2('');
    setResetPwReason('임시 비밀번호 재발급');
    setDetailModalOpen(true);
  };

  const handleSaveBasicHr = async () => {
    if (!selectedUser || !currentUser) return;
    setBusy(true);
    try {
      await updateEmployeeHrRecord({
        prevUser: selectedUser,
        patch: buildEmployeeHrPatch(selectedUser, detailForm, canResetPassword),
        deptNameMap,
        effectiveDate: detailForm.effectiveDate,
        reason: detailForm.reason || '기본 인사정보 수정',
        actor: { id: currentUser.id, name: currentUser.name },
      });
      await refreshAll();
      notifyToast('임직원 기본 정보 저장 완료', 'success');
      setDetailModalOpen(false);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '인사정보 수정 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExecuteAppointment = async () => {
    if (!selectedUser || !currentUser) return;
    await updateEmployeeHrRecord({
      prevUser: selectedUser,
      patch: buildEmployeeHrPatch(selectedUser, detailForm, canResetPassword),
      deptNameMap,
      effectiveDate: detailForm.effectiveDate,
      reason: detailForm.reason || '조직·직책·티어·재직상태 인사 발령',
      actor: { id: currentUser.id, name: currentUser.name },
    });
    await refreshAll();
    notifyToast(`${selectedUser.name} 인사 발령 완료`, 'success');
    setDetailModalOpen(false);
  };

  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !currentUser || !canViewPayroll) return;
    setBusy(true);
    try {
      await updateEmployeeHrRecord({
        prevUser: selectedUser,
        patch: {
          baseSalaryKrw: Number(detailForm.salary || 0),
          // 통상임금은 자동계산하지 않고 담당자 수동 입력값 그대로 저장한다.
          hourlyWageKrw: Number(detailForm.hourlyWage || 0),
          mealAllowanceKrw: Number(detailForm.mealAllowance || 0),
          vehicleAllowanceKrw: Number(detailForm.vehicleAllowance || 0),
          serviceContractKrw: Number(detailForm.serviceContract || 0),
          payrollBankName: detailForm.bank.trim() || null,
          payrollAccountHolder: detailForm.accountHolder.trim() || null,
          payrollAccountNo: detailForm.account.trim() || null,
          insNationalPension: detailForm.insPension,
          insHealthInsurance: detailForm.insHealth,
          insEmploymentInsurance: detailForm.insEmployment,
          insIndustrialAccident: detailForm.insAccident,
        },
        deptNameMap,
        effectiveDate: detailForm.effectiveDate,
        reason: detailForm.reason || '급여 · 통상임금 · 4대보험 · 계좌 변경',
        actor: { id: currentUser.id, name: currentUser.name },
      });
      await refreshAll();
      notifyToast('급여 · 계좌 정보 저장 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '급여 정보 저장 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !currentUser || !canResetPassword) return;
    if (resetPw1 !== resetPw2) {
      notifyToast('새 임시 비밀번호와 확인 입력이 일치하지 않습니다.', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminResetUserPassword({
        targetUser: selectedUser,
        newPassword: resetPw1,
        actor: { id: currentUser.id, name: currentUser.name },
        reason: resetPwReason,
      });
      await refreshAll();
      setResetPw1('');
      setResetPw2('');
      notifyToast(`${selectedUser.name} 비밀번호 초기화 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '비밀번호 초기화 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleExportExcel = async () => {
    setBusy(true);
    try {
      const count = await exportEmployeesToExcel({ users: filteredUsers, canViewPayroll });
      notifyToast(`임직원 ${count}명 엑셀 내보내기 완료`, 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '엑셀 내보내기 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const userColumns: GridColumn<FlUser>[] = [
    {
      key: 'action',
      header: '관리',
      width: 74,
      align: 'center',
      stickyLeft: true,
      render: (u) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openUserDetailModal(u);
          }}
          style={actionBtnStyle('secondary', true)}
        >
          상세
        </button>
      ),
    },
    { key: 'employeeNo', header: '사번', width: 96, render: (u) => u.employeeNo || '-' },
    { key: 'loginId', header: '아이디', width: 105, render: (u) => u.loginId },
    {
      key: 'name',
      header: '성명',
      width: 120,
      render: (u) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'calc(7px - 2pt)' }}>
          {u.profileImageUrl ? (
            <img
              src={u.profileImageUrl}
              alt={u.name}
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid var(--border-color)',
                flexShrink: 0,
              }}
            />
          ) : (
            <span
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {u.name.slice(0, 1)}
            </span>
          )}
          <span style={{ fontWeight: 700 }}>{u.name}</span>
        </div>
      ),
    },
    {
      key: 'departmentName',
      header: '소속 부서',
      width: 112,
      render: (u) => u.departmentName || '미배정',
    },
    { key: 'position', header: '직책', width: 82, render: (u) => u.position || '-' },
    { key: 'duty', header: '담당 직무', width: 116, render: (u) => u.duty || '-' },
    {
      key: 'tier',
      header: '직급 티어',
      width: 140,
      render: (u) => <StatusBadge label={TIER_LABELS[u.tierLevel]} tone={u.tierLevel >= 5 ? 'primary' : 'neutral'} />,
    },
    {
      key: 'annualLeave',
      header: '연차 잔여/부여',
      width: 110,
      align: 'right',
      render: (u) => {
        const rem = formatLeaveRemain(u.annualLeaveGrant, u.annualLeaveUsed);
        const grant = Number(u.annualLeaveGrant ?? 15);
        return `${rem.toFixed(1)} / ${grant.toFixed(1)}일`;
      },
    },
    ...(canViewPayroll
      ? [
          {
            key: 'baseSalary',
            header: '월 기본급',
            width: 112,
            align: 'right' as const,
            render: (u: FlUser) => formatMoney(Number(u.baseSalaryKrw || 0)),
          },
          {
            key: 'hourlyWage',
            header: '통상임금',
            width: 102,
            align: 'right' as const,
            render: (u: FlUser) =>
              Number(u.hourlyWageKrw || 0) > 0 ? formatMoney(Number(u.hourlyWageKrw)) : '미입력',
          },
        ]
      : []),
    {
      key: 'pledge',
      header: '보안서약',
      width: 78,
      align: 'center',
      render: (u) => (
        <StatusBadge
          label={u.pledgeDate || u.pledgeScanUrl ? '제출' : '미제출'}
          tone={u.pledgeDate || u.pledgeScanUrl ? 'success' : 'neutral'}
        />
      ),
    },
    { key: 'joinDate', header: '입사일', width: 100, render: (u) => u.joinDate || '-' },
    {
      key: 'status',
      header: '재직 상태',
      width: 82,
      align: 'center',
      render: (u) => <StatusBadge label={statusLabel(u.status)} tone={statusBadgeTone(u.status)} />,
    },
    { key: 'phone', header: '연락처', width: 118, render: (u) => u.phone || '-' },
  ];

  const historyColumns: GridColumn<FlHrHistory>[] = [
    { key: 'effectiveDate', header: '시행일', width: 102, render: (h) => h.effectiveDate },
    {
      key: 'userName',
      header: '대상자',
      width: 100,
      render: (h) => <span style={{ fontWeight: 700 }}>{userNameMap[h.userId] || h.userId}</span>,
    },
    {
      key: 'eventType',
      header: '발령 구분',
      width: 108,
      render: (h) => <StatusBadge label={h.eventType} tone={h.eventType === '퇴사처리' ? 'danger' : 'primary'} />,
    },
    { key: 'prevSummary', header: '변경 전', width: 170, render: (h) => h.prevSummary || '-' },
    { key: 'nextSummary', header: '변경 후', width: 210, render: (h) => h.nextSummary || '-' },
    { key: 'reason', header: '사유', width: 200, render: (h) => h.reason || '-' },
    { key: 'actorName', header: '처리자', width: 95, render: (h) => h.actorName || '-' },
    {
      key: 'createdAt',
      header: '기록일시',
      width: 145,
      render: (h) => (h.createdAt ? h.createdAt.slice(0, 16).replace('T', ' ') : '-'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
      <SectionPanel
        title="조직 인사 관리"
        manualId="hr-tabs"
        rightSlot={
          <SegmentedTabs
            tabs={[
              { id: 'USERS', label: '임직원 인사원장', count: datasets.users.length },
              { id: 'DEPTS', label: '부서 조직도', count: datasets.departments.length },
              { id: 'HISTORY', label: '인사 발령 이력', count: datasets.hrHistories.length },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as typeof tab)}
          />
        }
      >
        {tab === 'USERS' && (
          <HrDepartmentTreePanel
            departments={datasets.departments}
            deptTree={deptTree}
            users={datasets.users}
            deptHeadcountMap={deptHeadcountMap}
            selectedDeptId={selectedDeptId}
            statusFilter={statusFilter}
            keyword={keyword}
            filteredCount={filteredUsers.length}
            busy={busy}
            canEdit={canEdit}
            onSelectDept={setSelectedDeptId}
            onChangeStatusFilter={setStatusFilter}
            onChangeKeyword={setKeyword}
            onExportExcel={handleExportExcel}
            onOpenDeptModal={() => openDeptModal()}
            onOpenNewUserModal={openNewUserModal}
          >
            <DataGrid
              manualId="hr-grid"
              columns={userColumns}
              rows={filteredUsers}
              rowKey={(u) => u.id}
              onRowClick={openUserDetailModal}
              selectedRowId={selectedUserId}
              maxHeight="clamp(320px, calc(100vh - 260px), 780px)"
            />
          </HrDepartmentTreePanel>
        )}

        {tab === 'DEPTS' && (
          <HrDepartmentOrgPanel
            departments={datasets.departments}
            deptTree={deptTree}
            deptHeadcountMap={deptHeadcountMap}
            deptNameMap={deptNameMap}
            userNameMap={userNameMap}
            visibleDeptFuncTags={visibleDeptFuncTags}
            canEdit={canEdit}
            onOpenDeptModal={openDeptModal}
          />
        )}

        {tab === 'HISTORY' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
              <VerticalField label="발령 구분" width={160}>
                <select
                  value={histEventFilter}
                  onChange={(e) => setHistEventFilter(e.target.value)}
                  style={controlInputStyle}
                >
                  <option value="ALL">전체 구분</option>
                  {allEventTypes.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </VerticalField>
              <VerticalField label="이력 검색" width={260}>
                <input
                  type="text"
                  value={histKeyword}
                  onChange={(e) => setHistKeyword(e.target.value)}
                  placeholder="성명, 변경 내용, 사유 검색"
                  style={controlInputStyle}
                />
              </VerticalField>
            </div>
            <DataGrid
              columns={historyColumns}
              rows={filteredAllHistories}
              rowKey={(h) => h.id}
              maxHeight="clamp(320px, calc(100vh - 260px), 780px)"
            />
          </div>
        )}
      </SectionPanel>

      <HrNewEmployeeModal
        open={newUserModalOpen}
        busy={busy}
        canResetPassword={canResetPassword}
        canViewPayroll={canViewPayroll}
        deptTree={deptTree}
        form={newUserForm}
        onPatchForm={patchNewUserForm}
        onClose={() => setNewUserModalOpen(false)}
        onSubmit={handleCreateEmployee}
      />

      <HrDepartmentModal
        open={deptModalOpen}
        busy={busy}
        editDeptId={editDeptId}
        deptTree={deptTree}
        blockedParentDeptIds={blockedParentDeptIds}
        users={datasets.users}
        visibleDeptFuncTags={visibleDeptFuncTags}
        form={deptForm}
        onPatchForm={patchDeptForm}
        onClose={() => setDeptModalOpen(false)}
        onSubmit={handleSaveDepartment}
      />

      <HrEmployeeDetailModal
        open={detailModalOpen}
        busy={busy}
        detailTab={detailTab}
        selectedUser={selectedUser}
        canEdit={canEdit}
        canViewPayroll={canViewPayroll}
        canResetPassword={canResetPassword}
        deptTree={deptTree}
        form={detailForm}
        resetPw1={resetPw1}
        resetPw2={resetPw2}
        resetPwReason={resetPwReason}
        selectedUserHistories={selectedUserHistories}
        historyColumns={historyColumns}
        formatMoney={formatMoney}
        notifyToast={notifyToast}
        onClose={() => setDetailModalOpen(false)}
        onChangeTab={setDetailTab}
        onPatchForm={patchDetailForm}
        onChangeResetPw1={setResetPw1}
        onChangeResetPw2={setResetPw2}
        onChangeResetPwReason={setResetPwReason}
        onSaveBasicHr={handleSaveBasicHr}
        onExecuteAppointment={handleExecuteAppointment}
        onSavePayroll={handleSavePayroll}
        onResetPassword={handleAdminResetPassword}
      />

      <datalist id="fl-payroll-banks">
        {PAYROLL_BANK_OPTIONS.map((bank) => (
          <option key={bank} value={bank} />
        ))}
      </datalist>
    </div>
  );
};
