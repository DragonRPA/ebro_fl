// eBroFL v2.0 — 1단어 1뜻 전사 단일 도메인 타입 원천 (SSOT)
// Strictly erasableSyntaxOnly-compliant (zero TS enums / namespaces)

export type TierLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const TIER_LABELS: Record<TierLevel, string> = {
  1: '1단계 사원·기사',
  2: '2단계 주임·대리',
  3: '3단계 과장·차장',
  4: '4단계 팀장·부장',
  5: '5단계 상무·이사',
  6: '6단계 부사장',
  7: '7단계 대표이사',
};

export type FlPageId =
  | 'dashboard'
  | 'approval_inbox'
  | 'partners'
  | 'trade_item_masters'
  | 'rental_item_masters'
  | 'exchange_rates'
  | 'catalogs'
  | 'purchases'
  | 'logistics_costs'
  | 'quotations'
  | 'trade_contracts'
  | 'trade_inventory'
  | 'trade_fulfillment'
  | 'trade_performance'
  | 'rental_contracts'
  | 'rental_assets'
  | 'rental_fulfillment'
  | 'rental_maintenance'
  | 'rental_performance'
  | 'ar_billing_collection'
  | 'ap_settlements'
  | 'bank_matching'
  | 'financial_statements'
  | 'organization_hr'
  | 'operation_manual'
  | 'system_settings';

export interface MenuGroupDef {
  groupId: string;
  groupLabel: string;
  items: { pageId: FlPageId; label: string; shortDesc: string }[];
}

export const FL_MENU_GROUPS: MenuGroupDef[] = [
  {
    groupId: 'portal',
    groupLabel: '포털 · 결재',
    items: [
      { pageId: 'dashboard', label: '업무 대시보드', shortDesc: '결재 대기 · 출고 의뢰 · 만기 요약' },
      { pageId: 'approval_inbox', label: '결재함', shortDesc: '7단계 티어 결재 승인 · 반려 · 이력' },
    ],
  },
  {
    groupId: 'master',
    groupLabel: '기준정보 · 카탈로그',
    items: [
      { pageId: 'partners', label: '거래처 관리', shortDesc: '통합 거래처 역할 및 사업장 · 담당자' },
      { pageId: 'trade_item_masters', label: '유통 품목 관리', shortDesc: '판매 완제품 · 부품 · 대리점가 · 판매정가' },
      { pageId: 'rental_item_masters', label: '렌탈 품목 관리', shortDesc: '임대 기종 · 옵션 · 월·일 렌탈료 · 상각기준' },
      { pageId: 'exchange_rates', label: '환율 관리', shortDesc: '고시환율 등록 및 외화 환산 기준' },
      { pageId: 'catalogs', label: '제원 카탈로그', shortDesc: 'VDI 2198 제원 및 호환 부품 카탈로그' },
    ],
  },
  {
    groupId: 'procurement',
    groupLabel: '조달 · 물류',
    items: [
      { pageId: 'purchases', label: '매입 통관 관리', shortDesc: '수입 · 내수 매입 및 부대비용 원가배분' },
      { pageId: 'logistics_costs', label: '물류비 관리', shortDesc: '배차 운송비 기록 · 부담주체 · 정산' },
    ],
  },
  {
    groupId: 'trade',
    groupLabel: '유통 관리',
    items: [
      { pageId: 'quotations', label: '견적 관리', shortDesc: '유통 · 렌탈 견적 작성 및 계약 전환' },
      { pageId: 'trade_contracts', label: '유통 계약 관리', shortDesc: '유통 수주 · 계약서 발송 · 출고의뢰' },
      { pageId: 'trade_inventory', label: '유통 재고 조회', shortDesc: '시리얼 · 로트 선입선출 및 계정대체' },
      { pageId: 'trade_fulfillment', label: '유통 출고 관리', shortDesc: '출고 실행완료 · 공급사 중개 · 반품처리' },
      { pageId: 'trade_performance', label: '유통 실적 조회', shortDesc: '유통 매출 · 원가 · 반품차감 손익집계' },
    ],
  },
  {
    groupId: 'rental',
    groupLabel: '렌탈 · 정비',
    items: [
      { pageId: 'rental_contracts', label: '렌탈 계약 관리', shortDesc: '렌탈 계약 · 교환 · 회수 의뢰 관리' },
      { pageId: 'rental_assets', label: '렌탈 자산 관리', shortDesc: '자사 · 리스 · 전대 자산 및 상각 스케줄' },
      { pageId: 'rental_fulfillment', label: '렌탈 입출고 관리', shortDesc: '출고 · 교환 · 회수 실행완료 및 일수산정' },
      { pageId: 'rental_maintenance', label: '렌탈 정비 관리', shortDesc: '주기장 · 현장 · 순회정비 및 가동시간' },
      { pageId: 'rental_performance', label: '렌탈 실적 조회', shortDesc: '일할 매출 · 상각 · 리스이자 · 정비손익' },
    ],
  },
  {
    groupId: 'finance',
    groupLabel: '정산 · 회계 · 설정',
    items: [
      { pageId: 'ar_billing_collection', label: '청구 수납 관리', shortDesc: '청구 생성 · 세금계산서 · 수납 · 거래명세서' },
      { pageId: 'ap_settlements', label: '매입 비용 정산', shortDesc: '매입채무 · 물류비 · 외주비 · 리스이자 정산' },
      { pageId: 'bank_matching', label: '통장 입출금 대사', shortDesc: '통장 거래내역과 청구 · 채무 대사' },
      { pageId: 'financial_statements', label: '재무제표 조회', shortDesc: '재무상태표 · 손익계산서 · 리스명세 · 회계기준' },
      { pageId: 'organization_hr', label: '조직 인사 관리', shortDesc: '부서 조직도 · 임직원 인사원장 · 발령 이력' },
      { pageId: 'operation_manual', label: '업무 매뉴얼', shortDesc: '화면별 기본기능 · 조작순서 검색' },
      { pageId: 'system_settings', label: '시스템 설정', shortDesc: '7단계 티어 · 결재선 · 양식 · 문서발송 설정' },
    ],
  },
];

