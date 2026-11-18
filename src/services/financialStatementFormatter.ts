import type {
  FlApPayable,
  FlBilling,
  FlCollection,
  FlContract,
  FlContractLine,
  FlFinanceLease,
  FlFinanceLeaseSchedule,
  FlFulfillment,
  FlInventoryUnit,
  FlLogisticsDispatch,
  FlPurchase,
  FlPurchaseLine,
  FlRentalMaintenance,
  FlStockMovement,
  FlTradeAftercareCase,
} from '../types/domain';

export interface JournalPosting {
  ym: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  categoryTag: 'OP_CF' | 'INV_CF' | 'FIN_CF' | 'NON_CASH';
  memo: string;
}

export interface StatementLineItem {
  code: string;
  label: string;
  amount: number;
  indent?: number;
  isSubtotal?: boolean;
}

export interface AssetScheduleRow {
  unitId: string;
  unitCode: string;
  itemName: string;
  serialNo: string;
  acquisitionType: string;
  acquisitionDate: string;
  acquisitionCostKrw: number;
  periodDepreciationKrw: number;
  accumulatedDepreciationKrw: number;
  endingBookValueKrw: number;
}

export interface LeaseScheduleSummaryRow {
  leaseId: string;
  lenderName: string;
  serialNo: string;
  repaymentMethod: string;
  annualInterestRate: number;
  principalAmountKrw: number;
  periodPrincipalPaidKrw: number;
  periodInterestExpenseKrw: number;
  endingRemainingPrincipalKrw: number;
}

export interface FinancialStatementsReport {
  startYm: string;
  endYm: string;
  balanceSheet: {
    assets: StatementLineItem[];
    totalAssets: number;
    liabilities: StatementLineItem[];
    totalLiabilities: number;
    equity: StatementLineItem[];
    totalEquity: number;
    balanceDiff: number;
  };
  incomeStatement: {
    rows: StatementLineItem[];
    tradeRevenue: number;
    rentalRevenue: number;
    totalRevenue: number;
    tradeCogs: number;
    rentalCogs: number;
    totalCogs: number;
    grossProfit: number;
    sgaTotal: number;
    operatingIncome: number;
    nonOpIncome: number;
    nonOpExpense: number;
    interestExpense: number;
    fxGainLoss: number;
    netIncome: number;
  };
  cashFlow: {
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashChange: number;
    beginningCash: number;
    endingCash: number;
    cashCheckDiff: number;
    rows: StatementLineItem[];
  };
  assetSchedule: AssetScheduleRow[];
  leaseSummary: LeaseScheduleSummaryRow[];
}

export interface FinancialDatasetInput {
  purchases: FlPurchase[];
  purchaseLines: FlPurchaseLine[];
  inventoryUnits: FlInventoryUnit[];
  stockMovements: FlStockMovement[];
  financeLeases: FlFinanceLease[];
  financeLeaseSchedules: FlFinanceLeaseSchedule[];
  fulfillments: FlFulfillment[];
  billings: FlBilling[];
  collections: FlCollection[];
  apPayables: FlApPayable[];
  logisticsDispatches: FlLogisticsDispatch[];
  rentalMaintenances: FlRentalMaintenance[];
  tradeAftercareCases: FlTradeAftercareCase[];
  contracts?: FlContract[];
  contractLines?: FlContractLine[];
}

export const BS_DEBIT_NORMAL = new Set([
  '현금및현금성자산',
  '외상매출금',
  '상품재고(유통)',
  '부품소모품재고',
  '부가세대급금',
  '기계장치(렌탈자산)',
]);

export const BS_CREDIT_NORMAL = new Set([
  '감가상각누계액',
  '외상매입금',
  '부가세예수금',
  '미지급비용·이자',
  '금융리스부채',
  '자본금',
  '기초이월잉여금',
]);

