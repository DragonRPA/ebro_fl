import { downloadExcelFile } from '../../services/documentService';
import type { UpdateEmployeeHrInput } from '../../services/domainHrAdminEngine';
import {
  EMPLOYMENT_STATUS_LABELS,
  TIER_LABELS,
  type EmploymentStatus,
  type FlDepartment,
  type FlUser,
  type TierLevel,
} from '../../types/domain';
import type { BadgeTone } from '../../components/UiPrimitives';

export interface DeptNode {
  dept: FlDepartment;
  depth: number;
}

export function buildDeptTreeOrder(depts: FlDepartment[]): DeptNode[] {
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

export function collectDescendantDeptIds(rootId: string, depts: FlDepartment[]): Set<string> {
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

export function statusBadgeTone(status: string): BadgeTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'LEAVE_OF_ABSENCE') return 'warning';
  if (status === 'RETIRED') return 'danger';
  return 'neutral';
}

export function statusLabel(status: string): string {
  return EMPLOYMENT_STATUS_LABELS[status as EmploymentStatus] || status;
}

export const PAYROLL_BANK_OPTIONS = [
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

export const INSURANCE_FIELDS = [
  { key: 'insPension', label: '국민연금' },
  { key: 'insHealth', label: '건강보험' },
  { key: 'insEmployment', label: '고용보험' },
  { key: 'insAccident', label: '산재보험' },
] as const;

export function maskResidentRegNo(value?: string | null): string {
  const clean = (value || '').trim();
  if (!clean) return '미등록';
  const digits = clean.replace(/[^0-9]/g, '');
  if (digits.length >= 7) {
    return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`;
  }
  return `${clean.slice(0, Math.min(6, clean.length))}****`;
}

export function formatLeaveRemain(grant?: number, used?: number): number {
  const rem = Number(grant ?? 15) - Number(used ?? 0);
  return Math.max(0, Math.round(rem * 10) / 10);
}

export async function resizeAvatarImageToDataUrl(file: File): Promise<string> {
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

export async function readScanAttachment(file: File): Promise<{ name: string; dataUrl: string }> {
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

export async function openAttachmentPreview(url: string, fileName?: string | null): Promise<void> {
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

export async function exportEmployeesToExcel(params: {
  users: FlUser[];
  canViewPayroll: boolean;
}): Promise<number> {
  const { users, canViewPayroll } = params;
  const ExcelJSMod: any = await import('exceljs');
  const ExcelJS = ExcelJSMod?.Workbook ? ExcelJSMod : ExcelJSMod?.default || ExcelJSMod;
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
  for (const u of users) {
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
  ws.columns.forEach((col: { width?: number }) => {
    col.width = 16;
  });
  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  downloadExcelFile(`임직원_인사원장_${today}.xlsx`, new Uint8Array(buf as ArrayBuffer));
  return users.length;
}

export interface NewEmployeeFormState {
  loginId: string;
  password: string;
  name: string;
  empNo: string;
  deptId: string;
  position: string;
  duty: string;
  tier: TierLevel;
  maskPrice: boolean;
  joinDate: string;
  phone: string;
  email: string;
  birthDate: string;
  residentRegNo: string;
  address: string;
  emergency: string;
  leaveGrant: string;
  pledgeDate: string;
  mustChangePw: boolean;
  salary: string;
  hourlyWage: string;
  mealAllowance: string;
  vehicleAllowance: string;
  serviceContract: string;
  bank: string;
  accountHolder: string;
  account: string;
  insPension: boolean;
  insHealth: boolean;
  insEmployment: boolean;
  insAccident: boolean;
}

export function createInitialNewEmployeeForm(
  users: FlUser[],
  selectedDeptId: string
): NewEmployeeFormState {
  const usedNums = users
    .map((u) => {
      const m = /^EMP-(\d+)$/i.exec(u.employeeNo || '');
      return m ? Number(m[1]) : 0;
    })
    .filter((n) => n > 0);
  const nextNum = (usedNums.length > 0 ? Math.max(...usedNums) : 2600) + 1;
  return {
    loginId: '',
    password: '',
    name: '',
    empNo: `EMP-${nextNum}`,
    deptId: selectedDeptId !== 'ALL' && selectedDeptId !== 'UNASSIGNED' ? selectedDeptId : '',
    position: '사원',
    duty: '',
    tier: 1,
    maskPrice: false,
    joinDate: new Date().toISOString().slice(0, 10),
    phone: '',
    email: '',
    birthDate: '',
    residentRegNo: '',
    address: '',
    emergency: '',
    leaveGrant: '15',
    pledgeDate: '',
    mustChangePw: true,
    salary: '0',
    hourlyWage: '0',
    mealAllowance: '0',
    vehicleAllowance: '0',
    serviceContract: '0',
    bank: '',
    accountHolder: '',
    account: '',
    insPension: true,
    insHealth: true,
    insEmployment: true,
    insAccident: true,
  };
}

export interface DeptFormState {
  name: string;
  parentId: string;
  managerId: string;
  sortOrder: string;
  tags: string[];
  memo: string;
  active: boolean;
}

export function createInitialDeptForm(
  departments: FlDepartment[],
  selectedDeptId: string,
  dept?: FlDepartment
): DeptFormState {
  if (dept) {
    return {
      name: dept.name,
      parentId: dept.parentDepartmentId || '',
      managerId: dept.managerId || '',
      sortOrder: String(dept.sortOrder ?? 100),
      tags: Array.isArray(dept.functionalTags) ? [...dept.functionalTags] : [],
      memo: dept.memo || '',
      active: dept.isActive,
    };
  }
  const defaultRootDeptId =
    departments.find((d) => !d.parentDepartmentId)?.id || departments[0]?.id || '';
  return {
    name: '',
    parentId:
      selectedDeptId !== 'ALL' && selectedDeptId !== 'UNASSIGNED' ? selectedDeptId : defaultRootDeptId,
    managerId: '',
    sortOrder: String((departments.length + 1) * 10),
    tags: [],
    memo: '',
    active: true,
  };
}

export interface EmployeeDetailFormState {
  empNo: string;
  name: string;
  deptId: string;
  position: string;
  duty: string;
  tier: TierLevel;
  maskPrice: boolean;
  mustChangePw: boolean;
  status: EmploymentStatus;
  joinDate: string;
  retireDate: string;
  birthDate: string;
  residentRegNo: string;
  residentVisible: boolean;
  profileImageUrl: string;
  leaveGrant: string;
  leaveUsed: string;
  pledgeDate: string;
  pledgeScanName: string;
  pledgeScanUrl: string;
  phone: string;
  email: string;
  address: string;
  emergency: string;
  memo: string;
  effectiveDate: string;
  reason: string;
  salary: string;
  hourlyWage: string;
  mealAllowance: string;
  vehicleAllowance: string;
  serviceContract: string;
  bank: string;
  accountHolder: string;
  account: string;
  insPension: boolean;
  insHealth: boolean;
  insEmployment: boolean;
  insAccident: boolean;
}

export function createEmployeeDetailForm(u: FlUser): EmployeeDetailFormState {
  return {
    empNo: u.employeeNo || '',
    name: u.name,
    deptId: u.departmentId || '',
    position: u.position || '',
    duty: u.duty || '',
    tier: u.tierLevel,
    maskPrice: u.maskSalesPrice,
    mustChangePw: Boolean(u.mustChangePassword),
    status: (u.status as EmploymentStatus) || 'ACTIVE',
    joinDate: u.joinDate || '',
    retireDate: u.retireDate || '',
    birthDate: u.birthDate || '',
    residentRegNo: u.residentRegNo || '',
    residentVisible: false,
    profileImageUrl: u.profileImageUrl || '',
    leaveGrant: String(u.annualLeaveGrant ?? 15),
    leaveUsed: String(u.annualLeaveUsed ?? 0),
    pledgeDate: u.pledgeDate || '',
    pledgeScanName: u.pledgeScanName || '',
    pledgeScanUrl: u.pledgeScanUrl || '',
    phone: u.phone || '',
    email: u.email || '',
    address: u.address || '',
    emergency: u.emergencyContact || '',
    memo: u.memo || '',
    effectiveDate: new Date().toISOString().slice(0, 10),
    reason: '',
    salary: String(u.baseSalaryKrw || 0),
    hourlyWage: String(u.hourlyWageKrw || 0),
    mealAllowance: String(u.mealAllowanceKrw || 0),
    vehicleAllowance: String(u.vehicleAllowanceKrw || 0),
    serviceContract: String(u.serviceContractKrw || 0),
    bank: u.payrollBankName || '',
    accountHolder: u.payrollAccountHolder || '',
    account: u.payrollAccountNo || '',
    insPension: u.insNationalPension !== false,
    insHealth: u.insHealthInsurance !== false,
    insEmployment: u.insEmploymentInsurance !== false,
    insAccident: u.insIndustrialAccident !== false,
  };
}

export function hasEmployeeAppointmentChanged(
  selectedUser: FlUser | null,
  form: EmployeeDetailFormState
): boolean {
  if (!selectedUser) return false;
  return (
    (selectedUser.departmentId || '') !== form.deptId ||
    (selectedUser.position || '') !== form.position.trim() ||
    selectedUser.tierLevel !== form.tier ||
    selectedUser.status !== form.status
  );
}

export function buildEmployeeHrPatch(
  selectedUser: FlUser | null,
  form: EmployeeDetailFormState,
  canResetPassword: boolean
): UpdateEmployeeHrInput['patch'] {
  const prevResident = (selectedUser?.residentRegNo || '').trim();
  const prevPhoto = selectedUser?.profileImageUrl || '';
  const prevScanUrl = selectedUser?.pledgeScanUrl || '';
  return {
    name: form.name.trim(),
    employeeNo: form.empNo.trim() || null,
    departmentId: form.deptId || null,
    position: form.position.trim() || null,
    duty: form.duty.trim() || null,
    tierLevel: form.tier,
    maskSalesPrice: form.maskPrice,
    mustChangePassword: form.mustChangePw,
    status: form.status,
    joinDate: form.joinDate.trim() || null,
    retireDate: form.status === 'RETIRED' ? form.retireDate.trim() || form.effectiveDate : null,
    birthDate: form.birthDate.trim() || null,
    ...(canResetPassword && form.residentRegNo.trim() !== prevResident
      ? { residentRegNo: form.residentRegNo.trim() || null }
      : {}),
    ...(form.profileImageUrl !== prevPhoto ? { profileImageUrl: form.profileImageUrl || null } : {}),
    annualLeaveGrant: Math.max(0, Math.round(Number(form.leaveGrant || 0) * 10) / 10),
    annualLeaveUsed: Math.max(0, Math.round(Number(form.leaveUsed || 0) * 10) / 10),
    pledgeDate: form.pledgeDate.trim() || null,
    pledgeScanName: form.pledgeScanName.trim() || null,
    ...(form.pledgeScanUrl !== prevScanUrl ? { pledgeScanUrl: form.pledgeScanUrl || null } : {}),
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    address: form.address.trim() || null,
    emergencyContact: form.emergency.trim() || null,
    memo: form.memo.trim() || null,
  };
}
