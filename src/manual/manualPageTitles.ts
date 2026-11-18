import type { FlPageId } from '../types/domain';

export const FL_PAGE_TITLES: Record<FlPageId, string> = {
  dashboard: '업무 대시보드',
  approval_inbox: '결재함',
  partners: '거래처 관리',
  trade_item_masters: '유통 품목 관리',
  rental_item_masters: '렌탈 품목 관리',
  exchange_rates: '환율 관리',
  catalogs: '제원 카탈로그',
  purchases: '매입 통관 관리',
  logistics_costs: '물류비 관리',
  quotations: '견적 관리',
  trade_contracts: '유통 계약 관리',
  trade_inventory: '유통 재고 조회',
  trade_fulfillment: '유통 출고 관리',
  trade_performance: '유통 실적 조회',
  rental_contracts: '렌탈 계약 관리',
  rental_assets: '렌탈 자산 관리',
  rental_fulfillment: '렌탈 입출고 관리',
  rental_maintenance: '렌탈 정비 관리',
  rental_performance: '렌탈 실적 조회',
  ar_billing_collection: '청구 수납 관리',
  ap_settlements: '매입 비용 정산',
  bank_matching: '통장 입출금 대사',
  cash_calendar: '자금 일정 캘린더',
  financial_statements: '재무제표 조회',
  organization_hr: '조직 인사 관리',
  operation_manual: '업무 매뉴얼',
  permission_settings: '권한 설정',
  system_settings: '시스템 설정',
};

export function getPageTitleForTenant(pageId: FlPageId, _rentalEnabled = true): string {
  return FL_PAGE_TITLES[pageId] || '';
}
