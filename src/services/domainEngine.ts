import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
} from '../core/supabase';
import type {
  CurrencyCode,
  FlApPayable,
  FlAssetEvent,
  FlBankTransaction,
  FlBilling,
  FlCollection,
  FlContract,
  FlContractLine,
  FlFinanceLease,
  FlFinanceLeaseSchedule,
  FlFulfillment,
  FlInventoryUnit,
  FlLogisticsDispatch,
  FlPartner,
  FlPurchase,
  FlPurchaseLine,
  FlRentalMaintenance,
  FlStockMovement,
  FlTradeAftercareCase,
  ItemCategory,
  ManagementType,
} from '../types/domain';

export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function getDaysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function getMonthBounds(ym: string): { start: string; end: string; days: number } {
  const days = getDaysInMonth(ym);
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(days).padStart(2, '0')}`,
    days,
  };
}

export function diffDaysInclusive(startIso: string, endIso: string): number {
  const s = Date.parse(`${startIso}T00:00:00Z`);
  const e = Date.parse(`${endIso}T00:00:00Z`);
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

export function sortUnitsFifo(units: FlInventoryUnit[]): FlInventoryUnit[] {
  return [...units].sort((a, b) => {
    const d = a.acquisitionDate.localeCompare(b.acquisitionDate);
    return d !== 0 ? d : a.unitCode.localeCompare(b.unitCode);
  });
}

// ============================================================================
// 1. 매입 입고 & 수입 부대비용 원가 배분 (1원 단수 조정 포함)
// ============================================================================

export interface CreatePurchaseInput {
  purchaseType: 'IMPORT' | 'DOMESTIC';
  supplier: FlPartner;
  targetDomain: 'TRADE' | 'RENTAL';
  blNo?: string;
  lcNo?: string;
  currencyCode: CurrencyCode;
  fxRate: number;
  fxDate?: string;
  customsDutyKrw: number;
  oceanFreightKrw: number;
  clearanceFeeKrw: number;
  inlandFreightKrw: number;
  effectiveDate: string;
  actorId: string;
  actorName: string;
  memo?: string;
  lines: {
    itemId: string;
    sku: string;
    itemName: string;
    itemCategory: ItemCategory;
    managementType: ManagementType;
    quantity: number;
    foreignUnitPrice: number;
    serialList?: string[];
    lotNo?: string;
    warehouseLocation?: string;
  }[];
}

export async function confirmPurchaseInbound(input: CreatePurchaseInput): Promise<{
  purchase: FlPurchase;
  lines: FlPurchaseLine[];
  units: FlInventoryUnit[];
  payable: FlApPayable;
}> {
  if (input.lines.length === 0) {
    throw new Error('매입 품목이 최소 1건 이상 필요합니다.');
  }
  const fx = input.currencyCode === 'KRW' ? 1 : Number(input.fxRate || 1);
  const foreignTotals = input.lines.map((l) => Number((l.quantity * l.foreignUnitPrice).toFixed(2)));
  const foreignMerchTotal = Number(foreignTotals.reduce((a, b) => a + b, 0).toFixed(2));
  const krwMerchTotal =
    input.currencyCode === 'KRW' ? Math.round(foreignMerchTotal) : Math.round(foreignMerchTotal * fx);
  const ancillaryTotal = Math.round(
    (input.customsDutyKrw || 0) +
      (input.oceanFreightKrw || 0) +
      (input.clearanceFeeKrw || 0) +
      (input.inlandFreightKrw || 0)
  );
  const totalLandedCostKrw = krwMerchTotal + ancillaryTotal;

  const purchaseId = newId('PUR');
  const purchaseNo = purchaseId;
  const recordedAt = new Date().toISOString();

  const purchase: FlPurchase = {
    id: purchaseId,
    tenantId: DEFAULT_TENANT_ID,
    purchaseNo,
    purchaseType: input.purchaseType,
    supplierId: input.supplier.id,
    supplierName: input.supplier.name,
    targetDomain: input.targetDomain,
    blNo: input.blNo || null,
    lcNo: input.lcNo || null,
    currencyCode: input.currencyCode,
    fxRate: fx,
    fxDate: input.fxDate || input.effectiveDate,
    foreignMerchandiseTotal: foreignMerchTotal,
    krwMerchandiseTotal: krwMerchTotal,
    customsDutyKrw: Math.round(input.customsDutyKrw || 0),
    oceanFreightKrw: Math.round(input.oceanFreightKrw || 0),
    clearanceFeeKrw: Math.round(input.clearanceFeeKrw || 0),
    inlandFreightKrw: Math.round(input.inlandFreightKrw || 0),
    totalLandedCostKrw,
    status: 'CONFIRMED',
    effectiveDate: input.effectiveDate,
    recordedAt,
    memo: input.memo || null,
  };

  await execDbMutation('매입 입고 저장', () =>
    flSupabase.from('purchases').insert(camelToSnakeRow({ ...purchase }))
  );

  // 원화 물품가액 및 부대비용 비례 배분 (마지막 행 1원 단수 보정)
  let merchAllocatedSoFar = 0;
  let ancAllocatedSoFar = 0;
  const purchaseLines: FlPurchaseLine[] = [];
  const createdUnits: FlInventoryUnit[] = [];
  const movements: FlStockMovement[] = [];
  const events: FlAssetEvent[] = [];

  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    const isLast = i === input.lines.length - 1;
    const lineForeign = foreignTotals[i];
    const ratio = foreignMerchTotal > 0 ? lineForeign / foreignMerchTotal : 1 / input.lines.length;

    const allocMerch = isLast ? krwMerchTotal - merchAllocatedSoFar : Math.round(krwMerchTotal * ratio);
    const allocAnc = isLast ? ancillaryTotal - ancAllocatedSoFar : Math.round(ancillaryTotal * ratio);
    merchAllocatedSoFar += allocMerch;
    ancAllocatedSoFar += allocAnc;

    const lineTotalLanded = allocMerch + allocAnc;
    const qty = Math.max(1, Number(l.quantity));
    const landedUnitCost = Math.round(lineTotalLanded / qty);
    const lineId = `${purchaseId}-L${i + 1}`;
    const serialList = l.managementType === 'SERIAL'
      ? (l.serialList && l.serialList.length >= qty
          ? l.serialList.slice(0, qty)
          : Array.from({ length: qty }, (_, k) => l.serialList?.[k] || `SN-${purchaseId.slice(-5)}-${i + 1}-${k + 1}`))
      : [];

    const lineRec: FlPurchaseLine = {
      id: lineId,
      tenantId: DEFAULT_TENANT_ID,
      purchaseId,
      itemId: l.itemId,
      sku: l.sku,
      itemName: l.itemName,
      itemCategory: l.itemCategory,
      managementType: l.managementType,
      quantity: qty,
      foreignUnitPrice: l.foreignUnitPrice,
      foreignAmount: lineForeign,
      allocatedMerchandiseKrw: allocMerch,
      allocatedAncillaryKrw: allocAnc,
      landedUnitCostKrw: landedUnitCost,
      landedTotalCostKrw: lineTotalLanded,
      serialList,
      lotNo: l.lotNo || (l.managementType === 'LOT' ? `LOT-${purchaseId.slice(-6)}-${i + 1}` : null),
      warehouseLocation: l.warehouseLocation || '평택 주기장',
    };
    purchaseLines.push(lineRec);

    const ownershipDomain = input.targetDomain === 'TRADE' ? '유통재고' : '렌탈자산';

    if (l.managementType === 'SERIAL') {
      let unitSum = 0;
      for (let k = 0; k < qty; k++) {
        const uLast = k === qty - 1;
        const unitCost = uLast ? lineTotalLanded - unitSum : landedUnitCost;
        unitSum += unitCost;
        const uid = newId('UNIT');
        const unit: FlInventoryUnit = {
          id: uid,
          tenantId: DEFAULT_TENANT_ID,
          unitCode: uid,
          itemId: l.itemId,
          sku: l.sku,
          itemName: l.itemName,
          itemCategory: l.itemCategory,
          managementType: 'SERIAL',
          ownershipDomain,
          serialNo: serialList[k],
          lotNo: null,
          qtyOnHand: 1,
          qtyReserved: 0,
          unitCostKrw: unitCost,
          accumulatedDepreciationKrw: 0,
          bookValueKrw: unitCost,
          depreciationMonths: 60,
          residualValueKrw: 0,
          status: '보유중',
          acquisitionType: 'PURCHASE',
          acquisitionDate: input.effectiveDate,
          purchaseLineId: lineId,
          financeLeaseId: null,
          subleaseSupplierId: null,
          subleaseSupplierName: null,
          subleaseMonthlyCostKrw: 0,
          currentContractId: null,
          currentPartnerId: null,
          currentSiteId: null,
          warehouseLocation: lineRec.warehouseLocation,
          operatingHours: 0,
          monthlyRentalFeeKrw: 0,
          dailyRentalFeeKrw: 0,
          memo: `매입번호 ${purchaseNo}`,
        };
        createdUnits.push(unit);
        movements.push({
          id: newId('MOV'),
          tenantId: DEFAULT_TENANT_ID,
          movementType: 'INBOUND',
          unitId: uid,
          itemId: l.itemId,
          fromDomain: null,
          toDomain: ownershipDomain,
          fromStatus: null,
          toStatus: '보유중',
          qtyDelta: 1,
          unitCostKrw: unitCost,
          amountKrw: unitCost,
          refTable: 'fl_purchases',
          refId: purchaseId,
          actorId: input.actorId,
          actorName: input.actorName,
          effectiveDate: input.effectiveDate,
          recordedAt,
          memo: `${purchaseNo} 시리얼 입고 (${unit.serialNo})`,
        });
        if (ownershipDomain === '렌탈자산') {
          events.push({
            id: newId('EVT'),
            tenantId: DEFAULT_TENANT_ID,
            unitId: uid,
            eventType: 'PURCHASE',
            operatingHours: 0,
            deltaAmountKrw: unitCost,
            effectiveDate: input.effectiveDate,
            recordedAt,
            actorName: input.actorName,
            memo: `렌탈자산 매입 취득 (${purchaseNo})`,
          });
        }
      }
    } else {
      const uid = newId('UNIT');
      const unit: FlInventoryUnit = {
        id: uid,
        tenantId: DEFAULT_TENANT_ID,
        unitCode: uid,
        itemId: l.itemId,
        sku: l.sku,
        itemName: l.itemName,
        itemCategory: l.itemCategory,
        managementType: 'LOT',
        ownershipDomain,
        serialNo: null,
        lotNo: lineRec.lotNo,
        qtyOnHand: qty,
        qtyReserved: 0,
        unitCostKrw: landedUnitCost,
        accumulatedDepreciationKrw: 0,
        bookValueKrw: lineTotalLanded,
        depreciationMonths: 60,
        residualValueKrw: 0,
        status: '보유중',
        acquisitionType: 'PURCHASE',
        acquisitionDate: input.effectiveDate,
        purchaseLineId: lineId,
        financeLeaseId: null,
        subleaseSupplierId: null,
        subleaseSupplierName: null,
        subleaseMonthlyCostKrw: 0,
        currentContractId: null,
        currentPartnerId: null,
        currentSiteId: null,
        warehouseLocation: lineRec.warehouseLocation,
        operatingHours: 0,
        monthlyRentalFeeKrw: 0,
        dailyRentalFeeKrw: 0,
        memo: `매입번호 ${purchaseNo}`,
      };
      createdUnits.push(unit);
      movements.push({
        id: newId('MOV'),
        tenantId: DEFAULT_TENANT_ID,
        movementType: 'INBOUND',
        unitId: uid,
        itemId: l.itemId,
        fromDomain: null,
        toDomain: ownershipDomain,
        fromStatus: null,
        toStatus: '보유중',
        qtyDelta: qty,
        unitCostKrw: landedUnitCost,
        amountKrw: lineTotalLanded,
        refTable: 'fl_purchases',
        refId: purchaseId,
        actorId: input.actorId,
        actorName: input.actorName,
        effectiveDate: input.effectiveDate,
        recordedAt,
        memo: `${purchaseNo} 로트 입고 (${unit.lotNo})`,
      });
    }
  }

  await execDbMutation('매입 품목 저장', () =>
    flSupabase.from('purchase_lines').insert(purchaseLines.map((x) => camelToSnakeRow({ ...x })))
  );
  await execDbMutation('재고/자산 원장 생성', () =>
    flSupabase.from('inventory_units').insert(createdUnits.map((x) => camelToSnakeRow({ ...x })))
  );
  await execDbMutation('수불 이력 기록', () =>
    flSupabase.from('stock_movements').insert(movements.map((x) => camelToSnakeRow({ ...x })))
  );
  if (events.length > 0) {
    await execDbMutation('자산 취득 이력 기록', () =>
      flSupabase.from('asset_events').insert(events.map((x) => camelToSnakeRow({ ...x })))
    );
  }

  const vatAmt = input.purchaseType === 'DOMESTIC' ? Math.round(krwMerchTotal * 0.1) : 0;
  const payable: FlApPayable = {
    id: newId('AP'),
    tenantId: DEFAULT_TENANT_ID,
    payableNo: `AP-${purchaseNo}`,
    payableType: 'PURCHASE',
    partnerId: input.supplier.id,
    partnerName: input.supplier.name,
    refTable: 'fl_purchases',
    refId: purchaseId,
    currencyCode: input.currencyCode,
    bookedFxRate: fx,
    foreignAmount: foreignMerchTotal,
    supplyAmountKrw: krwMerchTotal,
    vatAmountKrw: vatAmt,
    totalAmountKrw: krwMerchTotal + vatAmt,
    paidAmountKrw: 0,
    settledFxRate: null,
    fxGainLossKrw: 0,
    status: 'UNPAID',
    dueDate: addDaysIso(input.effectiveDate, 30),
    accrualDate: input.effectiveDate,
    paidDate: null,
    memo: `${purchaseNo} 물품대금 매입채무`,
  };
  await execDbMutation('매입채무 생성', () =>
    flSupabase.from('ap_payables').insert(camelToSnakeRow({ ...payable }))
  );

  return { purchase, lines: purchaseLines, units: createdUnits, payable };
}

// ============================================================================
// 2. 외화 매입채무 결제 및 외환차익/외환차손 계산
// ============================================================================

export async function settleApPayable(params: {
  payable: FlApPayable;
  settledFxRate: number;
  settleForeignOrKrwAmount?: number;
  paidDate: string;
}): Promise<FlApPayable> {
  const { payable, settledFxRate, paidDate } = params;
  const isFx = payable.currencyCode !== 'KRW';
  const remainingTotal = Math.max(0, payable.totalAmountKrw - payable.paidAmountKrw);

  let paidKrw = 0;
  let fxGainLoss = payable.fxGainLossKrw;

  if (isFx) {
    const bookedRatioPaid =
      payable.totalAmountKrw > 0 ? payable.paidAmountKrw / payable.totalAmountKrw : 0;
    const remainingForeign = Number((payable.foreignAmount * (1 - bookedRatioPaid)).toFixed(4));
    const settleForeign =
      params.settleForeignOrKrwAmount !== undefined
        ? Math.min(remainingForeign, params.settleForeignOrKrwAmount)
        : remainingForeign;

    const bookedKrwPortion = Math.round(settleForeign * payable.bookedFxRate);
    paidKrw = Math.round(settleForeign * settledFxRate);
    // 부채 감소분(장부환율) - 실제 지급액(결제환율): 양수면 외환차익, 음수면 외환차손
    const deltaFx = bookedKrwPortion - paidKrw;
    fxGainLoss = Math.round(payable.fxGainLossKrw + deltaFx);

    const newPaidBookEquivalent = Math.min(
      payable.totalAmountKrw,
      payable.paidAmountKrw + bookedKrwPortion
    );
    const isFull = Math.abs(settleForeign - remainingForeign) < 0.01;
    const updated: FlApPayable = {
      ...payable,
      paidAmountKrw: isFull ? payable.totalAmountKrw : newPaidBookEquivalent,
      settledFxRate,
      fxGainLossKrw: fxGainLoss,
      status: isFull ? 'PAID' : 'PARTIAL',
      paidDate,
    };
    await execDbMutation('외화 매입채무 결제', () =>
      flSupabase.from('ap_payables').update(camelToSnakeRow({
        paidAmountKrw: updated.paidAmountKrw,
        settledFxRate: updated.settledFxRate,
        fxGainLossKrw: updated.fxGainLossKrw,
        status: updated.status,
        paidDate: updated.paidDate,
        updatedAt: new Date().toISOString(),
      })).eq('id', payable.id)
    );
    return updated;
  }

  paidKrw =
    params.settleForeignOrKrwAmount !== undefined
      ? Math.min(remainingTotal, Math.round(params.settleForeignOrKrwAmount))
      : remainingTotal;
  const newPaid = payable.paidAmountKrw + paidKrw;
  const isFull = newPaid >= payable.totalAmountKrw - 1;
  const updated: FlApPayable = {
    ...payable,
    paidAmountKrw: isFull ? payable.totalAmountKrw : newPaid,
    status: isFull ? 'PAID' : 'PARTIAL',
    paidDate,
  };
  await execDbMutation('매입채무 지급 완료', () =>
    flSupabase.from('ap_payables').update(camelToSnakeRow({
      paidAmountKrw: updated.paidAmountKrw,
      status: updated.status,
      paidDate: updated.paidDate,
      updatedAt: new Date().toISOString(),
    })).eq('id', payable.id)
  );
  return updated;
}

// ============================================================================
// 3. 금융리스 상환 스케줄 (원리금균등 / 원금균등) 및 리스 자산 등록
// ============================================================================

export function buildFinanceLeaseSchedule(lease: {
  id: string;
  principalAmountKrw: number;
  annualInterestRate: number;
  termMonths: number;
  repaymentMethod: '원리금균등' | '원금균등';
  startDate: string;
  paymentDay: number;
}): FlFinanceLeaseSchedule[] {
  const P = Math.round(lease.principalAmountKrw);
  const n = Math.max(1, Math.round(lease.termMonths));
  const r = (Number(lease.annualInterestRate) / 100) / 12;
  const [sy, sm] = lease.startDate.split('-').map(Number);

  const annuity =
    r > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : P / n;
  const fixedPrincipal = Math.floor(P / n);

  const rows: FlFinanceLeaseSchedule[] = [];
  let bal = P;

  for (let i = 1; i <= n; i++) {
    const dt = new Date(Date.UTC(sy, (sm - 1) + (i - 1), Math.min(lease.paymentDay || 25, 28)));
    const dueYm = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    const dueDate = `${dueYm}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    const opening = bal;
    const interest = Math.round(opening * r);

    let principalPay: number;
    if (i === n) {
      principalPay = opening;
    } else if (lease.repaymentMethod === '원금균등') {
      principalPay = fixedPrincipal;
    } else {
      principalPay = Math.round(annuity - interest);
      if (principalPay > opening) principalPay = opening;
    }

    const totalInstallment = principalPay + interest;
    const ending = opening - principalPay;
    bal = ending;

    rows.push({
      id: `${lease.id}-SCH-${String(i).padStart(3, '0')}`,
      tenantId: DEFAULT_TENANT_ID,
      leaseId: lease.id,
      installmentNo: i,
      dueYm,
      dueDate,
      openingPrincipalKrw: opening,
      principalPaymentKrw: principalPay,
      interestExpenseKrw: interest,
      totalInstallmentKrw: totalInstallment,
      endingPrincipalKrw: ending,
      isPaid: false,
      paidDate: null,
      bankTxId: null,
    });
  }
  return rows;
}

