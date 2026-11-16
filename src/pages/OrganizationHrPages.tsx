import React, { useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import {
  Building2,
  Download,
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { CommitActionButton } from '../core/ActionCommandGateway';
import { useAppShell } from '../core/AppShellContext';
import { downloadExcelFile } from '../services/documentService';
import {
  adminResetUserPassword,
  createEmployeeUser,
  saveDepartment,
  updateEmployeeHrRecord,
} from '../services/domainEngine';
import {
  ALL_DEPARTMENT_FUNC_TAGS,
  EMPLOYMENT_STATUS_LABELS,
  TIER_LABELS,
  type EmploymentStatus,
  type FlDepartment,
  type FlHrHistory,
  type FlUser,
  type TierLevel,
} from '../types/domain';
import {
  CommaNumberInput,
  ConservationBar,
  DataGrid,
  ModalDialog,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
  type BadgeTone,
  type GridColumn,
} from '../components/UiPrimitives';

interface DeptNode {
  dept: FlDepartment;
  depth: number;
}

function buildDeptTreeOrder(depts: FlDepartment[]): DeptNode[] {
  const byParent = new Map<string, FlDepartment[]>();
  const idSet = new Set(depts.map((d) => d.id));
  for (const d of depts) {
    const pKey = d.parentDepartmentId && idSet.has(d.parentDepartmentId) ? d.parentDepartmentId : '__ROOT__';
    const arr = byParent.get(pKey) || [];
    arr.push(d);
    byParent.set(pKey, arr);
  }
  const sortFn = (a: FlDepartment, b: FlDepartment) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  byParent.forEach((arr) => arr.sort(sortFn));

  const out: DeptNode[] = [];
  const visited = new Set<string>();
  const walk = (parentKey: string, depth: number) => {
    const children = byParent.get(parentKey) || [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      out.push({ dept: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk('__ROOT__', 0);
  for (const d of depts) {
    if (!visited.has(d.id)) {
      out.push({ dept: d, depth: 0 });
    }
  }
  return out;
}

function collectDescendantDeptIds(rootId: string, depts: FlDepartment[]): Set<string> {
  const set = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const d of depts) {
      if (d.parentDepartmentId && set.has(d.parentDepartmentId) && !set.has(d.id)) {
        set.add(d.id);
        added = true;
      }
    }
  }
  return set;
}

function statusBadgeTone(status: string): BadgeTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'LEAVE_OF_ABSENCE') return 'warning';
  if (status === 'RETIRED') return 'danger';
  return 'neutral';
}

function statusLabel(status: string): string {
  return EMPLOYMENT_STATUS_LABELS[status as EmploymentStatus] || status;
}

const PAYROLL_BANK_OPTIONS = [
  '국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  '기업은행',
  '농협은행',
  '산업은행',
  '제일은행',
  '씨티은행',
  '카카오뱅크',
  '케이뱅크',
  '토스뱅크',
  '부산은행',
  '아이엠뱅크',
  '경남은행',
  '광주은행',
  '전북은행',
  '제주은행',
  '수협은행',
  '새마을금고',
  '신협',
  '우체국',
];

function maskResidentRegNo(value?: string | null): string {
  const clean = (value || '').trim();
  if (!clean) return '미등록';
  const digits = clean.replace(/[^0-9]/g, '');
  if (digits.length >= 7) {
    return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  }
  return `${clean.slice(0, Math.min(6, clean.length))}****`;
}

function formatLeaveRemain(grant?: number, used?: number): number {
  const rem = Number(grant ?? 15) - Number(used ?? 0);
  return Math.max(0, Math.round(rem * 10) / 10);
}

async function resizeAvatarImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 등록할 수 있습니다.');
  }
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 180;
      const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('이미지 캔버스 초기화에 실패했습니다.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('이미지 디코딩에 실패했습니다.'));
    img.src = rawDataUrl;
  });
}

