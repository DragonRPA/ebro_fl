import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
} from '../core/supabase';
import { encryptSecret, hashPassword } from '../utils/cryptoVault';
import {
  type CurrencyCode,
  type FlDepartment,
  type FlUser,
  type HrEventType,
  type TierLevel,
} from '../types/domain';
export interface SaveDepartmentInput {
  id?: string;
  name: string;
  parentDepartmentId?: string | null;
  managerId?: string | null;
  functionalTags: string[];
  sortOrder?: number;
  memo?: string | null;
  isActive?: boolean;
}

export async function saveDepartment(input: SaveDepartmentInput): Promise<FlDepartment> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error('부서명을 입력하십시오.');
  if (input.id && input.parentDepartmentId === input.id) {
    throw new Error('자기 자신을 상위 부서로 지정할 수 없습니다.');
  }

  if (input.id && input.parentDepartmentId) {
    const deptRes = await flSupabase.from('departments').select('id, parent_department_id');
    if (deptRes.error) {
      throw new Error(deptRes.error.message || '부서 계층 조회 실패');
    }
    const parentMap = new Map<string, string | null>();
    for (const row of deptRes.data || []) {
      const rec = row as { id: string; parent_department_id: string | null };
      parentMap.set(rec.id, rec.parent_department_id || null);
    }
    let cur: string | null = input.parentDepartmentId;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      if (cur === input.id) {
        throw new Error('하위 부서를 상위 부서로 지정할 수 없습니다.');
      }
      visited.add(cur);
      cur = parentMap.get(cur) || null;
    }
  }

  const now = new Date().toISOString();
  const isNew = !input.id;
  const id = input.id || newId('DEPT');
  const dept: FlDepartment = {
    id,
    tenantId: DEFAULT_TENANT_ID,
    name: cleanName,
    parentDepartmentId: input.parentDepartmentId || null,
    managerId: input.managerId || null,
    functionalTags: Array.isArray(input.functionalTags) ? input.functionalTags : [],
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100,
    memo: input.memo?.trim() || null,
    isActive: input.isActive !== false,
  };

  if (isNew) {
    await execDbMutation('부서 등록', () =>
      flSupabase.from('departments').insert({
        ...camelToSnakeRow({
          ...dept,
          createdAt: now,
          updatedAt: now,
        }),
      })
    );
  } else {
    await execDbMutation('부서 정보 수정', () =>
      flSupabase
        .from('departments')
        .update({
          name: dept.name,
          parent_department_id: dept.parentDepartmentId,
          manager_id: dept.managerId,
          functional_tags: dept.functionalTags,
          sort_order: dept.sortOrder,
          memo: dept.memo,
          is_active: dept.isActive,
          updated_at: now,
        })
        .eq('id', dept.id)
    );
  }

  return dept;
}

export interface CreateEmployeeUserInput {
  loginId: string;
  initialPassword: string;
  name: string;
  employeeNo?: string | null;
  departmentId?: string | null;
  position?: string | null;
  duty?: string | null;
  tierLevel: TierLevel;
  maskSalesPrice?: boolean;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  joinDate?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  baseSalaryKrw?: number;
  payrollBankName?: string | null;
  payrollAccountNo?: string | null;
  profileImageUrl?: string | null;
  residentRegNo?: string | null;
  annualLeaveGrant?: number;
  annualLeaveUsed?: number;
  pledgeDate?: string | null;
  pledgeScanName?: string | null;
  pledgeScanUrl?: string | null;
  mustChangePassword?: boolean;
  payrollAccountHolder?: string | null;
  hourlyWageKrw?: number;
  mealAllowanceKrw?: number;
  vehicleAllowanceKrw?: number;
  serviceContractKrw?: number;
  insNationalPension?: boolean;
  insHealthInsurance?: boolean;
  insEmploymentInsurance?: boolean;
  insIndustrialAccident?: boolean;
  memo?: string | null;
  status?: string;
  actor: { id: string; name: string };
}

