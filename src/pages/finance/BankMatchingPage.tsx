import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { DEFAULT_TENANT_ID, camelToSnakeRow, execDbMutation, flSupabase, newId } from '../../core/supabase';
import { todayIso } from '../../services/domainMath';
import {
  payLeaseInstallment,
  recordBillingCollection,
  settleApPayable,
} from '../../services/domainProcurementLeaseEngine';
import {
  CommaNumberInput,
  DataGrid,
  SectionPanel,
  StatusBadge,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  BANK_MATCH_STATUS_KO_LABELS,
  formatKoStatus,
  koStatusTone,
  type FlBankTransaction,
} from '../../types/domain';
import { buildNonRentalPayables } from './financeHelpers';

export const BankMatchingPage: React.FC = () => {
  const { currentUser, isRentalEnabled, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('bank_matching');
  const today = todayIso();

  const visibleBankTransactions = useMemo(() => {
    if (isRentalEnabled) return datasets.bankTransactions;
    const rentalBillingIds = new Set(
      datasets.billings.filter((b) => b.billingDomain === 'RENTAL').map((b) => b.id)
    );
    const nonRentalPayableIds = new Set(buildNonRentalPayables(datasets).map((a) => a.id));
    const allPayableIds = new Set(datasets.apPayables.map((a) => a.id));
    return datasets.bankTransactions.filter((t) => {
      if (t.matchedType === 'LEASE_INSTALLMENT') return false;
      if (t.matchedType === 'AR_BILLING' && t.matchedId && rentalBillingIds.has(t.matchedId)) {
        return false;
      }
      if (
        t.matchedType === 'AP_PAYABLE' &&
        t.matchedId &&
        allPayableIds.has(t.matchedId) &&
        !nonRentalPayableIds.has(t.matchedId)
      ) {
        return false;
      }
      return true;
    });
  }, [datasets, isRentalEnabled]);

  const [txDate, setTxDate] = useState(today);
  const [txDirection, setTxDirection] = useState<'IN' | 'OUT'>('IN');
  const [bankName, setBankName] = useState('기업은행');
  const [accountNo, setAccountNo] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [amountKrw, setAmountKrw] = useState(0);
  const [memo, setMemo] = useState('');

  const [selectedTxId, setSelectedTxId] = useState<string | null>(
    visibleBankTransactions[0]?.id || null
  );
  const [targetMatchId, setTargetMatchId] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedTx =
    visibleBankTransactions.find((t) => t.id === selectedTxId) ||
    visibleBankTransactions[0] ||
    null;

  const candidateTargets = useMemo(() => {
    if (!selectedTx) return [];
    if (selectedTx.txDirection === 'IN') {
      return datasets.billings
        .filter(
          (b) =>
            b.unpaidBalanceKrw > 0 &&
            b.status !== 'CANCELLED' &&
            (isRentalEnabled || b.billingDomain !== 'RENTAL')
        )
        .map((b) => ({
          id: b.id,
          label: `미수청구 · ${b.billingNo} · ${b.partnerName} · 미수 ${b.unpaidBalanceKrw.toLocaleString('ko-KR')}원`,
        }));
    }
    const payablePool = isRentalEnabled ? datasets.apPayables : buildNonRentalPayables(datasets);
    const apOptions = payablePool
      .filter((a) => a.status !== 'PAID')
      .map((a) => ({
        id: `AP::${a.id}`,
        label: `매입채무 · ${a.payableNo} · ${a.partnerName} · ${(a.totalAmountKrw - a.paidAmountKrw).toLocaleString('ko-KR')}원`,
      }));
    if (!isRentalEnabled) return apOptions;
    const leaseOptions = datasets.financeLeaseSchedules
      .filter((s) => !s.isPaid)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((s) => {
        const lease = datasets.financeLeases.find((l) => l.id === s.leaseId);
        return {
          id: `LEASE::${s.id}`,
          label: `금융리스회차 · ${lease?.lenderName || s.leaseId} · ${s.installmentNo}회차 · ${s.dueDate} · ${s.totalInstallmentKrw.toLocaleString('ko-KR')}원`,
        };
      });
    return [...apOptions, ...leaseOptions];
  }, [datasets, isRentalEnabled, selectedTx]);

  const handleAddTx = async () => {
    if (!counterpartyName.trim() || amountKrw <= 0) {
      notifyToast('거래처 적요와 금액을 입력해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      const id = newId('BTX');
      const rec: FlBankTransaction = {
        id,
        tenantId: DEFAULT_TENANT_ID,
        txDate,
        txDirection,
        bankName,
        accountNo: accountNo.trim() || null,
        counterpartyName: counterpartyName.trim(),
        amountKrw: Math.round(amountKrw),
        matchStatus: 'UNMATCHED',
        memo: memo.trim() || null,
      };
      await execDbMutation('통장 거래내역 등록', () =>
        flSupabase.from('bank_transactions').insert(camelToSnakeRow({ ...rec }))
      );
      setCounterpartyName('');
      setAmountKrw(0);
      setSelectedTxId(id);
      await refreshAll();
      notifyToast('통장 거래내역 등록 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '거래내역 등록 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleMatch = async () => {
    if (!currentUser || !selectedTx || selectedTx.matchStatus !== 'UNMATCHED') return;
    const matchId = targetMatchId || candidateTargets[0]?.id;
    if (!matchId) {
      notifyToast('연결할 청구 또는 채무 대상을 선택해 주세요.', 'error');
      return;
    }
    setBusy(true);
    try {
      if (selectedTx.txDirection === 'IN') {
        const bill = datasets.billings.find((b) => b.id === matchId);
        if (!bill) throw new Error('청구 원장을 찾을 수 없습니다.');
        if (!isRentalEnabled && bill.billingDomain === 'RENTAL') {
          throw new Error('렌탈 영업을 영위하지 않는 테넌트에서는 실행할 수 없는 작업입니다.');
        }
        await recordBillingCollection({
          billing: bill,
          amountKrw: Math.min(bill.unpaidBalanceKrw, selectedTx.amountKrw),
          collectionDate: selectedTx.txDate,
          paymentMethod: '계좌이체',
          bankTxId: selectedTx.id,
          recordedBy: currentUser.name,
        });
      } else if (matchId.startsWith('LEASE::')) {
        if (!isRentalEnabled) {
          throw new Error('렌탈 영업을 영위하지 않는 테넌트에서는 실행할 수 없는 작업입니다.');
        }
        const schId = matchId.slice('LEASE::'.length);
        const sch = datasets.financeLeaseSchedules.find((s) => s.id === schId);
        const lease = sch ? datasets.financeLeases.find((l) => l.id === sch.leaseId) : undefined;
        if (!sch || !lease) throw new Error('금융리스 회차를 찾을 수 없습니다.');
        await payLeaseInstallment({
          lease,
          schedule: sch,
          paidDate: selectedTx.txDate,
          bankTxId: selectedTx.id,
        });
        await execDbMutation('리스출금 통장대사 연결', () =>
          flSupabase
            .from('bank_transactions')
            .update(
              camelToSnakeRow({
                matchedType: 'LEASE_INSTALLMENT',
                matchedId: sch.id,
                matchStatus: 'MATCHED',
                updatedAt: new Date().toISOString(),
              })
            )
            .eq('id', selectedTx.id)
        );
      } else {
        const apId = matchId.startsWith('AP::') ? matchId.slice('AP::'.length) : matchId;
        const ap = datasets.apPayables.find((a) => a.id === apId);
        if (!ap) throw new Error('매입채무를 찾을 수 없습니다.');
        await settleApPayable({
          payable: ap,
          settledFxRate: ap.bookedFxRate || 1,
          settleForeignOrKrwAmount: ap.currencyCode === 'KRW' ? selectedTx.amountKrw : undefined,
          paidDate: selectedTx.txDate,
        });
        await execDbMutation('출금 통장대사 연결', () =>
          flSupabase
            .from('bank_transactions')
            .update(
              camelToSnakeRow({
                matchedType: 'AP_PAYABLE',
                matchedId: ap.id,
                matchStatus: 'MATCHED',
                updatedAt: new Date().toISOString(),
              })
            )
            .eq('id', selectedTx.id)
        );
      }
      await refreshAll();
      notifyToast('통장 대사 연결 완료', 'success');
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : '통장 대사 실패', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      {canEdit && (
        <SectionPanel
          title="통장 입출금 거래 등록"
          manualId="btx-add"
          rightSlot={
            <button
              type="button"
              disabled={busy}
              onClick={handleAddTx}
              style={actionBtnStyle('primary', true)}
            >
              거래 등록
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 'var(--space-field-grid-gap)' }}>
            <VerticalField label="거래일자" required>
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="입출금" required>
              <select
                value={txDirection}
                onChange={(e) => setTxDirection(e.target.value as 'IN' | 'OUT')}
                style={controlInputStyle}
              >
                <option value="IN">입금</option>
                <option value="OUT">출금</option>
              </select>
            </VerticalField>
            <VerticalField label="은행">
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="계좌번호">
              <input
                type="text"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="거래처 적요" required>
              <input
                type="text"
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="거래금액" required>
              <CommaNumberInput min={0} value={amountKrw} onChange={setAmountKrw} />
            </VerticalField>
            <VerticalField label="비고">
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
          </div>
        </SectionPanel>
      )}

      <SectionPanel title="통장 입출금 1대1 대사 연결" manualId="btx-match">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <DataGrid
            columns={[
              { key: 'txDate', header: '거래일', width: 105, render: (t) => t.txDate },
              {
                key: 'dir',
                header: '구분',
                width: 75,
                align: 'center',
                render: (t) => (
                  <StatusBadge label={t.txDirection === 'IN' ? '입금' : '출금'} tone={t.txDirection === 'IN' ? 'success' : 'warning'} />
                ),
              },
              { key: 'bankName', header: '은행', width: 100, render: (t) => t.bankName },
              { key: 'counterpartyName', header: '거래처 적요', render: (t) => t.counterpartyName },
              { key: 'amountKrw', header: '금액', width: 125, align: 'right', render: (t) => formatMoney(t.amountKrw) },
              {
                key: 'status',
                header: '대사상태',
                width: 95,
                align: 'center',
                render: (t) => (
                  <StatusBadge
                    label={BANK_MATCH_STATUS_KO_LABELS[t.matchStatus] || formatKoStatus(t.matchStatus)}
                    tone={koStatusTone(t.matchStatus)}
                  />
                ),
              },
            ]}
            rows={[...visibleBankTransactions].sort((a, b) => b.txDate.localeCompare(a.txDate))}
            rowKey={(t) => t.id}
            selectedRowId={selectedTx?.id || null}
            onRowClick={(t) => {
              setSelectedTxId(t.id);
              setTargetMatchId('');
            }}
            maxHeight="clamp(280px, calc(100vh - 380px), 680px)"
          />

          {canEdit && selectedTx && selectedTx.matchStatus === 'UNMATCHED' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-field-grid-gap)', alignItems: 'flex-end' }}>
              <VerticalField label="매칭할 미수청구 · 매입채무" required minWidth={320} flex={1}>
                <select
                  value={targetMatchId || candidateTargets[0]?.id || ''}
                  onChange={(e) => setTargetMatchId(e.target.value)}
                  style={controlInputStyle}
                >
                  {candidateTargets.length === 0 ? (
                    <option value="">매칭 가능한 미정산 대상 없음</option>
                  ) : (
                    candidateTargets.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))
                  )}
                </select>
              </VerticalField>
              <button
                type="button"
                disabled={busy || candidateTargets.length === 0}
                onClick={handleMatch}
                style={actionBtnStyle('primary')}
              >
                대사 연결 확정
              </button>
            </div>
          )}
        </div>
      </SectionPanel>
    </div>
  );
};
