import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
  selectAllFlRows,
  snakeToCamelRow,
} from '../core/supabase';
import { encryptSecret, hashPassword } from '../utils/cryptoVault';
import {
  type BillingLine,
  computeDueDateFromCycle,
  type CurrencyCode,
  FlApPayable,
  FlAssetEvent,
  FlBilling,
  FlCollection,
  FlContract,
  FlContractLine,
  FlDepartment,
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
  FlUser,
  HrEventType,
  ItemCategory,
  ManagementType,
  TierLevel,
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

export function listMonthsBetween(fromYm: string, toYm: string): string[] {
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

export function computeUnitDepreciationAsOf(
  unit: FlInventoryUnit,
  startYm: string,
  endYm: string,
  stockMovements: FlStockMovement[] = []
): {
  periodDep: number;
  accumDep: number;
  endingBookValue: number;
  monthlyEntries: { ym: string; amount: number }[];
  transferOutResets: { ym: string; amount: number }[];
  domainAtEndYm: string;
} {
  if (
    unit.itemCategory === '부품' ||
    unit.itemCategory === '소모품' ||
    unit.acquisitionType === 'SUBLEASE'
  ) {
    return {
      periodDep: 0,
      accumDep: 0,
      endingBookValue: unit.ownershipDomain === '전대자산' ? 0 : Math.round(unit.unitCostKrw),
      domainAtEndYm: unit.ownershipDomain,
      monthlyEntries: [],
      transferOutResets: [],
    };
  }

  const transfers = stockMovements
    .filter((m) => m.unitId === unit.id && m.movementType === 'ACCOUNT_TRANSFER')
    .sort((a, b) => {
      const d = a.effectiveDate.localeCompare(b.effectiveDate);
      return d !== 0 ? d : a.recordedAt.localeCompare(b.recordedAt);
    });

  if (transfers.length === 0 && unit.ownershipDomain !== '렌탈자산') {
    return {
      periodDep: 0,
      accumDep: 0,
      endingBookValue: Math.round(unit.unitCostKrw),
      domainAtEndYm: unit.ownershipDomain,
      monthlyEntries: [],
      transferOutResets: [],
    };
  }

  const acqYm = unit.acquisitionDate.slice(0, 7);
  const monthsAll = listMonthsBetween(acqYm, endYm);
  const depMonths = Math.max(1, unit.depreciationMonths || 60);
  const inboundMov = stockMovements.find((m) => m.unitId === unit.id && m.movementType === 'INBOUND');
  const grossCost = Math.round(
    unit.ownershipDomain === '렌탈자산'
      ? unit.unitCostKrw
      : inboundMov?.unitCostKrw || Math.max(unit.unitCostKrw + unit.accumulatedDepreciationKrw, unit.unitCostKrw)
  );
  const depreciableBase = Math.max(0, grossCost - Math.round(unit.residualValueKrw || 0));
  const monthlyDep = Math.round(depreciableBase / depMonths);

  let curDomain: string = transfers[0]?.fromDomain || unit.ownershipDomain;
  let transferIdx = 0;
  let accumTotal = 0;
  let activeAccumForBalance = 0;
  let periodDep = 0;
  const monthlyEntries: { ym: string; amount: number }[] = [];
  const transferOutResets: { ym: string; amount: number }[] = [];

  for (const m of monthsAll) {
    while (transferIdx < transfers.length && transfers[transferIdx].effectiveDate.slice(0, 7) <= m) {
      const t = transfers[transferIdx];
      const nextDom = t.toDomain || curDomain;
      if (curDomain === '렌탈자산' && nextDom !== '렌탈자산' && activeAccumForBalance > 0) {
        transferOutResets.push({ ym: t.effectiveDate.slice(0, 7), amount: activeAccumForBalance });
        activeAccumForBalance = 0;
      }
      curDomain = nextDom;
      transferIdx++;
    }

    if (curDomain !== '렌탈자산') continue;
    const rem = depreciableBase - accumTotal;
    if (rem <= 0) break;
    const d = Math.min(monthlyDep, rem);
    accumTotal += d;
    activeAccumForBalance += d;
    if (m >= startYm && m <= endYm) {
      periodDep += d;
    }
    monthlyEntries.push({ ym: m, amount: d });
  }

  const finalAccum = curDomain === '렌탈자산' ? activeAccumForBalance : 0;
  return {
    periodDep,
    accumDep: finalAccum,
    endingBookValue:
      curDomain === '렌탈자산'
        ? Math.max(0, grossCost - finalAccum)
        : Math.round(unit.unitCostKrw),
    domainAtEndYm: curDomain,
    monthlyEntries,
    transferOutResets,
  };
}

export async function syncRentalAssetsDepreciationInDb(asOfYm: string): Promise<number> {
  const [unitRes, movRes] = await Promise.all([
    selectAllFlRows('inventory_units', { orderCol: 'id' }),
    selectAllFlRows('stock_movements', { orderCol: 'effective_date' }),
  ]);
  if (unitRes.error) {
    throw new Error(`자산 원장 조회 실패: ${unitRes.error.message || '데이터베이스 오류'}`);
  }
  const units = (unitRes.data || []).map((r) => snakeToCamelRow<FlInventoryUnit>(r));
  const movements = (movRes.data || []).map((r) => snakeToCamelRow<FlStockMovement>(r));
  const nowIso = new Date().toISOString();
  let updatedCount = 0;

  for (const u of units) {
    if (u.ownershipDomain !== '렌탈자산' || u.acquisitionType === 'SUBLEASE') continue;
    if (u.itemCategory === '부품' || u.itemCategory === '소모품') continue;
    const dep = computeUnitDepreciationAsOf(u, asOfYm, asOfYm, movements);
    const prevAccum = Math.round(Number(u.accumulatedDepreciationKrw || 0));
    const prevBook = Math.round(Number(u.bookValueKrw || 0));
    if (prevAccum !== dep.accumDep || prevBook !== dep.endingBookValue) {
      await execDbMutation('감가상각 원장 동기화', () =>
        flSupabase
          .from('inventory_units')
          .update({
            accumulated_depreciation_krw: dep.accumDep,
            book_value_krw: dep.endingBookValue,
            updated_at: nowIso,
          })
          .eq('id', u.id)
      );
      updatedCount++;
    }
  }
  return updatedCount;
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

export async function allocateSequentialUnitCodes(
  effectiveDate: string,
  count: number
): Promise<string[]> {
  const cleanDate = (effectiveDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const yymm = `${cleanDate.slice(2, 4)}${cleanDate.slice(5, 7)}`;
  const prefix = `U-${yymm}-`;
  const res = await flSupabase
    .from('inventory_units')
    .select('unit_code')
    .like('unit_code', `${prefix}%`);
  let maxSeq = 0;
  if (!res.error && Array.isArray(res.data)) {
    for (const row of res.data as { unit_code?: string }[]) {
      const code = row.unit_code || '';
      if (!code.startsWith(prefix)) continue;
      const num = Number(code.slice(prefix.length));
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }
  }
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const seq = String(maxSeq + 1 + i).padStart(4, '0');
    return `${prefix}${seq}`;
  });
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
  const totalUnitCodesNeeded = input.lines.reduce(
    (s, l) => s + (l.managementType === 'SERIAL' ? Math.max(1, Number(l.quantity)) : 1),
    0
  );
  const allocatedUnitCodes = await allocateSequentialUnitCodes(input.effectiveDate, totalUnitCodesNeeded);
  let unitCodeCursor = 0;
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

    // 부품·소모품은 렌탈 정비 목적 매입 시에도 기계장치 감가상각 대상이 아닌 유동재고(부품·소모품재고)로 귀속한다.
    const isConsumableOrPart = l.itemCategory === '부품' || l.itemCategory === '소모품';
    const ownershipDomain = isConsumableOrPart
      ? '유통재고'
      : input.targetDomain === 'TRADE'
        ? '유통재고'
        : '렌탈자산';
    const depMonths = isConsumableOrPart ? 0 : 60;

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
          unitCode: allocatedUnitCodes[unitCodeCursor++] || uid,
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
          depreciationMonths: depMonths,
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
        unitCode: allocatedUnitCodes[unitCodeCursor++] || uid,
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
        depreciationMonths: depMonths,
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
    dueDate: computeDueDateFromCycle(
      input.effectiveDate.slice(0, 7),
      input.supplier.defaultPaymentCycle,
      input.supplier.defaultPaymentMonthOffset,
      input.supplier.defaultPaymentDueDay,
      input.effectiveDate
    ),
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
  const [unitCode] = await allocateSequentialUnitCodes(params.startDate, 1);
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
    unitCode,
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

async function syncContractStatusAfterFulfillment(contractId: string): Promise<void> {
  const [ctrRes, linesRes, fulRes] = await Promise.all([
    flSupabase
      .from('contracts')
      .select('id, contract_domain, status')
      .eq('id', contractId)
      .maybeSingle(),
    flSupabase
      .from('contract_lines')
      .select('id, quantity, fulfilled_qty, line_status')
      .eq('contract_id', contractId),
    flSupabase
      .from('fulfillments')
      .select('id, action_type, status')
      .eq('contract_id', contractId),
  ]);
  if (ctrRes.error || !ctrRes.data) return;
  const ctr = ctrRes.data as { id: string; contract_domain: string; status: string };
  if (ctr.status === 'DRAFT' || ctr.status === 'CANCELLED' || ctr.status === 'TERMINATED') return;

  const activeLines = ((linesRes.data || []) as Array<{
    id: string;
    quantity: number;
    fulfilled_qty: number;
    line_status: string;
  }>).filter((l) => l.line_status !== 'CANCELLED');
  if (activeLines.length === 0) return;

  const hasRequested = ((fulRes.data || []) as Array<{ id: string; status: string }>).some(
    (f) => f.status === 'REQUESTED'
  );
  let nextStatus = ctr.status;

  if (ctr.contract_domain === 'TRADE') {
    const allFulfilled = activeLines.every(
      (l) => Number(l.fulfilled_qty || 0) >= Number(l.quantity || 1)
    );
    const anyFulfilled = activeLines.some((l) => Number(l.fulfilled_qty || 0) > 0);
    if (allFulfilled && !hasRequested) {
      nextStatus = 'COMPLETED';
    } else if (anyFulfilled || hasRequested) {
      nextStatus = 'FULFILLING';
    } else {
      nextStatus = 'ACTIVE';
    }
  } else {
    const allReturned = activeLines.every((l) => l.line_status === 'RETURNED');
    const anyUnfulfilled = activeLines.some(
      (l) => l.line_status === 'ACTIVE' && Number(l.fulfilled_qty || 0) < Number(l.quantity || 1)
    );
    if (allReturned && !hasRequested) {
      nextStatus = 'COMPLETED';
    } else if (anyUnfulfilled && hasRequested) {
      nextStatus = 'FULFILLING';
    } else {
      nextStatus = 'ACTIVE';
    }
  }

  if (nextStatus !== ctr.status) {
    await execDbMutation('계약 상태 자동 동기화', () =>
      flSupabase
        .from('contracts')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', contractId)
    );
  }
}

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
    if (unit.managementType === 'SERIAL' && qty !== 1) {
      throw new Error('시리얼 개별추적 장비는 1대 단위로 출고 실행해 주세요.');
    }
    if (unit.qtyOnHand < qty) {
      throw new Error(`선택한 재고의 가용수량 ${unit.qtyOnHand}개가 출고 수량 ${qty}개보다 부족합니다.`);
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

  await syncContractStatusAfterFulfillment(fulfillment.contractId);

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
    fulfillmentNo: newId('EX'),
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
    caseNo: newId('TAC'),
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
  if (Number(params.externalCostKrw || 0) > 0 && !params.vendorPartner) {
    throw new Error('외주 정비비가 있는 경우 외주정비처를 선택해 주세요.');
  }
  for (const p of params.partsUsed) {
    if (p.qty > p.unit.qtyOnHand) {
      throw new Error(`투입 부품 수량 ${p.qty}개가 가용 재고 ${p.unit.qtyOnHand}개를 초과했습니다.`);
    }
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
    maintNo: newId('MNT'),
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
  if (params.contract.status === 'DRAFT' || params.contract.status === 'CANCELLED') {
    return [];
  }
  const { start: mStart, end: mEnd, days: daysInMonth } = getMonthBounds(params.ym);
  const contractLines = params.lines.filter(
    (l) =>
      l.contractId === params.contract.id &&
      (l.lineStatus === 'FULFILLED' || l.lineStatus === 'REPLACED_OUT' || l.lineStatus === 'RETURNED') &&
      (Boolean(l.assignedUnitId) || l.fulfilledQty > 0)
  );
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
      description: `${line.itemName}${line.assignedSerialNo ? ` · ${line.assignedSerialNo}` : ''} [${winStart}~${winEnd}, ${activeDays}/${daysInMonth}일]`,
      days: activeDays,
      supplyAmountKrw: supply,
      vatAmountKrw: Math.round(supply * 0.1),
    });
  }

  // 동일 계약 내 교환 승계로 전월/후월 분할 시 월 전체 일수 합이 daysInMonth이면 합계 단수 1원 보정
  const resultByLineId = new Map(results.map((r) => [r.contractLineId, r]));
  let adjustedViaPredecessor = false;
  for (const line of contractLines) {
    if (!line.predecessorUnitId) continue;
    const succRes = resultByLineId.get(line.id);
    const predLine = contractLines.find(
      (p) => p.assignedUnitId === line.predecessorUnitId && p.lineStatus === 'REPLACED_OUT'
    );
    const predRes = predLine ? resultByLineId.get(predLine.id) : undefined;
    if (
      succRes &&
      predRes &&
      predLine &&
      predRes.days + succRes.days === daysInMonth &&
      predLine.unitPriceKrw === line.unitPriceKrw
    ) {
      const fullRate = Math.round(predLine.unitPriceKrw * predLine.quantity);
      succRes.supplyAmountKrw = fullRate - predRes.supplyAmountKrw;
      succRes.vatAmountKrw = Math.round(succRes.supplyAmountKrw * 0.1);
      adjustedViaPredecessor = true;
    }
  }

  if (!adjustedViaPredecessor) {
    const totalDays = results.reduce((s, r) => s + r.days, 0);
    if (
      results.length === 2 &&
      totalDays === daysInMonth &&
      contractLines.length === 2 &&
      contractLines[0].unitPriceKrw === contractLines[1].unitPriceKrw
    ) {
      const fullRate = Math.round(contractLines[0].unitPriceKrw * contractLines[0].quantity);
      results[1].supplyAmountKrw = fullRate - results[0].supplyAmountKrw;
      results[1].vatAmountKrw = Math.round(results[1].supplyAmountKrw * 0.1);
    }
  }

  return results;
}

export function buildContractBillingLines(params: {
  contract: FlContract;
  contractLines: FlContractLine[];
  fulfillments: FlFulfillment[];
  rentalMaintenances?: FlRentalMaintenance[];
  logisticsDispatches?: FlLogisticsDispatch[];
  existingBillings?: FlBilling[];
  ym: string;
}): BillingLine[] {
  if (params.contract.status === 'DRAFT' || params.contract.status === 'CANCELLED') {
    return [];
  }

  const activeBillings = (params.existingBillings || []).filter(
    (b) => b.status !== 'CANCELLED' && b.contractId === params.contract.id
  );
  const billedFulfillmentIds = new Set<string>();
  const billedRentalLineYmKeys = new Set<string>();
  const billedMaintIds = new Set<string>();
  const billedDispatchIds = new Set<string>();
  let legacyBilledSupplyForContract = 0;

  for (const b of activeBillings) {
    legacyBilledSupplyForContract += Number(b.supplyAmountKrw || 0);
    for (const bl of b.lines || []) {
      if (bl.fulfillmentId) billedFulfillmentIds.add(bl.fulfillmentId);
      if (bl.maintId) billedMaintIds.add(bl.maintId);
      if (bl.dispatchId) billedDispatchIds.add(bl.dispatchId);
      if (bl.contractLineId) {
        const ymTag = bl.billingYmTag || b.billingYm;
        if (ymTag) billedRentalLineYmKeys.add(`${bl.contractLineId}__${ymTag}`);
      }
    }
  }

  const out: BillingLine[] = [];

  if (params.contract.contractDomain === 'TRADE') {
    const contractLines = params.contractLines.filter(
      (l) => l.contractId === params.contract.id && l.lineStatus !== 'CANCELLED'
    );
    const lineMap = new Map(contractLines.map((l) => [l.id, l]));
    const completedTradeFuls = params.fulfillments.filter(
      (f) =>
        f.contractId === params.contract.id &&
        f.status === 'COMPLETED' &&
        f.actionType === '유통출고' &&
        (f.effectiveDate || '').slice(0, 7) <= params.ym
    );

    const hasStructuredFulfillmentBillings = activeBillings.some((b) =>
      (b.lines || []).some((bl) => Boolean(bl.fulfillmentId))
    );
    const legacyAlreadyCoversAll =
      !hasStructuredFulfillmentBillings &&
      activeBillings.length > 0 &&
      legacyBilledSupplyForContract >= params.contract.supplyAmountKrw;

    if (completedTradeFuls.length > 0 && !legacyAlreadyCoversAll) {
      for (const f of completedTradeFuls) {
        if (billedFulfillmentIds.has(f.id)) continue;
        const line = lineMap.get(f.contractLineId);
        if (!line) continue;
        const qty = Math.max(1, Number(f.quantity || 1));
        const supply =
          qty === line.quantity
            ? Math.round(line.supplyAmountKrw)
            : Math.round(line.unitPriceKrw * qty);
        if (supply <= 0) continue;
        out.push({
          description: `${line.itemName} 출고공급대금`,
          qty,
          supplyAmountKrw: supply,
          vatAmountKrw: Math.round(supply * 0.1),
          unitId: f.unitId || line.assignedUnitId || undefined,
          contractLineId: line.id,
          fulfillmentId: f.id,
          billingYmTag: params.ym,
        });
      }
    }

    if (completedTradeFuls.length > 0) {
      for (const d of params.logisticsDispatches || []) {
        if (
          d.relatedRefId === params.contract.id &&
          d.costBearer === 'CUSTOMER' &&
          d.customerChargeKrw > 0 &&
          d.dispatchDate.slice(0, 7) === params.ym &&
          !billedDispatchIds.has(d.id)
        ) {
          const supply = Math.round(d.customerChargeKrw);
          out.push({
            description: `${d.dispatchPurpose} 고객부담 운송비 · ${d.dispatchNo}`,
            qty: 1,
            supplyAmountKrw: supply,
            vatAmountKrw: Math.round(supply * 0.1),
            dispatchId: d.id,
            billingYmTag: params.ym,
          });
        }
      }
    }

    return out;
  }

  // RENTAL 계약: 출고 완료 이후 가동 이력이 있는 라인만 일할 임대료 청구
  const proRataRows = calculateRentalProRataForMonth({
    contract: params.contract,
    lines: params.contractLines,
    ym: params.ym,
  });
  const legacySameYmBilled = activeBillings.some(
    (b) =>
      b.billingYm === params.ym &&
      !(b.lines || []).some((bl) => Boolean(bl.contractLineId))
  );

  if (!legacySameYmBilled) {
    for (const r of proRataRows) {
      if (billedRentalLineYmKeys.has(`${r.contractLineId}__${params.ym}`)) continue;
      out.push({
        description: r.description,
        qty: 1,
        supplyAmountKrw: r.supplyAmountKrw,
        vatAmountKrw: r.vatAmountKrw,
        unitId: r.unitId,
        contractLineId: r.contractLineId,
        billingYmTag: params.ym,
      });
    }
  }

  const fulfilledRentalLines = params.contractLines.filter(
    (l) =>
      l.contractId === params.contract.id &&
      (l.lineStatus === 'FULFILLED' || l.lineStatus === 'REPLACED_OUT' || l.lineStatus === 'RETURNED') &&
      (Boolean(l.assignedUnitId) || l.fulfilledQty > 0)
  );
  if (fulfilledRentalLines.length > 0) {
    const primaryUnitId = fulfilledRentalLines.find((l) => Boolean(l.assignedUnitId))?.assignedUnitId || undefined;
    for (const m of params.rentalMaintenances || []) {
      if (
        m.contractId === params.contract.id &&
        m.status === 'COMPLETED' &&
        m.isCustomerBillable &&
        m.customerChargeKrw > 0 &&
        m.effectiveDate.slice(0, 7) === params.ym &&
        !billedMaintIds.has(m.id)
      ) {
        const supply = Math.round(m.customerChargeKrw);
        out.push({
          description: `${m.maintType} 유상청구 · ${m.maintNo}`,
          qty: 1,
          supplyAmountKrw: supply,
          vatAmountKrw: Math.round(supply * 0.1),
          unitId: m.unitId,
          maintId: m.id,
          billingYmTag: params.ym,
        });
      }
    }
    for (const d of params.logisticsDispatches || []) {
      if (
        d.relatedRefId === params.contract.id &&
        d.costBearer === 'CUSTOMER' &&
        d.customerChargeKrw > 0 &&
        d.dispatchDate.slice(0, 7) === params.ym &&
        !billedDispatchIds.has(d.id)
      ) {
        const supply = Math.round(d.customerChargeKrw);
        out.push({
          description: `${d.dispatchPurpose} 고객부담 운송비 · ${d.dispatchNo}`,
          qty: 1,
          supplyAmountKrw: supply,
          vatAmountKrw: Math.round(supply * 0.1),
          unitId: primaryUnitId,
          dispatchId: d.id,
          billingYmTag: params.ym,
        });
      }
    }
  }

  return out;
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
    collectionNo: newId('COL'),
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
    dispatchNo: newId('LOG'),
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


// ============================================================================
// 11. 조직 및 인사 원장 관리
// ============================================================================

export interface SaveDepartmentInput {
  id?: string;
  name: string;
  parentDepartmentId?: string | null;
  managerId?: string | null;
  functionalTags: string[];
  sortOrder?: number;
  memo?: string | null;
  isActive?: boolean;
}

export async function saveDepartment(input: SaveDepartmentInput): Promise<FlDepartment> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error('부서명을 입력하십시오.');
  if (input.id && input.parentDepartmentId === input.id) {
    throw new Error('자기 자신을 상위 부서로 지정할 수 없습니다.');
  }

  if (input.id && input.parentDepartmentId) {
    const deptRes = await flSupabase.from('departments').select('id, parent_department_id');
    if (deptRes.error) {
      throw new Error(deptRes.error.message || '부서 계층 조회 실패');
    }
    const parentMap = new Map<string, string | null>();
    for (const row of deptRes.data || []) {
      const rec = row as { id: string; parent_department_id: string | null };
      parentMap.set(rec.id, rec.parent_department_id || null);
    }
    let cur: string | null = input.parentDepartmentId;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      if (cur === input.id) {
        throw new Error('하위 부서를 상위 부서로 지정할 수 없습니다.');
      }
      visited.add(cur);
      cur = parentMap.get(cur) || null;
    }
  }

  const now = new Date().toISOString();
  const isNew = !input.id;
  const id = input.id || newId('DEPT');
  const dept: FlDepartment = {
    id,
    tenantId: DEFAULT_TENANT_ID,
    name: cleanName,
    parentDepartmentId: input.parentDepartmentId || null,
    managerId: input.managerId || null,
    functionalTags: Array.isArray(input.functionalTags) ? input.functionalTags : [],
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100,
    memo: input.memo?.trim() || null,
    isActive: input.isActive !== false,
  };

  if (isNew) {
    await execDbMutation('부서 등록', () =>
      flSupabase.from('departments').insert({
        ...camelToSnakeRow({
          ...dept,
          createdAt: now,
          updatedAt: now,
        }),
      })
    );
  } else {
    await execDbMutation('부서 정보 수정', () =>
      flSupabase
        .from('departments')
        .update({
          name: dept.name,
          parent_department_id: dept.parentDepartmentId,
          manager_id: dept.managerId,
          functional_tags: dept.functionalTags,
          sort_order: dept.sortOrder,
          memo: dept.memo,
          is_active: dept.isActive,
          updated_at: now,
        })
        .eq('id', dept.id)
    );
  }

  return dept;
}