export async function createFinanceLeaseWithAsset(params: {
  lender: FlPartner;
  itemId: string;
  sku: string;
  itemName: string;
  serialNo: string;
  principalAmountKrw: number;
  annualInterestRate: number;
  termMonths: number;
  repaymentMethod: '원리금균등' | '원금균등';
  startDate: string;
  paymentDay: number;
  monthlyRentalFeeKrw?: number;
  dailyRentalFeeKrw?: number;
  actorName: string;
  memo?: string;
}): Promise<{
  lease: FlFinanceLease;
  schedules: FlFinanceLeaseSchedule[];
  unit: FlInventoryUnit;
}> {
  const leaseId = newId('FLS');
  const unitId = newId('UNIT');
  const endDt = (() => {
    const [sy, sm] = params.startDate.split('-').map(Number);
    const dt = new Date(Date.UTC(sy, (sm - 1) + (params.termMonths - 1), Math.min(params.paymentDay || 25, 28)));
    return dt.toISOString().slice(0, 10);
  })();

  const schedules = buildFinanceLeaseSchedule({
    id: leaseId,
    principalAmountKrw: params.principalAmountKrw,
    annualInterestRate: params.annualInterestRate,
    termMonths: params.termMonths,
    repaymentMethod: params.repaymentMethod,
    startDate: params.startDate,
    paymentDay: params.paymentDay,
  });

  const lease: FlFinanceLease = {
    id: leaseId,
    tenantId: DEFAULT_TENANT_ID,
    leaseNo: leaseId,
    lenderPartnerId: params.lender.id,
    lenderName: params.lender.name,
    unitId,
    unitIds: [unitId],
    serialNo: params.serialNo,
    principalAmountKrw: Math.round(params.principalAmountKrw),
    annualInterestRate: params.annualInterestRate,
    termMonths: params.termMonths,
    repaymentMethod: params.repaymentMethod,
    startDate: params.startDate,
    endDate: endDt,
    paymentDay: params.paymentDay,
    remainingPrincipalKrw: Math.round(params.principalAmountKrw),
    status: 'ACTIVE',
    memo: params.memo || null,
  };

  const unit: FlInventoryUnit = {
    id: unitId,
    tenantId: DEFAULT_TENANT_ID,
    unitCode: unitId,
    itemId: params.itemId,
    sku: params.sku,
    itemName: params.itemName,
    itemCategory: '완제품',
    managementType: 'SERIAL',
    ownershipDomain: '렌탈자산',
    serialNo: params.serialNo,
    lotNo: null,
    qtyOnHand: 1,
    qtyReserved: 0,
    unitCostKrw: Math.round(params.principalAmountKrw),
    accumulatedDepreciationKrw: 0,
    bookValueKrw: Math.round(params.principalAmountKrw),
    depreciationMonths: 60,
    residualValueKrw: 0,
    status: '보유중',
    acquisitionType: 'FINANCE_LEASE',
    acquisitionDate: params.startDate,
    purchaseLineId: null,
    financeLeaseId: leaseId,
    subleaseSupplierId: null,
    subleaseSupplierName: null,
    subleaseMonthlyCostKrw: 0,
    currentContractId: null,
    currentPartnerId: null,
    currentSiteId: null,
    warehouseLocation: '평택 주기장',
    operatingHours: 0,
    monthlyRentalFeeKrw: params.monthlyRentalFeeKrw || 850000,
    dailyRentalFeeKrw: params.dailyRentalFeeKrw || 45000,
    memo: `금융리스 ${leaseId}`,
  };

  await execDbMutation('금융리스 자산 생성', () =>
    flSupabase.from('inventory_units').insert(camelToSnakeRow({ ...unit }))
  );
  await execDbMutation('금융리스 계약 생성', () =>
    flSupabase.from('finance_leases').insert(camelToSnakeRow({ ...lease }))
  );
  await execDbMutation('금융리스 상환 스케줄 생성', () =>
    flSupabase.from('finance_lease_schedules').insert(schedules.map((s) => camelToSnakeRow({ ...s })))
  );
  await execDbMutation('리스 취득 이력 기록', () =>
    flSupabase.from('asset_events').insert(camelToSnakeRow({
      id: newId('EVT'),
      tenantId: DEFAULT_TENANT_ID,
      unitId,
      eventType: 'LEASE_INIT',
      operatingHours: 0,
      deltaAmountKrw: Math.round(params.principalAmountKrw),
      effectiveDate: params.startDate,
      recordedAt: new Date().toISOString(),
      actorName: params.actorName,
      memo: `${params.lender.name} 금융리스 취득 (${leaseId})`,
    }))
  );

  return { lease, schedules, unit };
}

