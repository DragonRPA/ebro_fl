// src/data/flTradeRwtt2026Data.ts
// 2026년 01월 ~ 10월 (월별 3건, 총 30건) 지게차 완제품 + 출고 설치옵션 유통계약·출고·청구·수납·연체 RWTT 정합성 마스터 데이터
// 원칙:
// 1. 이메일 발송 전면 배제 (contractDocStatus: 'GENERATED', sentAt: undefined)
// 2. 완제품 수입 지게차 본품 + 19종 출고 설치옵션 결합 유통계약 -> 출고 -> 청구 -> 수납/부분미납/장기연체/최종미납 100% 대차 일치

import { MUJIN_OPTION_MASTERS, MUJIN_CUSTOMERS, MUJIN_TRADE_PRODUCTS } from './mujinGlobalInitialData';

export type RwttPaymentScenario =
  | 'PAID'             // 기한 내 정상 완납
  | 'OVERDUE_PAID'     // 납기 경과 연체 발생 및 독촉 후 완납
  | 'PARTIAL_OVERDUE'  // 일부 수납 후 잔액 장기 연체 미납 (최종 시점 미납)
  | 'UNPAID_OVERDUE'   // 전액 장기 연체 미납 (최종 시점 미납)
  | 'ISSUED_UNPAID';   // 최근 청구 발행 후 최종 시점 미납

export interface FlTradeRwttSpec {
  seq: number;                // 1 ~ 30
  ym: string;                 // '2026-01' ~ '2026-10'
  monthIndex: number;         // 1 ~ 3 within month
  orderDate: string;
  deliveryDate: string;
  billingDate: string;
  dueDate: string;
  customerId: string;
  productId: string;
  qty: number;
  serialNumbers: string[];
  optionIds: string[];
  freeOptionIds?: string[];
  scenario: RwttPaymentScenario;
  paidDate?: string;
  overdueDays: number;
  partialRatio?: number;
  delinquencyActionType?: 'CALL' | 'SMS' | 'VISIT' | 'LEGAL_NOTICE' | 'DIRECTIVE';
  delinquencyNote?: string;
}

