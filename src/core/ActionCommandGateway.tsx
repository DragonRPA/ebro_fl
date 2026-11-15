import React, { useState } from 'react';
import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  execDbMutation,
  flSupabase,
  newId,
} from './supabase';
import { useAppShell, type FlDatasets } from './AppShellContext';
import {
  TIER_LABELS,
  type ApprovalActionCode,
  type FlApprovalPolicy,
  type FlApprovalRequest,
  type FlUser,
  type TierLevel,
} from '../types/domain';
import {
  completeFulfillment,
  confirmPurchaseInbound,
  createFinanceLeaseWithAsset,
  executeAccountTransfer,
  executeRentalExchange,
  payLeaseInstallment,
  recordRentalMaintenance,
  recordTradeAftercare,
  settleApPayable,
  calculateRentalProRataForMonth,
} from '../services/domainEngine';

export function useActionGateway() {
  const { currentUser, datasets, refreshAll, notifyToast } = useAppShell();

  const getPolicy = (actionCode: ApprovalActionCode): FlApprovalPolicy | undefined =>
    datasets.approvalPolicies.find((p) => p.actionCode === actionCode);

  const requiresApprovalForUser = (actionCode: ApprovalActionCode, user: FlUser | null): boolean => {
    if (!user) return true;
    const pol = getPolicy(actionCode);
    if (!pol || !pol.requiresApproval) return false;
    return user.tierLevel < pol.requiredTier;
  };

  const submitApprovalRequest = async (params: {
    actionCode: ApprovalActionCode;
    targetTable: string;
    targetId: string;
    title: string;
    payload: Record<string, unknown>;
  }): Promise<FlApprovalRequest> => {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    const pol = getPolicy(params.actionCode);
    const requiredTier = (pol?.requiredTier || 3) as TierLevel;

    const req: FlApprovalRequest = {
      id: newId('APR'),
      tenantId: DEFAULT_TENANT_ID,
      actionCode: params.actionCode,
      targetTable: params.targetTable,
      targetId: params.targetId,
      title: params.title,
      payload: params.payload,
      requiredTier,
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      requesterTier: currentUser.tierLevel,
      approverId: null,
      approverName: null,
      approverTier: null,
      status: 'PENDING',
      rejectReason: null,
      requestedAt: new Date().toISOString(),
      decidedAt: null,
      executedAt: null,
    };

    await execDbMutation('결재 상신 등록', () =>
      flSupabase.from('approval_requests').insert(camelToSnakeRow({ ...req }))
    );
    await refreshAll();
    notifyToast(`${TIER_LABELS[requiredTier]} 결재 상신 완료`, 'info');
    return req;
  };

  const approveRequest = async (req: FlApprovalRequest): Promise<void> => {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    if (req.status !== 'PENDING') {
      throw new Error('대기중인 결재 요청만 승인할 수 있습니다.');
    }
    if (currentUser.tierLevel < req.requiredTier) {
      throw new Error(
        `승인 권한 티어 부족: 필요 티어 ${TIER_LABELS[req.requiredTier]}, 현재 ${TIER_LABELS[currentUser.tierLevel]}`
      );
    }

    await executeApprovedPayload(req, currentUser, datasets);

    const nowIso = new Date().toISOString();
    await execDbMutation('결재 승인 확정', () =>
      flSupabase
        .from('approval_requests')
        .update(
          camelToSnakeRow({
            status: 'APPROVED',
            approverId: currentUser.id,
            approverName: currentUser.name,
            approverTier: currentUser.tierLevel,
            decidedAt: nowIso,
            executedAt: nowIso,
          })
        )
        .eq('id', req.id)
    );
    await refreshAll();
    notifyToast(`${req.title} 승인 및 실행 완료`, 'success');
  };

  const rejectRequest = async (req: FlApprovalRequest, reason: string): Promise<void> => {
    if (!currentUser) throw new Error('로그인이 필요합니다.');
    if (currentUser.tierLevel < req.requiredTier) {
      throw new Error(`반려 권한 부족: 필요 티어 ${TIER_LABELS[req.requiredTier]}`);
    }
    const cleanReason = reason.trim();
    if (!cleanReason) {
      throw new Error('반려 사유를 입력해 주세요.');
    }
    await execDbMutation('결재 반려 처리', () =>
      flSupabase
        .from('approval_requests')
        .update(
          camelToSnakeRow({
            status: 'REJECTED',
            approverId: currentUser.id,
            approverName: currentUser.name,
            approverTier: currentUser.tierLevel,
            rejectReason: cleanReason,
            decidedAt: new Date().toISOString(),
          })
        )
        .eq('id', req.id)
    );
    await refreshAll();
    notifyToast('결재 반려 처리 완료', 'info');
  };

  return {
    getPolicy,
    requiresApprovalForUser,
    submitApprovalRequest,
    approveRequest,
    rejectRequest,
  };
}