export async function payLeaseInstallment(params: {
  lease: FlFinanceLease;
  schedule: FlFinanceLeaseSchedule;
  paidDate: string;
  bankTxId?: string | null;
}): Promise<{ updatedSchedule: FlFinanceLeaseSchedule; updatedLease: FlFinanceLease }> {
  if (params.schedule.isPaid) {
    return { updatedSchedule: params.schedule, updatedLease: params.lease };
  }
  const newRemaining = Math.max(
    0,
    Math.round(params.lease.remainingPrincipalKrw - params.schedule.principalPaymentKrw)
  );
  const newStatus = newRemaining <= 0 ? 'PAID_OFF' : 'ACTIVE';

  const updatedSchedule: FlFinanceLeaseSchedule = {
    ...params.schedule,
    isPaid: true,
    paidDate: params.paidDate,
    bankTxId: params.bankTxId || null,
  };
  const updatedLease: FlFinanceLease = {
    ...params.lease,
    remainingPrincipalKrw: newRemaining,
    status: newStatus,
  };

  await execDbMutation('리스 회차 상환 처리', () =>
    flSupabase.from('finance_lease_schedules').update(camelToSnakeRow({
      isPaid: true,
      paidDate: params.paidDate,
      bankTxId: params.bankTxId || null,
    })).eq('id', params.schedule.id)
  );
  await execDbMutation('리스 잔여원금 갱신', () =>
    flSupabase.from('finance_leases').update(camelToSnakeRow({
      remainingPrincipalKrw: newRemaining,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    })).eq('id', params.lease.id)
  );

  return { updatedSchedule, updatedLease };
}

