import type {
  ApprovalActionCode,
  CurrencyCode,
  DepartmentFuncTag,
  EmploymentStatus,
  FlApprovalRequest,
  FlItemMaster,
  FlPartner,
  PartnerRole,
  PaymentCycleType,
  PaymentMethodType,
} from './domainCoreTypes';
import type {
  FlApPayable,
  FlBankTransaction,
  FlBilling,
  FlContract,
  FlContractLine,
  FlFinanceLease,
  FlFulfillment,
  FlInventoryUnit,
  FlLogisticsDispatch,
  FlPurchase,
  FlPurchaseLine,
  FlQuotation,
  FlRentalMaintenance,
  FlStockMovement,
  FlTradeAftercareCase,
} from './domainLedgerTypes';

export const ALL_PARTNER_ROLES: readonly PartnerRole[] = [
  '매출처',
  '대리점',
  '금융사',
  '매입처',
  '전대공급처',
  '운송사',
  '외주정비처',
] as const;

export const RENTAL_ONLY_PARTNER_ROLES: readonly PartnerRole[] = [
  '금융사',
  '전대공급처',
  '외주정비처',
] as const;

export function getPartnerRolesForTenant(rentalEnabled: boolean): PartnerRole[] {
  if (rentalEnabled) return [...ALL_PARTNER_ROLES];
  const hidden = new Set<PartnerRole>(RENTAL_ONLY_PARTNER_ROLES);
  return ALL_PARTNER_ROLES.filter((r) => !hidden.has(r));
}

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: '재직',
  LEAVE_OF_ABSENCE: '휴직',
  RETIRED: '퇴사',
};

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

export function formatPartnerNtsStatus(
  ntsStatus?: string | null,
  ntsClosedDate?: string | null
): string {
  const st = String(ntsStatus || '').trim();
  const dt = String(ntsClosedDate || '').trim();
  if (st === '정상') return '정상';
  if (st === '휴업') return dt ? `휴업 · ${dt}` : '휴업';
  if (st === '폐업') return dt ? `폐업 · ${dt}` : '폐업';
  if (st === '미등록') return '미등록';
  return '-';
}