export async function executeApprovedPayload(
  req: FlApprovalRequest,
  approver: FlUser,
  datasets: FlDatasets
): Promise<void> {
  const p = req.payload || {};

  switch (req.actionCode as ApprovalActionCode) {
    case 'PURCHASE_CONFIRM': {
      const supplier = datasets.partners.find((x) => x.id === p.supplierId);
      if (!supplier) throw new Error('매입 거래처를 찾을 수 없습니다.');
      await confirmPurchaseInbound({
        purchaseType: (p.purchaseType as 'IMPORT' | 'DOMESTIC') || 'IMPORT',
        supplier,
        targetDomain: (p.targetDomain as 'TRADE' | 'RENTAL') || 'TRADE',
        blNo: p.blNo as string | undefined,
        lcNo: p.lcNo as string | undefined,
        currencyCode: (p.currencyCode as 'KRW' | 'USD' | 'CNY' | 'EUR' | 'JPY') || 'KRW',
        fxRate: Number(p.fxRate || 1),
        fxDate: p.fxDate as string | undefined,
        customsDutyKrw: Number(p.customsDutyKrw || 0),
        oceanFreightKrw: Number(p.oceanFreightKrw || 0),
        clearanceFeeKrw: Number(p.clearanceFeeKrw || 0),
        inlandFreightKrw: Number(p.inlandFreightKrw || 0),
        effectiveDate: String(p.effectiveDate),
        actorId: approver.id,
        actorName: approver.name,
        memo: p.memo as string | undefined,
        lines: (p.lines as never[]) || [],
      });
      return;
    }

    case 'LEASE_CREATE': {
      const lender = datasets.partners.find((x) => x.id === p.lenderPartnerId);
      if (!lender) throw new Error('금융사를 찾을 수 없습니다.');
      await createFinanceLeaseWithAsset({
        lender,
        itemId: String(p.itemId),
        sku: String(p.sku),
        itemName: String(p.itemName),
        serialNo: String(p.serialNo),
        principalAmountKrw: Number(p.principalAmountKrw),
        annualInterestRate: Number(p.annualInterestRate),
        termMonths: Number(p.termMonths),
        repaymentMethod: p.repaymentMethod === '원금균등' ? '원금균등' : '원리금균등',
        startDate: String(p.startDate),
        paymentDay: Number(p.paymentDay || 25),
        monthlyRentalFeeKrw: Number(p.monthlyRentalFeeKrw || 0),
        dailyRentalFeeKrw: Number(p.dailyRentalFeeKrw || 0),
        actorName: approver.name,
        memo: p.memo as string | undefined,
      });
      return;
    }

    case 'ACCOUNT_TRANSFER': {
      const unit = datasets.inventoryUnits.find((u) => u.id === p.unitId);
      if (!unit) throw new Error('계정대체 대상 자산을 찾을 수 없습니다.');
      await executeAccountTransfer({
        unit,
        toDomain: p.toDomain === '렌탈자산' ? '렌탈자산' : '유통재고',
        effectiveDate: String(p.effectiveDate),
        actorId: approver.id,
        actorName: approver.name,
        memo: p.memo as string | undefined,
      });
      return;
    }

    case 'TRADE_CONTRACT_CONFIRM':
    case 'RENTAL_CONTRACT_CONFIRM': {
      await execDbMutation('계약 확정 반영', () =>
        flSupabase
          .from('contracts')
          .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
          .eq('id', req.targetId)
      );
      return;
    }

    case 'FULFILLMENT_COMPLETE': {
      const ful = datasets.fulfillments.find((f) => f.id === (p.fulfillmentId || req.targetId));
      const line = ful ? datasets.contractLines.find((l) => l.id === ful.contractLineId) : undefined;
      const unit = datasets.inventoryUnits.find((u) => u.id === p.unitId);
      if (!ful || !line || !unit) throw new Error('출고·회수 실행 대상을 찾을 수 없습니다.');
      await completeFulfillment({
        fulfillment: ful,
        contractLine: line,
        unit,
        effectiveDate: String(p.effectiveDate),
        actorId: approver.id,
        actorName: approver.name,
        returnToRepair: Boolean(p.returnToRepair),
        memo: p.memo as string | undefined,
      });
      return;
    }

    case 'EXCHANGE_EXECUTE': {
      const contract = datasets.contracts.find((c) => c.id === p.contractId);
      const oldLine = datasets.contractLines.find((l) => l.id === p.oldLineId);
      const oldUnit = datasets.inventoryUnits.find((u) => u.id === p.oldUnitId);
      const newUnit = datasets.inventoryUnits.find((u) => u.id === p.newUnitId);
      if (!contract || !oldLine || !oldUnit || !newUnit) throw new Error('교환 대상 정보를 찾을 수 없습니다.');
      await executeRentalExchange({
        contract,
        oldLine,
        oldUnit,
        newUnit,
        exchangeDate: String(p.exchangeDate),
        actorId: approver.id,
        actorName: approver.name,
        oldUnitToRepair: Boolean(p.oldUnitToRepair),
        memo: p.memo as string | undefined,
      });
      return;
    }

    case 'TRADE_REFUND': {
      const contract = datasets.contracts.find((c) => c.id === p.contractId);
      const unit = datasets.inventoryUnits.find((u) => u.id === p.unitId);
      const repUnit = p.replacementUnitId
        ? datasets.inventoryUnits.find((u) => u.id === p.replacementUnitId)
        : null;
      const supplier = p.supplierPartnerId
        ? datasets.partners.find((pt) => pt.id === p.supplierPartnerId)
        : null;
      if (!contract || !unit) throw new Error('반품 처리 대상을 찾을 수 없습니다.');
      await recordTradeAftercare({
        contract,
        unit,
        caseType: (p.caseType as '공급사 정비중개' | '반품환불' | '반품교환') || '반품환불',
        supplier,
        refundSupplyKrw: Number(p.refundSupplyKrw || 0),
        replacementUnit: repUnit,
        effectiveDate: String(p.effectiveDate),
        actorId: approver.id,
        actorName: approver.name,
        memo: p.memo as string | undefined,
      });
      return;
    }

    case 'BILLING_CREATE': {
      const contract = datasets.contracts.find((c) => c.id === p.contractId);
      const ym = String(p.billingYm);
      if (!contract) throw new Error('청구 대상 계약을 찾을 수 없습니다.');
      const lines =
        contract.contractDomain === 'RENTAL'
          ? calculateRentalProRataForMonth({ contract, lines: datasets.contractLines, ym })
          : datasets.contractLines
              .filter((l) => l.contractId === contract.id)
              .map((l) => ({
                description: `${l.itemName} 공급대금`,
                supplyAmountKrw: l.supplyAmountKrw,
                vatAmountKrw: l.vatAmountKrw,
                unitId: l.assignedUnitId || undefined,
                contractLineId: l.id,
              }));
      const supply = lines.reduce((s, r) => s + r.supplyAmountKrw, 0);
      const vat = lines.reduce((s, r) => s + r.vatAmountKrw, 0);
      const total = supply + vat;
      if (total <= 0) throw new Error('청구 가능한 금액이 없습니다.');
      const bId = newId('BIL');
      await execDbMutation('청구 발행 저장', () =>
        flSupabase.from('billings').insert(
          camelToSnakeRow({
            id: bId,
            tenantId: DEFAULT_TENANT_ID,
            billingNo: bId,
            billingYm: ym,
            billingDomain: contract.contractDomain,
            contractId: contract.id,
            partnerId: contract.partnerId,
            partnerName: contract.partnerName,
            billingDate: String(p.billingDate),
            dueDate: String(p.dueDate),
            supplyAmountKrw: supply,
            vatAmountKrw: vat,
            totalAmountKrw: total,
            paidAmountKrw: 0,
            unpaidBalanceKrw: total,
            taxInvoiceIssued: false,
            lines,
            status: 'UNPAID',
          })
        )
      );
      return;
    }

    case 'AP_SETTLEMENT_PAY': {
      if (p.kind === 'LEASE_SCHEDULE') {
        const lease = datasets.financeLeases.find((l) => l.id === p.leaseId);
        const sch = datasets.financeLeaseSchedules.find((s) => s.id === p.scheduleId);
        if (!lease || !sch) throw new Error('리스 상환 회차를 찾을 수 없습니다.');
        await payLeaseInstallment({
          lease,
          schedule: sch,
          paidDate: String(p.paidDate),
          bankTxId: (p.bankTxId as string) || null,
        });
      } else {
        const ap = datasets.apPayables.find((a) => a.id === (p.payableId || req.targetId));
        if (!ap) throw new Error('지급 대상 매입채무를 찾을 수 없습니다.');
        await settleApPayable({
          payable: ap,
          settledFxRate: Number(p.settledFxRate || ap.bookedFxRate || 1),
          settleForeignOrKrwAmount: p.amount ? Number(p.amount) : undefined,
          paidDate: String(p.paidDate),
        });
      }
      return;
    }

    case 'ASSET_DISPOSAL': {
      await execDbMutation('자산 폐기 확정', () =>
        flSupabase
          .from('inventory_units')
          .update({ status: '폐기', updated_at: new Date().toISOString() })
          .eq('id', String(p.unitId || req.targetId))
      );
      return;
    }

    case 'POLICY_CONFIG_SAVE': {
      const requiredTier = Number(p.requiredTier || 3);
      await execDbMutation('결재 기준 저장', () =>
        flSupabase
          .from('approval_policies')
          .update({
            required_tier: requiredTier,
            requires_approval: Boolean(p.requiresApproval),
            updated_at: new Date().toISOString(),
          })
          .eq('id', String(p.policyId || req.targetId))
      );
      return;
    }

    default: {
      if (req.payload.maintPayload) {
        const mp = req.payload.maintPayload as Record<string, unknown>;
        const unit = datasets.inventoryUnits.find((u) => u.id === mp.unitId);
        if (unit) {
          await recordRentalMaintenance({
            maintType: (mp.maintType as '주기장정비' | '현장정비' | '순회정비') || '순회정비',
            unit,
            mechanicId: approver.id,
            mechanicName: approver.name,
            operatingHours: Number(mp.operatingHours || 0),
            partsUsed: [],
            laborCostKrw: Number(mp.laborCostKrw || 0),
            externalCostKrw: Number(mp.externalCostKrw || 0),
            isCustomerBillable: Boolean(mp.isCustomerBillable),
            customerChargeKrw: Number(mp.customerChargeKrw || 0),
            effectiveDate: String(mp.effectiveDate),
          });
        }
      }
    }
  }
}