// ============================================================================
// 4. 계정대체 (유통재고 <-> 렌탈자산 장부가 순액 승계)
// ============================================================================

export async function executeAccountTransfer(params: {
  unit: FlInventoryUnit;
  toDomain: '유통재고' | '렌탈자산';
  effectiveDate: string;
  actorId: string;
  actorName: string;
  memo?: string;
}): Promise<FlInventoryUnit> {
  const { unit, toDomain, effectiveDate, actorId, actorName, memo } = params;
  if (unit.ownershipDomain === toDomain) {
    throw new Error('현재 소속 계정과 전환 대상 계정이 동일합니다.');
  }
  if (unit.status !== '보유중') {
    throw new Error(`보유중 상태의 재고/자산만 계정대체가 가능합니다. (현재 상태: ${unit.status})`);
  }

  // 장부가(취득원가 - 감가상각누계액) 순액 그대로 승계 (재평가 금지)
  const netBookValue =
    unit.bookValueKrw > 0 ? unit.bookValueKrw : Math.max(0, unit.unitCostKrw - unit.accumulatedDepreciationKrw);
  const recordedAt = new Date().toISOString();

  const updated: FlInventoryUnit = {
    ...unit,
    ownershipDomain: toDomain,
    unitCostKrw: toDomain === '유통재고' ? netBookValue : unit.unitCostKrw,
    bookValueKrw: netBookValue,
  };

  await execDbMutation('계정대체 원장 반영', () =>
    flSupabase.from('inventory_units').update(camelToSnakeRow({
      ownershipDomain: updated.ownershipDomain,
      unitCostKrw: updated.unitCostKrw,
      bookValueKrw: updated.bookValueKrw,
      updatedAt: recordedAt,
    })).eq('id', unit.id)
  );

  await execDbMutation('계정대체 수불 이력', () =>
    flSupabase.from('stock_movements').insert(camelToSnakeRow({
      id: newId('MOV'),
      tenantId: DEFAULT_TENANT_ID,
      movementType: 'ACCOUNT_TRANSFER',
      unitId: unit.id,
      itemId: unit.itemId,
      fromDomain: unit.ownershipDomain,
      toDomain,
      fromStatus: unit.status,
      toStatus: unit.status,
      qtyDelta: 0,
      unitCostKrw: netBookValue,
      amountKrw: netBookValue,
      refTable: 'fl_inventory_units',
      refId: unit.id,
      actorId,
      actorName,
      effectiveDate,
      recordedAt,
      memo: memo || `${unit.ownershipDomain} -> ${toDomain} 계정대체 (장부가 ${netBookValue.toLocaleString()}원)`,
    }))
  );

  await execDbMutation('계정대체 자산 이벤트', () =>
    flSupabase.from('asset_events').insert(camelToSnakeRow({
      id: newId('EVT'),
      tenantId: DEFAULT_TENANT_ID,
      unitId: unit.id,
      eventType: 'ACCOUNT_TRANSFER',
      operatingHours: unit.operatingHours,
      deltaAmountKrw: netBookValue,
      effectiveDate,
      recordedAt,
      actorName,
      memo: memo || `${unit.ownershipDomain} -> ${toDomain} 계정대체`,
    }))
  );

  return updated;
}

// ============================================================================
// 5. 출고·회수 실행완료 (희망완료일 vs 입력일시 분리) & 렌탈 교환
// ============================================================================

