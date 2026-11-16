'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createServer } = require('vite');

const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

function getBsAmount(report, code) {
  const all = [
    ...report.balanceSheet.assets,
    ...report.balanceSheet.liabilities,
    ...report.balanceSheet.equity,
  ];
  const row = all.find((r) => r.code === code);
  if (!row) throw new Error(`Missing BS code: ${code}`);
  return row.amount;
}

async function main() {
  loadEnv();
  const viteServer = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  try {
    const supMod = await viteServer.ssrLoadModule('/src/core/supabase.ts');
    const engMod = await viteServer.ssrLoadModule('/src/services/domainEngine.ts');
    const fsMod = await viteServer.ssrLoadModule('/src/services/financialStatementEngine.ts');

    const { selectAllFlRows, snakeToCamelRow } = supMod;
    const {
      buildContractBillingLines,
      calculateRentalProRataForMonth,
      listMonthsBetween,
      computeUnitDepreciationAsOf,
    } = engMod;
    const { generateFinancialStatements } = fsMod;

    const fetchAllCamel = async (table) => {
      const res = await selectAllFlRows(table);
      if (res.error) throw new Error(`${table}: ${res.error.message}`);
      return (res.data || []).map((r) => snakeToCamelRow(r));
    };

    const [
      itemMasters,
      partners,
      purchases,
      purchaseLines,
      inventoryUnits,
      stockMovements,
      financeLeases,
      financeLeaseSchedules,
      contracts,
      contractLines,
      fulfillments,
      billings,
      collections,
      apPayables,
      logisticsDispatches,
      rentalMaintenances,
      tradeAftercareCases,
      approvalRequests,
      bankTransactions,
      catalogPackages,
    ] = await Promise.all([
      fetchAllCamel('item_masters'),
      fetchAllCamel('partners'),
      fetchAllCamel('purchases'),
      fetchAllCamel('purchase_lines'),
      fetchAllCamel('inventory_units'),
      fetchAllCamel('stock_movements'),
      fetchAllCamel('finance_leases'),
      fetchAllCamel('finance_lease_schedules'),
      fetchAllCamel('contracts'),
      fetchAllCamel('contract_lines'),
      fetchAllCamel('fulfillments'),
      fetchAllCamel('billings'),
      fetchAllCamel('collections'),
      fetchAllCamel('ap_payables'),
      fetchAllCamel('logistics_dispatches'),
      fetchAllCamel('rental_maintenances'),
      fetchAllCamel('trade_aftercare_cases'),
      fetchAllCamel('approval_requests'),
      fetchAllCamel('bank_transactions'),
      fetchAllCamel('catalog_packages'),
    ]);

    // 1. Volume Checks
    const tradeAvailUnits = inventoryUnits.filter(
      (u) =>
        u.ownershipDomain === '유통재고' &&
        (u.itemCategory === '완제품' || u.itemCategory === '어태치먼트') &&
        u.status === '보유중' &&
        u.qtyOnHand > 0
    );
    const tradeSoldFul = fulfillments.filter(
      (f) => f.actionType === '유통출고' && f.status === 'COMPLETED'
    );
    const partLots = inventoryUnits.filter((u) => u.itemCategory === '부품' && u.qtyOnHand > 0);
    const partQtySum = partLots.reduce((s, u) => s + u.qtyOnHand, 0);
    const consMasters = itemMasters.filter((m) => m.itemCategory === '소모품');
    const consLots = inventoryUnits.filter((u) => u.itemCategory === '소모품' && u.qtyOnHand > 0);
    const consQtySum = consLots.reduce((s, u) => s + u.qtyOnHand, 0);
    const rentalSubAssets = inventoryUnits.filter((u) => u.ownershipDomain !== '유통재고');
    const tradeContracts = contracts.filter((c) => c.contractDomain === 'TRADE');
    const tradeFulfilledContracts = tradeContracts.filter((c) => c.status === 'COMPLETED');
    const tradeUnfulfilledContracts = tradeContracts.filter((c) => {
      const lines = contractLines.filter((l) => l.contractId === c.id);
      return lines.some((l) => l.fulfilledQty === 0);
    });
    const rentalContracts = contracts.filter((c) => c.contractDomain === 'RENTAL');
    const rentalFulfilledContracts = rentalContracts.filter(
      (c) =>
        c.status !== 'DRAFT' &&
        c.status !== 'CANCELLED' &&
        contractLines.some((l) => l.contractId === c.id && l.fulfilledQty > 0)
    );
    const rentalUnfulfilledContracts = rentalContracts.filter((c) => {
      const lines = contractLines.filter((l) => l.contractId === c.id);
      return lines.some((l) => l.fulfilledQty === 0);
    });
    const completedMaint = rentalMaintenances.filter((m) => m.status === 'COMPLETED');
    const extMaint = completedMaint.filter((m) => m.externalCostKrw > 0 && m.vendorPartnerId);
    const billableMaint = completedMaint.filter((m) => m.isCustomerBillable && m.customerChargeKrw > 0);

    console.log('=== VOLUME METRICS ===');
    console.log({
      tradeAvailUnits: tradeAvailUnits.length,
      tradeSoldFulfillments: tradeSoldFul.length,
      partLots: partLots.length,
      partQtySum,
      consMasters: consMasters.length,
      consLots: consLots.length,
      consQtySum,
      rentalSubAssets: rentalSubAssets.length,
      tradeContracts: tradeContracts.length,
      tradeFulfilledContracts: tradeFulfilledContracts.length,
      tradeUnfulfilledContracts: tradeUnfulfilledContracts.length,
      rentalContracts: rentalContracts.length,
      rentalFulfilledContracts: rentalFulfilledContracts.length,
      rentalUnfulfilledContracts: rentalUnfulfilledContracts.length,
      completedMaint: completedMaint.length,
      extMaint: extMaint.length,
      billableMaint: billableMaint.length,
      billings: billings.length,
      collections: collections.length,
      logisticsDispatches: logisticsDispatches.length,
      financeLeases: financeLeases.length,
      approvalRequests: approvalRequests.length,
      bankTransactions: bankTransactions.length,
      partners: partners.length,
      catalogPackages: catalogPackages.length,
    });

    assert(tradeAvailUnits.length >= 30, `Expected tradeAvailUnits >= 30, got ${tradeAvailUnits.length}`);
    assert(tradeSoldFul.length >= 30, `Expected tradeSoldFul >= 30, got ${tradeSoldFul.length}`);
    assert(partLots.length >= 28 && partQtySum >= 800, `Parts low: lots=${partLots.length}, qty=${partQtySum}`);
    assert(consMasters.length >= 25 && consLots.length >= 25 && consQtySum >= 1000, `Cons low: m=${consMasters.length}, l=${consLots.length}, q=${consQtySum}`);
    assert(rentalSubAssets.length >= 50, `Expected rentalSubAssets >= 50, got ${rentalSubAssets.length}`);
    assert(tradeContracts.length >= 35, `Expected tradeContracts >= 35, got ${tradeContracts.length}`);
    assert(tradeFulfilledContracts.length >= 24 && tradeUnfulfilledContracts.length >= 10, `Trade contract mix fail`);
    assert(rentalContracts.length >= 32, `Expected rentalContracts >= 32, got ${rentalContracts.length}`);
    assert(rentalFulfilledContracts.length >= 24 && rentalUnfulfilledContracts.length >= 9, `Rental contract mix fail`);
    assert(completedMaint.length >= 28 && extMaint.length >= 5 && billableMaint.length >= 5, `Maint mix fail`);
    assert(billings.length >= 80 && collections.length >= 50 && logisticsDispatches.length >= 18 && financeLeases.length >= 12 && approvalRequests.length >= 8);

    // Ensure latest RENTAL contract in DB satisfies verify_v2_playwright.cjs ('ACTIVE' + 'FULFILLED')
    const sortedRentals = [...rentalContracts].sort((a, b) => b.contractDate.localeCompare(a.contractDate));
    const latestRental = sortedRentals[0];
    const latestRentalLines = contractLines.filter((l) => l.contractId === latestRental.id);
    assert.strictEqual(latestRental.status, 'ACTIVE', `Latest rental contract ${latestRental.contractNo} must be ACTIVE`);
    assert(latestRentalLines.some((l) => l.lineStatus === 'FULFILLED'), `Latest rental contract ${latestRental.contractNo} must have a FULFILLED line`);

    // 2. Organic Pre-Fulfillment Guard Check
    const completelyUnfulfilled = contracts.filter((c) => {
      const lines = contractLines.filter((l) => l.contractId === c.id);
      return lines.length > 0 && lines.every((l) => l.fulfilledQty === 0);
    });
    for (const c of completelyUnfulfilled) {
      const cb = billings.filter((b) => b.contractId === c.id && b.status !== 'CANCELLED');
      assert.strictEqual(cb.length, 0, `Unfulfilled contract ${c.contractNo} must have 0 billings, got ${cb.length}`);
      for (const ym of listMonthsBetween('2026-03', '2026-11')) {
        const previewLines = buildContractBillingLines({
          contract: c,
          contractLines,
          fulfillments,
          rentalMaintenances,
          logisticsDispatches,
          existingBillings: billings,
          ym,
        });
        assert.strictEqual(previewLines.length, 0, `Unfulfilled contract ${c.contractNo} in ${ym} should generate 0 billing lines`);
      }
    }
    console.log(`Pre-fulfillment zero-billing guard verified on ${completelyUnfulfilled.length} contracts.`);

    // 3. Financial Statement & Cross-Module Conservation Across 2026-01 .. 2026-11
    const allMonths = listMonthsBetween('2026-01', '2026-11');
    const ds = {
      purchases,
      purchaseLines,
      inventoryUnits,
      stockMovements,
      financeLeases,
      financeLeaseSchedules,
      fulfillments,
      billings,
      collections,
      apPayables,
      logisticsDispatches,
      rentalMaintenances,
      tradeAftercareCases,
    };

    for (const ym of allMonths) {
      const single = generateFinancialStatements(ds, ym, ym);
      assert.strictEqual(single.balanceSheet.balanceDiff, 0, `${ym} single BS balanceDiff=${single.balanceSheet.balanceDiff}`);
      assert.strictEqual(single.cashFlow.cashCheckDiff, 0, `${ym} single CF cashCheckDiff=${single.cashFlow.cashCheckDiff}`);
      assert(single.cashFlow.endingCash > 0, `${ym} endingCash <= 0 (${single.cashFlow.endingCash})`);

      const cum = generateFinancialStatements(ds, '2026-01', ym);
      assert.strictEqual(cum.balanceSheet.balanceDiff, 0, `2026-01..${ym} cum BS balanceDiff=${cum.balanceSheet.balanceDiff}`);
      assert.strictEqual(cum.cashFlow.cashCheckDiff, 0, `2026-01..${ym} cum CF cashCheckDiff=${cum.cashFlow.cashCheckDiff}`);
    }

    const rep = generateFinancialStatements(ds, '2026-01', '2026-11');
    const bsTradeInv = getBsAmount(rep, 'BS-A3');
    const bsPartsInv = getBsAmount(rep, 'BS-A4');
    const bsRentalNet = getBsAmount(rep, 'BS-A8');
    const bsAr = getBsAmount(rep, 'BS-A2');
    const bsAp = getBsAmount(rep, 'BS-L1');

    const physTradeInv = Math.round(
      inventoryUnits
        .filter((u) => u.ownershipDomain === '유통재고' && u.itemCategory !== '부품' && u.itemCategory !== '소모품')
        .reduce((s, u) => s + u.qtyOnHand * u.unitCostKrw, 0)
    );
    const physPartsInv = Math.round(
      inventoryUnits
        .filter((u) => u.itemCategory === '부품' || u.itemCategory === '소모품')
        .reduce((s, u) => s + u.qtyOnHand * u.unitCostKrw, 0)
    );
    const schedNet = rep.assetSchedule.reduce((s, r) => s + r.endingBookValueKrw, 0);
    const dbRentalNet = Math.round(
      inventoryUnits
        .filter((u) => u.ownershipDomain === '렌탈자산')
        .reduce((s, u) => s + u.bookValueKrw, 0)
    );
    const refundArAdj = tradeAftercareCases
      .filter((tc) => tc.status === 'COMPLETED' && tc.caseType === '반품환불')
      .reduce((s, tc) => s + Math.round(tc.refundSupplyKrw + tc.refundVatKrw), 0);
    const openBillingsUnpaid = Math.round(
      billings.filter((b) => b.status !== 'CANCELLED').reduce((s, b) => s + b.unpaidBalanceKrw, 0) - refundArAdj
    );
    const openApBal = Math.round(
      apPayables.reduce((s, ap) => s + (ap.totalAmountKrw - ap.paidAmountKrw), 0)
    );

    // TradePerformancePage exact formula check (2026-01-01 .. 2026-11-30)
    let tpSales = 0;
    let tpRefund = 0;
    let tpCogs = 0;
    for (const f of fulfillments) {
      if (f.fulfillmentDomain !== 'TRADE' || f.status !== 'COMPLETED') continue;
      const d = f.effectiveDate || '';
      if (d < '2026-01-01' || d > '2026-11-30') continue;
      const line = contractLines.find((l) => l.id === f.contractLineId);
      const sales = line
        ? f.quantity === line.quantity
          ? Math.round(line.supplyAmountKrw)
          : Math.round((line.supplyAmountKrw * f.quantity) / Math.max(1, line.quantity))
        : 0;
      tpSales += sales;
      tpCogs += f.cogsAmountKrw;
    }
    for (const b of billings) {
      if (b.status === 'CANCELLED' || b.billingDomain !== 'TRADE') continue;
      if (b.billingYm < '2026-01' || b.billingYm > '2026-11') continue;
      for (const bl of b.lines || []) {
        if (!bl.dispatchId) continue;
        tpSales += bl.supplyAmountKrw;
      }
    }
    for (const ac of tradeAftercareCases) {
      if (ac.status !== 'COMPLETED' || ac.effectiveDate < '2026-01-01' || ac.effectiveDate > '2026-11-30') continue;
      const u = inventoryUnits.find((x) => x.id === ac.unitId);
      const revCogs = u ? u.unitCostKrw : 0;
      if (ac.caseType === '반품환불') {
        tpRefund += ac.refundSupplyKrw;
        tpCogs -= revCogs;
      } else if (ac.caseType === '반품교환') {
        const repU = ac.replacementUnitId ? inventoryUnits.find((x) => x.id === ac.replacementUnitId) : undefined;
        const repCogs = repU ? repU.unitCostKrw : 0;
        tpCogs += repCogs - revCogs;
      }
    }
    const tpNetSales = tpSales - tpRefund;

    // RentalPerformancePage exact formula check (2026-01 .. 2026-11)
    let rpRev = 0;
    let rpDep = 0;
    let rpSub = 0;
    let rpMaint = 0;
    let rpInterest = 0;
    const revByUnit = new Map();
    for (const c of contracts) {
      if (c.contractDomain !== 'RENTAL' || c.status === 'CANCELLED') continue;
      for (const ym of allMonths) {
        const rows = calculateRentalProRataForMonth({ contract: c, lines: contractLines, ym });
        for (const r of rows) {
          if (r.unitId) revByUnit.set(r.unitId, (revByUnit.get(r.unitId) || 0) + r.supplyAmountKrw);
        }
      }
    }
    for (const b of billings) {
      if (b.status === 'CANCELLED' || b.billingDomain !== 'RENTAL' || !allMonths.includes(b.billingYm)) continue;
      for (const bl of b.lines || []) {
        if ((bl.maintId || bl.dispatchId) && bl.unitId && !bl.contractLineId) {
          revByUnit.set(bl.unitId, (revByUnit.get(bl.unitId) || 0) + Math.round(bl.supplyAmountKrw));
        }
      }
    }
    for (const u of rentalSubAssets) {
      rpRev += revByUnit.get(u.id) || 0;
      rpDep += computeUnitDepreciationAsOf(u, '2026-01', '2026-11', stockMovements).periodDep;
      const activeSubMonths = allMonths.filter((m) => m >= u.acquisitionDate.slice(0, 7)).length;
      rpSub += u.ownershipDomain === '전대자산' ? Math.round(u.subleaseMonthlyCostKrw) * activeSubMonths : 0;
      rpMaint += rentalMaintenances
        .filter((m) => m.status === 'COMPLETED' && m.unitId === u.id && allMonths.includes(m.effectiveDate.slice(0, 7)))
        .reduce((s, m) => s + m.totalCostKrw, 0);
      rpInterest += financeLeases
        .filter((fl) => fl.unitId === u.id || fl.unitIds.includes(u.id))
        .flatMap((fl) => financeLeaseSchedules.filter((s) => s.leaseId === fl.id && allMonths.includes(s.dueYm)))
        .reduce((s, sch) => s + sch.interestExpenseKrw, 0);
    }

    const reconReport = {
      bsDiff: rep.balanceSheet.balanceDiff,
      cfDiff: rep.cashFlow.cashCheckDiff,
      bsTradeInv,
      physTradeInv,
      bsPartsInv,
      physPartsInv,
      bsRentalNet,
      schedNet,
      dbRentalNet,
      bsAr,
      openBillingsUnpaid,
      bsAp,
      openApBal,
      plTradeRevenue: rep.incomeStatement.tradeRevenue,
      tpNetSales,
      plTradeCogs: rep.incomeStatement.tradeCogs,
      tpCogs,
      plRentalRevenue: rep.incomeStatement.rentalRevenue,
      rpRev,
      plRentalCogs: rep.incomeStatement.rentalCogs,
      rpRentalCogs: rpDep + rpMaint + rpSub,
      plInterest: rep.incomeStatement.interestExpense,
      rpInterest,
      plSga: rep.incomeStatement.sgaTotal,
      plFxGainLoss: rep.incomeStatement.fxGainLoss,
      endingCash: rep.cashFlow.endingCash,
    };
    console.log('=== RECONCILIATION REPORT (2026-01 ~ 2026-11) ===');
    console.log(reconReport);

    assert.strictEqual(bsTradeInv, physTradeInv, `Trade Inventory mismatch: BS=${bsTradeInv} vs Phys=${physTradeInv}`);
    assert.strictEqual(bsPartsInv, physPartsInv, `Parts/Cons Inventory mismatch: BS=${bsPartsInv} vs Phys=${physPartsInv}`);
    assert.strictEqual(bsRentalNet, schedNet, `Rental Net vs AssetSchedule mismatch: BS=${bsRentalNet} vs Sched=${schedNet}`);
    assert.strictEqual(bsRentalNet, dbRentalNet, `Rental Net vs DB BookValue mismatch: BS=${bsRentalNet} vs DB=${dbRentalNet}`);
    assert.strictEqual(bsAr, openBillingsUnpaid, `AR mismatch: BS=${bsAr} vs BillingsUnpaid=${openBillingsUnpaid}`);
    assert.strictEqual(bsAp, openApBal, `AP mismatch: BS=${bsAp} vs ApRem=${openApBal}`);
    assert.strictEqual(rep.incomeStatement.tradeRevenue, tpNetSales, `TradeRevenue mismatch: PL=${rep.incomeStatement.tradeRevenue} vs TP=${tpNetSales}`);
    assert.strictEqual(rep.incomeStatement.tradeCogs, tpCogs, `TradeCogs mismatch: PL=${rep.incomeStatement.tradeCogs} vs TP=${tpCogs}`);
    assert.strictEqual(rep.incomeStatement.rentalRevenue, rpRev, `RentalRevenue mismatch: PL=${rep.incomeStatement.rentalRevenue} vs RP=${rpRev}`);
    assert.strictEqual(rep.incomeStatement.rentalCogs, rpDep + rpMaint + rpSub, `RentalCogs mismatch: PL=${rep.incomeStatement.rentalCogs} vs RP=${rpDep + rpMaint + rpSub}`);
    assert.strictEqual(rep.incomeStatement.interestExpense, rpInterest, `LeaseInterest mismatch: PL=${rep.incomeStatement.interestExpense} vs RP=${rpInterest}`);

    assert(rep.incomeStatement.tradeRevenue > 0, 'tradeRevenue must be > 0');
    assert(rep.incomeStatement.rentalRevenue > 0, 'rentalRevenue must be > 0');
    assert(rep.incomeStatement.tradeCogs > 0, 'tradeCogs must be > 0');
    assert(rep.incomeStatement.rentalCogs > 0, 'rentalCogs must be > 0');
    assert(rep.incomeStatement.sgaTotal > 0, 'sgaTotal must be > 0');
    assert(rep.incomeStatement.interestExpense > 0, 'interestExpense must be > 0');
    assert(rep.incomeStatement.fxGainLoss !== 0, 'fxGainLoss must be !== 0');

    console.log('ALL ORGANIC CONSERVATION & RECONCILIATION CHECKS PASSED (0 KRW DIFF)!');
  } finally {
    await viteServer.close();
  }
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
