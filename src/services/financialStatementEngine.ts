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
  ItemCategory,
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
  contracts: FlContract[];
  contractLines: FlContractLine[];
}

function tradeInvAcctForCategory(cat?: ItemCategory): string {
  return cat === '부품' || cat === '소모품' ? '부품소모품재고' : '상품재고(유통)';
}

function listMonthsBetween(fromYm: string, toYm: string): string[] {
  if (!fromYm || !toYm || fromYm > toYm) return [];
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const BS_DEBIT_NORMAL = new Set([
  '현금및현금성자산',
  '외상매출금',
  '상품재고(유통)',
  '부품소모품재고',
  '부가세대급금',
  '기계장치(렌탈자산)',
]);

const BS_CREDIT_NORMAL = new Set([
  '감가상각누계액',
  '외상매입금',
  '부가세예수금',
  '미지급비용·이자',
  '금융리스부채',
  '자본금',
  '기초이월잉여금',
]);

export function generateFinancialStatements(
  data: FinancialDatasetInput,
  startYm: string,
  endYm: string
): FinancialStatementsReport {
  const postings: JournalPosting[] = [];

  // 1. 기초 영업자본금 설정 (유동성 확보 기준선)
  postings.push({
    ym: '2026-01',
    debitAccount: '현금및현금성자산',
    creditAccount: '자본금',
    amount: 300000000,
    categoryTag: 'FIN_CF',
    memo: '기초 자본금 납입',
  });

  const unitById = new Map(data.inventoryUnits.map((u) => [u.id, u]));

  // 2. 매입 확정 (IMPORT / DOMESTIC) — 희망완료일 기준 귀속
  for (const p of data.purchases) {
    if (p.status !== 'CONFIRMED') continue;
    const ym = p.effectiveDate.slice(0, 7);
    const lines = data.purchaseLines.filter((l) => l.purchaseId === p.id);
    if (p.targetDomain === 'TRADE' && lines.length > 0) {
      let postedMerch = 0;
      let postedAnc = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const isLast = i === lines.length - 1;
        const acct = tradeInvAcctForCategory(l.itemCategory);
        const merchAmt = isLast
          ? Math.round(p.krwMerchandiseTotal) - postedMerch
          : Math.round(l.allocatedMerchandiseKrw);
        const ancAmt = isLast
          ? Math.round(p.customsDutyKrw + p.oceanFreightKrw + p.clearanceFeeKrw + p.inlandFreightKrw) - postedAnc
          : Math.round(l.allocatedAncillaryKrw);
        postedMerch += merchAmt;
        postedAnc += ancAmt;
        if (merchAmt > 0) {
          postings.push({
            ym,
            debitAccount: acct,
            creditAccount: '외상매입금',
            amount: merchAmt,
            categoryTag: 'NON_CASH',
            memo: `${p.purchaseNo} 매입물품대`,
          });
        }
        if (ancAmt > 0) {
          postings.push({
            ym,
            debitAccount: acct,
            creditAccount: '현금및현금성자산',
            amount: ancAmt,
            categoryTag: 'OP_CF',
            memo: `${p.purchaseNo} 수입통관 부대비용`,
          });
        }
      }
      if (p.purchaseType === 'DOMESTIC' && p.krwMerchandiseTotal > 0) {
        postings.push({
          ym,
          debitAccount: '부가세대급금',
          creditAccount: '외상매입금',
          amount: Math.round(p.krwMerchandiseTotal * 0.1),
          categoryTag: 'NON_CASH',
          memo: `${p.purchaseNo} 내수 매입세액`,
        });
      }
      continue;
    }

    const assetAcct = p.targetDomain === 'RENTAL' ? '기계장치(렌탈자산)' : '상품재고(유통)';
    if (p.krwMerchandiseTotal > 0) {
      const vat = p.purchaseType === 'DOMESTIC' ? Math.round(p.krwMerchandiseTotal * 0.1) : 0;
      postings.push({
        ym,
        debitAccount: assetAcct,
        creditAccount: '외상매입금',
        amount: Math.round(p.krwMerchandiseTotal),
        categoryTag: 'NON_CASH',
        memo: `${p.purchaseNo} 매입물품대`,
      });
      if (vat > 0) {
        postings.push({
          ym,
          debitAccount: '부가세대급금',
          creditAccount: '외상매입금',
          amount: vat,
          categoryTag: 'NON_CASH',
          memo: `${p.purchaseNo} 내수 매입세액`,
        });
      }
    }
    const anc = Math.round(p.customsDutyKrw + p.oceanFreightKrw + p.clearanceFeeKrw + p.inlandFreightKrw);
    if (anc > 0) {
      postings.push({
        ym,
        debitAccount: assetAcct,
        creditAccount: '현금및현금성자산',
        amount: anc,
        categoryTag: p.targetDomain === 'RENTAL' ? 'INV_CF' : 'OP_CF',
        memo: `${p.purchaseNo} 수입통관 부대비용`,
      });
    }
  }

  // 매입전표 없이 직접 기초 등록된 실물 보유 자산/재고 기초이월 반영 (사후 출고량 역산 보정)
  for (const u of data.inventoryUnits) {
    if (u.acquisitionType === 'PURCHASE' && !u.purchaseLineId && u.unitCostKrw > 0) {
      const ym = u.acquisitionDate.slice(0, 7);
      const acct = u.ownershipDomain === '렌탈자산' ? '기계장치(렌탈자산)' : tradeInvAcctForCategory(u.itemCategory);
      const postOutQty = data.stockMovements
        .filter((m) => m.unitId === u.id && m.movementType !== 'INBOUND' && m.movementType !== 'ACCOUNT_TRANSFER')
        .reduce((s, m) => s + m.qtyDelta, 0);
      const openingQty =
        u.managementType === 'SERIAL' ? 1 : Math.max(u.qtyOnHand - postOutQty, u.qtyOnHand, 1);
      const initialVal = Math.round(u.unitCostKrw * openingQty);
      postings.push({
        ym,
        debitAccount: acct,
        creditAccount: '기초이월잉여금',
        amount: initialVal,
        categoryTag: 'NON_CASH',
        memo: `기초이월 ${u.unitCode}`,
      });
    }
  }

  // 계정대체 장부가 순액 이관 반영
  for (const m of data.stockMovements) {
    if (m.movementType !== 'ACCOUNT_TRANSFER' || m.amountKrw <= 0) continue;
    const u = unitById.get(m.unitId);
    const tradeAcct = tradeInvAcctForCategory(u?.itemCategory);
    const fromAcct = m.fromDomain === '렌탈자산' ? '기계장치(렌탈자산)' : tradeAcct;
    const toAcct = m.toDomain === '렌탈자산' ? '기계장치(렌탈자산)' : tradeAcct;
    if (fromAcct === toAcct) continue;
    postings.push({
      ym: m.effectiveDate.slice(0, 7),
      debitAccount: toAcct,
      creditAccount: fromAcct,
      amount: Math.round(m.amountKrw),
      categoryTag: 'NON_CASH',
      memo: `계정대체 ${m.fromDomain} -> ${m.toDomain}`,
    });
  }

  // 3. 금융리스 계약 체결 (렌탈자산 취득 / 금융리스부채 계상) & 회차별 원금/이자 반영
  for (const lease of data.financeLeases) {
    const ym = lease.startDate.slice(0, 7);
    postings.push({
      ym,
      debitAccount: '기계장치(렌탈자산)',
      creditAccount: '금융리스부채',
      amount: Math.round(lease.principalAmountKrw),
      categoryTag: 'NON_CASH',
      memo: `금융리스 ${lease.leaseNo} 취득`,
    });
  }

  for (const sch of data.financeLeaseSchedules) {
    if (sch.dueYm > endYm) continue;
    // 원금 상환: 지급 완료 시 현금 유출, 도래 미지급 시 미지급비용 전환
    const settleAcct = sch.isPaid ? '현금및현금성자산' : '미지급비용·이자';
    if (sch.principalPaymentKrw > 0) {
      postings.push({
        ym: sch.dueYm,
        debitAccount: '금융리스부채',
        creditAccount: settleAcct,
        amount: Math.round(sch.principalPaymentKrw),
        categoryTag: sch.isPaid ? 'FIN_CF' : 'NON_CASH',
        memo: `리스 원금상환 ${sch.leaseId} #${sch.installmentNo}`,
      });
    }
    if (sch.interestExpenseKrw > 0) {
      postings.push({
        ym: sch.dueYm,
        debitAccount: '이자비용(금융리스)',
        creditAccount: settleAcct,
        amount: Math.round(sch.interestExpenseKrw),
        categoryTag: sch.isPaid ? 'OP_CF' : 'NON_CASH',
        memo: `리스 이자비용 ${sch.leaseId} #${sch.installmentNo}`,
      });
    }
  }

  // 4. 렌탈자산 월별 정액법 감가상각 및 자산명세
  const assetSchedule: AssetScheduleRow[] = [];
  for (const u of data.inventoryUnits) {
    if (u.ownershipDomain !== '렌탈자산' || u.acquisitionType === 'SUBLEASE') continue;
    const acqYm = u.acquisitionDate.slice(0, 7);
    const monthsAll = listMonthsBetween(acqYm, endYm);
    const monthsInPeriod = monthsAll.filter((m) => m >= startYm && m <= endYm);
    const depMonths = Math.max(1, u.depreciationMonths || 60);
    const depreciableBase = Math.max(0, Math.round(u.unitCostKrw - u.residualValueKrw));
    const monthlyDep = Math.round(depreciableBase / depMonths);

    let accum = 0;
    let periodDep = 0;
    for (const m of monthsAll) {
      const rem = depreciableBase - accum;
      if (rem <= 0) break;
      const d = Math.min(monthlyDep, rem);
      accum += d;
      if (m >= startYm && m <= endYm) {
        periodDep += d;
      }
      postings.push({
        ym: m,
        debitAccount: '감가상각비(렌탈)',
        creditAccount: '감가상각누계액',
        amount: d,
        categoryTag: 'NON_CASH',
        memo: `감가상각 ${u.serialNo || u.unitCode}`,
      });
    }

    if (monthsInPeriod.length > 0 || acqYm <= endYm) {
      assetSchedule.push({
        unitId: u.id,
        unitCode: u.unitCode,
        itemName: u.itemName,
        serialNo: u.serialNo || '-',
        acquisitionType: u.acquisitionType,
        acquisitionDate: u.acquisitionDate,
        acquisitionCostKrw: Math.round(u.unitCostKrw),
        periodDepreciationKrw: periodDep,
        accumulatedDepreciationKrw: accum,
        endingBookValueKrw: Math.max(0, Math.round(u.unitCostKrw) - accum),
      });
    }

    // 전대자산 임차료는 아래 별도 루프에서 반영
  }

  // 전대자산 월 임차료
  for (const u of data.inventoryUnits) {
    if (u.ownershipDomain !== '전대자산' || u.subleaseMonthlyCostKrw <= 0) continue;
    const acqYm = u.acquisitionDate.slice(0, 7);
    const monthsAll = listMonthsBetween(acqYm, endYm);
    for (const m of monthsAll) {
      postings.push({
        ym: m,
        debitAccount: '전대임차료(원가)',
        creditAccount: '미지급비용·이자',
        amount: Math.round(u.subleaseMonthlyCostKrw),
        categoryTag: 'NON_CASH',
        memo: `전대 임차료 ${u.serialNo || u.unitCode}`,
      });
    }
  }

  // 5. 유통 출고 매출원가 (희망완료일 기준 귀속)
  for (const f of data.fulfillments) {
    if (f.status !== 'COMPLETED' || f.actionType !== '유통출고' || f.cogsAmountKrw <= 0) continue;
    const ym = (f.effectiveDate || f.recordedAt || '2026-11-01').slice(0, 7);
    const u = f.unitId ? unitById.get(f.unitId) : undefined;
    const invAcct = tradeInvAcctForCategory(u?.itemCategory);
    postings.push({
      ym,
      debitAccount: '상품매출원가',
      creditAccount: invAcct,
      amount: Math.round(f.cogsAmountKrw),
      categoryTag: 'NON_CASH',
      memo: `유통출고 매출원가 ${f.fulfillmentNo}`,
    });
  }

  // 6. 매출 청구 (유통 / 렌탈 구분)
  for (const b of data.billings) {
    if (b.status === 'CANCELLED') continue;
    const ym = b.billingYm;
    const revAcct = b.billingDomain === 'TRADE' ? '상품매출(유통)' : '임대매출(렌탈)';
    if (b.supplyAmountKrw > 0) {
      postings.push({
        ym,
        debitAccount: '외상매출금',
        creditAccount: revAcct,
        amount: Math.round(b.supplyAmountKrw),
        categoryTag: 'NON_CASH',
        memo: `청구 매출 ${b.billingNo}`,
      });
    }
    if (b.vatAmountKrw > 0) {
      postings.push({
        ym,
        debitAccount: '외상매출금',
        creditAccount: '부가세예수금',
        amount: Math.round(b.vatAmountKrw),
        categoryTag: 'NON_CASH',
        memo: `청구 부가세 ${b.billingNo}`,
      });
    }
  }

  // 7. 유통 반품 환불 차감 (매출 · 부가세 · 매출원가 역분개)
  for (const tc of data.tradeAftercareCases) {
    if (tc.status !== 'COMPLETED' || tc.caseType !== '반품환불') continue;
    const ym = tc.effectiveDate.slice(0, 7);
    if (tc.refundSupplyKrw > 0) {
      postings.push({
        ym,
        debitAccount: '상품매출(유통)',
        creditAccount: '외상매출금',
        amount: Math.round(tc.refundSupplyKrw),
        categoryTag: 'NON_CASH',
        memo: `반품환불 매출차감 ${tc.caseNo}`,
      });
    }
    if (tc.refundVatKrw > 0) {
      postings.push({
        ym,
        debitAccount: '부가세예수금',
        creditAccount: '외상매출금',
        amount: Math.round(tc.refundVatKrw),
        categoryTag: 'NON_CASH',
        memo: `반품환불 부가세차감 ${tc.caseNo}`,
      });
    }
    const u = unitById.get(tc.unitId);
    if (u && u.unitCostKrw > 0) {
      postings.push({
        ym,
        debitAccount: tradeInvAcctForCategory(u.itemCategory),
        creditAccount: '상품매출원가',
        amount: Math.round(u.unitCostKrw),
        categoryTag: 'NON_CASH',
        memo: `반품입고 원가환입 ${tc.caseNo}`,
      });
    }
  }

  // 8. 수납 입금
  for (const col of data.collections) {
    const ym = col.collectionDate.slice(0, 7);
    postings.push({
      ym,
      debitAccount: '현금및현금성자산',
      creditAccount: '외상매출금',
      amount: Math.round(col.amountKrw),
      categoryTag: 'OP_CF',
      memo: `매출채권 수납 ${col.collectionNo}`,
    });
  }

  // 9. 물류비 (운송비 순수 기록·정산)
  for (const ld of data.logisticsDispatches) {
    const ym = ld.dispatchDate.slice(0, 7);
    if (ld.transportCostKrw > 0) {
      postings.push({
        ym,
        debitAccount: '운반·물류비',
        creditAccount: '외상매입금',
        amount: Math.round(ld.transportCostKrw),
        categoryTag: 'NON_CASH',
        memo: `운송비 ${ld.dispatchNo}`,
      });
    }
    if (ld.vatKrw > 0) {
      postings.push({
        ym,
        debitAccount: '부가세대급금',
        creditAccount: '외상매입금',
        amount: Math.round(ld.vatKrw),
        categoryTag: 'NON_CASH',
        memo: `운송비 매입세액 ${ld.dispatchNo}`,
      });
    }
  }

  // 10. 렌탈 정비비 (부품 투입 / 자사 노무 / 외주비)
  for (const mnt of data.rentalMaintenances) {
    if (mnt.status !== 'COMPLETED') continue;
    const ym = mnt.effectiveDate.slice(0, 7);
    if (mnt.partsCostKrw > 0) {
      postings.push({
        ym,
        debitAccount: '수선유지·외주정비비',
        creditAccount: '부품소모품재고',
        amount: Math.round(mnt.partsCostKrw),
        categoryTag: 'NON_CASH',
        memo: `정비 부품소모 ${mnt.maintNo}`,
      });
    }
    if (mnt.laborCostKrw > 0) {
      postings.push({
        ym,
        debitAccount: '수선유지·외주정비비',
        creditAccount: '현금및현금성자산',
        amount: Math.round(mnt.laborCostKrw),
        categoryTag: 'OP_CF',
        memo: `정비 노무경비 ${mnt.maintNo}`,
      });
    }
    if (mnt.externalCostKrw > 0) {
      const extVat = Math.round(mnt.externalCostKrw * 0.1);
      postings.push({
        ym,
        debitAccount: '수선유지·외주정비비',
        creditAccount: '외상매입금',
        amount: Math.round(mnt.externalCostKrw),
        categoryTag: 'NON_CASH',
        memo: `외주 정비비 ${mnt.maintNo}`,
      });
      if (extVat > 0) {
        postings.push({
          ym,
          debitAccount: '부가세대급금',
          creditAccount: '외상매입금',
          amount: extVat,
          categoryTag: 'NON_CASH',
          memo: `외주 정비 부가세 ${mnt.maintNo}`,
        });
      }
    }
  }

  // 11. 매입채무 지급 및 외환차익/외환차손 반영
  for (const ap of data.apPayables) {
    if (ap.paidAmountKrw <= 0) continue;
    const ym = (ap.paidDate || ap.accrualDate).slice(0, 7);
    const apDec = Math.round(ap.paidAmountKrw);
    const fxDiff = Math.round(ap.fxGainLossKrw || 0);
    const cashPaid = apDec - fxDiff;

    if (cashPaid > 0) {
      postings.push({
        ym,
        debitAccount: '외상매입금',
        creditAccount: '현금및현금성자산',
        amount: Math.min(apDec, cashPaid),
        categoryTag: 'OP_CF',
        memo: `채무 결제 ${ap.payableNo}`,
      });
    }
    if (fxDiff > 0) {
      // 외환차익 (채무 장부가 > 실제 현금지급액)
      postings.push({
        ym,
        debitAccount: '외상매입금',
        creditAccount: '외환차익',
        amount: fxDiff,
        categoryTag: 'NON_CASH',
        memo: `외환차익 확정 ${ap.payableNo}`,
      });
    } else if (fxDiff < 0) {
      // 외환차손 (현금지급액 > 채무 장부가)
      postings.push({
        ym,
        debitAccount: '외환차손',
        creditAccount: '현금및현금성자산',
        amount: Math.abs(fxDiff),
        categoryTag: 'OP_CF',
        memo: `외환차손 확정 ${ap.payableNo}`,
      });
    }
  }

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
  const leaseSummary: LeaseScheduleSummaryRow[] = data.financeLeases.map((lease) => {
    const sch = data.financeLeaseSchedules.filter((s) => s.leaseId === lease.id);
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
  });

  const netCashChange = opCashPeriod + invCashPeriod + finCashPeriod;
  const endingCashFromCf = beginningCash + netCashChange;

  return {
    startYm,
    endYm,
    balanceSheet: {
      assets: [
        { code: 'BS-A1', label: '현금및현금성자산', amount: cashEnd, indent: 1 },
        { code: 'BS-A2', label: '외상매출금(매출채권)', amount: arBal, indent: 1 },
        { code: 'BS-A3', label: '상품재고(유통재고)', amount: tradeInvBal, indent: 1 },
        { code: 'BS-A4', label: '부품·소모품재고', amount: partsInvBal, indent: 1 },
        { code: 'BS-A5', label: '부가세대급금', amount: vatAssetBal, indent: 1 },
        { code: 'BS-A6', label: '렌탈자산(기계장치 취득원가)', amount: machGross, indent: 1 },
        { code: 'BS-A7', label: '감가상각누계액(차감)', amount: -accumDep, indent: 2 },
        { code: 'BS-A8', label: '렌탈자산 장부가액 순액', amount: machNet, isSubtotal: true },
      ],
      totalAssets,
      liabilities: [
        { code: 'BS-L1', label: '외상매입금(매입·물류·외주)', amount: apBal, indent: 1 },
        { code: 'BS-L2', label: '부가세예수금', amount: vatLiabBal, indent: 1 },
        { code: 'BS-L3', label: '미지급비용·이자·전대료', amount: accruedLiab, indent: 1 },
        { code: 'BS-L4', label: '금융리스부채 잔액', amount: leaseLiab, indent: 1 },
      ],
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
      rows: [
        { code: 'IS-1', label: 'I. 매출액', amount: totalRevenue, isSubtotal: true },
        { code: 'IS-1A', label: '상품매출 (유통 사업부)', amount: tradeRevenue, indent: 1 },
        { code: 'IS-1B', label: '임대매출 (렌탈 사업부 일할계상)', amount: rentalRevenue, indent: 1 },
        { code: 'IS-2', label: 'II. 매출원가', amount: totalCogs, isSubtotal: true },
        { code: 'IS-2A', label: '상품매출원가 (유통 출고원가)', amount: tradeCogs, indent: 1 },
        { code: 'IS-2B', label: '렌탈자산 감가상각비', amount: depExpense, indent: 1 },
        { code: 'IS-2C', label: '렌탈 정비·수선유지비', amount: maintExpense, indent: 1 },
        { code: 'IS-2D', label: '전대장비 임차원가', amount: subleaseExpense, indent: 1 },
        { code: 'IS-3', label: 'III. 매출총이익', amount: grossProfit, isSubtotal: true },
        { code: 'IS-4', label: 'IV. 판매비와관리비 (물류·운송비)', amount: sgaTotal, isSubtotal: true },
        { code: 'IS-5', label: 'V. 영업이익', amount: operatingIncome, isSubtotal: true },
        { code: 'IS-6A', label: 'VI. 영업외수익 · 외환차익', amount: fxGain, indent: 1 },
        { code: 'IS-6B', label: 'VII. 영업외비용 · 금융리스 이자비용', amount: interestExpense, indent: 1 },
        { code: 'IS-6C', label: 'VII. 영업외비용 · 외환차손', amount: fxLoss, indent: 1 },
        { code: 'IS-7', label: 'VIII. 당기순이익', amount: netIncome, isSubtotal: true },
      ],
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
        { code: 'CF-1', label: 'I. 영업활동 현금흐름', amount: opCashPeriod, isSubtotal: true },
        { code: 'CF-2', label: 'II. 투자활동 현금흐름', amount: invCashPeriod, isSubtotal: true },
        { code: 'CF-3', label: 'III. 재무활동 현금흐름', amount: finCashPeriod, isSubtotal: true },
        { code: 'CF-4', label: 'IV. 당기 현금 순증감', amount: netCashChange, isSubtotal: true },
        { code: 'CF-5', label: 'V. 기초 현금및현금성자산', amount: beginningCash, indent: 1 },
        { code: 'CF-6', label: 'VI. 기말 현금및현금성자산', amount: endingCashFromCf, isSubtotal: true },
      ],
    },
    assetSchedule,
    leaseSummary,
  };
}