export const ALL_FL_PAGE_IDS: FlPageId[] = FL_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.pageId));

export function defaultTierPagePermission(
  pageId: FlPageId,
  tierLevel: TierLevel
): { canView: boolean; canEdit: boolean; canApprove: boolean } {
  if (tierLevel >= 7) {
    return { canView: true, canEdit: true, canApprove: true };
  }
  if (pageId === 'organization_hr') {
    return {
      canView: tierLevel >= 4,
      canEdit: tierLevel >= 4,
      canApprove: tierLevel >= 5,
    };
  }
  if (pageId === 'system_settings' || pageId === 'financial_statements') {
    return {
      canView: tierLevel >= 4,
      canEdit: tierLevel >= 4,
      canApprove: tierLevel >= 4,
    };
  }
  return {
    canView: true,
    canEdit: tierLevel >= 2,
    canApprove: tierLevel >= 3,
  };
}

export type PartnerRole =
  | '매출처'
  | '대리점'
  | '금융사'
  | '매입처'
  | '전대공급처'
  | '운송사'
  | '외주정비처';

export type ItemCategory = '완제품' | '어태치먼트' | '부품' | '소모품';
export type ItemDomain = 'TRADE' | 'RENTAL' | 'BOTH';
export type ManagementType = 'SERIAL' | 'LOT';
export type OwnershipDomain = '유통재고' | '렌탈자산' | '전대자산';
export type UnitStatus = '보유중' | '출고대기' | '대여중' | '정비중' | '판매완료' | '전대반납' | '폐기';
export type CurrencyCode = 'KRW' | 'USD' | 'CNY' | 'EUR' | 'JPY';
export type DocumentTemplateType = '견적서_유통' | '견적서_렌탈' | '계약서_유통' | '계약서_렌탈' | '거래명세서';

export interface OfficialMailConfig {
  smtpProvider?: 'GMAIL' | 'NAVER' | 'OUTLOOK' | 'CUSTOM';
  smtpHost?: string;
  smtpPort?: number;
  googleEmail?: string;
  gmailAppPassword?: string;
  senderName?: string;
  isDevMode?: boolean;
  updatedAt?: string;
}

export interface TenantFeatures {
  bankMatchingEnabled?: boolean;
  autoTaxInvoice?: boolean;
  officialMailConfig?: OfficialMailConfig;
  specialFeatures?: string[];
  [key: string]: unknown;
}

export interface TenantProfile {
  id: string;
  tenantCode: string;
  subdomain: string;
  solutionType: string;
  displayName: string;
  corporateName: string;
  businessNumber: string;
  representativeName: string;
  businessAddress: string;
  businessCategory: string;
  businessItem: string;
  tel: string;
  fax: string;
  taxEmail: string;
  stampImageUrl?: string;
  stampBase64?: string;
  allowedPages: string[];
  hiddenPages: string[];
  features: TenantFeatures;
}

export type EmploymentStatus = 'ACTIVE' | 'LEAVE_OF_ABSENCE' | 'RETIRED';

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: '재직',
  LEAVE_OF_ABSENCE: '휴직',
  RETIRED: '퇴사',
};

export type DepartmentFuncTag =
  | '경영관리'
  | '영업'
  | '유통출고'
  | '렌탈자산'
  | '정비'
  | '물류'
  | '재무회계';

export const ALL_DEPARTMENT_FUNC_TAGS: DepartmentFuncTag[] = [
  '경영관리',
  '영업',
  '유통출고',
  '렌탈자산',
  '정비',
  '물류',
  '재무회계',
];

export type HrEventType =
  | '입사등록'
  | '부서이동'
  | '직책변경'
  | '티어변경'
  | '급여변경'
  | '휴직처리'
  | '복직처리'
  | '퇴사처리'
  | '비밀번호변경'
  | '비밀번호초기화'
  | '인사정보수정';

export interface FlDepartment {
  id: string;
  tenantId: string;
  name: string;
  parentDepartmentId?: string | null;
  managerId?: string | null;
  managerName?: string;
  functionalTags: string[];
  sortOrder: number;
  memo?: string | null;
  isActive: boolean;
}