export interface CommitActionButtonProps {
  actionCode: ApprovalActionCode;
  targetTable: string;
  targetId: string;
  title: string;
  buildPayload: () => Record<string, unknown> | null;
  onExecuteDirect: () => Promise<void>;
  label?: string;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'secondary';
  manualId?: string;
}

export const CommitActionButton: React.FC<CommitActionButtonProps> = ({
  actionCode,
  targetTable,
  targetId,
  title,
  buildPayload,
  onExecuteDirect,
  label = '저장',
  disabled = false,
  variant = 'primary',
  manualId,
}) => {
  const { currentUser, notifyToast } = useAppShell();
  const { requiresApprovalForUser, getPolicy, submitApprovalRequest } = useActionGateway();
  const [busy, setBusy] = useState(false);

  const needsApproval = requiresApprovalForUser(actionCode, currentUser);
  const pol = getPolicy(actionCode);
  const btnText = needsApproval ? '상신' : label;

  const bgColor =
    variant === 'danger'
      ? 'var(--danger)'
      : variant === 'secondary'
        ? 'var(--bg-card)'
        : needsApproval
          ? 'var(--warning)'
          : 'var(--primary)';
  const fgColor = variant === 'secondary' ? 'var(--text-main)' : '#ffffff';

  const handleClick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      if (needsApproval) {
        const payload = buildPayload();
        if (!payload) {
          setBusy(false);
          return;
        }
        await submitApprovalRequest({
          actionCode,
          targetTable,
          targetId,
          title,
          payload,
        });
      } else {
        await onExecuteDirect();
      }
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      data-manual-id={manualId}
      disabled={busy || disabled}
      onClick={handleClick}
      title={needsApproval && pol ? `${TIER_LABELS[pol.requiredTier]} 승인 상신` : label}
      style={{
        padding: '7px 14px',
        borderRadius: '6px',
        border: variant === 'secondary' ? '1px solid var(--border-color)' : '1px solid transparent',
        backgroundColor: bgColor,
        color: fgColor,
        fontWeight: 700,
        fontSize: '12.5px',
        cursor: busy || disabled ? 'not-allowed' : 'pointer',
        opacity: busy || disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {busy ? '처리중' : btnText}
    </button>
  );
};
