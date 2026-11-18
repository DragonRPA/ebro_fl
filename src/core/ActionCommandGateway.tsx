import React, { useState } from 'react';
import { useAppShell } from './AppShellContext';
import { useActionGateway } from './actionGatewayEngine';
import {
  RENTAL_ONLY_ACTION_CODES,
  TIER_LABELS,
  type ApprovalActionCode,
} from '../types/domain';

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

export const CommitActionButton: React.FC<CommitActionButtonProps> = React.memo(({
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
  const { currentUser, isRentalEnabled, notifyToast } = useAppShell();
  const { requiresApprovalForUser, getPolicy, submitApprovalRequest } = useActionGateway();
  const [busy, setBusy] = useState(false);

  if (!isRentalEnabled && RENTAL_ONLY_ACTION_CODES.includes(actionCode)) {
    return null;
  }

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
});
CommitActionButton.displayName = 'CommitActionButton';
