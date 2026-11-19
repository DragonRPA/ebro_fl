// eBroFL v2.0 — 핵심 테넌트·메뉴·권한·마스터 도메인 타입 SSOT

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
  | 'cash_calendar'
  | 'financial_statements'
  | 'organization_hr'
  | 'operation_manual'
  | 'permission_settings'
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
      { pageId: 'cash_calendar', label: '자금 일정 캘린더', shortDesc: '매입 지급일 · 매출 납기일 기반 입출금 일정' },
      { pageId: 'financial_statements', label: '재무제표 조회', shortDesc: '재무상태표 · 손익계산서 · 리스명세 · 회계기준' },
      { pageId: 'organization_hr', label: '조직 인사 관리', shortDesc: '부서 조직도 · 임직원 인사원장 · 발령 이력' },
      { pageId: 'operation_manual', label: '업무 매뉴얼', shortDesc: '화면별 기본기능 · 조작순서 검색' },
      { pageId: 'permission_settings', label: '권한 설정', shortDesc: '7단계 티어 · 결재선 · 티어/개인별 화면 권한' },
      { pageId: 'system_settings', label: '시스템 설정', shortDesc: '문서 양식 · 직인 도장 설정' },
    ],
  },
];

export const ALL_FL_PAGE_IDS: FlPageId[] = FL_MENU_GROUPS.flatMap((g) => g.items.map((i) => i.pageId));

export const RENTAL_ONLY_PAGE_IDS: readonly FlPageId[] = [
  'rental_item_masters',
  'rental_contracts',
  'rental_assets',
  'rental_fulfillment',
  'rental_maintenance',
  'rental_performance',
] as const;

const NON_RENTAL_MENU_SHORT_DESC_OVERRIDES: Partial<Record<FlPageId, string>> = {
  dashboard: '결재 대기 · 출고 의뢰 · 미수 · 납기 요약',
  quotations: '유통 견적 작성 및 계약 전환',
  trade_inventory: '시리얼 · 로트 선입선출 및 경과일수 조회',
  ap_settlements: '매입채무 · 물류비 정산',
  financial_statements: '재무상태표 · 손익계산서 · 현금흐름표 · 회계기준',
};

export function getMenuGroupsForTenant(rentalEnabled: boolean): MenuGroupDef[] {
  if (rentalEnabled) return FL_MENU_GROUPS;
  const hidden = new Set<FlPageId>(RENTAL_ONLY_PAGE_IDS);
  return FL_MENU_GROUPS.map((grp) => ({
    ...grp,
    items: grp.items
      .filter((item) => !hidden.has(item.pageId))
      .map((item) => ({
        ...item,
        shortDesc: NON_RENTAL_MENU_SHORT_DESC_OVERRIDES[item.pageId] || item.shortDesc,
      })),
  })).filter((grp) => grp.items.length > 0);
}

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
  if (pageId === 'permission_settings' || pageId === 'system_settings' || pageId === 'financial_statements') {
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

export const ALL_DOCUMENT_TEMPLATE_TYPES: readonly DocumentTemplateType[] = [
  '견적서_유통',
  '견적서_렌탈',
  '계약서_유통',
  '계약서_렌탈',
  '거래명세서',
] as const;

export const RENTAL_ONLY_DOC_TYPES: readonly DocumentTemplateType[] = [
  '견적서_렌탈',
  '계약서_렌탈',
] as const;

export function getDocTypesForTenant(rentalEnabled: boolean): DocumentTemplateType[] {
  if (rentalEnabled) return [...ALL_DOCUMENT_TEMPLATE_TYPES];
  const hidden = new Set<DocumentTemplateType>(RENTAL_ONLY_DOC_TYPES);
  return ALL_DOCUMENT_TEMPLATE_TYPES.filter((d) => !hidden.has(d));
}

export interface TenantR2Config {
  r2AccountId?: string;
  r2BucketName?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2PublicDomain?: string;
}

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

export interface TenantPopbillConfig {
  corpNum?: string;
  userId?: string;
  isTest?: boolean;
  useCustomKey?: boolean;
  linkId?: string;
  secretKey?: string;
  defaultPurposeType?: '청구' | '영수';
  autoSendToNts?: boolean;
}

export interface TenantFeatures {
  bankMatchingEnabled?: boolean;
  rentalEnabled?: boolean;
  autoTaxInvoice?: boolean;
  popbillTaxInvoice?: boolean;
  popbillConfig?: TenantPopbillConfig;
  agentAiEnabled?: boolean;
  tenantSupabaseUrl?: string;
  customDomain?: string;
  r2Config?: TenantR2Config;
  officialMailConfig?: OfficialMailConfig;
  specialFeatures?: string[];
  [key: string]: unknown;
}

export function isTenantRentalEnabled(
  tenant?: { features?: TenantFeatures } | null
): boolean {
  return tenant?.features?.rentalEnabled !== false;
}

export function isTenantPopbillEnabled(
  tenant?: { features?: TenantFeatures; specialFeatures?: string[] } | null
): boolean {
  const explicit = tenant?.features?.popbillTaxInvoice;
  if (typeof explicit === 'boolean') return explicit;
  const sf = Array.isArray(tenant?.specialFeatures)
    ? tenant.specialFeatures
    : Array.isArray(tenant?.features?.specialFeatures)
      ? tenant.features.specialFeatures
      : [];
  return sf.includes('feat:billings:popbill_tax_invoice');
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
  ciUrl?: string;
  logoUrl?: string;
  stampImageUrl?: string;
  stampBase64?: string;
  targetRepo?: string;
  r2Config?: TenantR2Config;
  allowedPages: string[];
  hiddenPages: string[];
  specialFeatures?: string[];
  features: TenantFeatures;
}

export type EmploymentStatus = 'ACTIVE' | 'LEAVE_OF_ABSENCE' | 'RETIRED';

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

export const RENTAL_ONLY_DEPT_TAGS: readonly DepartmentFuncTag[] = [
  '렌탈자산',
  '정비',
] as const;

export function getDepartmentFuncTagsForTenant(rentalEnabled: boolean): DepartmentFuncTag[] {
  if (rentalEnabled) return [...ALL_DEPARTMENT_FUNC_TAGS];
  const hidden = new Set<DepartmentFuncTag>(RENTAL_ONLY_DEPT_TAGS);
  return ALL_DEPARTMENT_FUNC_TAGS.filter((t) => !hidden.has(t));
}

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

export type PartnerNtsStatus = '정상' | '휴업' | '폐업' | '미등록';

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
  ntsStatus?: PartnerNtsStatus | string | null;
  ntsClosedDate?: string | null;
  ntsTaxType?: string | null;
  ntsCheckedAt?: string | null;
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
