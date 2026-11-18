import { DEFAULT_TENANT_ID } from '../core/supabase';
import {
  type BillingLine,
  type FlBilling,
  type FlContract,
  type FlContractLine,
  type FlFinanceLeaseSchedule,
  type FlFulfillment,
  type FlInventoryUnit,
  type FlLogisticsDispatch,
  type FlRentalMaintenance,
  type FlStockMovement,
} from '../types/domain';

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentYm(): string {
  return new Date().toISOString().slice(0, 7);
}
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

export function sortUnitsFifo(units: FlInventoryUnit[]): FlInventoryUnit[] {
  return [...units].sort((a, b) => {
    const d = a.acquisitionDate.localeCompare(b.acquisitionDate);
    return d !== 0 ? d : a.unitCode.localeCompare(b.unitCode);
  });
}

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