async function readScanAttachment(file: File): Promise<{ name: string; dataUrl: string }> {
  if (file.size > 1500 * 1024) {
    throw new Error('서약서 스캔본은 1.5메가바이트 이하 파일만 첨부할 수 있습니다.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('서약서 파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
  return { name: file.name, dataUrl };
}

async function openAttachmentPreview(url: string, fileName?: string | null): Promise<void> {
  if (!url) return;
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const win = window.open(objUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName || '보안서약서';
      a.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const OrganizationHrPage: React.FC = () => {
  const { currentUser, datasets, refreshAll, notifyToast, canEditPage, formatMoney } = useAppShell();
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
  const [nuLoginId, setNuLoginId] = useState('');
  const [nuPassword, setNuPassword] = useState('');
  const [nuName, setNuName] = useState('');
  const [nuEmpNo, setNuEmpNo] = useState('');
  const [nuDeptId, setNuDeptId] = useState('');
  const [nuPosition, setNuPosition] = useState('사원');
  const [nuDuty, setNuDuty] = useState('');
  const [nuTier, setNuTier] = useState<TierLevel>(1);
  const [nuMaskPrice, setNuMaskPrice] = useState(false);
  const [nuJoinDate, setNuJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [nuPhone, setNuPhone] = useState('');
  const [nuEmail, setNuEmail] = useState('');
  const [nuBirthDate, setNuBirthDate] = useState('');
  const [nuResidentRegNo, setNuResidentRegNo] = useState('');
  const [nuAddress, setNuAddress] = useState('');
  const [nuEmergency, setNuEmergency] = useState('');
  const [nuLeaveGrant, setNuLeaveGrant] = useState('15');
  const [nuPledgeDate, setNuPledgeDate] = useState('');
  const [nuMustChangePw, setNuMustChangePw] = useState(true);
  const [nuSalary, setNuSalary] = useState('0');
  const [nuHourlyWage, setNuHourlyWage] = useState('0');
  const [nuMealAllowance, setNuMealAllowance] = useState('0');
  const [nuVehicleAllowance, setNuVehicleAllowance] = useState('0');
  const [nuServiceContract, setNuServiceContract] = useState('0');
  const [nuBank, setNuBank] = useState('');
  const [nuAccountHolder, setNuAccountHolder] = useState('');
  const [nuAccount, setNuAccount] = useState('');
  const [nuInsPension, setNuInsPension] = useState(true);
  const [nuInsHealth, setNuInsHealth] = useState(true);
  const [nuInsEmployment, setNuInsEmployment] = useState(true);
  const [nuInsAccident, setNuInsAccident] = useState(true);

  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editDeptId, setEditDeptId] = useState<string | null>(null);
  const [dName, setDName] = useState('');
  const [dParentId, setDParentId] = useState('');
  const [dManagerId, setDManagerId] = useState('');
  const [dSortOrder, setDSortOrder] = useState('10');
  const [dTags, setDTags] = useState<string[]>([]);
  const [dMemo, setDMemo] = useState('');
  const [dActive, setDActive] = useState(true);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'HR' | 'PAYROLL' | 'PW' | 'LOG'>('HR');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [eEmpNo, setEEmpNo] = useState('');
  const [eName, setEName] = useState('');
  const [eDeptId, setEDeptId] = useState('');
  const [ePosition, setEPosition] = useState('');
  const [eDuty, setEDuty] = useState('');
  const [eTier, setETier] = useState<TierLevel>(1);
  const [eMaskPrice, setEMaskPrice] = useState(false);
  const [eMustChangePw, setEMustChangePw] = useState(false);
  const [eStatus, setEStatus] = useState<EmploymentStatus>('ACTIVE');
  const [eJoinDate, setEJoinDate] = useState('');
  const [eRetireDate, setERetireDate] = useState('');
  const [eBirthDate, setEBirthDate] = useState('');
  const [eResidentRegNo, setEResidentRegNo] = useState('');
  const [eResidentVisible, setEResidentVisible] = useState(false);
  const [eProfileImageUrl, setEProfileImageUrl] = useState('');
  const [eLeaveGrant, setELeaveGrant] = useState('15');
  const [eLeaveUsed, setELeaveUsed] = useState('0');
  const [ePledgeDate, setEPledgeDate] = useState('');
  const [ePledgeScanName, setEPledgeScanName] = useState('');
  const [ePledgeScanUrl, setEPledgeScanUrl] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [eAddress, setEAddress] = useState('');
  const [eEmergency, setEEmergency] = useState('');
  const [eMemo, setEMemo] = useState('');
  const [eEffectiveDate, setEEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [eReason, setEReason] = useState('');

  const [eSalary, setESalary] = useState('0');
  const [eHourlyWage, setEHourlyWage] = useState('0');
  const [eMealAllowance, setEMealAllowance] = useState('0');
  const [eVehicleAllowance, setEVehicleAllowance] = useState('0');
  const [eServiceContract, setEServiceContract] = useState('0');
  const [eBank, setEBank] = useState('');
  const [eAccountHolder, setEAccountHolder] = useState('');
  const [eAccount, setEAccount] = useState('');
  const [eInsPension, setEInsPension] = useState(true);
  const [eInsHealth, setEInsHealth] = useState(true);
  const [eInsEmployment, setEInsEmployment] = useState(true);
  const [eInsAccident, setEInsAccident] = useState(true);

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

  const headcountSummary = useMemo(() => {
    const total = datasets.users.length;
    const active = datasets.users.filter((u) => u.status === 'ACTIVE').length;
    const leave = datasets.users.filter((u) => u.status === 'LEAVE_OF_ABSENCE').length;
    const retired = datasets.users.filter((u) => u.status === 'RETIRED').length;
    const balanced = total === active + leave + retired;
    return { total, active, leave, retired, balanced };
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

  const openNewUserModal = () => {
    const usedNums = datasets.users
      .map((u) => {
        const m = /^EMP-(\d+)$/i.exec(u.employeeNo || '');
        return m ? Number(m[1]) : 0;
      })
      .filter((n) => n > 0);
    const nextNum = (usedNums.length > 0 ? Math.max(...usedNums) : 2600) + 1;
    setNuLoginId('');
    setNuPassword('');
    setNuName('');
    setNuEmpNo(`EMP-${nextNum}`);
    setNuDeptId(selectedDeptId !== 'ALL' && selectedDeptId !== 'UNASSIGNED' ? selectedDeptId : '');
    setNuPosition('사원');
    setNuDuty('');
    setNuTier(1);
    setNuMaskPrice(false);
    setNuJoinDate(new Date().toISOString().slice(0, 10));
    setNuPhone('');
    setNuEmail('');
    setNuBirthDate('');
    setNuResidentRegNo('');
    setNuAddress('');
    setNuEmergency('');
    setNuLeaveGrant('15');
    setNuPledgeDate('');
    setNuMustChangePw(true);
    setNuSalary('0');
    setNuHourlyWage('0');
    setNuMealAllowance('0');
    setNuVehicleAllowance('0');
    setNuServiceContract('0');
    setNuBank('');
    setNuAccountHolder('');
    setNuAccount('');
    setNuInsPension(true);
    setNuInsHealth(true);
    setNuInsEmployment(true);
    setNuInsAccident(true);
    setNewUserModalOpen(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusy(true);
    try {
      if (datasets.users.some((u) => u.loginId === nuLoginId.trim())) {
        throw new Error('이미 사용 중인 로그인 아이디입니다.');
      }
      await createEmployeeUser({
        loginId: nuLoginId,
        initialPassword: nuPassword,
        name: nuName,
        employeeNo: nuEmpNo,
        departmentId: nuDeptId || null,
        position: nuPosition,
        duty: nuDuty,
        tierLevel: nuTier,
        maskSalesPrice: nuMaskPrice,
        joinDate: nuJoinDate,
        phone: nuPhone,
        email: nuEmail,
        birthDate: nuBirthDate,
        residentRegNo: canResetPassword ? nuResidentRegNo : '',
        address: nuAddress,
        emergencyContact: nuEmergency,
        annualLeaveGrant: Number(nuLeaveGrant || 15),
        annualLeaveUsed: 0,
        pledgeDate: nuPledgeDate,
        mustChangePassword: nuMustChangePw,
        baseSalaryKrw: canViewPayroll ? Number(nuSalary || 0) : 0,
        // 통상임금은 자동계산하지 않고 수동 입력값만 전달한다.
        hourlyWageKrw: canViewPayroll ? Number(nuHourlyWage || 0) : 0,
        mealAllowanceKrw: canViewPayroll ? Number(nuMealAllowance || 0) : 0,
        vehicleAllowanceKrw: canViewPayroll ? Number(nuVehicleAllowance || 0) : 0,
        serviceContractKrw: canViewPayroll ? Number(nuServiceContract || 0) : 0,
        payrollBankName: canViewPayroll ? nuBank : '',
        payrollAccountHolder: canViewPayroll ? nuAccountHolder || nuName : '',
        payrollAccountNo: canViewPayroll ? nuAccount : '',
        insNationalPension: nuInsPension,
        insHealthInsurance: nuInsHealth,
        insEmploymentInsurance: nuInsEmployment,
        insIndustrialAccident: nuInsAccident,
        actor: { id: currentUser.id, name: currentUser.name },
      });
      await refreshAll();
      notifyToast(`${nuName.trim()} 신규 입사 등록 완료`, 'success');
      setNewUserModalOpen(false);
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '임직원 등록 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openDeptModal = (dept?: FlDepartment) => {
    if (dept) {
      setEditDeptId(dept.id);
      setDName(dept.name);
      setDParentId(dept.parentDepartmentId || '');
      setDManagerId(dept.managerId || '');
      setDSortOrder(String(dept.sortOrder ?? 100));
      setDTags(Array.isArray(dept.functionalTags) ? [...dept.functionalTags] : []);
      setDMemo(dept.memo || '');
      setDActive(dept.isActive);
    } else {
      setEditDeptId(null);
      setDName('');
      setDParentId(selectedDeptId !== 'ALL' && selectedDeptId !== 'UNASSIGNED' ? selectedDeptId : 'DEPT-0000001');
      setDManagerId('');
      setDSortOrder(String((datasets.departments.length + 1) * 10));
      setDTags([]);
      setDMemo('');
      setDActive(true);
    }
    setDeptModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveDepartment({
        id: editDeptId || undefined,
        name: dName,
        parentDepartmentId: dParentId || null,
        managerId: dManagerId || null,
        functionalTags: dTags,
        sortOrder: Number(dSortOrder || 100),
        memo: dMemo,
        isActive: dActive,
      });
      await refreshAll();
      notifyToast(`${dName.trim()} 부서 저장 완료`, 'success');
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
    setEEmpNo(u.employeeNo || '');
    setEName(u.name);
    setEDeptId(u.departmentId || '');
    setEPosition(u.position || '');
    setEDuty(u.duty || '');
    setETier(u.tierLevel);
    setEMaskPrice(u.maskSalesPrice);
    setEMustChangePw(Boolean(u.mustChangePassword));
    setEStatus((u.status as EmploymentStatus) || 'ACTIVE');
    setEJoinDate(u.joinDate || '');
    setERetireDate(u.retireDate || '');
    setEBirthDate(u.birthDate || '');
    setEResidentRegNo(u.residentRegNo || '');
    setEResidentVisible(false);
    setEProfileImageUrl(u.profileImageUrl || '');
    setELeaveGrant(String(u.annualLeaveGrant ?? 15));
    setELeaveUsed(String(u.annualLeaveUsed ?? 0));
    setEPledgeDate(u.pledgeDate || '');
    setEPledgeScanName(u.pledgeScanName || '');
    setEPledgeScanUrl(u.pledgeScanUrl || '');
    setEPhone(u.phone || '');
    setEEmail(u.email || '');
    setEAddress(u.address || '');
    setEEmergency(u.emergencyContact || '');
    setEMemo(u.memo || '');
    setEEffectiveDate(new Date().toISOString().slice(0, 10));
    setEReason('');
    setESalary(String(u.baseSalaryKrw || 0));
    setEHourlyWage(String(u.hourlyWageKrw || 0));
    setEMealAllowance(String(u.mealAllowanceKrw || 0));
    setEVehicleAllowance(String(u.vehicleAllowanceKrw || 0));
    setEServiceContract(String(u.serviceContractKrw || 0));
    setEBank(u.payrollBankName || '');
    setEAccountHolder(u.payrollAccountHolder || '');
    setEAccount(u.payrollAccountNo || '');
    setEInsPension(u.insNationalPension !== false);
    setEInsHealth(u.insHealthInsurance !== false);
    setEInsEmployment(u.insEmploymentInsurance !== false);
    setEInsAccident(u.insIndustrialAccident !== false);
    setResetPw1('');
    setResetPw2('');
    setResetPwReason('임시 비밀번호 재발급');
    setDetailModalOpen(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeAvatarImageToDataUrl(file);
      setEProfileImageUrl(dataUrl);
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
      setEPledgeScanName(name);
      setEPledgeScanUrl(dataUrl);
      if (!ePledgeDate) {
        setEPledgeDate(new Date().toISOString().slice(0, 10));
      }
      notifyToast('보안서약서 첨부 파일을 불러왔습니다. 저장 시 반영됩니다.', 'info');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '서약서 첨부 처리 실패', 'error');
    }
  };

  const appointmentChanged = useMemo(() => {
    if (!selectedUser) return false;
    return (
      (selectedUser.departmentId || '') !== eDeptId ||
      (selectedUser.position || '') !== ePosition.trim() ||
      selectedUser.tierLevel !== eTier ||
      selectedUser.status !== eStatus
    );
  }, [eDeptId, ePosition, eStatus, eTier, selectedUser]);

  const buildHrPatch = () => {
    const prevResident = (selectedUser?.residentRegNo || '').trim();
    const prevPhoto = selectedUser?.profileImageUrl || '';
    const prevScanUrl = selectedUser?.pledgeScanUrl || '';
    return {
      name: eName.trim(),
      employeeNo: eEmpNo.trim() || null,
      departmentId: eDeptId || null,
      position: ePosition.trim() || null,
      duty: eDuty.trim() || null,
      tierLevel: eTier,
      maskSalesPrice: eMaskPrice,
      mustChangePassword: eMustChangePw,
      status: eStatus,
      joinDate: eJoinDate.trim() || null,
      retireDate: eStatus === 'RETIRED' ? eRetireDate.trim() || eEffectiveDate : null,
      birthDate: eBirthDate.trim() || null,
      ...(canResetPassword && eResidentRegNo.trim() !== prevResident
        ? { residentRegNo: eResidentRegNo.trim() || null }
        : {}),
      ...(eProfileImageUrl !== prevPhoto ? { profileImageUrl: eProfileImageUrl || null } : {}),
      annualLeaveGrant: Math.max(0, Math.round(Number(eLeaveGrant || 0) * 10) / 10),
      annualLeaveUsed: Math.max(0, Math.round(Number(eLeaveUsed || 0) * 10) / 10),
      pledgeDate: ePledgeDate.trim() || null,
      pledgeScanName: ePledgeScanName.trim() || null,
      ...(ePledgeScanUrl !== prevScanUrl ? { pledgeScanUrl: ePledgeScanUrl || null } : {}),
      phone: ePhone.trim() || null,
      email: eEmail.trim() || null,
      address: eAddress.trim() || null,
      emergencyContact: eEmergency.trim() || null,
      memo: eMemo.trim() || null,
    };
  };

  const handleSaveBasicHr = async () => {
    if (!selectedUser || !currentUser) return;
    setBusy(true);
    try {
      await updateEmployeeHrRecord({
        prevUser: selectedUser,
        patch: buildHrPatch(),
        deptNameMap,
        effectiveDate: eEffectiveDate,
        reason: eReason || '기본 인사정보 수정',
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

  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !currentUser || !canViewPayroll) return;
    setBusy(true);
    try {
      await updateEmployeeHrRecord({
        prevUser: selectedUser,
        patch: {
          baseSalaryKrw: Number(eSalary || 0),
          // 통상임금은 자동계산하지 않고 담당자 수동 입력값 그대로 저장한다.
          hourlyWageKrw: Number(eHourlyWage || 0),
          mealAllowanceKrw: Number(eMealAllowance || 0),
          vehicleAllowanceKrw: Number(eVehicleAllowance || 0),
          serviceContractKrw: Number(eServiceContract || 0),
          payrollBankName: eBank.trim() || null,
          payrollAccountHolder: eAccountHolder.trim() || null,
          payrollAccountNo: eAccount.trim() || null,
          insNationalPension: eInsPension,
          insHealthInsurance: eInsHealth,
          insEmploymentInsurance: eInsEmployment,
          insIndustrialAccident: eInsAccident,
        },
        deptNameMap,
        effectiveDate: eEffectiveDate,
        reason: eReason || '급여 · 통상임금 · 4대보험 · 계좌 변경',
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
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('임직원 인사원장');
      const headers = [
        '사번',
        '로그인아이디',
        '성명',
        '소속부서',
        '직책',
        '담당직무',
        '직급티어',
        '재직상태',
        '입사일',
        '퇴사일',
        '연락처',
        '이메일',
        '생년월일',
        '주민등록번호',
        '주소',
        '비상연락처',
        '부여연차',
        '사용연차',
        '잔여연차',
        '보안서약일',
        '서약서파일명',
      ];
      if (canViewPayroll) {
        headers.push(
          '월기본급',
          '통상임금',
          '식대',
          '차량보조금',
          '용역계약금액',
          '급여은행',
          '예금주',
          '급여계좌',
          '국민연금',
          '건강보험',
          '고용보험',
          '산재보험'
        );
      }
      ws.addRow(headers);
      ws.getRow(1).font = { bold: true };
      for (const u of filteredUsers) {
        const leaveRemain = formatLeaveRemain(u.annualLeaveGrant, u.annualLeaveUsed);
        const row: (string | number)[] = [
          u.employeeNo || '',
          u.loginId,
          u.name,
          u.departmentName || '미배정',
          u.position || '',
          u.duty || '',
          TIER_LABELS[u.tierLevel],
          statusLabel(u.status),
          u.joinDate || '',
          u.retireDate || '',
          u.phone || '',
          u.email || '',
          u.birthDate || '',
          maskResidentRegNo(u.residentRegNo),
          u.address || '',
          u.emergencyContact || '',
          Number(u.annualLeaveGrant ?? 15),
          Number(u.annualLeaveUsed ?? 0),
          leaveRemain,
          u.pledgeDate || '',
          u.pledgeScanName || '',
        ];
        if (canViewPayroll) {
          row.push(
            Number(u.baseSalaryKrw || 0),
            Number(u.hourlyWageKrw || 0),
            Number(u.mealAllowanceKrw || 0),
            Number(u.vehicleAllowanceKrw || 0),
            Number(u.serviceContractKrw || 0),
            u.payrollBankName || '',
            u.payrollAccountHolder || '',
            u.payrollAccountNo || '',
            u.insNationalPension ? '가입' : '미가입',
            u.insHealthInsurance ? '가입' : '미가입',
            u.insEmploymentInsurance ? '가입' : '미가입',
            u.insIndustrialAccident ? '가입' : '미가입'
          );
        }
        ws.addRow(row);
      }
      ws.columns.forEach((col) => {
        col.width = 16;
      });
      const buf = await wb.xlsx.writeBuffer();
      const today = new Date().toISOString().slice(0, 10);
      downloadExcelFile(`임직원_인사원장_${today}.xlsx`, new Uint8Array(buf as ArrayBuffer));
      notifyToast(`임직원 ${filteredUsers.length}명 엑셀 내보내기 완료`, 'success');
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
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

  const deptColumns: GridColumn<DeptNode>[] = [
    {
      key: 'action',
      header: '관리',
      width: 74,
      align: 'center',
      stickyLeft: true,
      render: ({ dept }) => (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => openDeptModal(dept)}
          style={actionBtnStyle('secondary', true)}
        >
          수정
        </button>
      ),
    },
    { key: 'sortOrder', header: '정렬', width: 66, align: 'right', render: ({ dept }) => dept.sortOrder },
    {
      key: 'name',
      header: '부서명',
      width: 180,
      render: ({ dept, depth }) => (
        <span style={{ paddingLeft: `${depth * 16}px`, fontWeight: 700 }}>
          {depth > 0 ? 'ㄴ ' : ''}
          {dept.name}
        </span>
      ),
    },
    {
      key: 'parent',
      header: '상위 부서',
      width: 130,
      render: ({ dept }) => (dept.parentDepartmentId ? deptNameMap[dept.parentDepartmentId] || '-' : '최상위'),
    },
    {
      key: 'manager',
      header: '부서장',
      width: 100,
      render: ({ dept }) => dept.managerName || (dept.managerId ? userNameMap[dept.managerId] || '-' : '-'),
    },
    {
      key: 'tags',
      header: '업무 기능',
      width: 280,
      render: ({ dept }) =>
        dept.functionalTags.length > 0 ? (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {dept.functionalTags.map((t) => (
              <StatusBadge key={t} label={t} tone="info" />
            ))}
          </div>
        ) : (
          '-'
        ),
    },
    {
      key: 'headcount',
      header: '재직 인원',
      width: 86,
      align: 'right',
      render: ({ dept }) => `${deptHeadcountMap.get(dept.id) || 0}명`,
    },
    {
      key: 'active',
      header: '사용 여부',
      width: 82,
      align: 'center',
      render: ({ dept }) => <StatusBadge label={dept.isActive ? '사용' : '중지'} tone={dept.isActive ? 'success' : 'neutral'} />,
    },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              data-manual-id="hr-filter"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                <VerticalField label="소속 부서 필터" width={170}>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => setSelectedDeptId(e.target.value)}
                    style={controlInputStyle}
                  >
                    <option value="ALL">전체 부서</option>
                    {deptTree.map(({ dept, depth }) => (
                      <option key={dept.id} value={dept.id}>
                        {'  '.repeat(depth)}
                        {dept.name}
                      </option>
                    ))}
                    <option value="UNASSIGNED">미배정</option>
                  </select>
                </VerticalField>

                <VerticalField label="재직 상태" width={130}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    style={controlInputStyle}
                  >
                    <option value="ALL">전체 상태</option>
                    <option value="ACTIVE">재직</option>
                    <option value="LEAVE_OF_ABSENCE">휴직</option>
                    <option value="RETIRED">퇴사</option>
                  </select>
                </VerticalField>

                <VerticalField label="임직원 검색" width={230}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search
                      size={14}
                      style={{ position: 'absolute', left: '9px', color: 'var(--text-muted)', pointerEvents: 'none' }}
                    />
                    <input
                      type="text"
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      placeholder="사번, 아이디, 성명, 직책 검색"
                      style={{ ...controlInputStyle, paddingLeft: '28px' }}
                    />
                  </div>
                </VerticalField>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleExportExcel}
                  style={actionBtnStyle('secondary')}
                >
                  <Download size={14} />
                  인사대장 엑셀
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openDeptModal()}
                      style={actionBtnStyle('secondary')}
                    >
                      <Building2 size={14} />
                      부서 추가
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={openNewUserModal}
                      style={actionBtnStyle('primary')}
                    >
                      <UserPlus size={14} />
                      신규 입사 등록
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: '12px', alignItems: 'start' }}>
              <div
                data-manual-id="hr-dept-tree"
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '6px',
                    marginBottom: '4px',
                    borderBottom: '1px solid var(--table-row-border)',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                    <Users size={13} />
                    조직 계층도
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>{datasets.departments.length}개 부서</span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDeptId('ALL')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '5px',
                    border: '1px solid transparent',
                    backgroundColor: selectedDeptId === 'ALL' ? 'var(--primary-light)' : 'transparent',
                    color: selectedDeptId === 'ALL' ? 'var(--primary)' : 'var(--text-main)',
                    fontSize: '12.5px',
                    fontWeight: selectedDeptId === 'ALL' ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>전체 조직</span>
                  <span>{headcountSummary.active + headcountSummary.leave}명</span>
                </button>

                {deptTree.map(({ dept, depth }) => {
                  const active = selectedDeptId === dept.id;
                  return (
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => setSelectedDeptId(dept.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `6px 8px 6px ${8 + depth * 12}px`,
                        borderRadius: '5px',
                        border: '1px solid transparent',
                        backgroundColor: active ? 'var(--primary-light)' : 'transparent',
                        color: active ? 'var(--primary)' : 'var(--text-main)',
                        fontSize: '12.5px',
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span>
                        {depth > 0 ? 'ㄴ ' : ''}
                        {dept.name}
                      </span>
                      <span>{deptHeadcountMap.get(dept.id) || 0}명</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setSelectedDeptId('UNASSIGNED')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '5px',
                    border: '1px solid transparent',
                    backgroundColor: selectedDeptId === 'UNASSIGNED' ? 'var(--primary-light)' : 'transparent',
                    color: selectedDeptId === 'UNASSIGNED' ? 'var(--primary)' : 'var(--text-secondary)',
                    fontSize: '12.5px',
                    fontWeight: selectedDeptId === 'UNASSIGNED' ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>미배정 인원</span>
                  <span>{deptHeadcountMap.get('UNASSIGNED') || 0}명</span>
                </button>
              </div>

              <DataGrid
                manualId="hr-grid"
                columns={userColumns}
                rows={filteredUsers}
                rowKey={(u) => u.id}
                onRowClick={openUserDetailModal}
                selectedRowId={selectedUserId}
                maxHeight="540px"
              />
            </div>

            <ConservationBar
              manualId="hr-conservation"
              balanced={headcountSummary.balanced}
              balanceMessage={headcountSummary.balanced ? '정원 검증 일치' : '정원 집계 불일치'}
              items={[
                { label: '전체 임직원', value: `${headcountSummary.total}명`, tone: 'primary' },
                { label: '재직', value: `${headcountSummary.active}명`, tone: 'success' },
                { label: '휴직', value: `${headcountSummary.leave}명`, tone: 'warning' },
                { label: '퇴사', value: `${headcountSummary.retired}명`, tone: 'danger' },
                { label: '현재 조회', value: `${filteredUsers.length}명`, tone: 'neutral' },
              ]}
            />
          </div>
        )}

        {tab === 'DEPTS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {canEdit && (
                <button type="button" onClick={() => openDeptModal()} style={actionBtnStyle('primary')}>
                  <Plus size={14} />
                  신규 부서 등록
                </button>
              )}
            </div>
            <DataGrid
              manualId="hr-dept-tree"
              columns={deptColumns}
              rows={deptTree}
              rowKey={({ dept }) => dept.id}
              maxHeight="540px"
            />
            <ConservationBar
              manualId="hr-conservation"
              balanced
              balanceMessage="부서 조직 합계 일치"
              items={[
                { label: '전체 부서', value: `${datasets.departments.length}개`, tone: 'primary' },
                {
                  label: '사용 부서',
                  value: `${datasets.departments.filter((d) => d.isActive).length}개`,
                  tone: 'success',
                },
                { label: '미배정 재직자', value: `${deptHeadcountMap.get('UNASSIGNED') || 0}명`, tone: 'warning' },
              ]}
            />
          </div>
        )}

        {tab === 'HISTORY' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
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
              maxHeight="540px"
            />
          </div>
        )}
      </SectionPanel>

      <ModalDialog
        open={newUserModalOpen}
        title="신규 입사 임직원 등록"
        width={760}
        onClose={() => setNewUserModalOpen(false)}
      >
        <form onSubmit={handleCreateEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            <VerticalField label="로그인 아이디" required>
              <input
                type="text"
                value={nuLoginId}
                onChange={(e) => setNuLoginId(e.target.value)}
                placeholder="로그인 아이디"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="초기 비밀번호" required>
              <input
                type="password"
                value={nuPassword}
                onChange={(e) => setNuPassword(e.target.value)}
                placeholder="4자 이상"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="사번" required>
              <input
                type="text"
                value={nuEmpNo}
                onChange={(e) => setNuEmpNo(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            <VerticalField label="성명" required>
              <input
                type="text"
                value={nuName}
                onChange={(e) => setNuName(e.target.value)}
                placeholder="임직원 성명"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="소속 부서">
              <select
                value={nuDeptId}
                onChange={(e) => setNuDeptId(e.target.value)}
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
                value={nuPosition}
                onChange={(e) => setNuPosition(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
            <VerticalField label="직급 티어" required>
              <select
                value={nuTier}
                onChange={(e) => setNuTier(Number(e.target.value) as TierLevel)}
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
                value={nuDuty}
                onChange={(e) => setNuDuty(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="입사일" required>
              <input
                type="date"
                value={nuJoinDate}
                onChange={(e) => setNuJoinDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
            <VerticalField label="연락처">
              <input
                type="text"
                value={nuPhone}
                onChange={(e) => setNuPhone(e.target.value)}
                placeholder="010-0000-0000"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="이메일">
              <input
                type="email"
                value={nuEmail}
                onChange={(e) => setNuEmail(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="생년월일">
              <input
                type="date"
                value={nuBirthDate}
                onChange={(e) => setNuBirthDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            {canResetPassword ? (
              <VerticalField label="주민등록번호">
                <input
                  type="text"
                  value={nuResidentRegNo}
                  onChange={(e) => setNuResidentRegNo(e.target.value)}
                  placeholder="000000-0000000"
                  style={controlInputStyle}
                />
              </VerticalField>
            ) : (
              <VerticalField label="비상연락처">
                <input
                  type="text"
                  value={nuEmergency}
                  onChange={(e) => setNuEmergency(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: canResetPassword ? '2fr 1fr' : '1fr', gap: '10px' }}>
            <VerticalField label="주소">
              <input
                type="text"
                value={nuAddress}
                onChange={(e) => setNuAddress(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            {canResetPassword && (
              <VerticalField label="비상연락처">
                <input
                  type="text"
                  value={nuEmergency}
                  onChange={(e) => setNuEmergency(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            <VerticalField label="부여 연차일수">
              <input
                type="number"
                step="0.5"
                min={0}
                value={nuLeaveGrant}
                onChange={(e) => setNuLeaveGrant(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="보안서약일">
              <input
                type="date"
                value={nuPledgeDate}
                onChange={(e) => setNuPledgeDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>

          {canViewPayroll && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                초기 급여 · 수동 통상임금 · 4대보험 · 계좌
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                <VerticalField label="월 기본급">
                  <CommaNumberInput
                    min={0}
                    value={Number(nuSalary || 0)}
                    onChange={(v) => setNuSalary(String(v))}
                  />
                </VerticalField>
                <VerticalField label="통상임금 · 수동 입력">
                  <CommaNumberInput
                    min={0}
                    value={Number(nuHourlyWage || 0)}
                    onChange={(v) => setNuHourlyWage(v > 0 ? String(v) : '')}
                    placeholder="직접 입력"
                  />
                </VerticalField>
                <VerticalField label="용역계약금액">
                  <CommaNumberInput
                    min={0}
                    value={Number(nuServiceContract || 0)}
                    onChange={(v) => setNuServiceContract(String(v))}
                  />
                </VerticalField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                <VerticalField label="식대">
                  <CommaNumberInput
                    min={0}
                    value={Number(nuMealAllowance || 0)}
                    onChange={(v) => setNuMealAllowance(String(v))}
                  />
                </VerticalField>
                <VerticalField label="차량보조금">
                  <CommaNumberInput
                    min={0}
                    value={Number(nuVehicleAllowance || 0)}
                    onChange={(v) => setNuVehicleAllowance(String(v))}
                  />
                </VerticalField>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                <VerticalField label="급여 은행명">
                  <input
                    type="text"
                    list="fl-payroll-banks"
                    value={nuBank}
                    onChange={(e) => setNuBank(e.target.value)}
                    placeholder="선택 또는 직접 입력"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="예금주">
                  <input
                    type="text"
                    value={nuAccountHolder}
                    onChange={(e) => setNuAccountHolder(e.target.value)}
                    placeholder="미입력 시 성명 동일"
                    style={controlInputStyle}
                  />
                </VerticalField>
                <VerticalField label="급여 계좌번호">
                  <input
                    type="text"
                    value={nuAccount}
                    onChange={(e) => setNuAccount(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', paddingTop: '2px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={nuInsPension} onChange={(e) => setNuInsPension(e.target.checked)} />
                  국민연금
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={nuInsHealth} onChange={(e) => setNuInsHealth(e.target.checked)} />
                  건강보험
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={nuInsEmployment} onChange={(e) => setNuInsEmployment(e.target.checked)} />
                  고용보험
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={nuInsAccident} onChange={(e) => setNuInsAccident(e.target.checked)} />
                  산재보험
                </label>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={nuMaskPrice}
                onChange={(e) => setNuMaskPrice(e.target.checked)}
              />
              판매 단가 비공개 대상 지정
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={nuMustChangePw}
                onChange={(e) => setNuMustChangePw(e.target.checked)}
              />
              최초 로그인 비밀번호 변경 권장
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button type="button" onClick={() => setNewUserModalOpen(false)} style={actionBtnStyle('secondary')}>
              취소
            </button>
            <button type="submit" disabled={busy} style={actionBtnStyle('primary')}>
              {busy ? '등록 중' : '입사 등록 확정'}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={deptModalOpen}
        title={editDeptId ? '부서 정보 수정' : '신규 부서 등록'}
        width={580}
        onClose={() => setDeptModalOpen(false)}
      >
        <form onSubmit={handleSaveDepartment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <VerticalField label="부서명" required>
              <input
                type="text"
                value={dName}
                onChange={(e) => setDName(e.target.value)}
                placeholder="부서명 입력"
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="상위 부서">
              <select
                value={dParentId}
                onChange={(e) => setDParentId(e.target.value)}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '10px', alignItems: 'end' }}>
            <VerticalField label="부서장 지정">
              <select
                value={dManagerId}
                onChange={(e) => setDManagerId(e.target.value)}
                style={controlInputStyle}
              >
                <option value="">미지정</option>
                {datasets.users
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
                value={dSortOrder}
                onChange={(e) => setDSortOrder(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={dActive}
                onChange={(e) => setDActive(e.target.checked)}
              />
              부서 사용
            </label>
          </div>

          <VerticalField label="담당 업무 기능">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
              {ALL_DEPARTMENT_FUNC_TAGS.map((tag) => {
                const checked = dTags.includes(tag);
                return (
                  <label
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
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
                        setDTags((prev) =>
                          e.target.checked ? [...prev, tag] : prev.filter((x) => x !== tag)
                        )
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
              value={dMemo}
              onChange={(e) => setDMemo(e.target.value)}
              style={controlInputStyle}
            />
          </VerticalField>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setDeptModalOpen(false)} style={actionBtnStyle('secondary')}>
              취소
            </button>
            <button type="submit" disabled={busy} style={actionBtnStyle('primary')}>
              {busy ? '저장 중' : '부서 저장'}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={detailModalOpen && Boolean(selectedUser)}
        title={selectedUser ? `인사 카드 · ${selectedUser.name} · ${selectedUser.employeeNo || '-'}` : '인사 카드'}
        width={800}
        onClose={() => setDetailModalOpen(false)}
      >
        {selectedUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                paddingBottom: '10px',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setDetailTab('HR')}
                  style={actionBtnStyle(detailTab === 'HR' ? 'primary' : 'secondary', true)}
                >
                  인사정보 · 발령
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('PAYROLL')}
                  style={actionBtnStyle(detailTab === 'PAYROLL' ? 'primary' : 'secondary', true)}
                >
                  <ShieldCheck size={13} />
                  급여 · 계좌
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('PW')}
                  style={actionBtnStyle(detailTab === 'PW' ? 'primary' : 'secondary', true)}
                >
                  <KeyRound size={13} />
                  비밀번호 초기화
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('LOG')}
                  style={actionBtnStyle(detailTab === 'LOG' ? 'primary' : 'secondary', true)}
                >
                  <History size={13} />
                  개인 이력 · {selectedUserHistories.length}건
                </button>
              </div>
              <StatusBadge
                label={`${selectedUser.name} · ${TIER_LABELS[selectedUser.tierLevel]}`}
                tone="primary"
              />
            </div>

            {detailTab === 'HR' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '10px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {eProfileImageUrl ? (
                      <img
                        src={eProfileImageUrl}
                        alt={eName}
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
                        {(eName || selectedUser.name).slice(0, 1)}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {selectedUser.name} · {selectedUser.employeeNo || '사번 미지정'}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        잔여 연차 {formatLeaveRemain(Number(eLeaveGrant || 0), Number(eLeaveUsed || 0)).toFixed(1)}일 · 보안서약{' '}
                        {ePledgeDate || ePledgeScanUrl ? '제출' : '미제출'}
                      </span>
                    </div>
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <label style={{ ...actionBtnStyle('secondary', true), cursor: 'pointer' }}>
                        <Upload size={12} />
                        사진 첨부
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {eProfileImageUrl && (
                        <button
                          type="button"
                          onClick={() => setEProfileImageUrl('')}
                          style={actionBtnStyle('secondary', true)}
                        >
                          <Trash2 size={12} />
                          사진 삭제
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                  <VerticalField label="사번">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={eEmpNo}
                      onChange={(e) => setEEmpNo(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="성명" required>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="소속 부서">
                    <select
                      disabled={!canEdit}
                      value={eDeptId}
                      onChange={(e) => setEDeptId(e.target.value)}
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
                  <VerticalField label="직책">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={ePosition}
                      onChange={(e) => setEPosition(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="담당 직무">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={eDuty}
                      onChange={(e) => setEDuty(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="직급 티어">
                    <select
                      disabled={!canEdit}
                      value={eTier}
                      onChange={(e) => setETier(Number(e.target.value) as TierLevel)}
                      style={controlInputStyle}
                    >
                      {([1, 2, 3, 4, 5, 6, 7] as TierLevel[]).map((t) => (
                        <option key={t} value={t}>
                          {TIER_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </VerticalField>
                  <VerticalField label="재직 상태">
                    <select
                      disabled={!canEdit}
                      value={eStatus}
                      onChange={(e) => setEStatus(e.target.value as EmploymentStatus)}
                      style={controlInputStyle}
                    >
                      <option value="ACTIVE">재직</option>
                      <option value="LEAVE_OF_ABSENCE">휴직</option>
                      <option value="RETIRED">퇴사</option>
                    </select>
                  </VerticalField>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px' }}>
                  <VerticalField label="입사일">
                    <input
                      type="date"
                      disabled={!canEdit}
                      value={eJoinDate}
                      onChange={(e) => setEJoinDate(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="퇴사일">
                    <input
                      type="date"
                      disabled={!canEdit || eStatus !== 'RETIRED'}
                      value={eRetireDate}
                      onChange={(e) => setERetireDate(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="생년월일">
                    <input
                      type="date"
                      disabled={!canEdit}
                      value={eBirthDate}
                      onChange={(e) => setEBirthDate(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="주민등록번호">
                    {!canResetPassword ? (
                      <div style={{ ...controlInputStyle, display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                        권한 제한
                      </div>
                    ) : !eResidentVisible && eResidentRegNo ? (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
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
                          {maskResidentRegNo(eResidentRegNo)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEResidentVisible(true)}
                          title="주민등록번호 표시"
                          style={actionBtnStyle('secondary', true)}
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={eResidentRegNo}
                          onChange={(e) => setEResidentRegNo(e.target.value)}
                          placeholder="000000-0000000"
                          style={controlInputStyle}
                        />
                        {eResidentRegNo && (
                          <button
                            type="button"
                            onClick={() => setEResidentVisible(false)}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <VerticalField label="연락처">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={ePhone}
                      onChange={(e) => setEPhone(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="이메일">
                    <input
                      type="email"
                      disabled={!canEdit}
                      value={eEmail}
                      onChange={(e) => setEEmail(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                  <VerticalField label="주소">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={eAddress}
                      onChange={(e) => setEAddress(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="비상연락처">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={eEmergency}
                      onChange={(e) => setEEmergency(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', alignItems: 'end' }}>
                  <VerticalField label="부여 연차일수">
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      disabled={!canEdit}
                      value={eLeaveGrant}
                      onChange={(e) => setELeaveGrant(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="사용 연차일수">
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      disabled={!canEdit}
                      value={eLeaveUsed}
                      onChange={(e) => setELeaveUsed(e.target.value)}
                      style={controlInputStyle}
                    />
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
                      {formatLeaveRemain(Number(eLeaveGrant || 0), Number(eLeaveUsed || 0)).toFixed(1)}일
                    </div>
                  </VerticalField>
                  <VerticalField label="보안서약일">
                    <input
                      type="date"
                      disabled={!canEdit}
                      value={ePledgeDate}
                      onChange={(e) => setEPledgeDate(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    padding: '8px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-secondary)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                    <FileText size={14} />
                    <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>보안서약서 스캔본</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{ePledgeScanName || '미첨부'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {ePledgeScanUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          void openAttachmentPreview(ePledgeScanUrl, ePledgeScanName).catch((err) =>
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
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handlePledgeScanUpload}
                            style={{ display: 'none' }}
                          />
                        </label>
                        {ePledgeScanUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setEPledgeScanName('');
                              setEPledgeScanUrl('');
                            }}
                            style={actionBtnStyle('secondary', true)}
                          >
                            삭제
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: '10px' }}>
                  <VerticalField label="발령 시행일">
                    <input
                      type="date"
                      disabled={!canEdit}
                      value={eEffectiveDate}
                      onChange={(e) => setEEffectiveDate(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="변경 사유">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={eReason}
                      onChange={(e) => setEReason(e.target.value)}
                      placeholder="발령 또는 수정 사유"
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <VerticalField label="인사 메모">
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={eMemo}
                      onChange={(e) => setEMemo(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={eMaskPrice}
                        onChange={(e) => setEMaskPrice(e.target.checked)}
                      />
                      판매 단가 비공개 적용
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={eMustChangePw}
                        onChange={(e) => setEMustChangePw(e.target.checked)}
                      />
                      비밀번호 변경 필요 상태
                    </label>
                  </div>

                  {canEdit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setDetailModalOpen(false)}
                        style={actionBtnStyle('secondary')}
                      >
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
                            patch: buildHrPatch(),
                            effectiveDate: eEffectiveDate,
                            reason: eReason || '조직·직책·티어·재직상태 인사 발령',
                          })}
                          onExecuteDirect={async () => {
                            if (!currentUser) return;
                            await updateEmployeeHrRecord({
                              prevUser: selectedUser,
                              patch: buildHrPatch(),
                              deptNameMap,
                              effectiveDate: eEffectiveDate,
                              reason: eReason || '조직·직책·티어·재직상태 인사 발령',
                              actor: { id: currentUser.id, name: currentUser.name },
                            });
                            await refreshAll();
                            notifyToast(`${selectedUser.name} 인사 발령 완료`, 'success');
                            setDetailModalOpen(false);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleSaveBasicHr}
                          style={actionBtnStyle('primary')}
                        >
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
                <form onSubmit={handleSavePayroll} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                      gap: '10px',
                      padding: '10px 12px',
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    <VerticalField label="월 기본급" required>
                      <CommaNumberInput
                        min={0}
                        value={Number(eSalary || 0)}
                        onChange={(v) => setESalary(String(v))}
                      />
                    </VerticalField>
                    <VerticalField label="통상임금 · 수동 입력">
                      <CommaNumberInput
                        min={0}
                        value={Number(eHourlyWage || 0)}
                        onChange={(v) => setEHourlyWage(v > 0 ? String(v) : '')}
                        placeholder="시간당 통상임금 직접 입력"
                      />
                    </VerticalField>
                    <VerticalField label="용역계약금액">
                      <CommaNumberInput
                        min={0}
                        value={Number(eServiceContract || 0)}
                        onChange={(v) => setEServiceContract(String(v))}
                      />
                    </VerticalField>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    <VerticalField label="식대">
                      <CommaNumberInput
                        min={0}
                        value={Number(eMealAllowance || 0)}
                        onChange={(v) => setEMealAllowance(String(v))}
                      />
                    </VerticalField>
                    <VerticalField label="차량보조금">
                      <CommaNumberInput
                        min={0}
                        value={Number(eVehicleAllowance || 0)}
                        onChange={(v) => setEVehicleAllowance(String(v))}
                      />
                    </VerticalField>
                  </div>

                  <div
                    style={{
                      padding: '8px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-secondary)',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {Number(eHourlyWage || 0) > 0
                      ? `수동 입력 통상임금 기준 참고 단가 · 평일연장 1.5배 ${formatMoney(Math.round(Number(eHourlyWage) * 1.5))} · 휴일 8시간 이내 1.5배 ${formatMoney(Math.round(Number(eHourlyWage) * 1.5))} · 휴일 8시간 초과 2.0배 ${formatMoney(Math.round(Number(eHourlyWage) * 2))} · 야간가산 0.5배 ${formatMoney(Math.round(Number(eHourlyWage) * 0.5))}`
                      : '통상임금은 자동계산되지 않으며 직접 입력한 금액만 저장됩니다.'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
                    <VerticalField label="급여 은행명">
                      <input
                        type="text"
                        list="fl-payroll-banks"
                        value={eBank}
                        onChange={(e) => setEBank(e.target.value)}
                        placeholder="선택 또는 직접 입력"
                        style={controlInputStyle}
                      />
                    </VerticalField>
                    <VerticalField label="예금주">
                      <input
                        type="text"
                        value={eAccountHolder}
                        onChange={(e) => setEAccountHolder(e.target.value)}
                        style={controlInputStyle}
                      />
                    </VerticalField>
                    <VerticalField label="급여 계좌번호">
                      <input
                        type="text"
                        value={eAccount}
                        onChange={(e) => setEAccount(e.target.value)}
                        style={controlInputStyle}
                      />
                    </VerticalField>
                  </div>

                  <div
                    style={{
                      padding: '10px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        4대보험 가입여부
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEInsPension(true);
                            setEInsHealth(true);
                            setEInsEmployment(true);
                            setEInsAccident(true);
                          }}
                          style={actionBtnStyle('secondary', true)}
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEInsPension(false);
                            setEInsHealth(false);
                            setEInsEmployment(false);
                            setEInsAccident(false);
                          }}
                          style={actionBtnStyle('secondary', true)}
                        >
                          전체 해제
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={eInsPension}
                          onChange={(e) => setEInsPension(e.target.checked)}
                        />
                        국민연금
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={eInsHealth}
                          onChange={(e) => setEInsHealth(e.target.checked)}
                        />
                        건강보험
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={eInsEmployment}
                          onChange={(e) => setEInsEmployment(e.target.checked)}
                        />
                        고용보험
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                        <input
                          type="checkbox"
                          checked={eInsAccident}
                          onChange={(e) => setEInsAccident(e.target.checked)}
                        />
                        산재보험
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px' }}>
                    <VerticalField label="적용일">
                      <input
                        type="date"
                        value={eEffectiveDate}
                        onChange={(e) => setEEffectiveDate(e.target.value)}
                        style={controlInputStyle}
                      />
                    </VerticalField>
                    <VerticalField label="변경 사유">
                      <input
                        type="text"
                        value={eReason}
                        onChange={(e) => setEReason(e.target.value)}
                        placeholder="급여 조정, 통상임금, 계좌 또는 4대보험 변경 사유"
                        style={controlInputStyle}
                      />
                    </VerticalField>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button type="submit" disabled={busy} style={actionBtnStyle('primary')}>
                      {busy ? '저장 중' : '급여 · 계좌 저장'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                  급여 및 계좌 정보는 6단계 본부장급 이상 또는 최고 관리자만 조회 및 수정할 수 있습니다.
                </div>
              )
            )}

            {detailTab === 'PW' && (
              canResetPassword ? (
                <form onSubmit={handleAdminResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <VerticalField label="새 임시 비밀번호" required>
                      <input
                        type="password"
                        value={resetPw1}
                        onChange={(e) => setResetPw1(e.target.value)}
                        placeholder="4자 이상 입력"
                        style={controlInputStyle}
                      />
                    </VerticalField>
                    <VerticalField label="새 임시 비밀번호 확인" required>
                      <input
                        type="password"
                        value={resetPw2}
                        onChange={(e) => setResetPw2(e.target.value)}
                        placeholder="비밀번호 재입력"
                        style={controlInputStyle}
                      />
                    </VerticalField>
                  </div>
                  <VerticalField label="초기화 사유">
                    <input
                      type="text"
                      value={resetPwReason}
                      onChange={(e) => setResetPwReason(e.target.value)}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button type="submit" disabled={busy} style={actionBtnStyle('danger')}>
                      {busy ? '처리 중' : '비밀번호 초기화 실행'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                  비밀번호 초기화는 4단계 부서장급 이상 권한이 필요합니다.
                </div>
              )
            )}

            {detailTab === 'LOG' && (
              <DataGrid
                columns={historyColumns.filter((c) => c.key !== 'userName')}
                rows={selectedUserHistories}
                rowKey={(h) => h.id}
                maxHeight="340px"
              />
            )}
          </div>
        )}
      </ModalDialog>

      <datalist id="fl-payroll-banks">
        {PAYROLL_BANK_OPTIONS.map((bank) => (
          <option key={bank} value={bank} />
        ))}
      </datalist>
    </div>
  );
};