function roundKrw(val: unknown): number {
  const n = Number(val ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function roundLeaveDays(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : fallback;
}

interface ExistingUserIdentifierRow {
  id: string;
  loginId: string;
  employeeNo: string | null;
}

async function fetchExistingUserIdentifiers(): Promise<ExistingUserIdentifierRow[]> {
  const res = await flSupabase.from('users').select('id, login_id, employee_no');
  if (res.error) {
    throw new Error(res.error.message || '임직원 식별자 조회 실패');
  }
  return (res.data || []).map((row) => {
    const rec = row as { id: string; login_id: string; employee_no: string | null };
    return {
      id: rec.id,
      loginId: rec.login_id || '',
      employeeNo: rec.employee_no || null,
    };
  });
}

function nextSequentialEmployeeNo(existingUsers: ExistingUserIdentifierRow[]): string {
  const used = new Set<string>();
  let maxSeq = 2600;
  for (const row of existingUsers) {
    const emp = (row.employeeNo || '').trim().toUpperCase();
    if (!emp) continue;
    used.add(emp);
    const m = /^EMP-(\d+)$/.exec(emp);
    if (m) {
      const num = Number(m[1]);
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }
  }
  let seq = maxSeq + 1;
  while (used.has(`EMP-${seq}`)) seq++;
  return `EMP-${seq}`;
}

function assertUniqueUserIdentifiers(
  existingUsers: ExistingUserIdentifierRow[],
  params: { excludeUserId?: string; loginId?: string; employeeNo?: string | null }
): void {
  const cleanLoginLower = params.loginId?.trim().toLowerCase() || '';
  const cleanEmpUpper = params.employeeNo?.trim().toUpperCase() || '';
  for (const row of existingUsers) {
    if (params.excludeUserId && row.id === params.excludeUserId) continue;
    const rowLoginLower = row.loginId.trim().toLowerCase();
    const rowEmpUpper = (row.employeeNo || '').trim().toUpperCase();
    if (cleanLoginLower) {
      if (rowLoginLower === cleanLoginLower) {
        throw new Error('이미 사용 중인 로그인 아이디입니다.');
      }
      if (rowEmpUpper && rowEmpUpper === cleanLoginLower.toUpperCase()) {
        throw new Error('다른 임직원의 사번과 동일한 로그인 아이디는 사용할 수 없습니다.');
      }
    }
    if (cleanEmpUpper) {
      if (rowEmpUpper && rowEmpUpper === cleanEmpUpper) {
        throw new Error('이미 등록된 사번입니다.');
      }
      if (rowLoginLower && rowLoginLower.toUpperCase() === cleanEmpUpper) {
        throw new Error('다른 임직원의 로그인 아이디와 동일한 사번은 사용할 수 없습니다.');
      }
    }
  }
}

export async function createEmployeeUser(input: CreateEmployeeUserInput): Promise<FlUser> {
  const loginId = input.loginId.trim();
  const name = input.name.trim();
  if (!loginId) throw new Error('로그인 아이디를 입력하십시오.');
  if (!name) throw new Error('성명을 입력하십시오.');
  if (!input.initialPassword || input.initialPassword.trim().length < 4) {
    throw new Error('초기 비밀번호는 4자 이상이어야 합니다.');
  }

  const existingUsers = await fetchExistingUserIdentifiers();
  const explicitEmpNo = (input.employeeNo || '').trim();
  const employeeNo = explicitEmpNo || nextSequentialEmployeeNo(existingUsers);
  assertUniqueUserIdentifiers(existingUsers, { loginId, employeeNo });

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const status = input.status || 'ACTIVE';
  const id = newId('USR');
  const passwordHash = hashPassword(input.initialPassword.trim());

  const cleanResidentRegNo = input.residentRegNo?.trim() || null;

  const user: FlUser = {
    id,
    tenantId: DEFAULT_TENANT_ID,
    loginId,
    passwordHash,
    name,
    employeeNo,
    departmentId: input.departmentId || null,
    position: input.position?.trim() || '사원',
    duty: input.duty?.trim() || null,
    tierLevel: input.tierLevel,
    maskSalesPrice: Boolean(input.maskSalesPrice),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    birthDate: input.birthDate?.trim() || null,
    joinDate: input.joinDate?.trim() || today,
    retireDate: null,
    address: input.address?.trim() || null,
    emergencyContact: input.emergencyContact?.trim() || null,
    baseSalaryKrw: roundKrw(input.baseSalaryKrw),
    payrollBankName: input.payrollBankName?.trim() || null,
    payrollAccountNo: input.payrollAccountNo?.trim() || null,
    profileImageUrl: input.profileImageUrl?.trim() || null,
    residentRegNo: cleanResidentRegNo,
    annualLeaveGrant: roundLeaveDays(input.annualLeaveGrant, 15),
    annualLeaveUsed: roundLeaveDays(input.annualLeaveUsed, 0),
    pledgeDate: input.pledgeDate?.trim() || null,
    pledgeScanName: input.pledgeScanName?.trim() || null,
    pledgeScanUrl: input.pledgeScanUrl?.trim() || null,
    mustChangePassword: Boolean(input.mustChangePassword),
    payrollAccountHolder: input.payrollAccountHolder?.trim() || null,
    // 통상임금은 자동계산하지 않고 담당자 수동 입력값만 저장한다.
    hourlyWageKrw: roundKrw(input.hourlyWageKrw),
    mealAllowanceKrw: roundKrw(input.mealAllowanceKrw),
    vehicleAllowanceKrw: roundKrw(input.vehicleAllowanceKrw),
    serviceContractKrw: roundKrw(input.serviceContractKrw),
    insNationalPension: input.insNationalPension !== false,
    insHealthInsurance: input.insHealthInsurance !== false,
    insEmploymentInsurance: input.insEmploymentInsurance !== false,
    insIndustrialAccident: input.insIndustrialAccident !== false,
    memo: input.memo?.trim() || null,
    status,
    isActive: status !== 'RETIRED',
  };

  await execDbMutation('임직원 신규 등록', () =>
    flSupabase.from('users').insert({
      ...camelToSnakeRow({
        ...user,
        residentRegNo: cleanResidentRegNo ? encryptSecret(cleanResidentRegNo) : null,
        createdAt: now,
        updatedAt: now,
      }),
    })
  );

  await execDbMutation('입사 이력 기록', () =>
    flSupabase.from('hr_histories').insert(
      camelToSnakeRow({
        id: newId('HRH'),
        tenantId: DEFAULT_TENANT_ID,
        userId: user.id,
        eventType: '입사등록',
        effectiveDate: user.joinDate || today,
        prevSummary: null,
        nextSummary: `${employeeNo} · ${user.name} · ${user.position || '사원'} · ${user.tierLevel}단계`,
        reason: '신규 임직원 입사 등록',
        actorId: input.actor.id,
        actorName: input.actor.name,
        createdAt: now,
      })
    )
  );

  return user;
}

export interface UpdateEmployeeHrInput {
  prevUser: FlUser;
  patch: {
    name?: string;
    employeeNo?: string | null;
    departmentId?: string | null;
    position?: string | null;
    duty?: string | null;
    tierLevel?: TierLevel;
    maskSalesPrice?: boolean;
    phone?: string | null;
    email?: string | null;
    birthDate?: string | null;
    joinDate?: string | null;
    retireDate?: string | null;
    address?: string | null;
    emergencyContact?: string | null;
    baseSalaryKrw?: number;
    payrollBankName?: string | null;
    payrollAccountNo?: string | null;
    profileImageUrl?: string | null;
    residentRegNo?: string | null;
    annualLeaveGrant?: number;
    annualLeaveUsed?: number;
    pledgeDate?: string | null;
    pledgeScanName?: string | null;
    pledgeScanUrl?: string | null;
    mustChangePassword?: boolean;
    payrollAccountHolder?: string | null;
    hourlyWageKrw?: number;
    mealAllowanceKrw?: number;
    vehicleAllowanceKrw?: number;
    serviceContractKrw?: number;
    insNationalPension?: boolean;
    insHealthInsurance?: boolean;
    insEmploymentInsurance?: boolean;
    insIndustrialAccident?: boolean;
    memo?: string | null;
    status?: string;
  };
  deptNameMap?: Record<string, string>;
  effectiveDate?: string;
  reason?: string;
  actor: { id: string; name: string };
}

export async function updateEmployeeHrRecord(input: UpdateEmployeeHrInput): Promise<void> {
  const { prevUser, patch, deptNameMap = {}, actor } = input;
  const now = new Date().toISOString();
  const effectiveDate = (input.effectiveDate || '').trim() || now.slice(0, 10);

  const nextName = patch.name !== undefined ? patch.name.trim() : prevUser.name;
  if (!nextName) throw new Error('성명을 입력하십시오.');

  const nextDeptId =
    patch.departmentId !== undefined ? patch.departmentId || null : prevUser.departmentId || null;
  const nextPosition =
    patch.position !== undefined ? patch.position?.trim() || null : prevUser.position || null;
  const nextDuty = patch.duty !== undefined ? patch.duty?.trim() || null : prevUser.duty || null;
  const nextTier = patch.tierLevel !== undefined ? patch.tierLevel : prevUser.tierLevel;
  const nextStatus = patch.status !== undefined ? patch.status : prevUser.status;
  if (prevUser.id === actor.id && nextStatus !== 'ACTIVE') {
    throw new Error('본인 계정을 직접 퇴사 또는 휴직 처리할 수 없습니다.');
  }
  const nextEmpNo =
    patch.employeeNo !== undefined
      ? patch.employeeNo?.trim() || null
      : prevUser.employeeNo || null;
  if (nextEmpNo && nextEmpNo.toUpperCase() !== (prevUser.employeeNo || '').trim().toUpperCase()) {
    const existingUsers = await fetchExistingUserIdentifiers();
    assertUniqueUserIdentifiers(existingUsers, {
      excludeUserId: prevUser.id,
      employeeNo: nextEmpNo,
    });
  }
  const nextIsActive = nextStatus !== 'RETIRED';
  const nextSalary =
    patch.baseSalaryKrw !== undefined
      ? roundKrw(patch.baseSalaryKrw)
      : roundKrw(prevUser.baseSalaryKrw);
  // 통상임금은 기본급 변경 시에도 절대 재계산하지 않고 기존 또는 수동 입력값만 유지한다.
  const nextHourlyWage =
    patch.hourlyWageKrw !== undefined
      ? roundKrw(patch.hourlyWageKrw)
      : roundKrw(prevUser.hourlyWageKrw);
  const nextMealAllowance =
    patch.mealAllowanceKrw !== undefined
      ? roundKrw(patch.mealAllowanceKrw)
      : roundKrw(prevUser.mealAllowanceKrw);
  const nextVehicleAllowance =
    patch.vehicleAllowanceKrw !== undefined
      ? roundKrw(patch.vehicleAllowanceKrw)
      : roundKrw(prevUser.vehicleAllowanceKrw);
  const nextServiceContract =
    patch.serviceContractKrw !== undefined
      ? roundKrw(patch.serviceContractKrw)
      : roundKrw(prevUser.serviceContractKrw);

  const nextResidentPlain =
    patch.residentRegNo !== undefined
      ? patch.residentRegNo?.trim() || null
      : prevUser.residentRegNo?.trim() || null;

  let nextRetireDate =
    patch.retireDate !== undefined ? patch.retireDate?.trim() || null : prevUser.retireDate || null;
  if (nextStatus === 'RETIRED' && !nextRetireDate) {
    nextRetireDate = effectiveDate;
  } else if (nextStatus === 'ACTIVE') {
    nextRetireDate = null;
  }

  const updateRow = {
    name: nextName,
    employee_no: nextEmpNo,
    department_id: nextDeptId,
    position: nextPosition,
    duty: nextDuty,
    tier_level: nextTier,
    mask_sales_price:
      patch.maskSalesPrice !== undefined ? Boolean(patch.maskSalesPrice) : prevUser.maskSalesPrice,
    phone: patch.phone !== undefined ? patch.phone?.trim() || null : prevUser.phone || null,
    email: patch.email !== undefined ? patch.email?.trim() || null : prevUser.email || null,
    birth_date:
      patch.birthDate !== undefined ? patch.birthDate?.trim() || null : prevUser.birthDate || null,
    join_date:
      patch.joinDate !== undefined ? patch.joinDate?.trim() || null : prevUser.joinDate || null,
    retire_date: nextRetireDate,
    address:
      patch.address !== undefined ? patch.address?.trim() || null : prevUser.address || null,
    emergency_contact:
      patch.emergencyContact !== undefined
        ? patch.emergencyContact?.trim() || null
        : prevUser.emergencyContact || null,
    base_salary_krw: nextSalary,
    payroll_bank_name:
      patch.payrollBankName !== undefined
        ? patch.payrollBankName?.trim() || null
        : prevUser.payrollBankName || null,
    payroll_account_no:
      patch.payrollAccountNo !== undefined
        ? patch.payrollAccountNo?.trim() || null
        : prevUser.payrollAccountNo || null,
    profile_image_url:
      patch.profileImageUrl !== undefined
        ? patch.profileImageUrl?.trim() || null
        : prevUser.profileImageUrl || null,
    resident_reg_no: nextResidentPlain ? encryptSecret(nextResidentPlain) : null,
    annual_leave_grant:
      patch.annualLeaveGrant !== undefined
        ? roundLeaveDays(patch.annualLeaveGrant, 15)
        : roundLeaveDays(prevUser.annualLeaveGrant, 15),
    annual_leave_used:
      patch.annualLeaveUsed !== undefined
        ? roundLeaveDays(patch.annualLeaveUsed, 0)
        : roundLeaveDays(prevUser.annualLeaveUsed, 0),
    pledge_date:
      patch.pledgeDate !== undefined ? patch.pledgeDate?.trim() || null : prevUser.pledgeDate || null,
    pledge_scan_name:
      patch.pledgeScanName !== undefined
        ? patch.pledgeScanName?.trim() || null
        : prevUser.pledgeScanName || null,
    pledge_scan_url:
      patch.pledgeScanUrl !== undefined
        ? patch.pledgeScanUrl?.trim() || null
        : prevUser.pledgeScanUrl || null,
    must_change_password:
      patch.mustChangePassword !== undefined
        ? Boolean(patch.mustChangePassword)
        : Boolean(prevUser.mustChangePassword),
    payroll_account_holder:
      patch.payrollAccountHolder !== undefined
        ? patch.payrollAccountHolder?.trim() || null
        : prevUser.payrollAccountHolder || null,
    hourly_wage_krw: nextHourlyWage,
    meal_allowance_krw: nextMealAllowance,
    vehicle_allowance_krw: nextVehicleAllowance,
    service_contract_krw: nextServiceContract,
    ins_national_pension:
      patch.insNationalPension !== undefined
        ? Boolean(patch.insNationalPension)
        : prevUser.insNationalPension !== false,
    ins_health_insurance:
      patch.insHealthInsurance !== undefined
        ? Boolean(patch.insHealthInsurance)
        : prevUser.insHealthInsurance !== false,
    ins_employment_insurance:
      patch.insEmploymentInsurance !== undefined
        ? Boolean(patch.insEmploymentInsurance)
        : prevUser.insEmploymentInsurance !== false,
    ins_industrial_accident:
      patch.insIndustrialAccident !== undefined
        ? Boolean(patch.insIndustrialAccident)
        : prevUser.insIndustrialAccident !== false,
    memo: patch.memo !== undefined ? patch.memo?.trim() || null : prevUser.memo || null,
    status: nextStatus,
    is_active: nextIsActive,
    updated_at: now,
  };

  await execDbMutation('임직원 인사원장 수정', () =>
    flSupabase.from('users').update(updateRow).eq('id', prevUser.id)
  );

  const historyRows: Record<string, unknown>[] = [];
  const pushHistory = (
    eventType: HrEventType,
    prevSummary: string | null,
    nextSummary: string | null
  ) => {
    historyRows.push(
      camelToSnakeRow({
        id: newId('HRH'),
        tenantId: DEFAULT_TENANT_ID,
        userId: prevUser.id,
        eventType,
        effectiveDate,
        prevSummary,
        nextSummary,
        reason: input.reason?.trim() || '인사원장 변경 반영',
        actorId: actor.id,
        actorName: actor.name,
        createdAt: now,
      })
    );
  };

  if ((prevUser.departmentId || null) !== nextDeptId) {
    const prevDeptLabel =
      (prevUser.departmentId ? deptNameMap[prevUser.departmentId] : '') ||
      prevUser.departmentName ||
      '미배정';
    const nextDeptLabel = (nextDeptId ? deptNameMap[nextDeptId] : '') || '미배정';
    pushHistory('부서이동', prevDeptLabel, nextDeptLabel);
  }
  if ((prevUser.position || null) !== nextPosition) {
    pushHistory('직책변경', prevUser.position || '-', nextPosition || '-');
  }
  if (prevUser.tierLevel !== nextTier) {
    pushHistory('티어변경', `${prevUser.tierLevel}단계`, `${nextTier}단계`);
  }

  const payDiffPrev: string[] = [];
  const payDiffNext: string[] = [];
  const addPayDiff = (label: string, prevVal: number, nextVal: number) => {
    if (prevVal !== nextVal) {
      payDiffPrev.push(`${label} ₩${prevVal.toLocaleString('ko-KR')}`);
      payDiffNext.push(`${label} ₩${nextVal.toLocaleString('ko-KR')}`);
    }
  };
  addPayDiff('기본급', roundKrw(prevUser.baseSalaryKrw), nextSalary);
  addPayDiff('통상임금', roundKrw(prevUser.hourlyWageKrw), nextHourlyWage);
  addPayDiff('식대', roundKrw(prevUser.mealAllowanceKrw), nextMealAllowance);
  addPayDiff('차량보조금', roundKrw(prevUser.vehicleAllowanceKrw), nextVehicleAllowance);
  addPayDiff('용역계약금액', roundKrw(prevUser.serviceContractKrw), nextServiceContract);
  if (payDiffPrev.length > 0) {
    pushHistory('급여변경', payDiffPrev.join(' · '), payDiffNext.join(' · '));
  }

  if (prevUser.status !== nextStatus) {
    const ev: HrEventType =
      nextStatus === 'RETIRED'
        ? '퇴사처리'
        : nextStatus === 'LEAVE_OF_ABSENCE'
          ? '휴직처리'
          : '복직처리';
    pushHistory(ev, prevUser.status, nextStatus);
  }
  if (historyRows.length === 0) {
    pushHistory(
      '인사정보수정',
      `${prevUser.name} · ${prevUser.employeeNo || '-'}`,
      `${nextName} · ${updateRow.employee_no || '-'}`
    );
  }

  await execDbMutation('인사 이력 기록', () =>
    flSupabase.from('hr_histories').insert(historyRows)
  );
}

export async function adminResetUserPassword(params: {
  targetUser: FlUser;
  newPassword: string;
  actor: { id: string; name: string };
  reason?: string;
}): Promise<void> {
  const cleanPw = params.newPassword.trim();
  if (cleanPw.length < 4) {
    throw new Error('초기화할 비밀번호는 4자 이상이어야 합니다.');
  }
  const now = new Date().toISOString();
  const passwordHash = hashPassword(cleanPw);

  await execDbMutation('비밀번호 초기화', () =>
    flSupabase
      .from('users')
      .update({ password_hash: passwordHash, must_change_password: true, updated_at: now })
      .eq('id', params.targetUser.id)
  );

  await execDbMutation('비밀번호 초기화 이력 기록', () =>
    flSupabase.from('hr_histories').insert(
      camelToSnakeRow({
        id: newId('HRH'),
        tenantId: DEFAULT_TENANT_ID,
        userId: params.targetUser.id,
        eventType: '비밀번호초기화',
        effectiveDate: now.slice(0, 10),
        prevSummary: '기존 비밀번호',
        nextSummary: '관리자 임시 비밀번호 발급',
        reason: params.reason?.trim() || '관리자 비밀번호 초기화',
        actorId: params.actor.id,
        actorName: params.actor.name,
        createdAt: now,
      })
    )
  );
}

export interface ManagedExchangeRateInput {
  rateDate: string;
  currencyCode: Exclude<CurrencyCode, 'KRW'>;
  baseRateKrw: number;
  ttSellingRate?: number | null;
  source: string;
}

export async function upsertManagedExchangeRates(params: {
  rows: ManagedExchangeRateInput[];
}): Promise<number> {
  const validRows = params.rows.filter(
    (r) => /^\d{4}-\d{2}-\d{2}$/.test((r.rateDate || '').trim()) && Number(r.baseRateKrw) > 0
  );
  if (validRows.length === 0) {
    throw new Error('적재할 유효한 환율 데이터가 없습니다.');
  }

  const dedupMap = new Map<string, Record<string, unknown>>();
  for (const r of validRows) {
    const rateDate = r.rateDate.trim();
    const factor = r.currencyCode === 'JPY' ? 10000 : 100;
    const baseRateKrw = Math.round(Number(r.baseRateKrw) * factor) / factor;
    const rawTts =
      r.ttSellingRate !== undefined && r.ttSellingRate !== null && Number(r.ttSellingRate) > 0
        ? Number(r.ttSellingRate)
        : baseRateKrw * 1.01;
    const ttSellingRate = Math.round(rawTts * factor) / factor;
    const compactDate = rateDate.replace(/-/g, '');
    const key = `${rateDate}__${r.currencyCode}`;
    dedupMap.set(
      key,
      camelToSnakeRow({
        id: `FX-${compactDate}-${r.currencyCode}`,
        tenantId: DEFAULT_TENANT_ID,
        rateDate,
        currencyCode: r.currencyCode,
        baseRateKrw,
        ttSellingRate,
        source: (r.source || '').trim() || '외환시장 고시환율',
      })
    );
  }

  const snakeRows = Array.from(dedupMap.values());
  await execDbMutation('3개월 관리 환율 적재', () =>
    flSupabase
      .from('exchange_rates')
      .upsert(snakeRows, { onConflict: 'tenant_id,rate_date,currency_code' })
  );
  return snakeRows.length;
}

/**
 * 거래처 마스터 상호명 변경 시 전 메뉴 13개 연관 테이블의 비정규화 거래처 명칭 컬럼을 일괄 동기화한다.
 */
export async function syncPartnerNameAcrossTables(params: {
  partnerId: string;
  newName: string;
  prevName?: string | null;
}): Promise<void> {
  const cleanName = params.newName.trim();
  if (!params.partnerId || !cleanName) return;

  const fkUpdates: Array<[string, string, string, string]> = [
    ['매입 원장 거래처명 동기화', 'purchases', 'supplier_id', 'supplier_name'],
    ['물류 운송 거래처명 동기화', 'logistics_dispatches', 'carrier_partner_id', 'carrier_name'],
    ['매입채무 거래처명 동기화', 'ap_payables', 'partner_id', 'partner_name'],
    ['전대자산 공급처명 동기화', 'inventory_units', 'sublease_supplier_id', 'sublease_supplier_name'],
    ['견적서 거래처명 동기화', 'quotations', 'partner_id', 'partner_name'],
    ['계약서 거래처명 동기화', 'contracts', 'partner_id', 'partner_name'],
    ['출고·회수 거래처명 동기화', 'fulfillments', 'partner_id', 'partner_name'],
    ['사후처리 고객사명 동기화', 'trade_aftercare_cases', 'partner_id', 'partner_name'],
    ['사후처리 공급사명 동기화', 'trade_aftercare_cases', 'supplier_partner_id', 'supplier_name'],
    ['렌탈 정비 거래처명 동기화', 'rental_maintenances', 'partner_id', 'partner_name'],
    ['청구 내역 거래처명 동기화', 'billings', 'partner_id', 'partner_name'],
    ['수납 내역 거래처명 동기화', 'collections', 'partner_id', 'partner_name'],
    ['금융리스 여신사명 동기화', 'finance_leases', 'lender_partner_id', 'lender_name'],
  ];

  for (const [label, table, idCol, nameCol] of fkUpdates) {
    await execDbMutation(label, () =>
      flSupabase.from(table).update({ [nameCol]: cleanName }).eq(idCol, params.partnerId)
    );
  }

  const prevClean = (params.prevName || '').trim();
  if (prevClean && prevClean !== cleanName) {
    await execDbMutation('통장거래 적요 거래처명 동기화', () =>
      flSupabase
        .from('bank_transactions')
        .update({ counterparty_name: cleanName })
        .eq('counterparty_name', prevClean)
    );
  }
}
