import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
} from '../core/supabase';
import { addDaysIso, buildFinanceLeaseSchedule } from './domainMath';
import { allocateSequentialUnitCodes } from './domainProcurementInboundEngine';
import {
  type FlApPayable,
  type FlBilling,
  type FlCollection,
  type FlFinanceLease,
  type FlFinanceLeaseSchedule,
  type FlInventoryUnit,
  type FlLogisticsDispatch,
  type FlPartner,
} from '../types/domain';

export * from './domainProcurementInboundEngine';

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
