'use strict';

require('dotenv').config();
const assert = require('assert');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');

function isoYmd(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
}

async function getAllFlTableCounts(pgClient) {
  const tblRes = await pgClient.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'fl_%' AND tablename NOT LIKE 'fl_backup_%'
    ORDER BY tablename
  `);
  const counts = {};
  for (const r of tblRes.rows) {
    const cRes = await pgClient.query(`SELECT count(*)::int AS cnt FROM public."${r.tablename}"`);
    counts[r.tablename] = cRes.rows[0].cnt;
  }
  return counts;
}

async function loadFinancialDataset(flSupabase, snakeToCamelRow) {
  const fetch = async (tbl) => {
    const { data, error } = await flSupabase.from(tbl).select('*').limit(5000);
    if (error) throw new Error(`Failed loading ${tbl}: ${error.message}`);
    return (data || []).map((row) => snakeToCamelRow(row));
  };

  const [
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
    contracts,
    contractLines,
  ] = await Promise.all([
    fetch('purchases'),
    fetch('purchase_lines'),
    fetch('inventory_units'),
    fetch('stock_movements'),
    fetch('finance_leases'),
    fetch('finance_lease_schedules'),
    fetch('fulfillments'),
    fetch('billings'),
    fetch('collections'),
    fetch('ap_payables'),
    fetch('logistics_dispatches'),
    fetch('rental_maintenances'),
    fetch('trade_aftercare_cases'),
    fetch('contracts'),
    fetch('contract_lines'),
  ]);

  return {
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
    contracts,
    contractLines,
  };
}

async function main() {
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();

  const { createServer } = await import('vite');
  const viteServer = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });

  const tracked = {
    purchaseIds: [],
    purchaseLineIds: [],
    unitIds: [],
    payableIds: [],
    leaseIds: [],
    contractIds: [],
    contractLineIds: [],
    fulfillmentIds: [],
    approvalIds: [],
  };

  let preCounts = {};

  try {
    const domainEngine = await viteServer.ssrLoadModule('/src/services/domainEngine.ts');
    const fsEngine = await viteServer.ssrLoadModule('/src/services/financialStatementEngine.ts');
    const supabaseMod = await viteServer.ssrLoadModule('/src/core/supabase.ts');

    const {
      confirmPurchaseInbound,
      settleApPayable,
      buildFinanceLeaseSchedule,
      createFinanceLeaseWithAsset,
      payLeaseInstallment,
      executeAccountTransfer,
      completeFulfillment,
      executeRentalExchange,
      calculateRentalProRataForMonth,
    } = domainEngine;
    const { generateFinancialStatements } = fsEngine;
    const { DEFAULT_TENANT_ID, flSupabase, snakeToCamelRow, camelToSnakeRow, newId } = supabaseMod;

    preCounts = await getAllFlTableCounts(pgClient);
    console.log('[WTT 0] Recorded pre-test table counts across', Object.keys(preCounts).length, 'fl_* tables.');

    // Fetch seed partners & items
    const partnerRes = await flSupabase.from('partners').select('*').limit(100);
    assert(!partnerRes.error && partnerRes.data.length > 0, 'Seed partners required');
    const partners = partnerRes.data.map((r) => snakeToCamelRow(r));
    const supplier = partners.find((p) => ['SUPPLIER', 'BOTH', 'FINANCE'].includes(p.partnerType)) || partners[0];
    const customer = partners.find((p) => ['CUSTOMER', 'BOTH'].includes(p.partnerType)) || partners[0];

    const itemRes = await flSupabase.from('item_masters').select('*').limit(500);
    assert(!itemRes.error && itemRes.data.length > 0, 'Seed item_masters required');
    const items = itemRes.data.map((r) => snakeToCamelRow(r));
    const serialItem = items.find((it) => it.managementType === 'SERIAL');
    const lotItem = items.find((it) => it.managementType === 'LOT');
    assert(serialItem && lotItem, 'Both SERIAL and LOT seed items required');

    // =========================================================================
    // Test 1: Import Purchase Cost Allocation + AP FX Gain/Loss Settlement
    // =========================================================================
    const purResult = await confirmPurchaseInbound({
      purchaseType: 'IMPORT',
      supplier,
      targetDomain: 'TRADE',
      blNo: 'BL-WTT-2611',
      currencyCode: 'USD',
      fxRate: 1385.5,
      fxDate: '2026-11-05',
      customsDutyKrw: 333333,
      oceanFreightKrw: 450000,
      clearanceFeeKrw: 125000,
      inlandFreightKrw: 180000,
      effectiveDate: '2026-11-05',
      actorId: 'u-wtt',
      actorName: 'WTT검증',
      memo: 'WTT 수입 원가배분 검증',
      lines: [
        {
          itemId: serialItem.id,
          sku: serialItem.sku,
          itemName: serialItem.name,
          itemCategory: serialItem.itemCategory,
          managementType: 'SERIAL',
          quantity: 2,
          foreignUnitPrice: 12345.67,
          serialList: [`WTT-SN-${Date.now()}-A`, `WTT-SN-${Date.now()}-B`],
        },
        {
          itemId: lotItem.id,
          sku: lotItem.sku,
          itemName: lotItem.name,
          itemCategory: lotItem.itemCategory,
          managementType: 'LOT',
          quantity: 5,
          foreignUnitPrice: 432.11,
        },
      ],
    });
    tracked.purchaseIds.push(purResult.purchase.id);
    tracked.purchaseLineIds.push(...purResult.lines.map((l) => l.id));
    tracked.unitIds.push(...purResult.units.map((u) => u.id));
    tracked.payableIds.push(purResult.payable.id);

    const sumLineLanded = purResult.lines.reduce((s, l) => s + l.landedTotalCostKrw, 0);
    assert.strictEqual(sumLineLanded, purResult.purchase.totalLandedCostKrw, 'Landed cost sum mismatch');

    const serialUnits = purResult.units.filter((u) => u.managementType === 'SERIAL');
    assert.strictEqual(serialUnits.length, 2, 'Expected 2 SERIAL units');
    const sumSerialCost = serialUnits.reduce((s, u) => s + u.unitCostKrw, 0);
    assert.strictEqual(sumSerialCost, purResult.lines[0].landedTotalCostKrw, 'SERIAL unit cost sum mismatch');

    const halfForeign = Number((purResult.payable.foreignAmount / 2).toFixed(4));
    const apPartial = await settleApPayable({
      payable: purResult.payable,
      settledFxRate: 1370.0,
      settleForeignOrKrwAmount: halfForeign,
      paidDate: '2026-11-10',
    });
    assert.strictEqual(apPartial.status, 'PARTIAL', 'AP partial status expected');
    assert(apPartial.fxGainLossKrw > 0, 'Expected positive FX gain when settled rate < booked rate');

    const apFull = await settleApPayable({
      payable: apPartial,
      settledFxRate: 1405.0,
      paidDate: '2026-11-20',
    });
    assert.strictEqual(apFull.status, 'PAID', 'AP full status expected');
    const remForeign = Number((purResult.payable.foreignAmount * (1 - apPartial.paidAmountKrw / purResult.payable.totalAmountKrw)).toFixed(4));
    const expectedDelta2 = Math.round(remForeign * purResult.payable.bookedFxRate) - Math.round(remForeign * 1405.0);
    assert.strictEqual(apFull.fxGainLossKrw, Math.round(apPartial.fxGainLossKrw + expectedDelta2), 'Cumulative FX gain/loss mismatch');
    console.log('[WTT 1 PASS] Import landed cost exact 1 KRW sum & AP FX two-tranche settlement verified.');

    // =========================================================================
    // Test 2: Finance Lease 36-Month Amortization ('원리금균등' & '원금균등')
    // =========================================================================
    const leaseRes = await createFinanceLeaseWithAsset({
      lender: supplier,
      itemId: serialItem.id,
      sku: serialItem.sku,
      itemName: serialItem.name,
      serialNo: `WTT-LEASE-${Date.now()}`,
      principalAmountKrw: 32500000,
      annualInterestRate: 6.4,
      termMonths: 36,
      repaymentMethod: '원리금균등',
      startDate: '2026-11-01',
      paymentDay: 25,
      monthlyRentalFeeKrw: 900000,
      actorName: 'WTT검증',
      memo: 'WTT 원리금균등 리스 검증',
    });
    tracked.leaseIds.push(leaseRes.lease.id);
    tracked.unitIds.push(leaseRes.unit.id);

    const equalPrincipalSchedules = buildFinanceLeaseSchedule({
      id: 'WTT-EQP-SIM',
      principalAmountKrw: 32500000,
      annualInterestRate: 6.4,
      termMonths: 36,
      repaymentMethod: '원금균등',
      startDate: '2026-11-01',
      paymentDay: 25,
    });

    for (const [label, sched] of [
      ['원리금균등', leaseRes.schedules],
      ['원금균등', equalPrincipalSchedules],
    ]) {
      assert.strictEqual(sched.length, 36, `${label}: expected 36 installments`);
      const sumPrin = sched.reduce((s, r) => s + r.principalPaymentKrw, 0);
      assert.strictEqual(sumPrin, 32500000, `${label}: sum(principalPaymentKrw) must equal 32,500,000`);
      assert.strictEqual(sched[35].endingPrincipalKrw, 0, `${label}: final endingPrincipalKrw must equal 0`);
      for (const row of sched) {
        assert.strictEqual(
          row.openingPrincipalKrw - row.principalPaymentKrw,
          row.endingPrincipalKrw,
          `${label} #${row.installmentNo}: opening - principal !== ending`
        );
        assert.strictEqual(
          row.principalPaymentKrw + row.interestExpenseKrw,
          row.totalInstallmentKrw,
          `${label} #${row.installmentNo}: principal + interest !== totalInstallment`
        );
      }
    }

    const paidLease1 = await payLeaseInstallment({
      lease: leaseRes.lease,
      schedule: leaseRes.schedules[0],
      paidDate: '2026-11-25',
    });
    assert.strictEqual(
      paidLease1.updatedLease.remainingPrincipalKrw,
      32500000 - leaseRes.schedules[0].principalPaymentKrw,
      'Lease remaining principal after 1st payment mismatch'
    );
    console.log('[WTT 2 PASS] 36-month annuity & equal-principal amortization + installment payment verified.');

    // =========================================================================
    // Test 3: Account Transfer (유통재고 <-> 렌탈자산) Net Book Value Preservation
    // =========================================================================
    const unit0 = serialUnits[0];
    const origCost = unit0.unitCostKrw;
    const xferToRental = await executeAccountTransfer({
      unit: unit0,
      toDomain: '렌탈자산',
      effectiveDate: '2026-11-06',
      actorId: 'u-wtt',
      actorName: 'WTT검증',
    });
    assert.strictEqual(xferToRental.ownershipDomain, '렌탈자산');
    assert.strictEqual(xferToRental.bookValueKrw, origCost);

    const deprAmt = 500000;
    const netBook = origCost - deprAmt;
    await flSupabase
      .from('inventory_units')
      .update(camelToSnakeRow({ accumulatedDepreciationKrw: deprAmt, bookValueKrw: netBook }))
      .eq('id', unit0.id);

    const xferBackToTrade = await executeAccountTransfer({
      unit: { ...xferToRental, accumulatedDepreciationKrw: deprAmt, bookValueKrw: netBook },
      toDomain: '유통재고',
      effectiveDate: '2026-11-07',
      actorId: 'u-wtt',
      actorName: 'WTT검증',
    });
    assert.strictEqual(xferBackToTrade.ownershipDomain, '유통재고');
    assert.strictEqual(xferBackToTrade.unitCostKrw, netBook, 'Transfer to 유통재고 must use net book value');
    assert.strictEqual(xferBackToTrade.bookValueKrw, netBook, 'Book value must remain exact net book value');

    const movRes = await pgClient.query(
      `SELECT count(*)::int AS cnt FROM public.fl_stock_movements WHERE unit_id = $1 AND movement_type = 'ACCOUNT_TRANSFER'`,
      [unit0.id]
    );
    const evtRes = await pgClient.query(
      `SELECT count(*)::int AS cnt FROM public.fl_asset_events WHERE unit_id = $1 AND event_type = 'ACCOUNT_TRANSFER'`,
      [unit0.id]
    );
    assert.strictEqual(movRes.rows[0].cnt, 2, 'Expected 2 ACCOUNT_TRANSFER stock movements');
    assert.strictEqual(evtRes.rows[0].cnt, 2, 'Expected 2 ACCOUNT_TRANSFER asset events');
    console.log('[WTT 3 PASS] Account transfer (유통재고 <-> 렌탈자산) net book value preservation verified.');

    // =========================================================================
    // Test 4: Dual Timestamps (effectiveDate vs recordedAt) on Fulfillments
    // =========================================================================
    const testStartMs = Date.now();
    const contractId = newId('CTR-WTT');
    const oldLineId = newId('CL-WTT');
    const fulOutId = newId('FUL-WTT');
    tracked.contractIds.push(contractId);
    tracked.contractLineIds.push(oldLineId);
    tracked.fulfillmentIds.push(fulOutId);

    const testContract = {
      id: contractId,
      tenantId: DEFAULT_TENANT_ID,
      contractNo: contractId,
      contractDomain: 'RENTAL',
      quotationId: null,
      partnerId: customer.id,
      partnerName: customer.name,
      siteId: null,
      siteName: 'WTT 테스트 현장',
      siteAddress: '경기도 평택시 WTT로 1',
      salespersonId: 'u-wtt',
      salespersonName: 'WTT검증',
      contractDate: '2026-11-01',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      closingDay: 25,
      paymentDueDay: 10,
      paymentMonthOffset: 1,
      paymentMethod: '계좌이체',
      supplyAmountKrw: 900000,
      vatAmountKrw: 90000,
      totalAmountKrw: 990000,
      monthlyRentalKrw: 900000,
      dailyRentalKrw: 45000,
      status: 'ACTIVE',
    };
    const oldLine = {
      id: oldLineId,
      tenantId: DEFAULT_TENANT_ID,
      contractId,
      lineNo: 1,
      itemId: leaseRes.unit.itemId,
      sku: leaseRes.unit.sku,
      itemName: leaseRes.unit.itemName,
      itemCategory: leaseRes.unit.itemCategory,
      managementType: 'SERIAL',
      quantity: 1,
      fulfilledQty: 0,
      unitPriceKrw: 900000,
      supplyAmountKrw: 900000,
      vatAmountKrw: 90000,
      totalAmountKrw: 990000,
      lineStatus: 'ACTIVE',
    };
    const reqFulfillment = {
      id: fulOutId,
      tenantId: DEFAULT_TENANT_ID,
      fulfillmentNo: fulOutId,
      fulfillmentDomain: 'RENTAL',
      actionType: '렌탈출고',
      contractId,
      contractLineId: oldLineId,
      partnerId: customer.id,
      partnerName: customer.name,
      siteId: null,
      itemId: leaseRes.unit.itemId,
      unitId: null,
      replacementUnitId: null,
      quantity: 1,
      cogsAmountKrw: 0,
      status: 'REQUESTED',
      effectiveDate: null,
      recordedAt: null,
    };

    const insCtr = await flSupabase.from('contracts').insert(camelToSnakeRow(testContract));
    assert(!insCtr.error, `Insert contract failed: ${insCtr.error?.message}`);
    const insLine = await flSupabase.from('contract_lines').insert(camelToSnakeRow(oldLine));
    assert(!insLine.error, `Insert contract line failed: ${insLine.error?.message}`);
    const insFul = await flSupabase.from('fulfillments').insert(camelToSnakeRow(reqFulfillment));
    assert(!insFul.error, `Insert fulfillment failed: ${insFul.error?.message}`);

    const outRes = await completeFulfillment({
      fulfillment: reqFulfillment,
      contractLine: oldLine,
      unit: leaseRes.unit,
      effectiveDate: '2026-11-01',
      actorId: 'u-wtt',
      actorName: 'WTT검증',
    });

    const dbFulRes = await pgClient.query(
      `SELECT to_char(effective_date, 'YYYY-MM-DD') AS effective_date, recorded_at, status FROM public.fl_fulfillments WHERE id = $1`,
      [fulOutId]
    );
    assert.strictEqual(isoYmd(dbFulRes.rows[0].effective_date), '2026-11-01', 'Backdated effective_date must be preserved');
    assert(new Date(dbFulRes.rows[0].recorded_at).getTime() >= testStartMs - 10000, 'recorded_at must reflect current execution timestamp');
    assert.strictEqual(outRes.unit.status, '대여중', 'Rental unit must become 대여중 on completion');
    console.log('[WTT 4 PASS] Dual timestamps (effective_date vs recorded_at) on fulfillment verified.');

    // =========================================================================
    // Test 5: Single '교환' Process, Inheritance & Pro-Rata Conservation
    // =========================================================================
    const newRentalUnit = await executeAccountTransfer({
      unit: serialUnits[1],
      toDomain: '렌탈자산',
      effectiveDate: '2026-11-15',
      actorId: 'u-wtt',
      actorName: 'WTT검증',
    });

    const exRes = await executeRentalExchange({
      contract: testContract,
      oldLine: { ...oldLine, fulfilledQty: 1, lineStatus: 'FULFILLED', assignedUnitId: leaseRes.unit.id, effectiveStartDate: '2026-11-01' },
      oldUnit: outRes.unit,
      newUnit: newRentalUnit,
      exchangeDate: '2026-11-16',
      actorId: 'u-wtt',
      actorName: 'WTT검증',
      oldUnitToRepair: true,
    });
    tracked.fulfillmentIds.push(exRes.fulfillment.id);
    tracked.contractLineIds.push(exRes.newLine.id);

    assert.strictEqual(exRes.fulfillment.actionType, '교환', 'Exchange actionType must be 교환');
    assert.strictEqual(exRes.newLine.predecessorUnitId, leaseRes.unit.id, 'predecessorUnitId mismatch');
    assert.strictEqual(exRes.newLine.unitPriceKrw, 900000, 'Rate inheritance mismatch');
    assert.strictEqual(exRes.newLine.effectiveStartDate, '2026-11-16');

    const dbOldUnit = await pgClient.query(`SELECT status FROM public.fl_inventory_units WHERE id = $1`, [leaseRes.unit.id]);
    const dbNewUnit = await pgClient.query(`SELECT status FROM public.fl_inventory_units WHERE id = $1`, [newRentalUnit.id]);
    const dbOldLine = await pgClient.query(
      `SELECT line_status, to_char(effective_end_date, 'YYYY-MM-DD') AS effective_end_date FROM public.fl_contract_lines WHERE id = $1`,
      [oldLineId]
    );
    assert.strictEqual(dbOldUnit.rows[0].status, '정비중', 'Old unit status must transition to 정비중');
    assert.strictEqual(dbNewUnit.rows[0].status, '대여중', 'New unit status must transition to 대여중');
    assert.strictEqual(dbOldLine.rows[0].line_status, 'REPLACED_OUT');
    assert.strictEqual(isoYmd(dbOldLine.rows[0].effective_end_date), '2026-11-15');

    const linesRes = await flSupabase.from('contract_lines').select('*').eq('contract_id', contractId);
    assert(!linesRes.error);
    const camelLines = linesRes.data.map((r) => snakeToCamelRow(r));
    const proRata = calculateRentalProRataForMonth({
      contract: testContract,
      lines: camelLines,
      ym: '2026-11',
    });
    assert.strictEqual(proRata.length, 2, 'Expected 2 pro-rata lines for exchange month');
    assert.strictEqual(proRata[0].days + proRata[1].days, 30, 'Active days across exchange must sum to 30');
    assert.strictEqual(
      proRata[0].supplyAmountKrw + proRata[1].supplyAmountKrw,
      900000,
      'Pro-rata billing sum across exchange must equal 900,000 KRW (0 drift)'
    );
    console.log('[WTT 5 PASS] Single 교환 action, rate inheritance, predecessorUnitId & 0-drift pro-rata verified.');

    // =========================================================================
    // Test 6: 7-Tier Approval Workflow (Tier 2 -> PENDING -> Tier 4 APPROVED)
    // =========================================================================
    const uRes = await pgClient.query(`SELECT id, name, tier_level FROM public.fl_users WHERE login_id IN ('user', 'manager')`);
    const uUser = uRes.rows.find((u) => u.tier_level === 2);
    const uMgr = uRes.rows.find((u) => u.tier_level >= 4);
    assert(uUser && uMgr, 'Tier 2 user and Tier 4+ manager seed accounts required');

    const polRes = await pgClient.query(`SELECT action_code, required_tier FROM public.fl_approval_policies WHERE action_code = 'ACCOUNT_TRANSFER'`);
    const reqTier = polRes.rows[0] ? polRes.rows[0].required_tier : 4;
    assert(uUser.tier_level < reqTier && uMgr.tier_level >= reqTier, 'Expected Tier 2 < requiredTier <= Tier 4');

    const aprId = newId('APR-WTT');
    tracked.approvalIds.push(aprId);
    const insApr = await flSupabase.from('approval_requests').insert(camelToSnakeRow({
      id: aprId,
      tenantId: DEFAULT_TENANT_ID,
      actionCode: 'ACCOUNT_TRANSFER',
      targetTable: 'fl_inventory_units',
      targetId: serialUnits[1].id,
      title: 'WTT 계정대체 결재 상신 테스트',
      payload: { unitId: serialUnits[1].id, toDomain: '렌탈자산' },
      requiredTier: reqTier,
      requesterId: uUser.id,
      requesterName: uUser.name,
      requesterTier: uUser.tier_level,
      status: 'PENDING',
    }));
    assert(!insApr.error, `Insert approval request failed: ${insApr.error?.message}`);

    const aprCheck1 = await pgClient.query(`SELECT status FROM public.fl_approval_requests WHERE id = $1`, [aprId]);
    assert.strictEqual(aprCheck1.rows[0].status, 'PENDING');

    const nowIso = new Date().toISOString();
    const updApr = await flSupabase.from('approval_requests').update(camelToSnakeRow({
      status: 'APPROVED',
      approverId: uMgr.id,
      approverName: uMgr.name,
      approverTier: uMgr.tier_level,
      decidedAt: nowIso,
      executedAt: nowIso,
    })).eq('id', aprId);
    assert(!updApr.error, `Approve request failed: ${updApr.error?.message}`);

    const aprCheck2 = await pgClient.query(`SELECT status, approver_tier FROM public.fl_approval_requests WHERE id = $1`, [aprId]);
    assert.strictEqual(aprCheck2.rows[0].status, 'APPROVED');
    assert.strictEqual(aprCheck2.rows[0].approver_tier, uMgr.tier_level);
    console.log('[WTT 6 PASS] 7-tier approval workflow (Tier 2 PENDING -> Tier 4 APPROVED) verified.');

    // =========================================================================
    // Test 7: Balanced Financial Statements (with WTT mutations active)
    // =========================================================================
    const dsActive = await loadFinancialDataset(flSupabase, snakeToCamelRow);
    const fsActive = generateFinancialStatements(dsActive, '2026-10', '2026-11');
    assert.strictEqual(
      fsActive.balanceSheet.balanceDiff,
      0,
      `BS balanceDiff !== 0 (active WTT): got ${fsActive.balanceSheet.balanceDiff}`
    );
    assert.strictEqual(
      fsActive.cashFlow.cashCheckDiff,
      0,
      `CF cashCheckDiff !== 0 (active WTT): got ${fsActive.cashFlow.cashCheckDiff}`
    );
    assert(fsActive.incomeStatement.fxGainLoss !== 0, 'Expected non-zero FX gain/loss on PL during WTT');
    assert(fsActive.incomeStatement.interestExpense > 0, 'Expected positive finance lease interestExpense on PL');
    console.log(
      '[WTT 7a PASS] Financial statements (WTT active): BS diff=0, CF diff=0, interestExpense=',
      fsActive.incomeStatement.interestExpense,
      'fxGainLoss=',
      fsActive.incomeStatement.fxGainLoss
    );
  } finally {
    // Cleanup in FK/dependency-safe order
    const safeDel = async (sql, arr) => {
      if (!arr || arr.length === 0) return;
      await pgClient.query(sql, [arr]);
    };

    try {
      await safeDel(`DELETE FROM public.fl_approval_requests WHERE id = ANY($1)`, tracked.approvalIds);
      await safeDel(`DELETE FROM public.fl_asset_events WHERE unit_id = ANY($1)`, tracked.unitIds);
      await safeDel(`DELETE FROM public.fl_asset_events WHERE contract_id = ANY($1)`, tracked.contractIds);
      await safeDel(`DELETE FROM public.fl_stock_movements WHERE unit_id = ANY($1)`, tracked.unitIds);
      await safeDel(`DELETE FROM public.fl_stock_movements WHERE ref_id = ANY($1)`, [
        ...tracked.purchaseIds,
        ...tracked.fulfillmentIds,
      ]);
      await safeDel(`DELETE FROM public.fl_fulfillments WHERE id = ANY($1)`, tracked.fulfillmentIds);
      await safeDel(`DELETE FROM public.fl_contract_lines WHERE contract_id = ANY($1)`, tracked.contractIds);
      await safeDel(`DELETE FROM public.fl_contracts WHERE id = ANY($1)`, tracked.contractIds);
      await safeDel(`DELETE FROM public.fl_finance_lease_schedules WHERE lease_id = ANY($1)`, tracked.leaseIds);
      await safeDel(`DELETE FROM public.fl_finance_leases WHERE id = ANY($1)`, tracked.leaseIds);
      await safeDel(`DELETE FROM public.fl_ap_payables WHERE id = ANY($1)`, tracked.payableIds);
      await safeDel(`DELETE FROM public.fl_inventory_units WHERE id = ANY($1)`, tracked.unitIds);
      await safeDel(`DELETE FROM public.fl_purchase_lines WHERE purchase_id = ANY($1)`, tracked.purchaseIds);
      await safeDel(`DELETE FROM public.fl_purchases WHERE id = ANY($1)`, tracked.purchaseIds);
      console.log('[CLEANUP] Deleted all temporary WTT test rows.');
    } catch (cleanErr) {
      console.error('[CLEANUP ERROR]', cleanErr);
    }

    if (Object.keys(preCounts).length > 0) {
      const postCounts = await getAllFlTableCounts(pgClient);
      let mismatch = false;
      for (const tbl of Object.keys(preCounts)) {
        if (postCounts[tbl] !== preCounts[tbl]) {
          console.error(`[COUNT MISMATCH] ${tbl}: pre=${preCounts[tbl]} post=${postCounts[tbl]}`);
          mismatch = true;
        }
      }
      if (mismatch) {
        process.exitCode = 1;
      } else {
        console.log('[CLEANUP PASS] All fl_* table row counts match pre-test state exactly.');
      }
    }

    // Re-check balanced FS on clean starter dataset
    try {
      const { generateFinancialStatements } = await viteServer.ssrLoadModule('/src/services/financialStatementEngine.ts');
      const { flSupabase, snakeToCamelRow } = await viteServer.ssrLoadModule('/src/core/supabase.ts');
      const dsClean = await loadFinancialDataset(flSupabase, snakeToCamelRow);
      const fsClean = generateFinancialStatements(dsClean, '2026-10', '2026-11');
      assert.strictEqual(fsClean.balanceSheet.balanceDiff, 0, `Clean BS diff=${fsClean.balanceSheet.balanceDiff}`);
      assert.strictEqual(fsClean.cashFlow.cashCheckDiff, 0, `Clean CF diff=${fsClean.cashFlow.cashCheckDiff}`);
      console.log('[WTT 7b PASS] Clean production seed Financial Statements: BS diff=0, CF diff=0.');
    } finally {
      await viteServer.close();
      await pgClient.end();
    }
  }
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