export const FL_TRADE_RWTT_30_SPECS: FlTradeRwttSpec[] = [
  // ==================== 2026-01 (3건) ====================
  {
    seq: 1, ym: '2026-01', monthIndex: 1,
    orderDate: '2026-01-06', deliveryDate: '2026-01-09', billingDate: '2026-01-25', dueDate: '2026-02-10',
    customerId: 'CUST-MJ-001', productId: 'PRD-MJ-002', qty: 1,
    serialNumbers: ['HC-XE25-260101'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-05', 'FOM-MJ-09', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-02-06', overdueDays: 0
  },
  {
    seq: 2, ym: '2026-01', monthIndex: 2,
    orderDate: '2026-01-14', deliveryDate: '2026-01-17', billingDate: '2026-01-25', dueDate: '2026-02-10',
    customerId: 'CUST-MJ-003', productId: 'PRD-MJ-003', qty: 1,
    serialNumbers: ['HC-XE30-260102'],
    optionIds: ['FOM-MJ-02', 'FOM-MJ-06', 'FOM-MJ-14'],
    scenario: 'PAID', paidDate: '2026-02-09', overdueDays: 0
  },
  {
    seq: 3, ym: '2026-01', monthIndex: 3,
    orderDate: '2026-01-21', deliveryDate: '2026-01-24', billingDate: '2026-01-28', dueDate: '2026-02-15',
    customerId: 'CUST-MJ-004', productId: 'PRD-MJ-008', qty: 1,
    serialNumbers: ['HC-CQD18-260103'],
    optionIds: ['FOM-MJ-06', 'FOM-MJ-07', 'FOM-MJ-09', 'FOM-MJ-16'],
    scenario: 'OVERDUE_PAID', paidDate: '2026-03-13', overdueDays: 26,
    delinquencyActionType: 'CALL',
    delinquencyNote: '1월 출고 리치트럭 및 안전옵션 대금 납기 26일 경과 유선 독촉 후 전액 입금 완료'
  },

  // ==================== 2026-02 (3건) ====================
  {
    seq: 4, ym: '2026-02', monthIndex: 1,
    orderDate: '2026-02-04', deliveryDate: '2026-02-07', billingDate: '2026-02-25', dueDate: '2026-03-10',
    customerId: 'CUST-MJ-005', productId: 'PRD-MJ-010', qty: 1,
    serialNumbers: ['BYD-ECB30-260201'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-05', 'FOM-MJ-12', 'FOM-MJ-18'],
    scenario: 'PAID', paidDate: '2026-03-09', overdueDays: 0
  },
  {
    seq: 5, ym: '2026-02', monthIndex: 2,
    orderDate: '2026-02-12', deliveryDate: '2026-02-16', billingDate: '2026-02-25', dueDate: '2026-03-15',
    customerId: 'CUST-MJ-006', productId: 'PRD-MJ-001', qty: 1,
    serialNumbers: ['HC-XE18-260202'],
    optionIds: ['FOM-MJ-03', 'FOM-MJ-07', 'FOM-MJ-12'],
    scenario: 'OVERDUE_PAID', paidDate: '2026-04-18', overdueDays: 34,
    delinquencyActionType: 'VISIT',
    delinquencyNote: '남동공단 사업장 방문 대면 독촉 진행 및 지불각서 징구 후 34일 연체분 전액 수납 완료'
  },
  {
    seq: 6, ym: '2026-02', monthIndex: 3,
    orderDate: '2026-02-20', deliveryDate: '2026-02-24', billingDate: '2026-02-27', dueDate: '2026-03-15',
    customerId: 'CUST-MJ-007', productId: 'PRD-MJ-005', qty: 2,
    serialNumbers: ['HC-XE20-260203A', 'HC-XE20-260203B'],
    optionIds: ['FOM-MJ-06', 'FOM-MJ-09', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-03-12', overdueDays: 0
  },

  // ==================== 2026-03 (3건) ====================
  {
    seq: 7, ym: '2026-03', monthIndex: 1,
    orderDate: '2026-03-05', deliveryDate: '2026-03-09', billingDate: '2026-03-25', dueDate: '2026-04-10',
    customerId: 'CUST-MJ-008', productId: 'PRD-MJ-023', qty: 1,
    serialNumbers: ['HC-XE50-260301'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-15', 'FOM-MJ-17'],
    scenario: 'PAID', paidDate: '2026-04-08', overdueDays: 0
  },
  {
    seq: 8, ym: '2026-03', monthIndex: 2,
    orderDate: '2026-03-13', deliveryDate: '2026-03-17', billingDate: '2026-03-25', dueDate: '2026-04-15',
    customerId: 'CUST-MJ-009', productId: 'PRD-MJ-002', qty: 1,
    serialNumbers: ['HC-XE25-260302'],
    optionIds: ['FOM-MJ-02', 'FOM-MJ-10', 'FOM-MJ-13'],
    scenario: 'OVERDUE_PAID', paidDate: '2026-05-14', overdueDays: 29,
    delinquencyActionType: 'CALL',
    delinquencyNote: '당진 현장 자금집행 지연으로 29일 연체 후 완납 처리'
  },
  {
    seq: 9, ym: '2026-03', monthIndex: 3,
    orderDate: '2026-03-23', deliveryDate: '2026-03-26', billingDate: '2026-03-30', dueDate: '2026-04-15',
    customerId: 'CUST-MJ-010', productId: 'PRD-MJ-029', qty: 1,
    serialNumbers: ['HL-K325-260303'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-11', 'FOM-MJ-14'],
    scenario: 'UNPAID_OVERDUE', overdueDays: 204,
    delinquencyActionType: 'LEGAL_NOTICE',
    delinquencyNote: '장기 연체 204일 경과 · 최고장 발송 및 채권 보전 조치 진행 중 · 최종 시점 전액 미납'
  },

  // ==================== 2026-04 (3건) ====================
  {
    seq: 10, ym: '2026-04', monthIndex: 1,
    orderDate: '2026-04-03', deliveryDate: '2026-04-07', billingDate: '2026-04-25', dueDate: '2026-05-10',
    customerId: 'CUST-MJ-011', productId: 'PRD-MJ-004', qty: 1,
    serialNumbers: ['HC-XE15-260401'],
    optionIds: ['FOM-MJ-03', 'FOM-MJ-06', 'FOM-MJ-08', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-05-08', overdueDays: 0
  },
  {
    seq: 11, ym: '2026-04', monthIndex: 2,
    orderDate: '2026-04-14', deliveryDate: '2026-04-17', billingDate: '2026-04-25', dueDate: '2026-05-10',
    customerId: 'CUST-MJ-012', productId: 'PRD-MJ-009', qty: 1,
    serialNumbers: ['HC-CQD15-260402'],
    optionIds: ['FOM-MJ-07', 'FOM-MJ-09', 'FOM-MJ-16'],
    scenario: 'PAID', paidDate: '2026-05-09', overdueDays: 0
  },
  {
    seq: 12, ym: '2026-04', monthIndex: 3,
    orderDate: '2026-04-22', deliveryDate: '2026-04-25', billingDate: '2026-04-29', dueDate: '2026-05-15',
    customerId: 'CUST-MJ-013', productId: 'PRD-MJ-030', qty: 1,
    serialNumbers: ['HL-K330-260403'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-14', 'FOM-MJ-18'],
    scenario: 'PARTIAL_OVERDUE', paidDate: '2026-05-20', partialRatio: 0.5, overdueDays: 174,
    delinquencyActionType: 'VISIT',
    delinquencyNote: '청구 총액 중 50% 1차 수납 후 잔액 50% 174일 장기 연체 · 현장 방문 추심 진행 중'
  },

  // ==================== 2026-05 (3건) ====================
  {
    seq: 13, ym: '2026-05', monthIndex: 1,
    orderDate: '2026-05-04', deliveryDate: '2026-05-08', billingDate: '2026-05-25', dueDate: '2026-06-10',
    customerId: 'CUST-MJ-014', productId: 'PRD-MJ-002', qty: 1,
    serialNumbers: ['HC-XE25-260501'],
    optionIds: ['FOM-MJ-02', 'FOM-MJ-04', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-06-08', overdueDays: 0
  },
  {
    seq: 14, ym: '2026-05', monthIndex: 2,
    orderDate: '2026-05-13', deliveryDate: '2026-05-16', billingDate: '2026-05-25', dueDate: '2026-06-15',
    customerId: 'CUST-MJ-015', productId: 'PRD-MJ-003', qty: 1,
    serialNumbers: ['HC-XE30-260502'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-13', 'FOM-MJ-17'],
    scenario: 'OVERDUE_PAID', paidDate: '2026-07-07', overdueDays: 22,
    delinquencyActionType: 'CALL',
    delinquencyNote: '하절기 에어컨·풀캐빈 장착 출고건 22일 연체 후 유선 독촉으로 전액 수납 완료'
  },
  {
    seq: 15, ym: '2026-05', monthIndex: 3,
    orderDate: '2026-05-21', deliveryDate: '2026-05-25', billingDate: '2026-05-29', dueDate: '2026-06-15',
    customerId: 'CUST-MJ-016', productId: 'PRD-MJ-011', qty: 2,
    serialNumbers: ['HC-CBD20-260503A', 'HC-CBD20-260503B'],
    optionIds: ['FOM-MJ-07', 'FOM-MJ-08'],
    scenario: 'PAID', paidDate: '2026-06-11', overdueDays: 0
  },

  // ==================== 2026-06 (3건) ====================
  {
    seq: 16, ym: '2026-06', monthIndex: 1,
    orderDate: '2026-06-03', deliveryDate: '2026-06-06', billingDate: '2026-06-25', dueDate: '2026-07-10',
    customerId: 'CUST-MJ-017', productId: 'PRD-MJ-028', qty: 1,
    serialNumbers: ['HL-K320-260601'],
    optionIds: ['FOM-MJ-02', 'FOM-MJ-06', 'FOM-MJ-09', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-07-09', overdueDays: 0
  },
  {
    seq: 17, ym: '2026-06', monthIndex: 2,
    orderDate: '2026-06-12', deliveryDate: '2026-06-16', billingDate: '2026-06-25', dueDate: '2026-07-15',
    customerId: 'CUST-MJ-018', productId: 'PRD-MJ-024', qty: 1,
    serialNumbers: ['HC-XE60-260602'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-11', 'FOM-MJ-15'],
    scenario: 'OVERDUE_PAID', paidDate: '2026-08-22', overdueDays: 38,
    delinquencyActionType: 'VISIT',
    delinquencyNote: '6톤 대형 전동지게차 및 4채널 AI카메라·복합형 포지셔너 대금 38일 연체 후 완납'
  },
  {
    seq: 18, ym: '2026-06', monthIndex: 3,
    orderDate: '2026-06-22', deliveryDate: '2026-06-25', billingDate: '2026-06-29', dueDate: '2026-07-15',
    customerId: 'CUST-MJ-019', productId: 'PRD-MJ-031', qty: 1,
    serialNumbers: ['HL-K335-260603'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-14', 'FOM-MJ-19'],
    scenario: 'PARTIAL_OVERDUE', paidDate: '2026-07-28', partialRatio: 0.5, overdueDays: 113,
    delinquencyActionType: 'DIRECTIVE',
    delinquencyNote: '50% 중도 수납 후 잔액 50% 113일 연체 · 추가 부품 출고 정지 및 대표자 면담 지시'
  },

  // ==================== 2026-07 (3건) ====================
  {
    seq: 19, ym: '2026-07', monthIndex: 1,
    orderDate: '2026-07-04', deliveryDate: '2026-07-08', billingDate: '2026-07-25', dueDate: '2026-08-10',
    customerId: 'CUST-MJ-020', productId: 'PRD-MJ-002', qty: 1,
    serialNumbers: ['HC-XE25-260701'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-09', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-08-07', overdueDays: 0
  },
  {
    seq: 20, ym: '2026-07', monthIndex: 2,
    orderDate: '2026-07-14', deliveryDate: '2026-07-17', billingDate: '2026-07-25', dueDate: '2026-08-10',
    customerId: 'CUST-MJ-021', productId: 'PRD-MJ-007', qty: 1,
    serialNumbers: ['HC-XEM20-260702'],
    optionIds: ['FOM-MJ-03', 'FOM-MJ-06', 'FOM-MJ-10', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-08-10', overdueDays: 0
  },
  {
    seq: 21, ym: '2026-07', monthIndex: 3,
    orderDate: '2026-07-23', deliveryDate: '2026-07-27', billingDate: '2026-07-30', dueDate: '2026-08-15',
    customerId: 'CUST-MJ-022', productId: 'PRD-MJ-006', qty: 1,
    serialNumbers: ['HC-X70-260703'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-11', 'FOM-MJ-15'],
    scenario: 'UNPAID_OVERDUE', overdueDays: 82,
    delinquencyActionType: 'LEGAL_NOTICE',
    delinquencyNote: '7톤 대형 지게차 및 풀옵션 패키지 출고 대금 82일 전액 연체 · 법무 내용증명 발송 대기'
  },

  // ==================== 2026-08 (3건) ====================
  {
    seq: 22, ym: '2026-08', monthIndex: 1,
    orderDate: '2026-08-05', deliveryDate: '2026-08-08', billingDate: '2026-08-25', dueDate: '2026-09-10',
    customerId: 'CUST-MJ-023', productId: 'PRD-MJ-003', qty: 1,
    serialNumbers: ['HC-XE30-260801'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-13', 'FOM-MJ-18'],
    scenario: 'PAID', paidDate: '2026-09-09', overdueDays: 0
  },
  {
    seq: 23, ym: '2026-08', monthIndex: 2,
    orderDate: '2026-08-13', deliveryDate: '2026-08-18', billingDate: '2026-08-25', dueDate: '2026-09-15',
    customerId: 'CUST-MJ-024', productId: 'PRD-MJ-010', qty: 1,
    serialNumbers: ['BYD-ECB30-260802'],
    optionIds: ['FOM-MJ-02', 'FOM-MJ-04', 'FOM-MJ-09', 'FOM-MJ-14'],
    scenario: 'PARTIAL_OVERDUE', paidDate: '2026-09-25', partialRatio: 0.5, overdueDays: 51,
    delinquencyActionType: 'CALL',
    delinquencyNote: '50% 부분 입금 후 잔액 50% 51일 연체 중 · 11월 중순 잔금 결제 약속 관리'
  },
  {
    seq: 24, ym: '2026-08', monthIndex: 3,
    orderDate: '2026-08-21', deliveryDate: '2026-08-25', billingDate: '2026-08-28', dueDate: '2026-09-15',
    customerId: 'CUST-MJ-025', productId: 'PRD-MJ-032', qty: 1,
    serialNumbers: ['HL-K338-260803'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-15', 'FOM-MJ-17'],
    scenario: 'UNPAID_OVERDUE', overdueDays: 51,
    delinquencyActionType: 'VISIT',
    delinquencyNote: '3.8톤 헬리 지게차 및 복합형 포크포지셔너 대금 51일 전액 미납 · 영업담당자 현장 방문 독촉'
  },

  // ==================== 2026-09 (3건) ====================
  {
    seq: 25, ym: '2026-09', monthIndex: 1,
    orderDate: '2026-09-04', deliveryDate: '2026-09-08', billingDate: '2026-09-25', dueDate: '2026-10-10',
    customerId: 'CUST-MJ-026', productId: 'PRD-MJ-001', qty: 1,
    serialNumbers: ['HC-XE18-260901'],
    optionIds: ['FOM-MJ-02', 'FOM-MJ-06', 'FOM-MJ-09', 'FOM-MJ-12'],
    scenario: 'PAID', paidDate: '2026-10-08', overdueDays: 0
  },
  {
    seq: 26, ym: '2026-09', monthIndex: 2,
    orderDate: '2026-09-14', deliveryDate: '2026-09-17', billingDate: '2026-09-25', dueDate: '2026-10-15',
    customerId: 'CUST-MJ-027', productId: 'PRD-MJ-029', qty: 1,
    serialNumbers: ['HL-K325-260902'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-05', 'FOM-MJ-13', 'FOM-MJ-18'],
    scenario: 'PARTIAL_OVERDUE', paidDate: '2026-10-20', partialRatio: 0.5, overdueDays: 21,
    delinquencyActionType: 'SMS',
    delinquencyNote: '9월 청구분 50% 수납 후 잔액 50% 21일 경과 연체 · 납부 독촉 안내 발송'
  },
  {
    seq: 27, ym: '2026-09', monthIndex: 3,
    orderDate: '2026-09-22', deliveryDate: '2026-09-25', billingDate: '2026-09-29', dueDate: '2026-10-15',
    customerId: 'CUST-MJ-028', productId: 'PRD-MJ-025', qty: 1,
    serialNumbers: ['HC-XE80-260903'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-11', 'FOM-MJ-15'],
    scenario: 'UNPAID_OVERDUE', overdueDays: 21,
    delinquencyActionType: 'CALL',
    delinquencyNote: '8톤 중대형 지게차 및 4채널 AI카메라·복합형 포지셔너 대금 21일 연체 · 유선 독촉 진행'
  },

  // ==================== 2026-10 (3건) ====================
  {
    seq: 28, ym: '2026-10', monthIndex: 1,
    orderDate: '2026-10-06', deliveryDate: '2026-10-09', billingDate: '2026-10-25', dueDate: '2026-11-10',
    customerId: 'CUST-MJ-029', productId: 'PRD-MJ-002', qty: 1,
    serialNumbers: ['HC-XE25-261001'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-05', 'FOM-MJ-09', 'FOM-MJ-12'],
    scenario: 'ISSUED_UNPAID', overdueDays: 0
  },
  {
    seq: 29, ym: '2026-10', monthIndex: 2,
    orderDate: '2026-10-15', deliveryDate: '2026-10-19', billingDate: '2026-10-27', dueDate: '2026-11-15',
    customerId: 'CUST-MJ-030', productId: 'PRD-MJ-003', qty: 1,
    serialNumbers: ['HC-XE30-261002'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-05', 'FOM-MJ-14', 'FOM-MJ-17'],
    scenario: 'ISSUED_UNPAID', overdueDays: 0
  },
  {
    seq: 30, ym: '2026-10', monthIndex: 3,
    orderDate: '2026-10-23', deliveryDate: '2026-10-27', billingDate: '2026-10-30', dueDate: '2026-11-15',
    customerId: 'CUST-MJ-002', productId: 'PRD-MJ-023', qty: 1,
    serialNumbers: ['HC-XE50-261003'],
    optionIds: ['FOM-MJ-01', 'FOM-MJ-04', 'FOM-MJ-05', 'FOM-MJ-15'],
    scenario: 'ISSUED_UNPAID', overdueDays: 0
  }
];

function findCustomer(customerId: string) {
  return (
    MUJIN_CUSTOMERS.find((c: any) => c.id === customerId) || {
      id: customerId,
      name: `무진거래처 ${customerId}`,
      bizRegNo: '123-81-00000',
      representative: '대표자',
      repContact: '010-2000-3000',
      address: '경기도 평택시 포승읍 평택항만길 100',
      customerTier: 'END_USER'
    }
  );
}

function findProduct(productId: string) {
  return (
    MUJIN_TRADE_PRODUCTS.find((p: any) => p.id === productId) || {
      id: productId,
      skuCode: productId,
      name: '항차 리튬 전동지게차 2.5톤',
      modelName: 'CPD25-XEY2HA-SI',
      brand: '항차그룹',
      itemType: 'EQUIPMENT',
      inventoryAssetClass: 'PRODUCT',
      unit: '대',
      standardCost: 11450000,
      dealerPrice: 13348000,
      standardPrice: 14200000,
      defaultWarehouse: 'A창고'
    }
  );
}

function buildAppliedOptions(optionIds: string[], isDealer: boolean, freeOptionIds: string[] = []) {
  return optionIds.map(optId => {
    const master = MUJIN_OPTION_MASTERS.find((m: any) => m.id === optId) || MUJIN_OPTION_MASTERS[0];
    const isFree = freeOptionIds.includes(optId);
    const unitPrice = isFree ? 0 : (isDealer ? Number(master.dealerPrice || master.unitPrice) : Number(master.unitPrice));
    const costPrice = Number(master.costPrice || 0);
    return {
      optionId: master.id,
      optionCode: master.code || master.optionCode,
      optionGroup: master.optionGroup,
      optionGroupLabel: master.optionGroupLabel,
      domainTypeLabel: master.domainTypeLabel || '유상옵션',
      name: master.name,
      subVariant: master.subVariant,
      specDetail: master.specDetail,
      qty: 1,
      costPrice,
      unitPrice,
      supplyAmount: unitPrice,
      isFreeApplied: isFree
    };
  });
}

export interface FlTradeRwttBundle {
  salesOrders: any[];
  salesOrderLines: any[];
  outbounds: any[];
  tradeBillings: any[];
  contracts: any[];
  billings: any[];
  billingDetails: any[];
  receivables: any[];
  payments: any[];
  bankTransactions: any[];
  paymentDepositLinks: any[];
  delinquencyActionLogs: any[];
}

export function buildFlTradeRwtt2026Bundle(): FlTradeRwttBundle {
  const salesOrders: any[] = [];
  const salesOrderLines: any[] = [];
  const outbounds: any[] = [];
  const tradeBillings: any[] = [];
  const contracts: any[] = [];
  const billings: any[] = [];
  const billingDetails: any[] = [];
  const receivables: any[] = [];
  const payments: any[] = [];
  const bankTransactions: any[] = [];
  const paymentDepositLinks: any[] = [];
  const delinquencyActionLogs: any[] = [];

  for (const spec of FL_TRADE_RWTT_30_SPECS) {
    const ymCompact = spec.ym.replace('-', '').slice(2); // '2601' ~ '2610'
    const idxStr = String(spec.monthIndex).padStart(2, '0');
    const codeSuffix = `FL${ymCompact}-${idxStr}`; // e.g., FL2601-01

    const orderId = `SO-${codeSuffix}`;
    const lineId = `SOL-${codeSuffix}`;
    const contractId = `CTR-${codeSuffix}`;
    const outboundId = `TOUT-${codeSuffix}`;
    const tradeBillingId = `TBIL-${codeSuffix}`;
    const billingId = `BILL-${codeSuffix}`;
    const receivableId = `RCV-${codeSuffix}`;

    const cust = findCustomer(spec.customerId);
    const prod = findProduct(spec.productId);
    const isDealer = cust.customerTier === 'DEALER';

    const unitSalesPrice = isDealer
      ? Number(prod.dealerPrice || prod.standardPrice || 13500000)
      : Number(prod.standardPrice || 14200000);
    const unitCogs = Number(prod.standardCost || Math.round(unitSalesPrice * 0.78));

    const equipmentSupplyAmount = unitSalesPrice * spec.qty;
    const equipmentCostAmount = unitCogs * spec.qty;

    const appliedOptions = buildAppliedOptions(spec.optionIds, isDealer, spec.freeOptionIds);
    const optionSupplyAmount = appliedOptions.reduce((s, o) => s + (o.isFreeApplied ? 0 : o.qty * o.unitPrice), 0);
    const optionCostAmount = appliedOptions.reduce((s, o) => s + o.qty * o.costPrice, 0);
    const installedOptionsSummary = appliedOptions.map(o => o.name).join(' · ');

    const supplyAmount = equipmentSupplyAmount + optionSupplyAmount;
    const totalCogsAmount = equipmentCostAmount + optionCostAmount;
    const vatAmount = Math.round(supplyAmount * 0.1);
    const grandTotal = supplyAmount + vatAmount;

    // 수납/미납/연체 금액 계산 (부가세 포함 총청구액 grandTotal 기준)
    let paidAmount = 0;
    let remainingAmount = grandTotal;
    let tradeBillingStatus: 'ISSUED' | 'PARTIAL' | 'OVERDUE' | 'PAID' = 'ISSUED';
    let billingStatus: 'UNPAID' | 'PARTIAL' | 'PAID' = 'UNPAID';
    let receivableStatus: 'PENDING' | 'PARTIAL' | 'CLEARED' = 'PENDING';

    if (spec.scenario === 'PAID' || spec.scenario === 'OVERDUE_PAID') {
      paidAmount = grandTotal;
      remainingAmount = 0;
      tradeBillingStatus = 'PAID';
      billingStatus = 'PAID';
      receivableStatus = 'CLEARED';
    } else if (spec.scenario === 'PARTIAL_OVERDUE') {
      paidAmount = Math.round(grandTotal * (spec.partialRatio || 0.5));
      remainingAmount = grandTotal - paidAmount;
      tradeBillingStatus = 'PARTIAL';
      billingStatus = 'PARTIAL';
      receivableStatus = 'PARTIAL';
    } else if (spec.scenario === 'UNPAID_OVERDUE') {
      paidAmount = 0;
      remainingAmount = grandTotal;
      tradeBillingStatus = 'OVERDUE';
      billingStatus = 'UNPAID';
      receivableStatus = 'PENDING';
    } else {
      // ISSUED_UNPAID
      paidAmount = 0;
      remainingAmount = grandTotal;
      tradeBillingStatus = 'ISSUED';
      billingStatus = 'UNPAID';
      receivableStatus = 'PENDING';
    }

    const tradeItemSummary = `완제품: ${prod.name} ${spec.qty}대 / 출고설치옵션: ${installedOptionsSummary}`;
    const createdIso = `${spec.orderDate}T09:00:00.000Z`;
    const deliveredIso = `${spec.deliveryDate}T15:30:00.000Z`;
    const billedIso = `${spec.billingDate}T10:00:00.000Z`;
    const paidIso = spec.paidDate ? `${spec.paidDate}T14:20:00.000Z` : undefined;

    // 1. 유통 수주·계약 원장 (TradeSalesOrder) — 이메일 미발송 ('GENERATED')
    salesOrders.push({
      id: orderId,
      orderNo: orderId,
      customerId: cust.id,
      customerName: cust.name,
      customerBizNo: cust.bizRegNo || '',
      customerTier: cust.customerTier || 'END_USER',
      contractId,
      contractNo: contractId,
      contractType: 'TRADE',
      contractUnitRule: 'PER_OUTBOUND',
      outboundSeq: spec.monthIndex,
      outboundId,
      siteName: cust.address || '고객사 지정 사업장',
      itemType: 'EQUIPMENT',
      manufacturer: prod.brand || '항차그룹',
      modelName: prod.modelName,
      serialNumber: spec.serialNumbers.join(', '),
      quantity: spec.qty,
      unitSalesPrice,
      unitCogs,
      warehouseName: prod.defaultWarehouse || 'A창고',
      billingMode: 'STANDALONE',
      targetBillingYm: spec.ym,
      linkedReceivableId: receivableId,
      linkedBillingId: billingId,
      deliveryMethod: 'DIRECT',
      orderDate: spec.orderDate,
      deliveryDate: spec.deliveryDate,
      status: 'DELIVERED',
      equipmentSupplyAmount,
      equipmentCostAmount,
      optionSupplyAmount,
      optionCostAmount,
      totalSalesAmount: supplyAmount,
      totalCogsAmount,
      appliedOptions,
      installedOptionsSummary,
      contractDocStatus: 'GENERATED',
      contractSentAt: undefined,
      contractSentTo: undefined,
      deliveryLocation: cust.address || '경기도 평택시 포승읍 물류단지',
      receiverName: cust.representative || '현장담당자',
      receiverPhone: cust.repContact || '010-2000-3000',
      paymentTerms: `납품 검수 후 당월 말일 청구, 납기일 ${spec.dueDate} 현금 결제`,
      specialTerms: `1. 완제품 지게차 및 출고 설치옵션(${installedOptionsSummary}) 일체 장착 출고\n2. 이메일 무발송 전산 확정 계약`,
      salespersonName: '유통영업팀',
      memo: `2026년 ${spec.ym.slice(5)}월 제${spec.monthIndex}차 FL 유통계약 · ${tradeItemSummary}`,
      createdAt: createdIso,
      updatedAt: paidIso || billedIso,
      tenant_id: 'fl-demo'
    });

    // 2. 유통 수주 상세 품목 (TradeSalesOrderLine)
    salesOrderLines.push({
      id: lineId,
      orderId,
      productId: prod.id,
      qty: spec.qty,
      unitPrice: unitSalesPrice,
      unitCogs,
      serialNumbers: spec.serialNumbers,
      warehouseName: prod.defaultWarehouse || 'A창고',
      memo: `출고설치옵션 장착: ${installedOptionsSummary}`,
      createdAt: createdIso,
      tenant_id: 'fl-demo'
    });

    // 3. 유통 출고·인수 원장 (TradeOutbound)
    outbounds.push({
      id: outboundId,
      outboundNo: outboundId,
      orderId,
      salesOrderId: orderId,
      orderNo: orderId,
      contractId,
      contractNo: contractId,
      contractType: 'TRADE',
      contractUnitRule: 'PER_OUTBOUND',
      outboundSeq: spec.monthIndex,
      requestDate: spec.orderDate,
      scheduledDate: spec.deliveryDate,
      completedDate: spec.deliveryDate,
      customerId: cust.id,
      customerName: cust.name,
      itemType: 'EQUIPMENT',
      manufacturer: prod.brand || '항차그룹',
      modelName: prod.modelName,
      serialNumber: spec.serialNumbers.join(', '),
      quantity: spec.qty,
      warehouseName: prod.defaultWarehouse || 'A창고',
      status: 'DELIVERED',
      deliveryType: 'DIRECT',
      driverName: '김탁송 기사',
      driverContact: '010-8222-5111',
      vehicleNo: '경기82바5512',
      shippingCost: 180000,
      paidBy: 'OURS',
      destinationAddress: cust.address || '경기도 평택시 포승읍 물류단지',
      receiverName: cust.representative || '현장담당자',
      receiverPhone: cust.repContact || '010-2000-3000',
      inspectorName: '박검수 팀장',
      inspectionNote: `완제품 시리얼(${spec.serialNumbers.join(', ')}) 및 장착옵션(${installedOptionsSummary}) 출고 검수 합격`,
      appliedOptions,
      optionBillingAmount: optionSupplyAmount,
      optionSupplyAmount,
      optionCostAmount,
      equipmentSupplyAmount,
      installedOptionsSummary,
      allocatedAt: createdIso,
      packedAt: `${spec.orderDate}T16:00:00.000Z`,
      shippedAt: `${spec.deliveryDate}T08:30:00.000Z`,
      deliveredAt: deliveredIso,
      closingMemo: `유통계약 ${contractId} 출고 완료 · ${prod.modelName} ${spec.qty}대 + 옵션(${installedOptionsSummary})`,
      createdAt: createdIso,
      updatedAt: deliveredIso,
      tenant_id: 'fl-demo'
    });

    // 4. 유통 청구·명세서 원장 (TradeBilling) — 이메일 미발송 (sentAt: undefined)
    tradeBillings.push({
      id: tradeBillingId,
      orderId,
      orderIds: [orderId],
      contractId,
      contractNo: contractId,
      customerId: cust.id,
      billingMonth: spec.ym,
      billingDate: spec.billingDate,
      dueDate: spec.dueDate,
      equipmentSupplyAmount,
      optionSupplyAmount,
      supplyAmount,
      vatAmount,
      totalAmount: grandTotal,
      paidAmount,
      remainingAmount,
      overdueDays: spec.overdueDays,
      paymentScenario: spec.scenario,
      appliedOptions,
      installedOptionsSummary,
      status: tradeBillingStatus,
      recipientName: cust.representative || '재무담당자',
      recipientEmail: undefined,
      sentAt: undefined,
      paidAt: paidIso,
      memo:
        spec.scenario === 'PAID'
          ? `[정상완납] ${contractId} 지게차 본품 및 설치옵션 합산 청구 · 기한 내 전액 수납 완료`
          : spec.scenario === 'OVERDUE_PAID'
          ? `[연체후완납] ${contractId} 납기 대비 ${spec.overdueDays}일 연체 후 독촉 거쳐 전액 수납 완료`
          : spec.scenario === 'PARTIAL_OVERDUE'
          ? `[일부수납·잔액연체] ${contractId} 총액의 50%(₩${paidAmount.toLocaleString()}) 수납 · 잔액 ₩${remainingAmount.toLocaleString()} (${spec.overdueDays}일 연체 미납)`
          : spec.scenario === 'UNPAID_OVERDUE'
          ? `[장기연체·전액미납] ${contractId} 납기(${spec.dueDate}) 경과 ${spec.overdueDays}일 장기 연체 · 전액 미납`
          : `[청구발행·미납] ${contractId} 10월 정기 청구 발행 · 최종 시점 미납 잔액 ₩${remainingAmount.toLocaleString()}`,
      createdAt: billedIso,
      updatedAt: paidIso || billedIso,
      tenant_id: 'fl-demo'
    });

    // 5. 전사 통합 계약 원장 (Contract - contractType: 'TRADE')
    const grossProfit = supplyAmount - totalCogsAmount;
    const marginRate = supplyAmount > 0 ? Number(((grossProfit / supplyAmount) * 100).toFixed(1)) : 0;

    contracts.push({
      id: contractId,
      contractNo: contractId,
      contractType: 'TRADE',
      contractCategory: 'EQUIPMENT_WITH_OPTION',
      contractUnitRule: 'PER_OUTBOUND',
      outboundId,
      outboundSeq: spec.monthIndex,
      tradeOrderId: orderId,
      tradeItemSummary,
      customerId: cust.id,
      siteName: cust.address || '고객사 사업장',
      startDate: spec.orderDate,
      endDate: spec.deliveryDate,
      billingDay: 25,
      statementClosingDay: 25,
      paymentDueDay: Number(spec.dueDate.slice(8, 10)) || 15,
      paymentDueMonthOffset: 1,
      status: 'ACTIVE',
      installedOptionsSummary,
      appliedOptions,
      optionBillingMode: 'ONE_TIME_BILLING',
      optionMonthlyTotal: 0,
      optionOneTimeTotal: optionSupplyAmount,
      optionSupplyAmount,
      equipmentSupplyAmount,
      tradeSupplyAmount: supplyAmount,
      tradeTotalAmount: grandTotal,
      tradeCostAmount: totalCogsAmount,
      costTypeLabel: '유통원가',
      contractMonths: 1,
      monthlyRevenueAmount: supplyAmount,
      monthlyCostAmount: totalCogsAmount,
      equipmentCostAmount,
      optionCostAmount,
      maintenanceCostAmount: 0,
      totalAmount: supplyAmount,
      revenueAmount: supplyAmount,
      costAmount: totalCogsAmount,
      profitAmount: grossProfit,
      marginRate,
      specialTerms: `유통계약(${spec.ym}) · ${tradeItemSummary} · 이메일 미발송`,
      lastBilledYm: spec.ym,
      lastBillingDate: spec.billingDate,
      createdAt: createdIso,
      updatedAt: paidIso || billedIso,
      tenant_id: 'fl-demo'
    });

    // 6. 전사 통합 청구 원장 (Billing)
    // 주의: Billings.tsx 및 DelinquencyPage.tsx 규격상 b.totalAmount는 공급가액(supplyAmount)이며,
    // grandTotal = b.totalAmount + Math.round(b.totalAmount * 0.1), b.paidAmount는 부가세 포함 실수납액(paidAmount)임.
    billings.push({
      id: billingId,
      billingType: 'ASSET_SALE',
      billingYm: spec.ym,
      customerId: cust.id,
      contractId,
      contractType: 'TRADE',
      tradeOrderId: orderId,
      tradeBillingId,
      billingDate: spec.billingDate,
      dueDate: spec.dueDate,
      supplyAmount,
      vatAmount,
      totalAmount: supplyAmount,
      paidAmount,
      overdueDays: spec.overdueDays,
      appliedOptions,
      optionSupplyAmount,
      equipmentSupplyAmount,
      status: billingStatus,
      details: {
        orderId,
        contractNo: contractId,
        outboundId,
        serialNumbers: spec.serialNumbers,
        installedOptionsSummary,
        paymentScenario: spec.scenario,
        dueDate: spec.dueDate,
        grandTotal,
        remainingAmount,
        emailSent: false
      },
      createdAt: billedIso,
      updatedAt: paidIso || billedIso,
      tenant_id: 'fl-demo'
    });

    // 7. 청구 상세 라인 (BillingDetail - 본품 1건 + 출고설치옵션 1건)
    billingDetails.push({
      id: `BDET-${codeSuffix}-EQ`,
      billingId,
      receivableId,
      itemName: `[완제품] ${prod.name} (${spec.serialNumbers.join(', ')})`,
      displayName: `${prod.name} 본품`,
      internalDescription: `[유통출고:${orderId}] 완제품 지게차 ${prod.modelName} ${spec.qty}대 본품 공급가`,
      quantity: spec.qty,
      unitPrice: unitSalesPrice,
      amount: equipmentSupplyAmount,
      description: `출고번호 ${outboundId} · 시리얼 ${spec.serialNumbers.join(', ')}`,
      createdAt: billedIso,
      updatedAt: billedIso,
      tenant_id: 'fl-demo'
    });

    billingDetails.push({
      id: `BDET-${codeSuffix}-OPT`,
      billingId,
      receivableId,
      itemName: `[출고설치옵션] ${installedOptionsSummary}`,
      displayName: `출고 설치옵션 (${appliedOptions.length}종 장착)`,
      internalDescription: `[유통출고:${orderId}] 지게차 출고 설치옵션 (${installedOptionsSummary}) 합산 공급가`,
      quantity: 1,
      unitPrice: optionSupplyAmount,
      amount: optionSupplyAmount,
      description: appliedOptions.map(o => `${o.name}(₩${o.supplyAmount.toLocaleString()})`).join(', '),
      createdAt: billedIso,
      updatedAt: billedIso,
      tenant_id: 'fl-demo'
    });

    // 8. 외상미수금 원장 (Receivable)
    receivables.push({
      id: receivableId,
      contractId,
      billingId,
      tradeOrderId: orderId,
      tradeBillingId,
      customerId: cust.id,
      assetNo: spec.serialNumbers[0],
      type: 'OTHER',
      occurredDate: spec.deliveryDate,
      dueDate: spec.dueDate,
      internalDescription: `[유통출고:${orderId}] ${contractId} ${prod.modelName} 본품 및 출고옵션(${installedOptionsSummary}) 유통대금`,
      displayName: `${prod.name} 외 설치옵션 ${appliedOptions.length}종`,
      supplyAmount,
      vatAmount,
      totalAmount: grandTotal,
      billedAmount: paidAmount,
      paidAmount,
      remainingAmount,
      overdueDays: spec.overdueDays,
      status: receivableStatus,
      createdAt: billedIso,
      updatedAt: paidIso || billedIso,
      tenant_id: 'fl-demo'
    });

    // 9. 수납 원장 (Payment) + 법인통장 입금 내역 (BankTransaction) + 대사 링크 (PaymentDepositLink)
    if (paidAmount > 0 && spec.paidDate) {
      const paymentId = `PAY-${codeSuffix}`;
      const bankTxId = `TXN-${codeSuffix}`;
      const linkId = `PDL-${codeSuffix}`;
      const useShinhan = spec.seq % 2 === 1;

      payments.push({
        id: paymentId,
        billingId,
        paymentDate: spec.paidDate,
        amount: paidAmount,
        method: '계좌이체',
        memo:
          spec.scenario === 'PAID'
            ? `${contractId} 유통대금(본품+설치옵션) 기한 내 전액 수납`
            : spec.scenario === 'OVERDUE_PAID'
            ? `${contractId} 유통대금 ${spec.overdueDays}일 연체 후 전액 수납 완결`
            : `${contractId} 유통대금 1차 부분수납(50%) · 잔액 ₩${remainingAmount.toLocaleString()} 미납`,
        createdAt: paidIso!,
        updatedAt: paidIso!,
        tenant_id: 'fl-demo'
      });

      bankTransactions.push({
        id: bankTxId,
        bankName: useShinhan ? '신한은행' : '기업은행',
        accountNumber: useShinhan ? '140-012-889201' : '042-119283-04-015',
        transactionDate: spec.paidDate,
        summary: '타행이체입금',
        counterparty: cust.name,
        senderName: cust.name,
        senderAccount: '',
        depositAmount: paidAmount,
        withdrawAmount: 0,
        balance: 250000000 + spec.seq * 15000000,
        branchName: useShinhan ? '평택금융센터' : '남동공단지점',
        customerId: cust.id,
        matchedBillingId: billingId,
        matchingType: 'AUTO',
        isDeposit: true,
        memo: `${contractId} (${orderId}) 무진글로벌 지게차 유통청구 수납 대사 완료`,
        createdAt: paidIso!,
        updatedAt: paidIso!,
        tenant_id: 'fl-demo'
      });

      paymentDepositLinks.push({
        id: linkId,
        paymentId,
        bankTransactionId: bankTxId,
        usedAmount: paidAmount,
        createdAt: paidIso!,
        tenant_id: 'fl-demo'
      });
    }

    // 10. 연체 추심·독촉 이력 (DelinquencyActionLog)
    if (
      spec.scenario === 'OVERDUE_PAID' ||
      spec.scenario === 'PARTIAL_OVERDUE' ||
      spec.scenario === 'UNPAID_OVERDUE'
    ) {
      const actionDate =
        spec.scenario === 'OVERDUE_PAID' && spec.paidDate
          ? spec.paidDate
          : '2026-11-01';
      const promiseDate =
        spec.scenario === 'OVERDUE_PAID' && spec.paidDate
          ? spec.paidDate
          : '2026-11-20';
      const promiseStatus =
        spec.scenario === 'OVERDUE_PAID'
          ? 'KEPT'
          : spec.scenario === 'PARTIAL_OVERDUE'
          ? 'PENDING'
          : 'BROKEN';

      delinquencyActionLogs.push({
        id: `DLQ-${codeSuffix}`,
        customerId: cust.id,
        actionDate,
        actionType: spec.delinquencyActionType || 'CALL',
        actionDetails: `[${contractId} / ${orderId}] ${spec.delinquencyNote || '유통대금 연체 독촉'} (청구합계 ₩${grandTotal.toLocaleString()}, 수납 ₩${paidAmount.toLocaleString()}, 미납잔액 ₩${remainingAmount.toLocaleString()})`,
        recordedBy: '채권관리팀장',
        promiseDate,
        promiseAmount: remainingAmount > 0 ? remainingAmount : grandTotal,
        promiseStatus,
        createdAt: `${actionDate}T11:00:00.000Z`,
        tenant_id: 'fl-demo'
      });
    }
  }

  return {
    salesOrders,
    salesOrderLines,
    outbounds,
    tradeBillings,
    contracts,
    billings,
    billingDetails,
    receivables,
    payments,
    bankTransactions,
    paymentDepositLinks,
    delinquencyActionLogs
  };
}

export const FL_TRADE_RWTT_2026_BUNDLE = buildFlTradeRwtt2026Bundle();