export async function completeFulfillment(params: {
  fulfillment: FlFulfillment;
  contractLine: FlContractLine;
  unit: FlInventoryUnit;
  effectiveDate: string;
  actorId: string;
  actorName: string;
  returnToRepair?: boolean;
  memo?: string;
}): Promise<{
  fulfillment: FlFulfillment;
  unit: FlInventoryUnit;
}> {
  const { fulfillment, contractLine, unit, effectiveDate, actorId, actorName, memo } = params;
  if (fulfillment.status === 'COMPLETED') {
    throw new Error('이미 실행완료 처리된 의뢰입니다.');
  }

  const recordedAt = new Date().toISOString();
  const qty = Math.max(1, Number(fulfillment.quantity));
  let cogsAmount = 0;
  let updatedUnit: FlInventoryUnit = { ...unit };
  let movementType: FlStockMovement['movementType'] = 'TRADE_OUTBOUND';
  let eventType: FlAssetEvent['eventType'] = 'TRADE_OUTBOUND';

  if (fulfillment.actionType === '유통출고') {
    if (unit.ownershipDomain !== '유통재고') {
      throw new Error('유통출고는 유통재고 소유 항목만 처리할 수 있습니다.');
    }
    cogsAmount =
      unit.managementType === 'SERIAL'
        ? Math.round(unit.unitCostKrw)
        : Math.round(unit.unitCostKrw * qty);

    if (unit.managementType === 'SERIAL') {
      updatedUnit.status = '판매완료';
      updatedUnit.qtyOnHand = 0;
      updatedUnit.currentContractId = fulfillment.contractId;
      updatedUnit.currentPartnerId = fulfillment.partnerId;
    } else {
      const rem = Math.max(0, unit.qtyOnHand - qty);
      updatedUnit.qtyOnHand = rem;
      updatedUnit.status = rem === 0 ? '판매완료' : '보유중';
    }
    movementType = 'TRADE_OUTBOUND';
    eventType = 'TRADE_OUTBOUND';
  } else if (fulfillment.actionType === '렌탈출고') {
    if (unit.ownershipDomain === '유통재고') {
      throw new Error('렌탈출고는 렌탈자산 또는 전대자산만 가능합니다.');
    }
    updatedUnit.status = '대여중';
    updatedUnit.currentContractId = fulfillment.contractId;
    updatedUnit.currentPartnerId = fulfillment.partnerId;
    updatedUnit.currentSiteId = fulfillment.siteId || null;
    movementType = 'RENTAL_OUTBOUND';
    eventType = 'RENTAL_START';
  } else if (fulfillment.actionType === '렌탈회수') {
    updatedUnit.status = params.returnToRepair ? '정비중' : '보유중';
    updatedUnit.currentContractId = null;
    updatedUnit.currentPartnerId = null;
    updatedUnit.currentSiteId = null;
    movementType = 'RENTAL_RETURN';
    eventType = 'RENTAL_RETURN';
  }

  const updatedFulfillment: FlFulfillment = {
    ...fulfillment,
    unitId: unit.id,
    cogsAmountKrw: cogsAmount,
    status: 'COMPLETED',
    effectiveDate,
    recordedAt,
    executedBy: actorName,
    memo: memo ?? fulfillment.memo,
  };

  await execDbMutation('실행완료 상태 저장', () =>
    flSupabase.from('fulfillments').update(camelToSnakeRow({
      unitId: unit.id,
      cogsAmountKrw: cogsAmount,
      status: 'COMPLETED',
      effectiveDate,
      recordedAt,
      executedBy: actorName,
      memo: updatedFulfillment.memo,
      updatedAt: recordedAt,
    })).eq('id', fulfillment.id)
  );

  await execDbMutation('재고/자산 상태 갱신', () =>
    flSupabase.from('inventory_units').update(camelToSnakeRow({
      status: updatedUnit.status,
      qtyOnHand: updatedUnit.qtyOnHand,
      currentContractId: updatedUnit.currentContractId,
      currentPartnerId: updatedUnit.currentPartnerId,
      currentSiteId: updatedUnit.currentSiteId,
      updatedAt: recordedAt,
    })).eq('id', unit.id)
  );

  const linePatch: Record<string, unknown> = {
    assignedUnitId: unit.id,
    assignedSerialNo: unit.serialNo,
    assignedLotNo: unit.lotNo,
    updatedAt: recordedAt,
  };
  if (fulfillment.actionType === '유통출고') {
    linePatch.fulfilledQty = contractLine.fulfilledQty + qty;
    linePatch.lineStatus = contractLine.fulfilledQty + qty >= contractLine.quantity ? 'FULFILLED' : 'ACTIVE';
    linePatch.effectiveStartDate = effectiveDate;
  } else if (fulfillment.actionType === '렌탈출고') {
    linePatch.fulfilledQty = contractLine.fulfilledQty + qty;
    linePatch.lineStatus = 'FULFILLED';
    linePatch.effectiveStartDate = effectiveDate;
  } else if (fulfillment.actionType === '렌탈회수') {
    linePatch.lineStatus = 'RETURNED';
    linePatch.effectiveEndDate = effectiveDate;
  }

  await execDbMutation('계약 품목 행 갱신', () =>
    flSupabase.from('contract_lines').update(camelToSnakeRow(linePatch)).eq('id', contractLine.id)
  );

  await execDbMutation('수불 이력 기록', () =>
    flSupabase.from('stock_movements').insert(camelToSnakeRow({
      id: newId('MOV'),
      tenantId: DEFAULT_TENANT_ID,
      movementType,
      unitId: unit.id,
      itemId: unit.itemId,
      fromDomain: unit.ownershipDomain,
      toDomain: updatedUnit.ownershipDomain,
      fromStatus: unit.status,
      toStatus: updatedUnit.status,
      qtyDelta: fulfillment.actionType === '유통출고' ? -qty : 0,
      unitCostKrw: unit.unitCostKrw,
      amountKrw: cogsAmount,
      refTable: 'fl_fulfillments',
      refId: fulfillment.id,
      actorId,
      actorName,
      effectiveDate,
      recordedAt,
      memo: `${fulfillment.actionType} 실행완료 (희망일 ${effectiveDate})`,
    }))
  );

  await execDbMutation('자산 이벤트 기록', () =>
    flSupabase.from('asset_events').insert(camelToSnakeRow({
      id: newId('EVT'),
      tenantId: DEFAULT_TENANT_ID,
      unitId: unit.id,
      contractId: fulfillment.contractId,
      eventType,
      operatingHours: unit.operatingHours,
      deltaAmountKrw: cogsAmount,
      effectiveDate,
      recordedAt,
      actorName,
      memo: `${fulfillment.actionType} 실행완료`,
    }))
  );

  return { fulfillment: updatedFulfillment, unit: updatedUnit };
}

