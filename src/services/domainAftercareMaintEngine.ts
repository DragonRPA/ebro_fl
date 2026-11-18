import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
} from '../core/supabase';
import { addDaysIso } from './domainMath';
import {
  type FlContract,
  type FlInventoryUnit,
  type FlPartner,
  type FlRentalMaintenance,
  type FlTradeAftercareCase,
} from '../types/domain';

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
  warrantyApplied?: boolean;
  effectiveDate: string;
  actorId: string;
  actorName: string;
  memo?: string;
}): Promise<FlTradeAftercareCase> {
  const { contract, unit, caseType, supplier, refundSupplyKrw, replacementUnit, warrantyApplied, effectiveDate, actorId, actorName, memo } = params;
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
    serialNo: unit.serialNo || unit.lotNo || null,
    caseType,
    warrantyApplied: Boolean(warrantyApplied),
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
