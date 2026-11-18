import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
  selectAllFlRows,
  snakeToCamelRow,
} from '../core/supabase';
import { computeUnitDepreciationAsOf } from './domainMath';
import {
  computeDueDateFromCycle,
  type CurrencyCode,
  type FlApPayable,
  type FlAssetEvent,
  type FlInventoryUnit,
  type FlPartner,
  type FlPurchase,
  type FlPurchaseLine,
  type FlStockMovement,
  type ItemCategory,
  type ManagementType,
} from '../types/domain';
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

export async function allocateNextContractNo(
  domain: 'TRADE' | 'RENTAL',
  contractDate: string
): Promise<string> {
  const cleanDate = (contractDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const yymm = `${cleanDate.slice(2, 4)}${cleanDate.slice(5, 7)}`;
  const prefix = `${domain === 'RENTAL' ? 'R' : 'T'}-${yymm}-`;
  const res = await flSupabase
    .from('contracts')
    .select('contract_no')
    .like('contract_no', `${prefix}%`);
  let maxSeq = 0;
  if (!res.error && Array.isArray(res.data)) {
    for (const row of res.data as { contract_no?: string }[]) {
      const code = row.contract_no || '';
      if (!code.startsWith(prefix)) continue;
      const num = Number(code.slice(prefix.length));
      if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
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