export function partnerNtsStatusTone(
  ntsStatus?: string | null
): 'success' | 'warning' | 'danger' | 'neutral' {
  const st = String(ntsStatus || '').trim();
  if (st === '정상') return 'success';
  if (st === '휴업') return 'warning';
  if (st === '폐업') return 'danger';
  return 'neutral';
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

export const RENTAL_ONLY_ACTION_CODES: readonly ApprovalActionCode[] = [
  'LEASE_CREATE',
  'ACCOUNT_TRANSFER',
  'RENTAL_CONTRACT_CONFIRM',
  'EXCHANGE_EXECUTE',
  'ASSET_DISPOSAL',
] as const;

export const RENTAL_ONLY_PAYABLE_TYPES: readonly FlApPayable['payableType'][] = [
  'FINANCE_LEASE',
  'SUBLEASE_RENT',
  'EXTERNAL_REPAIR',
] as const;

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

export function formatKoActionCode(code: string, rentalEnabled = true): string {
  const key = String(code || '').trim().toUpperCase() as ApprovalActionCode;
  if (!rentalEnabled && key === 'FULFILLMENT_COMPLETE') {
    return '출고 완료';
  }
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

export function filterPartnersForTenant(
  partners: FlPartner[],
  rentalEnabled: boolean
): FlPartner[] {
  if (rentalEnabled) return partners;
  const rentalOnlyRoles = new Set<PartnerRole>(RENTAL_ONLY_PARTNER_ROLES);
  return partners.filter(
    (p) =>
      !p.partnerRoles ||
      p.partnerRoles.length === 0 ||
      p.partnerRoles.some((r) => !rentalOnlyRoles.has(r))
  );
}

export function selectCustomerPartners(partners: FlPartner[]): FlPartner[] {
  const matched = partners.filter(
    (p) => p.partnerRoles.includes('매출처') || p.partnerRoles.includes('대리점')
  );
  return matched.length > 0 ? matched : partners;
}

export interface PartnerPaymentDefaults {
  paymentMethod: PaymentMethodType;
  closingDay: number;
  paymentCycle: PaymentCycleType;
  paymentDueDay: number;
}

export function resolvePartnerPaymentDefaults(partner?: FlPartner | null): PartnerPaymentDefaults {
  const paymentMethod = normalizePaymentMethod(partner?.paymentMethod);
  const closingDay = partner?.defaultClosingDay || 31;
  const paymentCycle = offsetToPaymentCycle(
    partner?.defaultPaymentMonthOffset,
    partner?.defaultPaymentCycle
  );
  const paymentDueDay = paymentCycle === '선입금' ? 0 : partner?.defaultPaymentDueDay || 10;
  return { paymentMethod, closingDay, paymentCycle, paymentDueDay };
}

export function filterItemMastersForTenant(
  items: FlItemMaster[],
  rentalEnabled: boolean
): FlItemMaster[] {
  if (rentalEnabled) return items;
  return items.filter((it) => it.itemDomain !== 'RENTAL');
}

export function isEffectiveTradeUnitForTenant(
  unit: FlInventoryUnit,
  rentalEnabled: boolean,
  stockMovements: FlStockMovement[],
  purchases: FlPurchase[] = [],
  purchaseLines: FlPurchaseLine[] = []
): boolean {
  if (rentalEnabled) {
    return unit.ownershipDomain === '유통재고';
  }
  if (
    unit.ownershipDomain === '전대자산' ||
    unit.acquisitionType === 'FINANCE_LEASE' ||
    unit.acquisitionType === 'SUBLEASE'
  ) {
    return false;
  }
  if (unit.purchaseLineId) {
    const pl = purchaseLines.find((l) => l.id === unit.purchaseLineId);
    const pur = pl ? purchases.find((p) => p.id === pl.purchaseId) : undefined;
    if (pur) {
      return pur.targetDomain !== 'RENTAL';
    }
  }
  const firstTransfer = [...stockMovements]
    .filter((m) => m.unitId === unit.id && m.movementType === 'ACCOUNT_TRANSFER')
    .sort(
      (a, b) =>
        (a.effectiveDate || '').localeCompare(b.effectiveDate || '') ||
        (a.recordedAt || '').localeCompare(b.recordedAt || '')
    )[0];
  const initialDomain = firstTransfer?.fromDomain || unit.ownershipDomain;
  return initialDomain === '유통재고';
}

export interface RentalApprovalScopeDatasets {
  fulfillments: Pick<FlFulfillment, 'id' | 'fulfillmentDomain'>[];
  contracts: Pick<FlContract, 'id' | 'contractDomain'>[];
  apPayables: Pick<FlApPayable, 'id' | 'payableType' | 'refId'>[];
  purchases: Pick<FlPurchase, 'id' | 'targetDomain'>[];
  logisticsDispatches: Pick<FlLogisticsDispatch, 'id' | 'dispatchPurpose' | 'relatedRefId'>[];
}

export function isActionPayloadRentalRelated(
  actionCode: string,
  targetId: string,
  payload: Record<string, unknown> | null | undefined,
  datasets: RentalApprovalScopeDatasets
): boolean {
  const p = payload || {};
  if (RENTAL_ONLY_ACTION_CODES.includes(actionCode as ApprovalActionCode)) {
    return true;
  }
  if (p.maintPayload) {
    return true;
  }
  if (actionCode === 'PURCHASE_CONFIRM' && p.targetDomain === 'RENTAL') {
    return true;
  }
  if (actionCode === 'FULFILLMENT_COMPLETE') {
    const ful = datasets.fulfillments.find((f) => f.id === (p.fulfillmentId || targetId));
    if (ful?.fulfillmentDomain === 'RENTAL') return true;
  }
  if (actionCode === 'BILLING_CREATE') {
    const contract = datasets.contracts.find((c) => c.id === (p.contractId || targetId));
    if (contract?.contractDomain === 'RENTAL') return true;
  }
  if (actionCode === 'AP_SETTLEMENT_PAY') {
    if (p.kind === 'LEASE_SCHEDULE') return true;
    const ap = datasets.apPayables.find((a) => a.id === (p.payableId || targetId));
    if (ap) {
      if (RENTAL_ONLY_PAYABLE_TYPES.includes(ap.payableType)) return true;
      if (ap.payableType === 'PURCHASE' && ap.refId) {
        const pur = datasets.purchases.find((x) => x.id === ap.refId);
        if (pur?.targetDomain === 'RENTAL') return true;
      }
      if (ap.payableType === 'LOGISTICS' && ap.refId) {
        const disp = datasets.logisticsDispatches.find((d) => d.id === ap.refId);
        if (disp) {
          if (disp.dispatchPurpose === '교환') return true;
          if (disp.relatedRefId) {
            const ctr = datasets.contracts.find((c) => c.id === disp.relatedRefId);
            if (ctr?.contractDomain === 'RENTAL') return true;
            const ful = datasets.fulfillments.find((f) => f.id === disp.relatedRefId);
            if (ful?.fulfillmentDomain === 'RENTAL') return true;
          }
        }
      }
    }
  }
  return false;
}

export function isApprovalRequestRentalRelated(
  req: Pick<FlApprovalRequest, 'actionCode' | 'targetId' | 'payload'>,
  datasets: RentalApprovalScopeDatasets
): boolean {
  return isActionPayloadRentalRelated(req.actionCode, req.targetId, req.payload, datasets);
}

export type { DepartmentFuncTag };