export interface CreateEmployeeUserInput {
  loginId: string;
  initialPassword: string;
  name: string;
  employeeNo?: string | null;
  departmentId?: string | null;
  position?: string | null;
  duty?: string | null;
  tierLevel: TierLevel;
  maskSalesPrice?: boolean;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  joinDate?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  baseSalaryKrw?: number;
  payrollBankName?: string | null;
  payrollAccountNo?: string | null;
  profileImageUrl?: string | null;
  residentRegNo?: string | null;
  annualLeaveGrant?: number;
  annualLeaveUsed?: number;
  pledgeDate?: string | null;
  pledgeScanName?: string | null;
  pledgeScanUrl?: string | null;
  mustChangePassword?: boolean;
  payrollAccountHolder?: string | null;
  hourlyWageKrw?: number;
  mealAllowanceKrw?: number;
  vehicleAllowanceKrw?: number;
  serviceContractKrw?: number;
  insNationalPension?: boolean;
  insHealthInsurance?: boolean;
  insEmploymentInsurance?: boolean;
  insIndustrialAccident?: boolean;
  memo?: string | null;
  status?: string;
  actor: { id: string; name: string };
}

function roundKrw(val: unknown): number {
  const n = Number(val ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function roundLeaveDays(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : fallback;
}

interface ExistingUserIdentifierRow {
  id: string;
  loginId: string;
  employeeNo: string | null;
}

async function fetchExistingUserIdentifiers(): Promise<ExistingUserIdentifierRow[]> {
  const res = await flSupabase.from('users').select('id, login_id, employee_no');
  if (res.error) {
    throw new Error(res.error.message || '임직원 식별자 조회 실패');
  }
  return (res.data || []).map((row) => {
    const rec = row as { id: string; login_id: string; employee_no: string | null };
    return {
      id: rec.id,
      loginId: rec.login_id || '',
      employeeNo: rec.employee_no || null,
    };
  });
}

function nextSequentialEmployeeNo(existingUsers: ExistingUserIdentifierRow[]): string {
  const used = new Set<string>();
  let maxSeq = 2600;
  for (const row of existingUsers) {
    const emp = (row.employeeNo || '').trim().toUpperCase();
    if (!emp) continue;
    used.add(emp);
    const m = /^EMP-(\d+)$/.exec(emp);
    if (m) {
      const num = Number(m[1]);
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }
  }
  let seq = maxSeq + 1;
  while (used.has(`EMP-${seq}`)) seq++;
  return `EMP-${seq}`;
}

function assertUniqueUserIdentifiers(
  existingUsers: ExistingUserIdentifierRow[],
  params: { excludeUserId?: string; loginId?: string; employeeNo?: string | null }
): void {
  const cleanLoginLower = params.loginId?.trim().toLowerCase() || '';
  const cleanEmpUpper = params.employeeNo?.trim().toUpperCase() || '';
  for (const row of existingUsers) {
    if (params.excludeUserId && row.id === params.excludeUserId) continue;
    const rowLoginLower = row.loginId.trim().toLowerCase();
    const rowEmpUpper = (row.employeeNo || '').trim().toUpperCase();
    if (cleanLoginLower) {
      if (rowLoginLower === cleanLoginLower) {
        throw new Error('이미 사용 중인 로그인 아이디입니다.');
      }
      if (rowEmpUpper && rowEmpUpper === cleanLoginLower.toUpperCase()) {
        throw new Error('다른 임직원의 사번과 동일한 로그인 아이디는 사용할 수 없습니다.');
      }
    }
    if (cleanEmpUpper) {
      if (rowEmpUpper && rowEmpUpper === cleanEmpUpper) {
        throw new Error('이미 등록된 사번입니다.');
      }
      if (rowLoginLower && rowLoginLower.toUpperCase() === cleanEmpUpper) {
        throw new Error('다른 임직원의 로그인 아이디와 동일한 사번은 사용할 수 없습니다.');
      }
    }
  }
}

export async function createEmployeeUser(input: CreateEmployeeUserInput): Promise<FlUser> {
  const loginId = input.loginId.trim();
  const name = input.name.trim();
  if (!loginId) throw new Error('로그인 아이디를 입력하십시오.');
  if (!name) throw new Error('성명을 입력하십시오.');
  if (!input.initialPassword || input.initialPassword.trim().length < 4) {
    throw new Error('초기 비밀번호는 4자 이상이어야 합니다.');
  }

  const existingUsers = await fetchExistingUserIdentifiers();
  const explicitEmpNo = (input.employeeNo || '').trim();
  const employeeNo = explicitEmpNo || nextSequentialEmployeeNo(existingUsers);
  assertUniqueUserIdentifiers(existingUsers, { loginId, employeeNo });

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const status = input.status || 'ACTIVE';
  const id = newId('USR');
  const passwordHash = hashPassword(input.initialPassword.trim());

  const cleanResidentRegNo = input.residentRegNo?.trim() || null;

  const user: FlUser = {
    id,
    tenantId: DEFAULT_TENANT_ID,
    loginId,
    passwordHash,
    name,
    employeeNo,
    departmentId: input.departmentId || null,
    position: input.position?.trim() || '사원',
    duty: input.duty?.trim() || null,
    tierLevel: input.tierLevel,
    maskSalesPrice: Boolean(input.maskSalesPrice),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    birthDate: input.birthDate?.trim() || null,
    joinDate: input.joinDate?.trim() || today,
    retireDate: null,
    address: input.address?.trim() || null,
    emergencyContact: input.emergencyContact?.trim() || null,
    baseSalaryKrw: roundKrw(input.baseSalaryKrw),
    payrollBankName: input.payrollBankName?.trim() || null,
    payrollAccountNo: input.payrollAccountNo?.trim() || null,
    profileImageUrl: input.profileImageUrl?.trim() || null,
    residentRegNo: cleanResidentRegNo,
    annualLeaveGrant: roundLeaveDays(input.annualLeaveGrant, 15),
    annualLeaveUsed: roundLeaveDays(input.annualLeaveUsed, 0),
    pledgeDate: input.pledgeDate?.trim() || null,
    pledgeScanName: input.pledgeScanName?.trim() || null,
    pledgeScanUrl: input.pledgeScanUrl?.trim() || null,
    mustChangePassword: Boolean(input.mustChangePassword),
    payrollAccountHolder: input.payrollAccountHolder?.trim() || null,
    // 통상임금은 자동계산하지 않고 담당자 수동 입력값만 저장한다.
    hourlyWageKrw: roundKrw(input.hourlyWageKrw),
    mealAllowanceKrw: roundKrw(input.mealAllowanceKrw),
    vehicleAllowanceKrw: roundKrw(input.vehicleAllowanceKrw),
    serviceContractKrw: roundKrw(input.serviceContractKrw),
    insNationalPension: input.insNationalPension !== false,
    insHealthInsurance: input.insHealthInsurance !== false,
    insEmploymentInsurance: input.insEmploymentInsurance !== false,
    insIndustrialAccident: input.insIndustrialAccident !== false,
    memo: input.memo?.trim() || null,
    status,
    isActive: status !== 'RETIRED',
  };

  await execDbMutation('임직원 신규 등록', () =>
    flSupabase.from('users').insert({
      ...camelToSnakeRow({
        ...user,
        residentRegNo: cleanResidentRegNo ? encryptSecret(cleanResidentRegNo) : null,
        createdAt: now,
        updatedAt: now,
      }),
    })
  );

  await execDbMutation('입사 이력 기록', () =>
    flSupabase.from('hr_histories').insert(
      camelToSnakeRow({
        id: newId('HRH'),
        tenantId: DEFAULT_TENANT_ID,
        userId: user.id,
        eventType: '입사등록',
        effectiveDate: user.joinDate || today,
        prevSummary: null,
        nextSummary: `${employeeNo} · ${user.name} · ${user.position || '사원'} · ${user.tierLevel}단계`,
        reason: '신규 임직원 입사 등록',
        actorId: input.actor.id,
        actorName: input.actor.name,
        createdAt: now,
      })
    )
  );

  return user;
}

export interface UpdateEmployeeHrInput {
  prevUser: FlUser;
  patch: {
    name?: string;
    employeeNo?: string | null;
    departmentId?: string | null;
    position?: string | null;
    duty?: string | null;
    tierLevel?: TierLevel;
    maskSalesPrice?: boolean;
    phone?: string | null;
    email?: string | null;
    birthDate?: string | null;
    joinDate?: string | null;
    retireDate?: string | null;
    address?: string | null;
    emergencyContact?: string | null;
    baseSalaryKrw?: number;
    payrollBankName?: string | null;
    payrollAccountNo?: string | null;
    profileImageUrl?: string | null;
    residentRegNo?: string | null;
    annualLeaveGrant?: number;
    annualLeaveUsed?: number;
    pledgeDate?: string | null;
    pledgeScanName?: string | null;
    pledgeScanUrl?: string | null;
    mustChangePassword?: boolean;
    payrollAccountHolder?: string | null;
    hourlyWageKrw?: number;
    mealAllowanceKrw?: number;
    vehicleAllowanceKrw?: number;
    serviceContractKrw?: number;
    insNationalPension?: boolean;
    insHealthInsurance?: boolean;
    insEmploymentInsurance?: boolean;
    insIndustrialAccident?: boolean;
    memo?: string | null;
    status?: string;
  };
  deptNameMap?: Record<string, string>;
  effectiveDate?: string;
  reason?: string;
  actor: { id: string; name: string };
}

export async function updateEmployeeHrRecord(input: UpdateEmployeeHrInput): Promise<void> {
  const { prevUser, patch, deptNameMap = {}, actor } = input;
  const now = new Date().toISOString();
  const effectiveDate = (input.effectiveDate || '').trim() || now.slice(0, 10);

  const nextName = patch.name !== undefined ? patch.name.trim() : prevUser.name;
  if (!nextName) throw new Error('성명을 입력하십시오.');

  const nextDeptId =
    patch.departmentId !== undefined ? patch.departmentId || null : prevUser.departmentId || null;
  const nextPosition =
    patch.position !== undefined ? patch.position?.trim() || null : prevUser.position || null;
  const nextDuty = patch.duty !== undefined ? patch.duty?.trim() || null : prevUser.duty || null;
  const nextTier = patch.tierLevel !== undefined ? patch.tierLevel : prevUser.tierLevel;
  const nextStatus = patch.status !== undefined ? patch.status : prevUser.status;
  if (prevUser.id === actor.id && nextStatus !== 'ACTIVE') {
    throw new Error('본인 계정을 직접 퇴사 또는 휴직 처리할 수 없습니다.');
  }
  const nextEmpNo =
    patch.employeeNo !== undefined
      ? patch.employeeNo?.trim() || null
      : prevUser.employeeNo || null;
  if (nextEmpNo && nextEmpNo.toUpperCase() !== (prevUser.employeeNo || '').trim().toUpperCase()) {
    const existingUsers = await fetchExistingUserIdentifiers();
    assertUniqueUserIdentifiers(existingUsers, {
      excludeUserId: prevUser.id,
      employeeNo: nextEmpNo,
    });
  }
  const nextIsActive = nextStatus !== 'RETIRED';
  const nextSalary =
    patch.baseSalaryKrw !== undefined
      ? roundKrw(patch.baseSalaryKrw)
      : roundKrw(prevUser.baseSalaryKrw);
  // 통상임금은 기본급 변경 시에도 절대 재계산하지 않고 기존 또는 수동 입력값만 유지한다.
  const nextHourlyWage =
    patch.hourlyWageKrw !== undefined
      ? roundKrw(patch.hourlyWageKrw)
      : roundKrw(prevUser.hourlyWageKrw);
  const nextMealAllowance =
    patch.mealAllowanceKrw !== undefined
      ? roundKrw(patch.mealAllowanceKrw)
      : roundKrw(prevUser.mealAllowanceKrw);
  const nextVehicleAllowance =
    patch.vehicleAllowanceKrw !== undefined
      ? roundKrw(patch.vehicleAllowanceKrw)
      : roundKrw(prevUser.vehicleAllowanceKrw);
  const nextServiceContract =
    patch.serviceContractKrw !== undefined
      ? roundKrw(patch.serviceContractKrw)
      : roundKrw(prevUser.serviceContractKrw);

  const nextResidentPlain =
    patch.residentRegNo !== undefined
      ? patch.residentRegNo?.trim() || null
      : prevUser.residentRegNo?.trim() || null;

  let nextRetireDate =
    patch.retireDate !== undefined ? patch.retireDate?.trim() || null : prevUser.retireDate || null;
  if (nextStatus === 'RETIRED' && !nextRetireDate) {
    nextRetireDate = effectiveDate;
  } else if (nextStatus === 'ACTIVE') {
    nextRetireDate = null;
  }

  const updateRow = {
    name: nextName,
    employee_no: nextEmpNo,
    department_id: nextDeptId,
    position: nextPosition,
    duty: nextDuty,
    tier_level: nextTier,
    mask_sales_price:
      patch.maskSalesPrice !== undefined ? Boolean(patch.maskSalesPrice) : prevUser.maskSalesPrice,
    phone: patch.phone !== undefined ? patch.phone?.trim() || null : prevUser.phone || null,
    email: patch.email !== undefined ? patch.email?.trim() || null : prevUser.email || null,
    birth_date:
      patch.birthDate !== undefined ? patch.birthDate?.trim() || null : prevUser.birthDate || null,
    join_date:
      patch.joinDate !== undefined ? patch.joinDate?.trim() || null : prevUser.joinDate || null,
    retire_date: nextRetireDate,
    address:
      patch.address !== undefined ? patch.address?.trim() || null : prevUser.address || null,
    emergency_contact:
      patch.emergencyContact !== undefined
        ? patch.emergencyContact?.trim() || null
        : prevUser.emergencyContact || null,
    base_salary_krw: nextSalary,
    payroll_bank_name:
      patch.payrollBankName !== undefined
        ? patch.payrollBankName?.trim() || null
        : prevUser.payrollBankName || null,
    payroll_account_no:
      patch.payrollAccountNo !== undefined
        ? patch.payrollAccountNo?.trim() || null
        : prevUser.payrollAccountNo || null,
    profile_image_url:
      patch.profileImageUrl !== undefined
        ? patch.profileImageUrl?.trim() || null
        : prevUser.profileImageUrl || null,
    resident_reg_no: nextResidentPlain ? encryptSecret(nextResidentPlain) : null,
    annual_leave_grant:
      patch.annualLeaveGrant !== undefined
        ? roundLeaveDays(patch.annualLeaveGrant, 15)
        : roundLeaveDays(prevUser.annualLeaveGrant, 15),
    annual_leave_used:
      patch.annualLeaveUsed !== undefined
        ? roundLeaveDays(patch.annualLeaveUsed, 0)
        : roundLeaveDays(prevUser.annualLeaveUsed, 0),
    pledge_date:
      patch.pledgeDate !== undefined ? patch.pledgeDate?.trim() || null : prevUser.pledgeDate || null,
    pledge_scan_name:
      patch.pledgeScanName !== undefined
        ? patch.pledgeScanName?.trim() || null
        : prevUser.pledgeScanName || null,
    pledge_scan_url:
      patch.pledgeScanUrl !== undefined
        ? patch.pledgeScanUrl?.trim() || null
        : prevUser.pledgeScanUrl || null,
    must_change_password:
      patch.mustChangePassword !== undefined
        ? Boolean(patch.mustChangePassword)
        : Boolean(prevUser.mustChangePassword),
    payroll_account_holder:
      patch.payrollAccountHolder !== undefined
        ? patch.payrollAccountHolder?.trim() || null
        : prevUser.payrollAccountHolder || null,
    hourly_wage_krw: nextHourlyWage,
    meal_allowance_krw: nextMealAllowance,
    vehicle_allowance_krw: nextVehicleAllowance,
    service_contract_krw: nextServiceContract,
    ins_national_pension:
      patch.insNationalPension !== undefined
        ? Boolean(patch.insNationalPension)
        : prevUser.insNationalPension !== false,
    ins_health_insurance:
      patch.insHealthInsurance !== undefined
        ? Boolean(patch.insHealthInsurance)
        : prevUser.insHealthInsurance !== false,
    ins_employment_insurance:
      patch.insEmploymentInsurance !== undefined
        ? Boolean(patch.insEmploymentInsurance)
        : prevUser.insEmploymentInsurance !== false,
    ins_industrial_accident:
      patch.insIndustrialAccident !== undefined
        ? Boolean(patch.insIndustrialAccident)
        : prevUser.insIndustrialAccident !== false,
    memo: patch.memo !== undefined ? patch.memo?.trim() || null : prevUser.memo || null,
    status: nextStatus,
    is_active: nextIsActive,
    updated_at: now,
  };

  await execDbMutation('임직원 인사원장 수정', () =>
    flSupabase.from('users').update(updateRow).eq('id', prevUser.id)
  );

  const historyRows: Record<string, unknown>[] = [];
  const pushHistory = (
    eventType: HrEventType,
    prevSummary: string | null,
    nextSummary: string | null
  ) => {
    historyRows.push(
      camelToSnakeRow({
        id: newId('HRH'),
        tenantId: DEFAULT_TENANT_ID,
        userId: prevUser.id,
        eventType,
        effectiveDate,
        prevSummary,
        nextSummary,
        reason: input.reason?.trim() || '인사원장 변경 반영',
        actorId: actor.id,
        actorName: actor.name,
        createdAt: now,
      })
    );
  };

  if ((prevUser.departmentId || null) !== nextDeptId) {
    const prevDeptLabel =
      (prevUser.departmentId ? deptNameMap[prevUser.departmentId] : '') ||
      prevUser.departmentName ||
      '미배정';
    const nextDeptLabel = (nextDeptId ? deptNameMap[nextDeptId] : '') || '미배정';
    pushHistory('부서이동', prevDeptLabel, nextDeptLabel);
  }
  if ((prevUser.position || null) !== nextPosition) {
    pushHistory('직책변경', prevUser.position || '-', nextPosition || '-');
  }
  if (prevUser.tierLevel !== nextTier) {
    pushHistory('티어변경', `${prevUser.tierLevel}단계`, `${nextTier}단계`);
  }

  const payDiffPrev: string[] = [];
  const payDiffNext: string[] = [];
  const addPayDiff = (label: string, prevVal: number, nextVal: number) => {
    if (prevVal !== nextVal) {
      payDiffPrev.push(`${label} ₩${prevVal.toLocaleString('ko-KR')}`);
      payDiffNext.push(`${label} ₩${nextVal.toLocaleString('ko-KR')}`);
    }
  };
  addPayDiff('기본급', roundKrw(prevUser.baseSalaryKrw), nextSalary);
  addPayDiff('통상임금', roundKrw(prevUser.hourlyWageKrw), nextHourlyWage);
  addPayDiff('식대', roundKrw(prevUser.mealAllowanceKrw), nextMealAllowance);
  addPayDiff('차량보조금', roundKrw(prevUser.vehicleAllowanceKrw), nextVehicleAllowance);
  addPayDiff('용역계약금액', roundKrw(prevUser.serviceContractKrw), nextServiceContract);
  if (payDiffPrev.length > 0) {
    pushHistory('급여변경', payDiffPrev.join(' · '), payDiffNext.join(' · '));
  }

  if (prevUser.status !== nextStatus) {
    const ev: HrEventType =
      nextStatus === 'RETIRED'
        ? '퇴사처리'
        : nextStatus === 'LEAVE_OF_ABSENCE'
          ? '휴직처리'
          : '복직처리';
    pushHistory(ev, prevUser.status, nextStatus);
  }
  if (historyRows.length === 0) {
    pushHistory(
      '인사정보수정',
      `${prevUser.name} · ${prevUser.employeeNo || '-'}`,
      `${nextName} · ${updateRow.employee_no || '-'}`
    );
  }

  await execDbMutation('인사 이력 기록', () =>
    flSupabase.from('hr_histories').insert(historyRows)
  );
}

export async function adminResetUserPassword(params: {
  targetUser: FlUser;
  newPassword: string;
  actor: { id: string; name: string };
  reason?: string;
}): Promise<void> {
  const cleanPw = params.newPassword.trim();
  if (cleanPw.length < 4) {
    throw new Error('초기화할 비밀번호는 4자 이상이어야 합니다.');
  }
  const now = new Date().toISOString();
  const passwordHash = hashPassword(cleanPw);

  await execDbMutation('비밀번호 초기화', () =>
    flSupabase
      .from('users')
      .update({ password_hash: passwordHash, must_change_password: true, updated_at: now })
      .eq('id', params.targetUser.id)
  );

  await execDbMutation('비밀번호 초기화 이력 기록', () =>
    flSupabase.from('hr_histories').insert(
      camelToSnakeRow({
        id: newId('HRH'),
        tenantId: DEFAULT_TENANT_ID,
        userId: params.targetUser.id,
        eventType: '비밀번호초기화',
        effectiveDate: now.slice(0, 10),
        prevSummary: '기존 비밀번호',
        nextSummary: '관리자 임시 비밀번호 발급',
        reason: params.reason?.trim() || '관리자 비밀번호 초기화',
        actorId: params.actor.id,
        actorName: params.actor.name,
        createdAt: now,
      })
    )
  );
}

export interface ManagedExchangeRateInput {
  rateDate: string;
  currencyCode: Exclude<CurrencyCode, 'KRW'>;
  baseRateKrw: number;
  ttSellingRate?: number | null;
  source: string;
}

export async function upsertManagedExchangeRates(params: {
  rows: ManagedExchangeRateInput[];
}): Promise<number> {
  const validRows = params.rows.filter(
    (r) => /^\d{4}-\d{2}-\d{2}$/.test((r.rateDate || '').trim()) && Number(r.baseRateKrw) > 0
  );
  if (validRows.length === 0) {
    throw new Error('적재할 유효한 환율 데이터가 없습니다.');
  }

  const dedupMap = new Map<string, Record<string, unknown>>();
  for (const r of validRows) {
    const rateDate = r.rateDate.trim();
    const factor = r.currencyCode === 'JPY' ? 10000 : 100;
    const baseRateKrw = Math.round(Number(r.baseRateKrw) * factor) / factor;
    const rawTts =
      r.ttSellingRate !== undefined && r.ttSellingRate !== null && Number(r.ttSellingRate) > 0
        ? Number(r.ttSellingRate)
        : baseRateKrw * 1.01;
    const ttSellingRate = Math.round(rawTts * factor) / factor;
    const compactDate = rateDate.replace(/-/g, '');
    const key = `${rateDate}__${r.currencyCode}`;
    dedupMap.set(
      key,
      camelToSnakeRow({
        id: `FX-${compactDate}-${r.currencyCode}`,
        tenantId: DEFAULT_TENANT_ID,
        rateDate,
        currencyCode: r.currencyCode,
        baseRateKrw,
        ttSellingRate,
        source: (r.source || '').trim() || '외환시장 고시환율',
      })
    );
  }

  const snakeRows = Array.from(dedupMap.values());
  await execDbMutation('3개월 관리 환율 적재', () =>
    flSupabase
      .from('exchange_rates')
      .upsert(snakeRows, { onConflict: 'tenant_id,rate_date,currency_code' })
  );
  return snakeRows.length;
}

/**
 * 거래처 마스터 상호명 변경 시 전 메뉴 13개 연관 테이블의 비정규화 거래처 명칭 컬럼을 일괄 동기화한다.
 */
export async function syncPartnerNameAcrossTables(params: {
  partnerId: string;
  newName: string;
  prevName?: string | null;
}): Promise<void> {
  const cleanName = params.newName.trim();
  if (!params.partnerId || !cleanName) return;

  const fkUpdates: Array<[string, string, string, string]> = [
    ['매입 원장 거래처명 동기화', 'purchases', 'supplier_id', 'supplier_name'],
    ['물류 운송 거래처명 동기화', 'logistics_dispatches', 'carrier_partner_id', 'carrier_name'],
    ['매입채무 거래처명 동기화', 'ap_payables', 'partner_id', 'partner_name'],
    ['전대자산 공급처명 동기화', 'inventory_units', 'sublease_supplier_id', 'sublease_supplier_name'],
    ['견적서 거래처명 동기화', 'quotations', 'partner_id', 'partner_name'],
    ['계약서 거래처명 동기화', 'contracts', 'partner_id', 'partner_name'],
    ['출고·회수 거래처명 동기화', 'fulfillments', 'partner_id', 'partner_name'],
    ['사후처리 고객사명 동기화', 'trade_aftercare_cases', 'partner_id', 'partner_name'],
    ['사후처리 공급사명 동기화', 'trade_aftercare_cases', 'supplier_partner_id', 'supplier_name'],
    ['렌탈 정비 거래처명 동기화', 'rental_maintenances', 'partner_id', 'partner_name'],
    ['청구 내역 거래처명 동기화', 'billings', 'partner_id', 'partner_name'],
    ['수납 내역 거래처명 동기화', 'collections', 'partner_id', 'partner_name'],
    ['금융리스 여신사명 동기화', 'finance_leases', 'lender_partner_id', 'lender_name'],
  ];

  for (const [label, table, idCol, nameCol] of fkUpdates) {
    await execDbMutation(label, () =>
      flSupabase.from(table).update({ [nameCol]: cleanName }).eq(idCol, params.partnerId)
    );
  }

  const prevClean = (params.prevName || '').trim();
  if (prevClean && prevClean !== cleanName) {
    await execDbMutation('통장거래 적요 거래처명 동기화', () =>
      flSupabase
        .from('bank_transactions')
        .update({ counterparty_name: cleanName })
        .eq('counterparty_name', prevClean)
    );
  }
}
