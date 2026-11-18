import { computeUnitDepreciationAsOf, listMonthsBetween } from './domainMath';
import type { ItemCategory } from '../types/domain';
import {
  compileFinancialStatementsFromPostings,
  type AssetScheduleRow,
  type FinancialDatasetInput,
  type FinancialStatementsReport,
  type JournalPosting,
} from './financialStatementFormatter';

export * from './financialStatementFormatter';

function tradeInvAcctForCategory(cat?: ItemCategory): string {
  return cat === '부품' || cat === '소모품' ? '부품소모품재고' : '상품재고(유통)';
}

export function generateFinancialStatements(
  data: FinancialDatasetInput,
  startYm: string,
  endYm: string,
  options?: { includeRental?: boolean }
): FinancialStatementsReport {
  const includeRental = options?.includeRental !== false;
  const postings: JournalPosting[] = [];

  const rentalPurchaseIds = new Set(
    data.purchases.filter((p) => p.targetDomain === 'RENTAL').map((p) => p.id)
  );
  const rentalContractIds = new Set(
    (data.contracts || []).filter((c) => c.contractDomain === 'RENTAL').map((c) => c.id)
  );
  const rentalFulfillmentIds = new Set(
    data.fulfillments.filter((f) => f.fulfillmentDomain === 'RENTAL').map((f) => f.id)
  );
  const rentalBillingIds = new Set(
    data.billings.filter((b) => b.billingDomain === 'RENTAL').map((b) => b.id)
  );
  const rentalDispatchIds = new Set(
    data.logisticsDispatches
      .filter(
        (d) =>
          d.dispatchPurpose === '교환' ||
          (d.relatedRefId
            ? rentalContractIds.has(d.relatedRefId) || rentalFulfillmentIds.has(d.relatedRefId)
            : false)
      )
      .map((d) => d.id)
  );
  const excludedPayableIds = new Set(
    data.apPayables
      .filter(
        (ap) =>
          ap.payableType === 'FINANCE_LEASE' ||
          ap.payableType === 'SUBLEASE_RENT' ||
          ap.payableType === 'EXTERNAL_REPAIR' ||
          (ap.payableType === 'PURCHASE' && Boolean(ap.refId && rentalPurchaseIds.has(ap.refId))) ||
          (ap.payableType === 'LOGISTICS' && Boolean(ap.refId && rentalDispatchIds.has(ap.refId)))
      )
      .map((ap) => ap.id)
  );

  // 1. 기초 영업자본금 설정 (유동성 확보 기준선)
  postings.push({
    ym: '2026-01',
    debitAccount: '현금및현금성자산',
    creditAccount: '자본금',
    amount: 1500000000,
    categoryTag: 'FIN_CF',
    memo: '기초 자본금 납입',
  });

  const unitById = new Map(data.inventoryUnits.map((u) => [u.id, u]));

  // 2. 매입 확정 (IMPORT / DOMESTIC) — 희망완료일 기준 귀속
  for (const p of data.purchases) {
    if (p.status !== 'CONFIRMED') continue;
    if (!includeRental && p.targetDomain === 'RENTAL') continue;
    const ym = p.effectiveDate.slice(0, 7);
    const lines = data.purchaseLines.filter((l) => l.purchaseId === p.id);
    if (lines.length > 0) {
      let postedMerch = 0;
      let postedAnc = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const isLast = i === lines.length - 1;
        const isPartOrCons = l.itemCategory === '부품' || l.itemCategory === '소모품';
        const acct = isPartOrCons
          ? '부품소모품재고'
          : p.targetDomain === 'RENTAL'
            ? '기계장치(렌탈자산)'
            : '상품재고(유통)';
        const cfTag = acct === '기계장치(렌탈자산)' ? 'INV_CF' : 'OP_CF';
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
            categoryTag: cfTag,
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
    if ((u.acquisitionType === 'PURCHASE' || u.acquisitionType === 'ACCOUNT_TRANSFER') && !u.purchaseLineId && u.unitCostKrw > 0) {
      const firstTransfer = [...data.stockMovements]
        .filter((m) => m.unitId === u.id && m.movementType === 'ACCOUNT_TRANSFER')
        .sort((a, b) => (a.effectiveDate || '').localeCompare(b.effectiveDate || ''))[0];
      const initialDomain = firstTransfer?.fromDomain || u.ownershipDomain;
      if (!includeRental && (initialDomain === '렌탈자산' || initialDomain === '전대자산')) {
        continue;
      }
      const ym = u.acquisitionDate.slice(0, 7);
      const acct =
        includeRental && u.ownershipDomain === '렌탈자산'
          ? '기계장치(렌탈자산)'
          : tradeInvAcctForCategory(u.itemCategory);
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
  if (includeRental) {
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
  }

  // 3. 금융리스 계약 체결 (렌탈자산 취득 / 금융리스부채 계상) & 회차별 원금/이자 반영
  if (includeRental) {
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
  }

  // 4. 렌탈자산 월별 정액법 감가상각 및 자산명세 (계정대체 이력 반영)
  const assetSchedule: AssetScheduleRow[] = [];
  if (includeRental) {
    for (const u of data.inventoryUnits) {
      if (u.itemCategory === '부품' || u.itemCategory === '소모품' || u.acquisitionType === 'SUBLEASE') continue;
      const hadRentalTransfer = data.stockMovements.some(
        (m) =>
          m.unitId === u.id &&
          m.movementType === 'ACCOUNT_TRANSFER' &&
          (m.fromDomain === '렌탈자산' || m.toDomain === '렌탈자산')
      );
      if (u.ownershipDomain !== '렌탈자산' && !hadRentalTransfer) continue;

      const depInfo = computeUnitDepreciationAsOf(u, startYm, endYm, data.stockMovements);
      for (const entry of depInfo.monthlyEntries) {
        postings.push({
          ym: entry.ym,
          debitAccount: '감가상각비(렌탈)',
          creditAccount: '감가상각누계액',
          amount: entry.amount,
          categoryTag: 'NON_CASH',
          memo: `감가상각 ${u.serialNo || u.unitCode}`,
        });
      }
      for (const rst of depInfo.transferOutResets) {
        if (rst.amount > 0) {
          postings.push({
            ym: rst.ym,
            debitAccount: '감가상각누계액',
            creditAccount: '기계장치(렌탈자산)',
            amount: rst.amount,
            categoryTag: 'NON_CASH',
            memo: `계정대체 상각누계 상계 ${u.serialNo || u.unitCode}`,
          });
        }
      }

      const acqYm = u.acquisitionDate.slice(0, 7);
      if (depInfo.domainAtEndYm === '렌탈자산' && acqYm <= endYm) {
        assetSchedule.push({
          unitId: u.id,
          unitCode: u.unitCode,
          itemName: u.itemName,
          serialNo: u.serialNo || '-',
          acquisitionType: u.acquisitionType,
          acquisitionDate: u.acquisitionDate,
          acquisitionCostKrw: Math.round(u.unitCostKrw),
          periodDepreciationKrw: depInfo.periodDep,
          accumulatedDepreciationKrw: depInfo.accumDep,
          endingBookValueKrw: depInfo.endingBookValue,
        });
      }
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
    if (!includeRental && rentalBillingIds.has(b.id)) continue;
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

  // 7. 유통 반품 환불 · 반품교환 차감 (매출 · 부가세 · 매출원가 역분개 및 대품 원가 반영)
  for (const tc of data.tradeAftercareCases) {
    if (tc.status !== 'COMPLETED') continue;
    const ym = tc.effectiveDate.slice(0, 7);
    if (tc.caseType === '반품환불') {
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
    } else if (tc.caseType === '반품교환') {
      const u = unitById.get(tc.unitId);
      if (u && u.unitCostKrw > 0) {
        postings.push({
          ym,
          debitAccount: tradeInvAcctForCategory(u.itemCategory),
          creditAccount: '상품매출원가',
          amount: Math.round(u.unitCostKrw),
          categoryTag: 'NON_CASH',
          memo: `반품교환 회수 원가환입 ${tc.caseNo}`,
        });
      }
      const rep = tc.replacementUnitId ? unitById.get(tc.replacementUnitId) : undefined;
      if (rep && rep.unitCostKrw > 0) {
        postings.push({
          ym,
          debitAccount: '상품매출원가',
          creditAccount: tradeInvAcctForCategory(rep.itemCategory),
          amount: Math.round(rep.unitCostKrw),
          categoryTag: 'NON_CASH',
          memo: `반품교환 대품 매출원가 ${tc.caseNo}`,
        });
      }
    }
  }

  // 8. 수납 입금
  for (const col of data.collections) {
    if (!includeRental && rentalBillingIds.has(col.billingId)) continue;
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
    if (!includeRental && rentalDispatchIds.has(ld.id)) continue;
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
  if (includeRental) {
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
  }

  // 11. 매입채무 지급 및 외환차익/외환차손 반영
  for (const ap of data.apPayables) {
    if (ap.paidAmountKrw <= 0) continue;
    if (!includeRental && excludedPayableIds.has(ap.id)) continue;
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

  return compileFinancialStatementsFromPostings({
    startYm,
    endYm,
    includeRental,
    postings,
    assetSchedule,
    financeLeases: data.financeLeases,
    financeLeaseSchedules: data.financeLeaseSchedules,
  });
}