export async function executeRentalExchange(params: {
  contract: FlContract;
  oldLine: FlContractLine;
  oldUnit: FlInventoryUnit;
  newUnit: FlInventoryUnit;
  exchangeDate: string;
  actorId: string;
  actorName: string;
  oldUnitToRepair?: boolean;
  memo?: string;
}): Promise<{
  fulfillment: FlFulfillment;
  newLine: FlContractLine;
}> {
  const { contract, oldLine, oldUnit, newUnit, exchangeDate, actorId, actorName, memo } = params;
  if (newUnit.ownershipDomain === '유통재고') {
    throw new Error('렌탈 교환 투입 장비는 렌탈자산 또는 전대자산이어야 합니다.');
  }
  if (newUnit.status !== '보유중') {
    throw new Error(`교체 투입 장비는 보유중 상태여야 합니다. (현재: ${newUnit.status})`);
  }

  const prevEndDate = addDaysIso(exchangeDate, -1);
  const recordedAt = new Date().toISOString();

  // 1) 전자산 계약선 종료 & 회수 전환
  await execDbMutation('전자산 계약선 종료', () =>
    flSupabase.from('contract_lines').update(camelToSnakeRow({
      lineStatus: 'REPLACED_OUT',
      effectiveEndDate: prevEndDate,
      updatedAt: recordedAt,
    })).eq('id', oldLine.id)
  );
  await execDbMutation('전자산 상태 회수', () =>
    flSupabase.from('inventory_units').update(camelToSnakeRow({
      status: params.oldUnitToRepair ? '정비중' : '보유중',
      currentContractId: null,
      currentPartnerId: null,
      currentSiteId: null,
      updatedAt: recordedAt,
    })).eq('id', oldUnit.id)
  );

  // 2) 후장비 신규 계약선 생성 — 최초 계약 조건 100% 승계 + predecessorUnitId 연결
  const newLineId = newId('CL');
  const newLine: FlContractLine = {
    id: newLineId,
    tenantId: DEFAULT_TENANT_ID,
    contractId: contract.id,
    lineNo: oldLine.lineNo + 1,
    itemId: newUnit.itemId,
    sku: newUnit.sku,
    itemName: newUnit.itemName,
    itemCategory: newUnit.itemCategory,
    managementType: newUnit.managementType,
    quantity: 1,
    fulfilledQty: 1,
    unitPriceKrw: oldLine.unitPriceKrw,
    supplyAmountKrw: oldLine.supplyAmountKrw,
    vatAmountKrw: oldLine.vatAmountKrw,
    totalAmountKrw: oldLine.totalAmountKrw,
    optionSummary: oldLine.optionSummary || null,
    assignedUnitId: newUnit.id,
    assignedSerialNo: newUnit.serialNo || null,
    assignedLotNo: newUnit.lotNo || null,
    lineStatus: 'FULFILLED',
    effectiveStartDate: exchangeDate,
    effectiveEndDate: null,
    predecessorUnitId: oldUnit.id,
    memo: memo || `교환 승계 (${oldUnit.serialNo || oldUnit.unitCode} -> ${newUnit.serialNo || newUnit.unitCode})`,
  };
  await execDbMutation('후장비 계약선 승계 생성', () =>
    flSupabase.from('contract_lines').insert(camelToSnakeRow({ ...newLine }))
  );

  await execDbMutation('후장비 대여중 전환', () =>
    flSupabase.from('inventory_units').update(camelToSnakeRow({
      status: '대여중',
      currentContractId: contract.id,
      currentPartnerId: contract.partnerId,
      currentSiteId: contract.siteId || null,
      updatedAt: recordedAt,
    })).eq('id', newUnit.id)
  );

  const fulfillment: FlFulfillment = {
    id: newId('FUL'),
    tenantId: DEFAULT_TENANT_ID,
    fulfillmentNo: `EX-${Date.now().toString(36).toUpperCase()}`,
    fulfillmentDomain: 'RENTAL',
    actionType: '교환',
    contractId: contract.id,
    contractLineId: newLineId,
    partnerId: contract.partnerId,
    partnerName: contract.partnerName,
    siteId: contract.siteId || null,
    itemId: newUnit.itemId,
    unitId: oldUnit.id,
    replacementUnitId: newUnit.id,
    quantity: 1,
    cogsAmountKrw: 0,
    status: 'COMPLETED',
    effectiveDate: exchangeDate,
    recordedAt,
    executedBy: actorName,
    memo: memo || '렌탈 장비 교환 완료',
  };
  await execDbMutation('교환 실행완료 저장', () =>
    flSupabase.from('fulfillments').insert(camelToSnakeRow({ ...fulfillment }))
  );

  await execDbMutation('교환 수불 이력 기록', () =>
    flSupabase.from('stock_movements').insert([
      camelToSnakeRow({
        id: newId('MOV'),
        tenantId: DEFAULT_TENANT_ID,
        movementType: 'EXCHANGE_OUT',
        unitId: oldUnit.id,
        itemId: oldUnit.itemId,
        fromDomain: oldUnit.ownershipDomain,
        toDomain: oldUnit.ownershipDomain,
        fromStatus: '대여중',
        toStatus: params.oldUnitToRepair ? '정비중' : '보유중',
        qtyDelta: 0,
        unitCostKrw: oldUnit.unitCostKrw,
        amountKrw: 0,
        refTable: 'fl_fulfillments',
        refId: fulfillment.id,
        actorId,
        actorName,
        effectiveDate: exchangeDate,
        recordedAt,
        memo: `교환 회수 (마감 ${prevEndDate})`,
      }),
      camelToSnakeRow({
        id: newId('MOV'),
        tenantId: DEFAULT_TENANT_ID,
        movementType: 'EXCHANGE_IN',
        unitId: newUnit.id,
        itemId: newUnit.itemId,
        fromDomain: newUnit.ownershipDomain,
        toDomain: newUnit.ownershipDomain,
        fromStatus: '보유중',
        toStatus: '대여중',
        qtyDelta: 0,
        unitCostKrw: newUnit.unitCostKrw,
        amountKrw: 0,
        refTable: 'fl_fulfillments',
        refId: fulfillment.id,
        actorId,
        actorName,
        effectiveDate: exchangeDate,
        recordedAt,
        memo: `교환 투입 (개시 ${exchangeDate})`,
      }),
    ])
  );

  await execDbMutation('교환 추적 이벤트 기록', () =>
    flSupabase.from('asset_events').insert([
      camelToSnakeRow({
        id: newId('EVT'),
        tenantId: DEFAULT_TENANT_ID,
        unitId: oldUnit.id,
        contractId: contract.id,
        eventType: 'EXCHANGE_OUT',
        successorUnitId: newUnit.id,
        operatingHours: oldUnit.operatingHours,
        deltaAmountKrw: 0,
        effectiveDate: exchangeDate,
        recordedAt,
        actorName,
        memo: `교환 회수 -> ${newUnit.serialNo || newUnit.unitCode}`,
      }),
      camelToSnakeRow({
        id: newId('EVT'),
        tenantId: DEFAULT_TENANT_ID,
        unitId: newUnit.id,
        contractId: contract.id,
        eventType: 'EXCHANGE_IN',
        predecessorUnitId: oldUnit.id,
        operatingHours: newUnit.operatingHours,
        deltaAmountKrw: 0,
        effectiveDate: exchangeDate,
        recordedAt,
        actorName,
        memo: `교환 승계 <- ${oldUnit.serialNo || oldUnit.unitCode}`,
      }),
    ])
  );

  return { fulfillment, newLine };
}

// ============================================================================
// 6. 유통 반품/중개 처리 vs 렌탈 정비 처리
// ============================================================================

export async function recordTradeAftercare(params: {
  contract: FlContract;
  unit: FlInventoryUnit;
  caseType: '공급사 정비중개' | '반품환불' | '반품교환';
  supplier?: FlPartner | null;
  refundSupplyKrw: number;
  replacementUnit?: FlInventoryUnit | null;
  effectiveDate: string;
  actorId: string;
  actorName: string;
  memo?: string;
}): Promise<FlTradeAftercareCase> {
  const { contract, unit, caseType, supplier, refundSupplyKrw, replacementUnit, effectiveDate, actorId, actorName, memo } = params;
  const recordedAt = new Date().toISOString();
  const refundSupply = caseType === '반품환불' ? Math.round(refundSupplyKrw) : 0;
  const refundVat = Math.round(refundSupply * 0.1);

  const rec: FlTradeAftercareCase = {
    id: newId('TAC'),
    tenantId: DEFAULT_TENANT_ID,
    caseNo: `TAC-${Date.now().toString(36).toUpperCase()}`,
    contractId: contract.id,
    partnerId: contract.partnerId,
    partnerName: contract.partnerName,
    unitId: unit.id,
    caseType,
    supplierPartnerId: supplier?.id || null,
    supplierName: supplier?.name || null,
    refundSupplyKrw: refundSupply,
    refundVatKrw: refundVat,
    replacementUnitId: replacementUnit?.id || null,
    status: 'COMPLETED',
    effectiveDate,
    recordedAt,
    memo: memo || null,
  };

  await execDbMutation('유통 사후처리 저장', () =>
    flSupabase.from('trade_aftercare_cases').insert(camelToSnakeRow({ ...rec }))
  );

  if (caseType === '반품환불' || caseType === '반품교환') {
    await execDbMutation('반품 재고 복원', () =>
      flSupabase.from('inventory_units').update(camelToSnakeRow({
        status: '보유중',
        qtyOnHand: unit.managementType === 'SERIAL' ? 1 : unit.qtyOnHand + 1,
        currentContractId: null,
        currentPartnerId: null,
        updatedAt: recordedAt,
      })).eq('id', unit.id)
    );
    await execDbMutation('반품 수불 기록', () =>
      flSupabase.from('stock_movements').insert(camelToSnakeRow({
        id: newId('MOV'),
        tenantId: DEFAULT_TENANT_ID,
        movementType: 'TRADE_RETURN',
        unitId: unit.id,
        itemId: unit.itemId,
        fromDomain: unit.ownershipDomain,
        toDomain: unit.ownershipDomain,
        fromStatus: '판매완료',
        toStatus: '보유중',
        qtyDelta: 1,
        unitCostKrw: unit.unitCostKrw,
        amountKrw: unit.unitCostKrw,
        refTable: 'fl_trade_aftercare_cases',
        refId: rec.id,
        actorId,
        actorName,
        effectiveDate,
        recordedAt,
        memo: `${caseType} 입고`,
      }))
    );
  }

  if (caseType === '반품교환' && replacementUnit) {
    await execDbMutation('반품교환 출고 처리', () =>
      flSupabase.from('inventory_units').update(camelToSnakeRow({
        status: '판매완료',
        qtyOnHand: 0,
        currentContractId: contract.id,
        currentPartnerId: contract.partnerId,
        updatedAt: recordedAt,
      })).eq('id', replacementUnit.id)
    );
    await execDbMutation('반품교환 출고 수불', () =>
      flSupabase.from('stock_movements').insert(camelToSnakeRow({
        id: newId('MOV'),
        tenantId: DEFAULT_TENANT_ID,
        movementType: 'TRADE_OUTBOUND',
        unitId: replacementUnit.id,
        itemId: replacementUnit.itemId,
        fromDomain: replacementUnit.ownershipDomain,
        toDomain: replacementUnit.ownershipDomain,
        fromStatus: '보유중',
        toStatus: '판매완료',
        qtyDelta: -1,
        unitCostKrw: replacementUnit.unitCostKrw,
        amountKrw: replacementUnit.unitCostKrw,
        refTable: 'fl_trade_aftercare_cases',
        refId: rec.id,
        actorId,
        actorName,
        effectiveDate,
        recordedAt,
        memo: '반품교환 대품 출고',
      }))
    );
  }

  return rec;
}