export function compileFinancialStatementsFromPostings(params: {
  startYm: string;
  endYm: string;
  includeRental: boolean;
  postings: JournalPosting[];
  assetSchedule: AssetScheduleRow[];
  financeLeases: FlFinanceLease[];
  financeLeaseSchedules: FlFinanceLeaseSchedule[];
}): FinancialStatementsReport {
  const {
    startYm,
    endYm,
    includeRental,
    postings,
    assetSchedule,
    financeLeases,
    financeLeaseSchedules,
  } = params;

  // ==========================================================================
  // 원장 집계 (endYm 기준 누계 대차대조 + startYm~endYm 손익 분리)
  // ==========================================================================
  const bsNet = new Map<string, number>(); // (+) = Debit, (-) = Credit
  const priorNominalNet = new Map<string, number>();
  const periodNominalNet = new Map<string, number>();

  let beginningCash = 0;
  let opCashPeriod = 0;
  let invCashPeriod = 0;
  let finCashPeriod = 0;

  for (const p of postings) {
    if (p.ym > endYm) continue;

    // Cash tracking
    if (p.ym < startYm) {
      if (p.debitAccount === '현금및현금성자산') beginningCash += p.amount;
      if (p.creditAccount === '현금및현금성자산') beginningCash -= p.amount;
    } else {
      const delta =
        (p.debitAccount === '현금및현금성자산' ? p.amount : 0) -
        (p.creditAccount === '현금및현금성자산' ? p.amount : 0);
      if (delta !== 0) {
        if (p.categoryTag === 'OP_CF') opCashPeriod += delta;
        else if (p.categoryTag === 'INV_CF') invCashPeriod += delta;
        else if (p.categoryTag === 'FIN_CF') finCashPeriod += delta;
      }
    }

    const postSide = (acct: string, sign: 1 | -1) => {
      if (BS_DEBIT_NORMAL.has(acct) || BS_CREDIT_NORMAL.has(acct)) {
        bsNet.set(acct, (bsNet.get(acct) || 0) + sign * p.amount);
      } else if (p.ym < startYm) {
        priorNominalNet.set(acct, (priorNominalNet.get(acct) || 0) + sign * p.amount);
      } else {
        periodNominalNet.set(acct, (periodNominalNet.get(acct) || 0) + sign * p.amount);
      }
    };

    postSide(p.debitAccount, 1);
    postSide(p.creditAccount, -1);
  }

  const getBsDr = (acct: string) => Math.round(bsNet.get(acct) || 0);
  const getBsCr = (acct: string) => Math.round(-(bsNet.get(acct) || 0));

  const getPeriodCr = (acct: string) => Math.round(-(periodNominalNet.get(acct) || 0));
  const getPeriodDr = (acct: string) => Math.round(periodNominalNet.get(acct) || 0);

  // 전기 이월 이익잉여금 = prior기간 총수익 - 총비용 = sum(-priorNominalNet)
  let priorRetained = 0;
  for (const val of priorNominalNet.values()) {
    priorRetained += -val;
  }
  priorRetained = Math.round(priorRetained);

  // 당기 손익계산서 산출
  const tradeRevenue = getPeriodCr('상품매출(유통)');
  const rentalRevenue = getPeriodCr('임대매출(렌탈)');
  const totalRevenue = tradeRevenue + rentalRevenue;

  const tradeCogs = getPeriodDr('상품매출원가');
  const depExpense = getPeriodDr('감가상각비(렌탈)');
  const maintExpense = getPeriodDr('수선유지·외주정비비');
  const subleaseExpense = getPeriodDr('전대임차료(원가)');
  const rentalCogs = depExpense + maintExpense + subleaseExpense;
  const totalCogs = tradeCogs + rentalCogs;

  const grossProfit = totalRevenue - totalCogs;
  const logisticsExpense = getPeriodDr('운반·물류비');
  const sgaTotal = logisticsExpense;
  const operatingIncome = grossProfit - sgaTotal;

  const fxGain = getPeriodCr('외환차익');
  const fxLoss = getPeriodDr('외환차손');
  const interestExpense = getPeriodDr('이자비용(금융리스)');

  const nonOpIncome = fxGain;
  const nonOpExpense = interestExpense + fxLoss;
  const netIncome = operatingIncome + nonOpIncome - nonOpExpense;

  // 재무상태표 구성
  const cashEnd = getBsDr('현금및현금성자산');
  const arBal = getBsDr('외상매출금');
  const tradeInvBal = getBsDr('상품재고(유통)');
  const partsInvBal = getBsDr('부품소모품재고');
  const vatAssetBal = getBsDr('부가세대급금');
  const machGross = getBsDr('기계장치(렌탈자산)');
  const accumDep = getBsCr('감가상각누계액');
  const machNet = machGross - accumDep;

  const totalAssets = cashEnd + arBal + tradeInvBal + partsInvBal + vatAssetBal + machNet;

  const apBal = getBsCr('외상매입금');
  const vatLiabBal = getBsCr('부가세예수금');
  const accruedLiab = getBsCr('미지급비용·이자');
  const leaseLiab = getBsCr('금융리스부채');
  const totalLiabilities = apBal + vatLiabBal + accruedLiab + leaseLiab;

  const capitalStock = getBsCr('자본금');
  const openingCarry = getBsCr('기초이월잉여금') + priorRetained;
  const totalEquity = capitalStock + openingCarry + netIncome;

  const balanceDiff = totalAssets - (totalLiabilities + totalEquity);

  // 금융리스 기간별 명세 요약
  const leaseSummary: LeaseScheduleSummaryRow[] = includeRental
    ? financeLeases.map((lease) => {
        const sch = financeLeaseSchedules.filter((s) => s.leaseId === lease.id);
        const inPeriod = sch.filter((s) => s.dueYm >= startYm && s.dueYm <= endYm);
        const upToEnd = sch.filter((s) => s.dueYm <= endYm);
        const paidPrincipalUpToEnd = upToEnd.reduce((s, r) => s + Math.round(r.principalPaymentKrw), 0);
        return {
          leaseId: lease.leaseNo,
          lenderName: lease.lenderName,
          serialNo: lease.serialNo || '-',
          repaymentMethod: lease.repaymentMethod,
          annualInterestRate: lease.annualInterestRate,
          principalAmountKrw: Math.round(lease.principalAmountKrw),
          periodPrincipalPaidKrw: inPeriod.reduce((s, r) => s + Math.round(r.principalPaymentKrw), 0),
          periodInterestExpenseKrw: inPeriod.reduce((s, r) => s + Math.round(r.interestExpenseKrw), 0),
          endingRemainingPrincipalKrw: Math.max(0, Math.round(lease.principalAmountKrw) - paidPrincipalUpToEnd),
        };
      })
    : [];

  const netCashChange = opCashPeriod + invCashPeriod + finCashPeriod;
  const endingCashFromCf = beginningCash + netCashChange;

  const balanceSheetAssets: StatementLineItem[] = [
    { code: 'BS-A1', label: '현금및현금성자산', amount: cashEnd, indent: 1 },
    { code: 'BS-A2', label: '외상매출금(매출채권)', amount: arBal, indent: 1 },
    { code: 'BS-A3', label: '상품재고(유통재고)', amount: tradeInvBal, indent: 1 },
    { code: 'BS-A4', label: '부품·소모품재고', amount: partsInvBal, indent: 1 },
    { code: 'BS-A5', label: '부가세대급금', amount: vatAssetBal, indent: 1 },
    ...(includeRental
      ? [
          { code: 'BS-A6', label: '렌탈자산(기계장치 취득원가)', amount: machGross, indent: 1 },
          { code: 'BS-A7', label: '감가상각누계액(차감)', amount: -accumDep, indent: 2 },
          { code: 'BS-A8', label: '렌탈자산 장부가액 순액', amount: machNet, isSubtotal: true },
        ]
      : []),
  ];

  const balanceSheetLiabilities: StatementLineItem[] = includeRental
    ? [
        { code: 'BS-L1', label: '외상매입금(매입·물류·외주)', amount: apBal, indent: 1 },
        { code: 'BS-L2', label: '부가세예수금', amount: vatLiabBal, indent: 1 },
        { code: 'BS-L3', label: '미지급비용·이자·전대료', amount: accruedLiab, indent: 1 },
        { code: 'BS-L4', label: '금융리스부채 잔액', amount: leaseLiab, indent: 1 },
      ]
    : [
        { code: 'BS-L1', label: '외상매입금(매입·물류)', amount: apBal, indent: 1 },
        { code: 'BS-L2', label: '부가세예수금', amount: vatLiabBal, indent: 1 },
      ];

  const incomeStatementRows: StatementLineItem[] = includeRental
    ? [
        { code: 'IS-1', label: '1. 매출액', amount: totalRevenue, isSubtotal: true },
        { code: 'IS-1A', label: '상품매출 (유통 사업부)', amount: tradeRevenue, indent: 1 },
        { code: 'IS-1B', label: '임대매출 (렌탈 사업부 일할계상)', amount: rentalRevenue, indent: 1 },
        { code: 'IS-2', label: '2. 매출원가', amount: totalCogs, isSubtotal: true },
        { code: 'IS-2A', label: '상품매출원가 (유통 출고원가)', amount: tradeCogs, indent: 1 },
        { code: 'IS-2B', label: '렌탈자산 감가상각비', amount: depExpense, indent: 1 },
        { code: 'IS-2C', label: '렌탈 정비·수선유지비', amount: maintExpense, indent: 1 },
        { code: 'IS-2D', label: '전대장비 임차원가', amount: subleaseExpense, indent: 1 },
        { code: 'IS-3', label: '3. 매출총이익', amount: grossProfit, isSubtotal: true },
        { code: 'IS-4', label: '4. 판매비와관리비 (물류·운송비)', amount: sgaTotal, isSubtotal: true },
        { code: 'IS-5', label: '5. 영업이익', amount: operatingIncome, isSubtotal: true },
        { code: 'IS-6A', label: '6. 영업외수익 · 외환차익', amount: fxGain, indent: 1 },
        { code: 'IS-6B', label: '7-1. 영업외비용 · 금융리스 이자비용', amount: interestExpense, indent: 1 },
        { code: 'IS-6C', label: '7-2. 영업외비용 · 외환차손', amount: fxLoss, indent: 1 },
        { code: 'IS-7', label: '8. 당기순이익', amount: netIncome, isSubtotal: true },
      ]
    : [
        { code: 'IS-1', label: '1. 매출액', amount: totalRevenue, isSubtotal: true },
        { code: 'IS-1A', label: '상품매출', amount: tradeRevenue, indent: 1 },
        { code: 'IS-2', label: '2. 매출원가', amount: totalCogs, isSubtotal: true },
        { code: 'IS-2A', label: '상품매출원가', amount: tradeCogs, indent: 1 },
        { code: 'IS-3', label: '3. 매출총이익', amount: grossProfit, isSubtotal: true },
        { code: 'IS-4', label: '4. 판매비와관리비 (물류·운송비)', amount: sgaTotal, isSubtotal: true },
        { code: 'IS-5', label: '5. 영업이익', amount: operatingIncome, isSubtotal: true },
        { code: 'IS-6A', label: '6. 영업외수익 · 외환차익', amount: fxGain, indent: 1 },
        { code: 'IS-6C', label: '7. 영업외비용 · 외환차손', amount: fxLoss, indent: 1 },
        { code: 'IS-7', label: '8. 당기순이익', amount: netIncome, isSubtotal: true },
      ];

  return {
    startYm,
    endYm,
    balanceSheet: {
      assets: balanceSheetAssets,
      totalAssets,
      liabilities: balanceSheetLiabilities,
      totalLiabilities,
      equity: [
        { code: 'BS-E1', label: '자본금', amount: capitalStock, indent: 1 },
        { code: 'BS-E2', label: '이월이익잉여금·개시자본', amount: openingCarry, indent: 1 },
        { code: 'BS-E3', label: '당기순이익(조회기간 귀속)', amount: netIncome, indent: 1 },
      ],
      totalEquity,
      balanceDiff,
    },
    incomeStatement: {
      rows: incomeStatementRows,
      tradeRevenue,
      rentalRevenue,
      totalRevenue,
      tradeCogs,
      rentalCogs,
      totalCogs,
      grossProfit,
      sgaTotal,
      operatingIncome,
      nonOpIncome,
      nonOpExpense,
      interestExpense,
      fxGainLoss: fxGain - fxLoss,
      netIncome,
    },
    cashFlow: {
      operatingCashFlow: opCashPeriod,
      investingCashFlow: invCashPeriod,
      financingCashFlow: finCashPeriod,
      netCashChange,
      beginningCash,
      endingCash: endingCashFromCf,
      cashCheckDiff: endingCashFromCf - cashEnd,
      rows: [
        { code: 'CF-1', label: '1. 영업활동 현금흐름', amount: opCashPeriod, isSubtotal: true },
        { code: 'CF-2', label: '2. 투자활동 현금흐름', amount: invCashPeriod, isSubtotal: true },
        { code: 'CF-3', label: '3. 재무활동 현금흐름', amount: finCashPeriod, isSubtotal: true },
        { code: 'CF-4', label: '4. 당기 현금 순증감', amount: netCashChange, isSubtotal: true },
        { code: 'CF-5', label: '5. 기초 현금및현금성자산', amount: beginningCash, indent: 1 },
        { code: 'CF-6', label: '6. 기말 현금및현금성자산', amount: endingCashFromCf, isSubtotal: true },
      ],
    },
    assetSchedule,
    leaseSummary,
  };
}