export interface FlUser {
  id: string;
  tenantId: string;
  loginId: string;
  passwordHash: string;
  name: string;
  employeeNo?: string | null;
  departmentId?: string | null;
  departmentName?: string;
  position?: string | null;
  duty?: string | null;
  tierLevel: TierLevel;
  maskSalesPrice: boolean;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  joinDate?: string | null;
  retireDate?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  baseSalaryKrw: number;
  payrollBankName?: string | null;
  payrollAccountNo?: string | null;
  profileImageUrl?: string | null;
  residentRegNo?: string | null;
  annualLeaveGrant: number;
  annualLeaveUsed: number;
  pledgeDate?: string | null;
  pledgeScanName?: string | null;
  pledgeScanUrl?: string | null;
  mustChangePassword: boolean;
  payrollAccountHolder?: string | null;
  hourlyWageKrw: number;
  mealAllowanceKrw: number;
  vehicleAllowanceKrw: number;
  serviceContractKrw: number;
  insNationalPension: boolean;
  insHealthInsurance: boolean;
  insEmploymentInsurance: boolean;
  insIndustrialAccident: boolean;
  memo?: string | null;
  status: string;
  isActive: boolean;
}

export interface FlHrHistory {
  id: string;
  tenantId: string;
  userId: string;
  eventType: HrEventType | string;
  effectiveDate: string;
  prevSummary?: string | null;
  nextSummary?: string | null;
  reason?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  createdAt?: string;
}

export interface FlUserPermission {
  id: string;
  tenantId: string;
  userId?: string | null;
  tierLevel?: TierLevel | null;
  pageId: FlPageId;
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
}

export type ApprovalActionCode =
  | 'PURCHASE_CONFIRM'
  | 'LEASE_CREATE'
  | 'ACCOUNT_TRANSFER'
  | 'TRADE_CONTRACT_CONFIRM'
  | 'RENTAL_CONTRACT_CONFIRM'
  | 'FULFILLMENT_COMPLETE'
  | 'EXCHANGE_EXECUTE'
  | 'TRADE_REFUND'
  | 'BILLING_CREATE'
  | 'AP_SETTLEMENT_PAY'
  | 'ASSET_DISPOSAL'
  | 'POLICY_CONFIG_SAVE'
  | 'HR_APPOINTMENT';

export interface FlApprovalPolicy {
  id: string;
  tenantId: string;
  actionCode: ApprovalActionCode;
  actionName: string;
  description?: string | null;
  requiredTier: TierLevel;
  requiresApproval: boolean;
  isActive: boolean;
}

export interface FlApprovalRequest {
  id: string;
  tenantId: string;
  actionCode: ApprovalActionCode | string;
  targetTable: string;
  targetId: string;
  title: string;
  payload: Record<string, unknown>;
  requiredTier: TierLevel;
  requesterId: string;
  requesterName: string;
  requesterTier: TierLevel;
  approverId?: string | null;
  approverName?: string | null;
  approverTier?: TierLevel | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejectReason?: string | null;
  requestedAt: string;
  decidedAt?: string | null;
  executedAt?: string | null;
}

export interface FlDocumentTemplate {
  id: string;
  tenantId: string;
  docType: DocumentTemplateType;
  templateName: string;
  templatePath?: string | null;
  templateBase64?: string | null;
  headerNote?: string | null;
  footerNote?: string | null;
  isDefault: boolean;
  updatedBy?: string | null;
  updatedAt?: string;
}

export type PaymentMethodType = '계좌이체' | '전자어음' | '약속어음' | '법인카드' | '현금';

export const PAYMENT_METHODS: readonly PaymentMethodType[] = [
  '계좌이체',
  '전자어음',
  '약속어음',
  '법인카드',
  '현금',
] as const;

export type PaymentCycleType = '선입금' | '당월' | '익월' | '익익월' | '3개월후';

export const PAYMENT_CYCLES: readonly PaymentCycleType[] = [
  '선입금',
  '당월',
  '익월',
  '익익월',
  '3개월후',
] as const;

export const KOREAN_BANK_LIST: readonly string[] = [
  '국민은행',
  '신한은행',
  '기업은행',
  '우리은행',
  '하나은행',
  '농협은행',
  '산업은행',
  '아이엠뱅크',
  '부산은행',
  '경남은행',
  '광주은행',
  '전북은행',
  '제주은행',
  '수협은행',
  '새마을금고',
  '신협',
  '우체국',
  '카카오뱅크',
  '케이뱅크',
  '토스뱅크',
  '제일은행',
  '씨티은행',
] as const;

export function normalizePaymentMethod(raw?: string | null): PaymentMethodType {
  const s = String(raw || '').trim();
  if (s === '계좌이체' || s === '전자어음' || s === '약속어음' || s === '법인카드' || s === '현금') {
    return s;
  }
  if (s === '어음') return '약속어음';
  if (s === '카드') return '법인카드';
  return '계좌이체';
}

export function cycleToMonthOffset(cycle?: string | null): number {
  const s = String(cycle || '').trim();
  if (s === '선입금' || s === '당월') return 0;
  if (s === '익월') return 1;
  if (s === '익익월') return 2;
  if (s === '3개월후') return 3;
  return 1;
}

export function offsetToPaymentCycle(
  offset?: number | null,
  currentCycle?: string | null
): PaymentCycleType {
  const cur = String(currentCycle || '').trim();
  if (cur === '선입금' || cur === '당월' || cur === '익월' || cur === '익익월' || cur === '3개월후') {
    return cur;
  }
  const n = Number(offset);
  if (n === 0) return '당월';
  if (n === 1) return '익월';
  if (n === 2) return '익익월';
  if (n >= 3) return '3개월후';
  return '익월';
}