export async function recordRentalMaintenance(params: {
  maintType: '주기장정비' | '현장정비' | '순회정비';
  unit: FlInventoryUnit;
  contract?: FlContract | null;
  partner?: FlPartner | null;
  mechanicId: string;
  mechanicName: string;
  vendorPartner?: FlPartner | null;
  operatingHours: number;
  partsUsed: { unit: FlInventoryUnit; qty: number }[];
  laborCostKrw: number;
  externalCostKrw: number;
  isCustomerBillable: boolean;
  customerChargeKrw: number;
  effectiveDate: string;
  memo?: string;
}): Promise<FlRentalMaintenance> {
  if (params.unit.ownershipDomain === '유통재고') {
    throw new Error('정비는 렌탈자산 또는 전대자산에만 등록할 수 있습니다.');
  }
  const recordedAt = new Date().toISOString();
  const partsRows = params.partsUsed.map((p) => ({
    unitId: p.unit.id,
    itemId: p.unit.itemId,
    itemName: p.unit.itemName,
    qty: p.qty,
    unitCostKrw: p.unit.unitCostKrw,
  }));
  const partsCost = partsRows.reduce((s, r) => s + Math.round(r.qty * r.unitCostKrw), 0);
  const totalCost = partsCost + Math.round(params.laborCostKrw || 0) + Math.round(params.externalCostKrw || 0);

  const maint: FlRentalMaintenance = {
    id: newId('MNT'),
    tenantId: DEFAULT_TENANT_ID,
    maintNo: `MNT-${Date.now().toString(36).toUpperCase()}`,
    maintType: params.maintType,
    unitId: params.unit.id,
    serialNo: params.unit.serialNo || null,
    contractId: params.contract?.id || params.unit.currentContractId || null,
    partnerId: params.partner?.id || params.unit.currentPartnerId || null,
    partnerName: params.partner?.name || null,
    mechanicId: params.mechanicId,
    mechanicName: params.mechanicName,
    vendorPartnerId: params.vendorPartner?.id || null,
    operatingHours: params.operatingHours,
    partsUsed: partsRows,
    partsCostKrw: partsCost,
    laborCostKrw: Math.round(params.laborCostKrw || 0),
    externalCostKrw: Math.round(params.externalCostKrw || 0),
    totalCostKrw: totalCost,
    isCustomerBillable: params.isCustomerBillable,
    customerChargeKrw: params.isCustomerBillable ? Math.round(params.customerChargeKrw || 0) : 0,
    status: 'COMPLETED',
    effectiveDate: params.effectiveDate,
    recordedAt,
    memo: params.memo || null,
  };

  await execDbMutation('렌탈 정비 저장', () =>
    flSupabase.from('rental_maintenances').insert(camelToSnakeRow({ ...maint }))
  );

  // 가동시간 누적 갱신
  const nextHours = Math.max(params.unit.operatingHours, params.operatingHours);
  await execDbMutation('자산 가동시간 갱신', () =>
    flSupabase.from('inventory_units').update(camelToSnakeRow({
      operatingHours: nextHours,
      status: params.unit.status === '정비중' ? '보유중' : params.unit.status,
      updatedAt: recordedAt,
    })).eq('id', params.unit.id)
  );

  // 부품 출고 차감
  for (const p of params.partsUsed) {
    const newQty = Math.max(0, p.unit.qtyOnHand - p.qty);
    await execDbMutation('정비 부품 차감', () =>
      flSupabase.from('inventory_units').update(camelToSnakeRow({
        qtyOnHand: newQty,
        updatedAt: recordedAt,
      })).eq('id', p.unit.id)
    );
    await execDbMutation('정비 부품 수불 기록', () =>
      flSupabase.from('stock_movements').insert(camelToSnakeRow({
        id: newId('MOV'),
        tenantId: DEFAULT_TENANT_ID,
        movementType: 'REPAIR_OUT',
        unitId: p.unit.id,
        itemId: p.unit.itemId,
        fromDomain: p.unit.ownershipDomain,
        toDomain: p.unit.ownershipDomain,
        fromStatus: p.unit.status,
        toStatus: p.unit.status,
        qtyDelta: -p.qty,
        unitCostKrw: p.unit.unitCostKrw,
        amountKrw: Math.round(p.qty * p.unit.unitCostKrw),
        refTable: 'fl_rental_maintenances',
        refId: maint.id,
        actorId: params.mechanicId,
        actorName: params.mechanicName,
        effectiveDate: params.effectiveDate,
        recordedAt,
        memo: `${params.maintType} 부품 투입 (${params.unit.serialNo || params.unit.unitCode})`,
      }))
    );
  }

  // 외주 정비비 매입채무 등록
  if (params.vendorPartner && params.externalCostKrw > 0) {
    const extSupply = Math.round(params.externalCostKrw);
    const extVat = Math.round(extSupply * 0.1);
    await execDbMutation('외주 정비비 채무 등록', () =>
      flSupabase.from('ap_payables').insert(camelToSnakeRow({
        id: newId('AP'),
        tenantId: DEFAULT_TENANT_ID,
        payableNo: `AP-${maint.maintNo}`,
        payableType: 'EXTERNAL_REPAIR',
        partnerId: params.vendorPartner!.id,
        partnerName: params.vendorPartner!.name,
        refTable: 'fl_rental_maintenances',
        refId: maint.id,
        currencyCode: 'KRW',
        bookedFxRate: 1,
        foreignAmount: 0,
        supplyAmountKrw: extSupply,
        vatAmountKrw: extVat,
        totalAmountKrw: extSupply + extVat,
        paidAmountKrw: 0,
        fxGainLossKrw: 0,
        status: 'UNPAID',
        dueDate: addDaysIso(params.effectiveDate, 30),
        accrualDate: params.effectiveDate,
        memo: `외주 정비비 (${maint.maintNo})`,
      }))
    );
  }

  await execDbMutation('정비 이벤트 기록', () =>
    flSupabase.from('asset_events').insert(camelToSnakeRow({
      id: newId('EVT'),
      tenantId: DEFAULT_TENANT_ID,
      unitId: params.unit.id,
      contractId: maint.contractId,
      eventType: 'MAINTENANCE',
      operatingHours: nextHours,
      deltaAmountKrw: totalCost,
      effectiveDate: params.effectiveDate,
      recordedAt,
      actorName: params.mechanicName,
      memo: `${params.maintType} · 가동시간 ${nextHours}시간`,
    }))
  );

  return maint;
}

// ============================================================================
// 7. 일할 렌탈 청구 생성 · 수납 · 세금계산서 상태 · 통장 대사
// ============================================================================

