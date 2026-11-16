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
    hrDeptIds: [],
    hrUserIds: [],
    fxRateIds: [],
  };

  let preCounts = {};

  try {
    const domainEngine = await viteServer.ssrLoadModule('/src/services/domainEngine.ts');
    const fsEngine = await viteServer.ssrLoadModule('/src/services/financialStatementEngine.ts');
    const supabaseMod = await viteServer.ssrLoadModule('/src/core/supabase.ts');
    const cryptoVault = await viteServer.ssrLoadModule('/src/utils/cryptoVault.ts');

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
      saveDepartment,
      createEmployeeUser,
      updateEmployeeHrRecord,
      adminResetUserPassword,
      upsertManagedExchangeRates,
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
    // Test 8: Org & HR Lifecycle (Dept, Hire, Password Reset, Move, Retire, History)
    // =========================================================================
    assert(Object.keys(preCounts).length >= 30, `Expected 30 fl_* tables, got ${Object.keys(preCounts).length}`);
    const orgPermRes = await pgClient.query(
      "SELECT tier_level, can_view, can_edit, can_approve FROM public.fl_user_permissions WHERE user_id IS NULL AND page_id = 'organization_hr' ORDER BY tier_level"
    );
    assert.strictEqual(orgPermRes.rows.length, 7, `Expected 7 tier permissions for organization_hr, got ${orgPermRes.rows.length}`);
    for (const pr of orgPermRes.rows) {
      if (pr.tier_level <= 3) {
        assert.strictEqual(pr.can_view, false, `Tier ${pr.tier_level} must not view organization_hr`);
        assert.strictEqual(pr.can_edit, false, `Tier ${pr.tier_level} must not edit organization_hr`);
      } else {
        assert.strictEqual(pr.can_view, true, `Tier ${pr.tier_level} must view organization_hr`);
        assert.strictEqual(pr.can_edit, true, `Tier ${pr.tier_level} must edit organization_hr`);
      }
      assert.strictEqual(pr.can_approve, pr.tier_level >= 5, `Tier ${pr.tier_level} approve parity mismatch`);
    }

    const testDept = await saveDepartment({
      name: `WTT임시부서_${Date.now()}`,
      parentDepartmentId: 'DEPT-0000001',
      functionalTags: ['경영관리', '재무회계'],
      sortOrder: 99,
      memo: 'WTT 검증용 임시 부서',
    });
    tracked.hrDeptIds.push(testDept.id);

    const childDept = await saveDepartment({
      name: `WTT하위부서_${Date.now()}`,
      parentDepartmentId: testDept.id,
      functionalTags: ['경영관리'],
      sortOrder: 100,
    });
    tracked.hrDeptIds.push(childDept.id);

    await assert.rejects(
      () =>
        saveDepartment({
          id: testDept.id,
          name: testDept.name,
          parentDepartmentId: childDept.id,
          functionalTags: ['경영관리'],
        }),
      /하위 부서를 상위 부서로 지정할 수 없습니다/,
      'Multi-hop department cycle must be rejected'
    );

    const wttLoginId = `wtt_hr_${Date.now()}`;
    const testHrUser = await createEmployeeUser({
      loginId: wttLoginId,
      initialPassword: 'InitPass!1',
      name: 'WTT사원',
      employeeNo: `EMP-WTT-${String(Date.now()).slice(-4)}`,
      departmentId: testDept.id,
      position: '주임',
      duty: '전산검증',
      tierLevel: 2,
      joinDate: '2026-11-01',
      phone: '010-1234-9999',
      residentRegNo: '920315-1234567',
      annualLeaveGrant: 15,
      annualLeaveUsed: 2.5,
      pledgeDate: '2026-11-01',
      pledgeScanName: 'pledge.pdf',
      baseSalaryKrw: 3500000,
      mealAllowanceKrw: 200000,
      vehicleAllowanceKrw: 100000,
      serviceContractKrw: 500000,
      payrollBankName: '기업은행',
      payrollAccountHolder: 'WTT사원',
      payrollAccountNo: '010-9999-1111',
      insNationalPension: true,
      insHealthInsurance: true,
      insEmploymentInsurance: false,
      insIndustrialAccident: true,
      actor: { id: 'u-1', name: '개발자' },
    });
    tracked.hrUserIds.push(testHrUser.id);

    await assert.rejects(
      () =>
        createEmployeeUser({
          loginId: wttLoginId,
          initialPassword: 'InitPass!1',
          name: '중복아이디',
          tierLevel: 1,
          actor: { id: 'u-1', name: '개발자' },
        }),
      /이미 사용 중인 로그인 아이디입니다/,
      'Duplicate loginId must be rejected'
    );

    await assert.rejects(
      () =>
        createEmployeeUser({
          loginId: `${wttLoginId}_dupemp`,
          employeeNo: testHrUser.employeeNo,
          initialPassword: 'InitPass!1',
          name: '중복사번',
          tierLevel: 1,
          actor: { id: 'u-1', name: '개발자' },
        }),
      /이미 등록된 사번입니다/,
      'Duplicate employeeNo must be rejected'
    );

    await assert.rejects(
      () =>
        updateEmployeeHrRecord({
          prevUser: testHrUser,
          patch: { status: 'RETIRED', retireDate: '2026-11-15' },
          actor: { id: testHrUser.id, name: testHrUser.name },
        }),
      /본인 계정을 직접 퇴사 또는 휴직 처리할 수 없습니다/,
      'Self-retirement must be rejected'
    );

    const hrRow1 = (await pgClient.query('SELECT * FROM public.fl_users WHERE id = $1', [testHrUser.id])).rows[0];
    assert(cryptoVault.verifyPassword('InitPass!1', hrRow1.password_hash), 'Initial password must verify');
    assert.strictEqual(Number(hrRow1.base_salary_krw), 3500000, 'Salary must persist');
    assert.strictEqual(Number(hrRow1.hourly_wage_krw), 0, 'Ordinary wage must NOT be auto-calculated from baseSalary');
    assert.strictEqual(Number(hrRow1.meal_allowance_krw), 200000, 'Meal allowance must persist');
    assert.strictEqual(Number(hrRow1.vehicle_allowance_krw), 100000, 'Vehicle allowance must persist');
    assert.strictEqual(Number(hrRow1.service_contract_krw), 500000, 'Service contract amount must persist');
    assert.strictEqual(Number(hrRow1.annual_leave_grant), 15, 'Annual leave grant must persist');
    assert.strictEqual(Number(hrRow1.annual_leave_used), 2.5, 'Annual leave used must persist');
    assert.strictEqual(hrRow1.pledge_date, '2026-11-01', 'Pledge date must persist');
    assert.strictEqual(hrRow1.pledge_scan_name, 'pledge.pdf', 'Pledge scan name must persist');
    assert.strictEqual(hrRow1.payroll_account_holder, 'WTT사원', 'Payroll account holder must persist');
    assert.strictEqual(hrRow1.ins_employment_insurance, false, 'Insurance opt-out must persist');
    assert(
      typeof hrRow1.resident_reg_no === 'string' && hrRow1.resident_reg_no.startsWith('__EBRO_ENC__v1__'),
      'Resident reg no must be encrypted at rest'
    );
    assert.strictEqual(
      cryptoVault.decryptSecret(hrRow1.resident_reg_no),
      '920315-1234567',
      'Resident reg no must decrypt back intact'
    );

    await adminResetUserPassword({
      targetUser: testHrUser,
      newPassword: 'ResetPass!2',
      actor: { id: 'u-1', name: '개발자' },
      reason: 'WTT 비밀번호 초기화 검증',
    });
    const hrRow2 = (await pgClient.query('SELECT * FROM public.fl_users WHERE id = $1', [testHrUser.id])).rows[0];
    assert(!cryptoVault.verifyPassword('InitPass!1', hrRow2.password_hash), 'Old password must fail after reset');
    assert(cryptoVault.verifyPassword('ResetPass!2', hrRow2.password_hash), 'New reset password must verify');
    assert.strictEqual(hrRow2.must_change_password, true, 'Reset password must flag must_change_password');

    await updateEmployeeHrRecord({
      prevUser: testHrUser,
      patch: { departmentId: 'DEPT-0000003', tierLevel: 3, position: '대리', hourlyWageKrw: 18500 },
      deptNameMap: { [testDept.id]: testDept.name, 'DEPT-0000003': '영업부' },
      effectiveDate: '2026-11-10',
      reason: 'WTT 부서이동 · 승진 · 수동 통상임금 등록',
      actor: { id: 'u-1', name: '개발자' },
    });

    await updateEmployeeHrRecord({
      prevUser: {
        ...testHrUser,
        departmentId: 'DEPT-0000003',
        tierLevel: 3,
        position: '대리',
        hourlyWageKrw: 18500,
      },
      patch: { baseSalaryKrw: 4200000, status: 'RETIRED', retireDate: '2026-11-15' },
      deptNameMap: { 'DEPT-0000003': '영업부' },
      effectiveDate: '2026-11-15',
      reason: 'WTT 기본급 인상 시 수동 통상임금 보존 및 퇴사 검증',
      actor: { id: 'u-1', name: '개발자' },
    });

    const hrRow3 = (
      await pgClient.query(
        'SELECT status, is_active, retire_date, tier_level, department_id, base_salary_krw, hourly_wage_krw FROM public.fl_users WHERE id = $1',
        [testHrUser.id]
      )
    ).rows[0];
    assert.strictEqual(hrRow3.status, 'RETIRED');
    assert.strictEqual(hrRow3.is_active, false);
    assert.strictEqual(hrRow3.retire_date, '2026-11-15');
    assert.strictEqual(hrRow3.tier_level, 3);
    assert.strictEqual(hrRow3.department_id, 'DEPT-0000003');
    assert.strictEqual(Number(hrRow3.base_salary_krw), 4200000);
    assert.strictEqual(
      Number(hrRow3.hourly_wage_krw),
      18500,
      'Manual ordinary wage must stay exact (18500) even when baseSalary changes to 4200000'
    );

    const histRows = (await pgClient.query('SELECT event_type FROM public.fl_hr_histories WHERE user_id = $1 ORDER BY created_at', [testHrUser.id])).rows;
    const histTypes = histRows.map((r) => r.event_type);
    for (const reqEv of ['입사등록', '비밀번호초기화', '부서이동', '직책변경', '티어변경', '급여변경', '퇴사처리']) {
      assert(histTypes.includes(reqEv), `Missing HR history event_type=${reqEv}, got ${histTypes.join(',')}`);
    }
    console.log(`[WTT 8 PASS] Org & HR lifecycle (${histTypes.length} audit history events + password reset + retirement) verified.`);

    // =========================================================================
    // Test 9: Managed Exchange Rates 3-Month Coverage & 1-Unit KRW Consistency
    // =========================================================================
    const fxCovRes = await pgClient.query(`
      SELECT currency_code,
             COUNT(*)::int AS cnt,
             MIN(base_rate_krw)::float8 AS min_rate,
             MAX(base_rate_krw)::float8 AS max_rate
      FROM public.fl_exchange_rates
      GROUP BY currency_code
      ORDER BY currency_code
    `);
    const covMap = new Map(fxCovRes.rows.map((r) => [r.currency_code, r]));
    for (const cur of ['USD', 'CNY', 'EUR', 'JPY']) {
      const info = covMap.get(cur);
      assert(info && info.cnt >= 40, `Expected >=40 3-month managed FX rows for ${cur}, got ${info?.cnt || 0}`);
    }
    const jpyInfo = covMap.get('JPY');
    assert(
      jpyInfo.min_rate > 5 && jpyInfo.max_rate < 20,
      `JPY managed rates must use 1-yen per KRW basis (expected 5..20), got ${jpyInfo.min_rate}..${jpyInfo.max_rate}`
    );

    const wttFxCount = await upsertManagedExchangeRates({
      rows: [
        {
          rateDate: '2025-01-02',
          currencyCode: 'JPY',
          baseRateKrw: 9.3542,
          ttSellingRate: 9.4477,
          source: 'WTT 검증',
        },
      ],
    });
    assert.strictEqual(wttFxCount, 1);
    tracked.fxRateIds.push('FX-20250102-JPY');
    const fxCheckRow = (
      await pgClient.query(
        'SELECT base_rate_krw::float8 AS base, tt_selling_rate::float8 AS tts FROM public.fl_exchange_rates WHERE id = $1',
        ['FX-20250102-JPY']
      )
    ).rows[0];
    assert(Math.abs(fxCheckRow.base - 9.3542) < 0.0005, `Expected JPY 4-decimal precision, got ${fxCheckRow.base}`);
    console.log(`[WTT 9 PASS] Managed FX 3-month series (${fxCovRes.rows.map((r) => `${r.currency_code}:${r.cnt}`).join(', ')}) & 1-JPY precision verified.`);

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
      await safeDel(`DELETE FROM public.fl_exchange_rates WHERE id = ANY($1)`, tracked.fxRateIds);
      await safeDel(`DELETE FROM public.fl_approval_requests WHERE id = ANY($1)`, tracked.approvalIds);
      await safeDel(`DELETE FROM public.fl_hr_histories WHERE user_id = ANY($1)`, tracked.hrUserIds);
      await safeDel(`DELETE FROM public.fl_users WHERE id = ANY($1)`, tracked.hrUserIds);
      if (tracked.hrDeptIds.length > 0) {
        await pgClient.query(`UPDATE public.fl_departments SET parent_department_id = NULL WHERE id = ANY($1)`, [tracked.hrDeptIds]);
      }
      await safeDel(`DELETE FROM public.fl_departments WHERE id = ANY($1)`, tracked.hrDeptIds);
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