export const DAY_OF_MONTH_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 31, label: '말일' },
  ...Array.from({ length: 30 }, (_, i) => ({ value: i + 1, label: `${i + 1}일` })),
];

export function formatDayOfMonthLabel(day?: number | null): string {
  const d = Number(day);
  if (!Number.isFinite(d) || d >= 31) return '말일';
  if (d <= 0) return '1일';
  return `${Math.trunc(d)}일`;
}

export function formatClosingDayLabel(day?: number | null): string {
  return `매월 ${formatDayOfMonthLabel(day ?? 31)}`;
}

export function formatPaymentTermsLabel(
  cycle?: string | null,
  dueDay?: number | null,
  monthOffset?: number | null
): string {
  const resolved = offsetToPaymentCycle(monthOffset, cycle);
  if (resolved === '선입금') return '선입금';
  return `${resolved} ${formatDayOfMonthLabel(dueDay ?? 10)}`;
}

export function computeDueDateFromCycle(
  baseYmOrDate: string,
  cycle?: string | null,
  monthOffset?: number | null,
  dueDay?: number | null,
  fallbackDate?: string
): string {
  const resolved = offsetToPaymentCycle(monthOffset, cycle);
  if (resolved === '선입금') {
    if (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) return fallbackDate;
    if (/^\d{4}-\d{2}-\d{2}$/.test(baseYmOrDate)) return baseYmOrDate;
  }
  const m = /^(\d{4})-(\d{2})/.exec(String(baseYmOrDate || ''));
  if (!m) {
    return fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)
      ? fallbackDate
      : new Date().toISOString().slice(0, 10);
  }
  const baseYear = Number(m[1]);
  const baseMonth = Number(m[2]);
  const addMonths = resolved === '선입금' ? 0 : cycleToMonthOffset(resolved);
  const targetUtc = new Date(Date.UTC(baseYear, baseMonth - 1 + addMonths, 1));
  const targetYear = targetUtc.getUTCFullYear();
  const targetMonth = targetUtc.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const rawDay = resolved === '선입금' ? 1 : Number(dueDay ?? 10);
  const finalDay = rawDay >= 31 ? lastDay : Math.min(lastDay, Math.max(1, Math.trunc(rawDay || 10)));
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
}

export interface FlPartner {
  id: string;
  tenantId: string;
  name: string;
  bizRegNo?: string | null;
  representative?: string | null;
  bizType?: string | null;
  bizItem?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxEmail?: string | null;
  partnerRoles: PartnerRole[];
  defaultClosingDay: number;
  defaultPaymentCycle: PaymentCycleType;
  defaultPaymentDueDay: number;
  defaultPaymentMonthOffset: number;
  paymentMethod: PaymentMethodType | string;
  bankName?: string | null;
  bankAccount?: string | null;
  bankHolder?: string | null;
  creditGrade?: string | null;
  isActive: boolean;
  memo?: string | null;
  bizCertUrl?: string | null;
  bizCertName?: string | null;
  bankbookUrl?: string | null;
  bankbookName?: string | null;
}

export interface FlPartnerSite {
  id: string;
  tenantId: string;
  partnerId: string;
  siteName: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  isPrimary: boolean;
  isActive: boolean;
  memo?: string | null;
}

export interface FlItemMaster {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  itemCategory: ItemCategory;
  itemDomain: ItemDomain;
  managementType: ManagementType;
  manufacturer?: string | null;
  modelName?: string | null;
  tonnage?: number | null;
  powerType?: string | null;
  specSummary?: string | null;
  unitName: string;
  standardCostKrw: number;
  dealerPriceKrw: number;
  retailPriceKrw: number;
  standardMonthlyRentalKrw: number;
  standardDailyRentalKrw: number;
  depreciationMonths: number;
  residualValueKrw: number;
  warehouseLocation: string;
  diagramType?: string | null;
  imageUrl?: string | null;
  specSheetUrl?: string | null;
  manualUrl?: string | null;
  vdiSpecs: Record<string, unknown>[];
  mastSpecs: Record<string, unknown>[];
  batteryOptions: Record<string, unknown>[];
  oemCrossRefCodes: string[];
  compatibleModels: string[];
  isActive: boolean;
  memo?: string | null;
}

export interface FlCatalogPackage {
  id: string;
  tenantId: string;
  catalogCode: string;
  title: string;
  subtitle?: string | null;
  targetPartnerRole: string;
  targetModels: string[];
  selectedItemSkus: string[];
  showUnitPrice: boolean;
  showStock: boolean;
  headerNotice?: string | null;
  footerContact?: string | null;
  isDefault: boolean;
}

export interface FlExchangeRate {
  id: string;
  tenantId: string;
  rateDate: string;
  currencyCode: Exclude<CurrencyCode, 'KRW'>;
  baseRateKrw: number;
  ttSellingRate?: number | null;
  source: string;
}