export function calculateRentalProRataForMonth(params: {
  contract: FlContract;
  lines: FlContractLine[];
  ym: string;
}): { unitId?: string; contractLineId: string; description: string; days: number; supplyAmountKrw: number; vatAmountKrw: number }[] {
  const { start: mStart, end: mEnd, days: daysInMonth } = getMonthBounds(params.ym);
  const contractLines = params.lines.filter((l) => l.contractId === params.contract.id && l.lineStatus !== 'CANCELLED');
  const results: { unitId?: string; contractLineId: string; description: string; days: number; supplyAmountKrw: number; vatAmountKrw: number }[] = [];

  for (const line of contractLines) {
    const lineStart = line.effectiveStartDate || params.contract.startDate;
    const lineEnd = line.effectiveEndDate || params.contract.endDate;
    const winStart = lineStart > mStart ? lineStart : mStart;
    const winEnd = lineEnd < mEnd ? lineEnd : mEnd;
    const activeDays = diffDaysInclusive(winStart, winEnd);
    if (activeDays <= 0) continue;

    const monthlyRate = line.unitPriceKrw * line.quantity;
    const supply =
      activeDays >= daysInMonth
        ? Math.round(monthlyRate)
        : Math.round((monthlyRate * activeDays) / daysInMonth);

    results.push({
      unitId: line.assignedUnitId || undefined,
      contractLineId: line.id,
      description: `${line.itemName}${line.assignedSerialNo ? ` (${line.assignedSerialNo})` : ''} [${winStart}~${winEnd}, ${activeDays}/${daysInMonth}일]`,
      days: activeDays,
      supplyAmountKrw: supply,
      vatAmountKrw: Math.round(supply * 0.1),
    });
  }

  // 동일 계약 내 교환 승계로 전월/후월 분할 시 월 전체 일수 합이 daysInMonth이면 합계 단수 1원 보정
  const totalDays = results.reduce((s, r) => s + r.days, 0);
  if (results.length === 2 && totalDays === daysInMonth && contractLines.length === 2 && contractLines[0].unitPriceKrw === contractLines[1].unitPriceKrw) {
    const fullRate = Math.round(contractLines[0].unitPriceKrw * contractLines[0].quantity);
    results[1].supplyAmountKrw = fullRate - results[0].supplyAmountKrw;
    results[1].vatAmountKrw = Math.round(results[1].supplyAmountKrw * 0.1);
  }

  return results;
}

export async function recordBillingCollection(params: {
  billing: FlBilling;
  amountKrw: number;
  collectionDate: string;
  paymentMethod: string;
  bankTxId?: string | null;
  recordedBy: string;
  memo?: string;
}): Promise<{ collection: FlCollection; billing: FlBilling }> {
  const { billing, amountKrw, collectionDate, paymentMethod, bankTxId, recordedBy, memo } = params;
  const cleanAmt = Math.round(amountKrw);
  if (cleanAmt <= 0) throw new Error('수납액은 0원보다 커야 합니다.');

  const col: FlCollection = {
    id: newId('COL'),
    tenantId: DEFAULT_TENANT_ID,
    collectionNo: `COL-${Date.now().toString(36).toUpperCase()}`,
    billingId: billing.id,
    partnerId: billing.partnerId,
    partnerName: billing.partnerName,
    collectionDate,
    amountKrw: cleanAmt,
    paymentMethod,
    bankTxId: bankTxId || null,
    recordedBy,
    memo: memo || null,
  };

  const nextPaid = Math.min(billing.totalAmountKrw, billing.paidAmountKrw + cleanAmt);
  const nextUnpaid = Math.max(0, billing.totalAmountKrw - nextPaid);
  const nextStatus: FlBilling['status'] = nextUnpaid === 0 ? 'PAID' : nextPaid > 0 ? 'PARTIAL' : 'UNPAID';

  const updatedBilling: FlBilling = {
    ...billing,
    paidAmountKrw: nextPaid,
    unpaidBalanceKrw: nextUnpaid,
    status: nextStatus,
  };

  await execDbMutation('수납 내역 기록', () =>
    flSupabase.from('collections').insert(camelToSnakeRow({ ...col }))
  );
  await execDbMutation('청구 미수잔액 갱신', () =>
    flSupabase.from('billings').update(camelToSnakeRow({
      paidAmountKrw: nextPaid,
      unpaidBalanceKrw: nextUnpaid,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    })).eq('id', billing.id)
  );

  if (bankTxId) {
    await execDbMutation('통장 입출금 대사 연결', () =>
      flSupabase.from('bank_transactions').update(camelToSnakeRow({
        matchedType: 'AR_BILLING',
        matchedId: billing.id,
        matchStatus: 'MATCHED',
        updatedAt: new Date().toISOString(),
      })).eq('id', bankTxId)
    );
  }

  return { collection: col, billing: updatedBilling };
}

export async function recordLogisticsDispatch(params: {
  dispatchPurpose: FlLogisticsDispatch['dispatchPurpose'];
  carrier: FlPartner;
  driverName?: string;
  driverPhone?: string;
  vehicleNo?: string;
  originAddress: string;
  destinationAddress: string;
  relatedRefType?: string;
  relatedRefId?: string;
  transportCostKrw: number;
  costBearer: FlLogisticsDispatch['costBearer'];
  customerChargeKrw?: number;
  dispatchDate: string;
  memo?: string;
}): Promise<{ dispatch: FlLogisticsDispatch; payable: FlApPayable }> {
  const cost = Math.round(params.transportCostKrw);
  const vat = Math.round(cost * 0.1);
  const dispatch: FlLogisticsDispatch = {
    id: newId('LOG'),
    tenantId: DEFAULT_TENANT_ID,
    dispatchNo: `LOG-${Date.now().toString(36).toUpperCase()}`,
    dispatchPurpose: params.dispatchPurpose,
    carrierPartnerId: params.carrier.id,
    carrierName: params.carrier.name,
    driverName: params.driverName || null,
    driverPhone: params.driverPhone || null,
    vehicleNo: params.vehicleNo || null,
    originAddress: params.originAddress,
    destinationAddress: params.destinationAddress,
    relatedRefType: params.relatedRefType || null,
    relatedRefId: params.relatedRefId || null,
    transportCostKrw: cost,
    vatKrw: vat,
    costBearer: params.costBearer,
    customerChargeKrw: params.costBearer === 'CUSTOMER' ? Math.round(params.customerChargeKrw || cost) : 0,
    settlementStatus: 'SETTLED',
    settlementYm: params.dispatchDate.slice(0, 7),
    dispatchDate: params.dispatchDate,
    recordedAt: new Date().toISOString(),
    memo: params.memo || null,
  };

  const payable: FlApPayable = {
    id: newId('AP'),
    tenantId: DEFAULT_TENANT_ID,
    payableNo: `AP-${dispatch.dispatchNo}`,
    payableType: 'LOGISTICS',
    partnerId: params.carrier.id,
    partnerName: params.carrier.name,
    refTable: 'fl_logistics_dispatches',
    refId: dispatch.id,
    currencyCode: 'KRW',
    bookedFxRate: 1,
    foreignAmount: 0,
    supplyAmountKrw: cost,
    vatAmountKrw: vat,
    totalAmountKrw: cost + vat,
    paidAmountKrw: 0,
    fxGainLossKrw: 0,
    status: 'UNPAID',
    dueDate: addDaysIso(params.dispatchDate, 30),
    accrualDate: params.dispatchDate,
    memo: `운송비 정산 (${dispatch.dispatchNo})`,
  };

  await execDbMutation('물류비 기록 저장', () =>
    flSupabase.from('logistics_dispatches').insert(camelToSnakeRow({ ...dispatch }))
  );
  await execDbMutation('운송비 매입채무 생성', () =>
    flSupabase.from('ap_payables').insert(camelToSnakeRow({ ...payable }))
  );

  return { dispatch, payable };
}
