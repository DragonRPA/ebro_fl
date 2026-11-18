import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
} from '../core/supabase';
import { addDaysIso } from './domainMath';
import {
  type FlAssetEvent,
  type FlContract,
  type FlContractLine,
  type FlFulfillment,
  type FlInventoryUnit,
  type FlStockMovement,
} from '../types/domain';
export async function allocateNextFulfillmentNos(
  refDate: string,
  count: number
): Promise<string[]> {
  const cleanDate = (refDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const yymm = `${cleanDate.slice(2, 4)}${cleanDate.slice(5, 7)}`;
  const prefix = `F-${yymm}-`;
  const res = await flSupabase
    .from('fulfillments')
    .select('fulfillment_no')
    .like('fulfillment_no', `${prefix}%`);
  let maxSeq = 0;
  if (!res.error && Array.isArray(res.data)) {
    for (const row of res.data as { fulfillment_no?: string }[]) {
      const code = row.fulfillment_no || '';
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
  allowTradeOriginUnit?: boolean;
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
      const canNormalizeTradeOrigin =
        Boolean(params.allowTradeOriginUnit) &&
        unit.ownershipDomain === '렌탈자산' &&
        unit.acquisitionType !== 'FINANCE_LEASE' &&
        unit.acquisitionType !== 'SUBLEASE';
      if (!canNormalizeTradeOrigin) {
        throw new Error('유통출고는 유통재고 소유 항목만 처리할 수 있습니다.');
      }
      updatedUnit.ownershipDomain = '유통재고';
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
      const wMonths = Math.max(0, Number(contractLine.warrantyMonths ?? unit.warrantyMonths ?? 12));
      if (wMonths > 0 && !updatedUnit.warrantyStartDate) {
        const startDt = new Date(`${effectiveDate.slice(0, 10)}T00:00:00Z`);
        const endDt = new Date(startDt);
        endDt.setUTCMonth(endDt.getUTCMonth() + wMonths);
        updatedUnit.warrantyMonths = wMonths;
        updatedUnit.warrantyStartDate = effectiveDate.slice(0, 10);
        updatedUnit.warrantyEndDate = endDt.toISOString().slice(0, 10);
      }
      if (!updatedUnit.warrantyNote && contractLine.warrantyNote) {
        updatedUnit.warrantyNote = contractLine.warrantyNote;
      }
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
      ownershipDomain: updatedUnit.ownershipDomain,
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

  const [exFulfillmentNo] = await allocateNextFulfillmentNos(exchangeDate, 1);
  const fulfillment: FlFulfillment = {
    id: newId('FUL'),
    tenantId: DEFAULT_TENANT_ID,
    fulfillmentNo: exFulfillmentNo,
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

export * from './domainAftercareMaintEngine';