export interface FlPurchase {
  id: string;
  tenantId: string;
  purchaseNo: string;
  purchaseType: 'IMPORT' | 'DOMESTIC';
  supplierId: string;
  supplierName: string;
  targetDomain: 'TRADE' | 'RENTAL';
  blNo?: string | null;
  lcNo?: string | null;
  currencyCode: CurrencyCode;
  fxRate: number;
  fxDate?: string | null;
  foreignMerchandiseTotal: number;
  krwMerchandiseTotal: number;
  customsDutyKrw: number;
  oceanFreightKrw: number;
  clearanceFeeKrw: number;
  inlandFreightKrw: number;
  totalLandedCostKrw: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlPurchaseLine {
  id: string;
  tenantId: string;
  purchaseId: string;
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory: ItemCategory;
  managementType: ManagementType;
  quantity: number;
  foreignUnitPrice: number;
  foreignAmount: number;
  allocatedMerchandiseKrw: number;
  allocatedAncillaryKrw: number;
  landedUnitCostKrw: number;
  landedTotalCostKrw: number;
  serialList: string[];
  lotNo?: string | null;
  warehouseLocation: string;
}

export interface FlLogisticsDispatch {
  id: string;
  tenantId: string;
  dispatchNo: string;
  dispatchPurpose: '일반운송' | '납품운송' | '회수운송' | '교환' | '자체이동';
  carrierPartnerId?: string | null;
  carrierName: string;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleNo?: string | null;
  originAddress: string;
  destinationAddress: string;
  relatedRefType?: string | null;
  relatedRefId?: string | null;
  transportCostKrw: number;
  vatKrw: number;
  costBearer: 'OURS' | 'CUSTOMER' | 'SUPPLIER';
  customerChargeKrw: number;
  settlementStatus: 'UNSETTLED' | 'SETTLED' | 'PAID';
  settlementYm?: string | null;
  dispatchDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlApPayable {
  id: string;
  tenantId: string;
  payableNo: string;
  payableType: 'PURCHASE' | 'LOGISTICS' | 'FINANCE_LEASE' | 'SUBLEASE_RENT' | 'EXTERNAL_REPAIR';
  partnerId: string;
  partnerName: string;
  refTable?: string | null;
  refId?: string | null;
  currencyCode: CurrencyCode;
  bookedFxRate: number;
  foreignAmount: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  paidAmountKrw: number;
  settledFxRate?: number | null;
  fxGainLossKrw: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  dueDate?: string | null;
  accrualDate: string;
  paidDate?: string | null;
  memo?: string | null;
}

export interface FlInventoryUnit {
  id: string;
  tenantId: string;
  unitCode: string;
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory: ItemCategory;
  managementType: ManagementType;
  ownershipDomain: OwnershipDomain;
  serialNo?: string | null;
  lotNo?: string | null;
  qtyOnHand: number;
  qtyReserved: number;
  unitCostKrw: number;
  accumulatedDepreciationKrw: number;
  bookValueKrw: number;
  depreciationMonths: number;
  residualValueKrw: number;
  status: UnitStatus;
  acquisitionType: 'PURCHASE' | 'FINANCE_LEASE' | 'SUBLEASE' | 'ACCOUNT_TRANSFER' | 'RETURN';
  acquisitionDate: string;
  purchaseLineId?: string | null;
  financeLeaseId?: string | null;
  subleaseSupplierId?: string | null;
  subleaseSupplierName?: string | null;
  subleaseMonthlyCostKrw: number;
  currentContractId?: string | null;
  currentPartnerId?: string | null;
  currentSiteId?: string | null;
  warehouseLocation: string;
  operatingHours: number;
  monthlyRentalFeeKrw: number;
  dailyRentalFeeKrw: number;
  memo?: string | null;
}

export interface FlStockMovement {
  id: string;
  tenantId: string;
  movementType:
    | 'INBOUND'
    | 'ACCOUNT_TRANSFER'
    | 'TRADE_RESERVE'
    | 'TRADE_OUTBOUND'
    | 'TRADE_RETURN'
    | 'RENTAL_OUTBOUND'
    | 'RENTAL_RETURN'
    | 'EXCHANGE_OUT'
    | 'EXCHANGE_IN'
    | 'REPAIR_OUT'
    | 'DISPOSAL';
  unitId: string;
  itemId: string;
  fromDomain?: string | null;
  toDomain?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  qtyDelta: number;
  unitCostKrw: number;
  amountKrw: number;
  refTable?: string | null;
  refId?: string | null;
  actorId: string;
  actorName: string;
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface QuotationLine {
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory?: ItemCategory;
  managementType?: ManagementType;
  qty: number;
  unitPriceKrw: number;
  supplyAmountKrw: number;
  optionSummary?: string;
}

export interface FlQuotation {
  id: string;
  tenantId: string;
  quoteNo: string;
  quoteDomain: 'TRADE' | 'RENTAL';
  partnerId: string;
  partnerName: string;
  siteId?: string | null;
  salespersonId: string;
  salespersonName: string;
  quoteDate: string;
  validUntil: string;
  rentalMonths: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  lines: QuotationLine[];
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'CANCELLED';
  convertedContractId?: string | null;
  memo?: string | null;
}

export interface FlContract {
  id: string;
  tenantId: string;
  contractNo: string;
  contractDomain: 'TRADE' | 'RENTAL';
  quotationId?: string | null;
  partnerId: string;
  partnerName: string;
  siteId?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  salespersonId: string;
  salespersonName: string;
  contractDate: string;
  startDate: string;
  endDate: string;
  closingDay: number;
  paymentCycle: PaymentCycleType;
  paymentDueDay: number;
  paymentMonthOffset: number;
  paymentMethod: PaymentMethodType | string;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  monthlyRentalKrw: number;
  dailyRentalKrw: number;
  status: 'DRAFT' | 'ACTIVE' | 'FULFILLING' | 'COMPLETED' | 'TERMINATED' | 'CANCELLED';
  specialTerms?: string | null;
  memo?: string | null;
}

export interface FlContractLine {
  id: string;
  tenantId: string;
  contractId: string;
  lineNo: number;
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory: ItemCategory;
  managementType: ManagementType;
  quantity: number;
  fulfilledQty: number;
  unitPriceKrw: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  optionSummary?: string | null;
  assignedUnitId?: string | null;
  assignedSerialNo?: string | null;
  assignedLotNo?: string | null;
  lineStatus: 'ACTIVE' | 'FULFILLED' | 'REPLACED_OUT' | 'RETURNED' | 'CANCELLED';
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
  predecessorUnitId?: string | null;
  memo?: string | null;
}

export interface FlFulfillment {
  id: string;
  tenantId: string;
  fulfillmentNo: string;
  fulfillmentDomain: 'TRADE' | 'RENTAL';
  actionType: '유통출고' | '렌탈출고' | '렌탈회수' | '교환';
  contractId: string;
  contractLineId: string;
  partnerId: string;
  partnerName: string;
  siteId?: string | null;
  itemId: string;
  unitId?: string | null;
  replacementUnitId?: string | null;
  quantity: number;
  cogsAmountKrw: number;
  status: 'REQUESTED' | 'COMPLETED' | 'CANCELLED';
  effectiveDate?: string | null;
  recordedAt?: string | null;
  executedBy?: string | null;
  memo?: string | null;
}

export interface FlTradeAftercareCase {
  id: string;
  tenantId: string;
  caseNo: string;
  contractId: string;
  partnerId: string;
  partnerName: string;
  unitId: string;
  caseType: '공급사 정비중개' | '반품환불' | '반품교환';
  supplierPartnerId?: string | null;
  supplierName?: string | null;
  refundSupplyKrw: number;
  refundVatKrw: number;
  replacementUnitId?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlRentalMaintenance {
  id: string;
  tenantId: string;
  maintNo: string;
  maintType: '주기장정비' | '현장정비' | '순회정비';
  unitId: string;
  serialNo?: string | null;
  contractId?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  mechanicId?: string | null;
  mechanicName?: string | null;
  vendorPartnerId?: string | null;
  operatingHours: number;
  partsUsed: { unitId: string; itemId: string; itemName: string; qty: number; unitCostKrw: number }[];
  partsCostKrw: number;
  laborCostKrw: number;
  externalCostKrw: number;
  totalCostKrw: number;
  isCustomerBillable: boolean;
  customerChargeKrw: number;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlAssetEvent {
  id: string;
  tenantId: string;
  unitId: string;
  contractId?: string | null;
  eventType:
    | 'PURCHASE'
    | 'LEASE_INIT'
    | 'ACCOUNT_TRANSFER'
    | 'RENTAL_START'
    | 'EXCHANGE_OUT'
    | 'EXCHANGE_IN'
    | 'RENTAL_RETURN'
    | 'MAINTENANCE'
    | 'TRADE_OUTBOUND'
    | 'TRADE_RETURN'
    | 'DEPRECIATION'
    | 'DISPOSAL';
  predecessorUnitId?: string | null;
  successorUnitId?: string | null;
  operatingHours: number;
  deltaAmountKrw: number;
  effectiveDate: string;
  recordedAt: string;
  actorName?: string | null;
  memo?: string | null;
}

export interface BillingLine {
  description: string;
  qty: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  unitId?: string;
  contractLineId?: string;
}

export interface FlBilling {
  id: string;
  tenantId: string;
  billingNo: string;
  billingYm: string;
  billingDomain: 'TRADE' | 'RENTAL' | 'MIXED';
  contractId: string;
  partnerId: string;
  partnerName: string;
  billingDate: string;
  dueDate: string;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  paidAmountKrw: number;
  unpaidBalanceKrw: number;
  taxInvoiceIssued: boolean;
  taxInvoiceNo?: string | null;
  taxInvoiceIssuedAt?: string | null;
  statementSentAt?: string | null;
  lines: BillingLine[];
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  memo?: string | null;
}

export interface FlCollection {
  id: string;
  tenantId: string;
  collectionNo: string;
  billingId: string;
  partnerId: string;
  partnerName: string;
  collectionDate: string;
  amountKrw: number;
  paymentMethod: string;
  bankTxId?: string | null;
  recordedBy: string;
  memo?: string | null;
}

export interface FlBankTransaction {
  id: string;
  tenantId: string;
  txDate: string;
  txDirection: 'IN' | 'OUT';
  bankName: string;
  accountNo?: string | null;
  counterpartyName: string;
  amountKrw: number;
  matchedType?: 'AR_BILLING' | 'AP_PAYABLE' | 'LEASE_INSTALLMENT' | null;
  matchedId?: string | null;
  matchStatus: 'UNMATCHED' | 'MATCHED' | 'EXCLUDED';
  memo?: string | null;
}

export interface FlFinanceLease {
  id: string;
  tenantId: string;
  leaseNo: string;
  lenderPartnerId: string;
  lenderName: string;
  unitId?: string | null;
  unitIds: string[];
  serialNo?: string | null;
  principalAmountKrw: number;
  annualInterestRate: number;
  termMonths: number;
  repaymentMethod: '원리금균등' | '원금균등';
  startDate: string;
  endDate: string;
  paymentDay: number;
  remainingPrincipalKrw: number;
  status: 'ACTIVE' | 'PAID_OFF' | 'TERMINATED';
  memo?: string | null;
}

export interface FlFinanceLeaseSchedule {
  id: string;
  tenantId: string;
  leaseId: string;
  installmentNo: number;
  dueYm: string;
  dueDate: string;
  openingPrincipalKrw: number;
  principalPaymentKrw: number;
  interestExpenseKrw: number;
  totalInstallmentKrw: number;
  endingPrincipalKrw: number;
  isPaid: boolean;
  paidDate?: string | null;
  bankTxId?: string | null;
}

export type KoBadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export const CURRENCY_KO_LABELS: Record<CurrencyCode, string> = {
  KRW: '원화',
  USD: '미국 달러',
  CNY: '중국 위안',
  EUR: '유럽 유로',
  JPY: '일본 엔',
};

export const PURCHASE_STATUS_KO_LABELS: Record<FlPurchase['status'], string> = {
  DRAFT: '임시저장',
  CONFIRMED: '확정',
  CANCELLED: '취소',
};

export const SETTLEMENT_STATUS_KO_LABELS: Record<FlLogisticsDispatch['settlementStatus'], string> = {
  UNSETTLED: '미정산',
  SETTLED: '정산확정',
  PAID: '지급완료',
};

export const QUOTATION_STATUS_KO_LABELS: Record<FlQuotation['status'], string> = {
  DRAFT: '작성중',
  SENT: '발송완료',
  ACCEPTED: '수주확정',
  CONVERTED: '계약전환',
  CANCELLED: '취소',
};

export const CONTRACT_STATUS_KO_LABELS: Record<FlContract['status'], string> = {
  DRAFT: '임시저장',
  ACTIVE: '진행중',
  FULFILLING: '출고진행',
  COMPLETED: '이행완료',
  TERMINATED: '중도해지',
  CANCELLED: '취소',
};

export const CONTRACT_LINE_STATUS_KO_LABELS: Record<FlContractLine['lineStatus'], string> = {
  ACTIVE: '계약유효',
  FULFILLED: '출고완료',
  REPLACED_OUT: '교환회수',
  RETURNED: '반납완료',
  CANCELLED: '취소',
};

export const FULFILLMENT_STATUS_KO_LABELS: Record<FlFulfillment['status'], string> = {
  REQUESTED: '처리대기',
  COMPLETED: '실행완료',
  CANCELLED: '취소',
};

export const AFTERCARE_STATUS_KO_LABELS: Record<FlTradeAftercareCase['status'], string> = {
  OPEN: '접수',
  IN_PROGRESS: '처리중',
  COMPLETED: '처리완료',
  CANCELLED: '취소',
};

export const MAINT_STATUS_KO_LABELS: Record<FlRentalMaintenance['status'], string> = {
  OPEN: '정비접수',
  COMPLETED: '정비완료',
  CANCELLED: '취소',
};

export const BILLING_STATUS_KO_LABELS: Record<FlBilling['status'], string> = {
  UNPAID: '미수',
  PARTIAL: '부분수납',
  PAID: '완납',
  CANCELLED: '취소',
};

export const AP_STATUS_KO_LABELS: Record<FlApPayable['status'], string> = {
  UNPAID: '미지급',
  PARTIAL: '부분지급',
  PAID: '지급완료',
};

export const PAYABLE_TYPE_KO_LABELS: Record<FlApPayable['payableType'], string> = {
  PURCHASE: '매입채무',
  LOGISTICS: '물류운송비',
  FINANCE_LEASE: '금융리스',
  SUBLEASE_RENT: '전대임차료',
  EXTERNAL_REPAIR: '외주정비비',
};

export const ACQUISITION_TYPE_KO_LABELS: Record<FlInventoryUnit['acquisitionType'], string> = {
  PURCHASE: '직접매입',
  FINANCE_LEASE: '금융리스',
  SUBLEASE: '전대임차',
  ACCOUNT_TRANSFER: '계정대체',
  RETURN: '반품입고',
};

export const BANK_MATCH_STATUS_KO_LABELS: Record<FlBankTransaction['matchStatus'], string> = {
  UNMATCHED: '미대사',
  MATCHED: '대사완료',
  EXCLUDED: '대사제외',
};

export const LEASE_STATUS_KO_LABELS: Record<FlFinanceLease['status'], string> = {
  ACTIVE: '상환중',
  PAID_OFF: '완납종료',
  TERMINATED: '중도해지',
};

export const APPROVAL_STATUS_KO_LABELS: Record<FlApprovalRequest['status'], string> = {
  PENDING: '결재대기',
  APPROVED: '승인완료',
  REJECTED: '반려',
  CANCELLED: '취소',
};

export const ACTION_CODE_KO_LABELS: Record<ApprovalActionCode, string> = {
  PURCHASE_CONFIRM: '매입 입고 확정',
  LEASE_CREATE: '금융리스 등록',
  ACCOUNT_TRANSFER: '계정대체 실행',
  TRADE_CONTRACT_CONFIRM: '유통 계약 확정',
  RENTAL_CONTRACT_CONFIRM: '렌탈 계약 확정',
  FULFILLMENT_COMPLETE: '출고·회수 완료',
  EXCHANGE_EXECUTE: '렌탈 교환 실행',
  TRADE_REFUND: '유통 반품 환불',
  BILLING_CREATE: '월말 청구 발행',
  AP_SETTLEMENT_PAY: '매입·물류 대금 지급',
  ASSET_DISPOSAL: '자산 폐기 처분',
  POLICY_CONFIG_SAVE: '권한·결재 기준 변경',
  HR_APPOINTMENT: '인사 발령 확정',
};

export const TARGET_TABLE_KO_LABELS: Record<string, string> = {
  fl_purchases: '매입통관 원장',
  fl_finance_leases: '금융리스 원장',
  fl_inventory_units: '재고·자산 원장',
  fl_contracts: '계약 원장',
  fl_fulfillments: '입출고 원장',
  fl_trade_aftercare_cases: '유통 사후처리 원장',
  fl_billings: '청구 원장',
  fl_ap_payables: '매입채무 원장',
  fl_approval_policies: '결재정책 원장',
  fl_users: '인사 원장',
};

const UNIFIED_STATUS_KO_MAP: Record<string, string> = {
  ...CURRENCY_KO_LABELS,
  ...EMPLOYMENT_STATUS_LABELS,
  ...PURCHASE_STATUS_KO_LABELS,
  ...SETTLEMENT_STATUS_KO_LABELS,
  ...QUOTATION_STATUS_KO_LABELS,
  ...CONTRACT_STATUS_KO_LABELS,
  ...CONTRACT_LINE_STATUS_KO_LABELS,
  ...FULFILLMENT_STATUS_KO_LABELS,
  ...AFTERCARE_STATUS_KO_LABELS,
  ...MAINT_STATUS_KO_LABELS,
  ...BILLING_STATUS_KO_LABELS,
  ...AP_STATUS_KO_LABELS,
  ...PAYABLE_TYPE_KO_LABELS,
  ...ACQUISITION_TYPE_KO_LABELS,
  ...BANK_MATCH_STATUS_KO_LABELS,
  ...LEASE_STATUS_KO_LABELS,
  ...APPROVAL_STATUS_KO_LABELS,
  ...ACTION_CODE_KO_LABELS,
  // ACTIVE 우선순위: 계약/라인 기본 표시('진행중')가 직관적이며 인사화면은 EMPLOYMENT_STATUS_LABELS 사용
  ACTIVE: '진행중',
  COMPLETED: '이행완료',
};

export function formatKoCurrency(code: string): string {
  const key = String(code || '').trim().toUpperCase() as CurrencyCode;
  return CURRENCY_KO_LABELS[key] || code;
}

export function formatKoPayableType(code: string): string {
  const key = String(code || '').trim().toUpperCase() as FlApPayable['payableType'];
  return PAYABLE_TYPE_KO_LABELS[key] || code;
}

export function formatKoAcquisitionType(code: string): string {
  const key = String(code || '').trim().toUpperCase() as FlInventoryUnit['acquisitionType'];
  return ACQUISITION_TYPE_KO_LABELS[key] || code;
}

export function formatKoActionCode(code: string): string {
  const key = String(code || '').trim().toUpperCase() as ApprovalActionCode;
  return ACTION_CODE_KO_LABELS[key] || code;
}

export function formatKoTargetTable(table: string): string {
  const key = String(table || '').trim();
  return TARGET_TABLE_KO_LABELS[key] || table;
}

export function formatKoStatus(code: string): string {
  const raw = String(code ?? '');
  if (!raw) return '';
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (UNIFIED_STATUS_KO_MAP[trimmed]) return UNIFIED_STATUS_KO_MAP[trimmed];
  if (UNIFIED_STATUS_KO_MAP[upper]) return UNIFIED_STATUS_KO_MAP[upper];
  return raw;
}

export function koStatusTone(code: string): KoBadgeTone {
  const upper = String(code || '').trim().toUpperCase();
  if (
    upper === 'CONFIRMED' ||
    upper === 'COMPLETED' ||
    upper === 'FULFILLED' ||
    upper === 'SETTLED' ||
    upper === 'PAID' ||
    upper === 'APPROVED' ||
    upper === 'MATCHED' ||
    upper === 'PAID_OFF'
  ) {
    return 'success';
  }
  if (upper === 'ACTIVE' || upper === 'CONVERTED' || upper === 'ACCEPTED') {
    return 'primary';
  }
  if (
    upper === 'REQUESTED' ||
    upper === 'PENDING' ||
    upper === 'PARTIAL' ||
    upper === 'UNSETTLED' ||
    upper === 'IN_PROGRESS' ||
    upper === 'FULFILLING' ||
    upper === 'SENT'
  ) {
    return 'warning';
  }
  if (upper === 'REJECTED' || upper === 'TERMINATED' || upper === 'UNPAID') {
    return 'danger';
  }
  return 'neutral';
}
