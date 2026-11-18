import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { todayIso } from '../../services/domainMath';
import { payLeaseInstallment, settleApPayable } from '../../services/domainProcurementLeaseEngine';
import {
  CommaNumberInput,
  DataGrid,
  SectionPanel,
  SegmentedTabs,
  StatusBadge,
  VerticalField,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  AP_STATUS_KO_LABELS,
  formatKoCurrency,
  formatKoPayableType,
  formatKoStatus,
  koStatusTone,
} from '../../types/domain';
import { buildNonRentalPayables } from './financeHelpers';

export const ApSettlementsPage: React.FC = () => {
  const { isRentalEnabled, datasets, formatMoney, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('ap_settlements');
  const today = todayIso();

  const visiblePayables = useMemo(
    () => (isRentalEnabled ? datasets.apPayables : buildNonRentalPayables(datasets)),
    [datasets, isRentalEnabled]
  );

  const [tab, setTab] = useState<'AP' | 'LEASE'>('AP');
  const effectiveTab: 'AP' | 'LEASE' = isRentalEnabled ? tab : 'AP';
  const [selectedApId, setSelectedApId] = useState<string | null>(visiblePayables[0]?.id || null);
  const [settledFxRate, setSettledFxRate] = useState<number>(1380);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [paidDate, setPaidDate] = useState(today);

  const [selectedSchId, setSelectedSchId] = useState<string | null>(null);

  const selectedAp =
    visiblePayables.find((a) => a.id === selectedApId) || visiblePayables[0] || null;

  const unpaidSchedules = useMemo(
    () =>
      datasets.financeLeaseSchedules
        .slice()
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [datasets.financeLeaseSchedules]
  );

  const selectedSch =
    unpaidSchedules.find((s) => s.id === selectedSchId) ||
    unpaidSchedules.find((s) => !s.isPaid) ||
    null;

  const fxPreview = useMemo(() => {
    if (!selectedAp || selectedAp.currencyCode === 'KRW') return 0;
    const remKrw = selectedAp.totalAmountKrw - selectedAp.paidAmountKrw;
    const fxQty =
      settleAmount > 0
        ? settleAmount
        : Math.round((remKrw / Math.max(1, selectedAp.bookedFxRate)) * 100) / 100;
    const settledKrw = Math.round(fxQty * Number(settledFxRate || selectedAp.bookedFxRate));
    const bookedPortion = Math.round(fxQty * selectedAp.bookedFxRate);
    return settledKrw - bookedPortion;
  }, [selectedAp, settleAmount, settledFxRate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel
        title={isRentalEnabled ? '매입채무 · 금융리스 원리금 정산' : '매입채무 · 물류운송비 정산'}
        manualId="ap-tabs"
        rightSlot={
          isRentalEnabled ? (
            <SegmentedTabs
              tabs={[
                { id: 'AP', label: '매입 · 물류 · 외주 채무', count: visiblePayables.length },
                {
                  id: 'LEASE',
                  label: '금융리스 상환회차',
                  count: datasets.financeLeaseSchedules.filter((s) => !s.isPaid).length,
                },
              ]}
              activeId={effectiveTab}
              onChange={(id) => setTab(id as typeof tab)}
            />
          ) : undefined
        }
      >
        {effectiveTab === 'AP' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <DataGrid
              columns={[
                { key: 'no', header: '채무번호', width: 140, render: (a) => <span style={{ fontWeight: 700 }}>{a.payableNo}</span> },
                { key: 'type', header: '구분', width: 115, render: (a) => <StatusBadge label={formatKoPayableType(a.payableType)} tone="info" /> },
                { key: 'partnerName', header: '지급처', render: (a) => a.partnerName },
                { key: 'cur', header: '통화', width: 90, align: 'center', render: (a) => formatKoCurrency(a.currencyCode) },
                { key: 'fx', header: '장부환율', width: 95, align: 'right', render: (a) => a.bookedFxRate },
                { key: 'tot', header: '원화채무액', width: 125, align: 'right', render: (a) => formatMoney(a.totalAmountKrw) },
                { key: 'paid', header: '기지급액', width: 115, align: 'right', render: (a) => formatMoney(a.paidAmountKrw) },
                { key: 'fxGl', header: '외환차손익', width: 110, align: 'right', render: (a) => formatMoney(a.fxGainLossKrw) },
                {
                  key: 'st',
                  header: '상태',
                  width: 90,
                  align: 'center',
                  render: (a) => (
                    <StatusBadge
                      label={AP_STATUS_KO_LABELS[a.status] || formatKoStatus(a.status)}
                      tone={koStatusTone(a.status)}
                    />
                  ),
                },
              ]}
              rows={visiblePayables}
              rowKey={(a) => a.id}
              selectedRowId={selectedAp?.id || null}
              onRowClick={(a) => {
                setSelectedApId(a.id);
                setSettledFxRate(a.bookedFxRate || 1);
                setSettleAmount(0);
              }}
              maxHeight="clamp(280px, calc(100vh - 380px), 680px)"
            />

            {canEdit && selectedAp && selectedAp.status !== 'PAID' && (
              <div
                data-manual-id="ap-pay"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-field-grid-gap)',
                  alignItems: 'flex-end',
                  padding: 'var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-header)',
                }}
              >
                <VerticalField label="지급일자" required width={145}>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                {selectedAp.currencyCode !== 'KRW' && (
                  <VerticalField label="결제 적용환율" required width={140}>
                    <input
                      type="number"
                      step="0.01"
                      value={settledFxRate}
                      onChange={(e) => setSettledFxRate(Number(e.target.value))}
                      style={controlInputStyle}
                    />
                  </VerticalField>
                )}
                <VerticalField
                  label={selectedAp.currencyCode === 'KRW' ? '지급 원화금액' : `지급 외화금액 · ${formatKoCurrency(selectedAp.currencyCode)}`}
                  width={165}
                >
                  <CommaNumberInput
                    allowDecimal={selectedAp.currencyCode !== 'KRW'}
                    maxDecimals={2}
                    min={0}
                    value={settleAmount}
                    onChange={setSettleAmount}
                    placeholder="0 입력 시 잔액 전액 지급"
                  />
                </VerticalField>
                {selectedAp.currencyCode !== 'KRW' && (
                  <StatusBadge
                    label={
                      fxPreview > 0
                        ? `예상 외환차손 ${fxPreview.toLocaleString('ko-KR')}원`
                        : fxPreview < 0
                          ? `예상 외환차익 ${Math.abs(fxPreview).toLocaleString('ko-KR')}원`
                          : '환차손익 0원'
                    }
                    tone={fxPreview > 0 ? 'danger' : fxPreview < 0 ? 'success' : 'neutral'}
                  />
                )}
                <CommitActionButton
                  actionCode="AP_SETTLEMENT_PAY"
                  targetTable="fl_ap_payables"
                  targetId={selectedAp.id}
                  title={`채무 지급 확정 · ${selectedAp.payableNo}`}
                  buildPayload={() => ({
                    kind: 'AP',
                    payableId: selectedAp.id,
                    settledFxRate: selectedAp.currencyCode === 'KRW' ? 1 : settledFxRate,
                    amount: settleAmount > 0 ? settleAmount : undefined,
                    paidDate,
                  })}
                  onExecuteDirect={async () => {
                    await settleApPayable({
                      payable: selectedAp,
                      settledFxRate: selectedAp.currencyCode === 'KRW' ? 1 : settledFxRate,
                      settleForeignOrKrwAmount: settleAmount > 0 ? settleAmount : undefined,
                      paidDate,
                    });
                    await refreshAll();
                    notifyToast('매입채무 지급 및 외환차손익 확정 완료', 'success');
                  }}
                  label="지급 확정"
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
            <DataGrid
              columns={[
                { key: 'leaseId', header: '리스번호', width: 120, render: (s) => s.leaseId },
                { key: 'no', header: '회차', width: 55, align: 'center', render: (s) => s.installmentNo },
                { key: 'dueDate', header: '납입예정일', width: 105, render: (s) => s.dueDate },
                { key: 'prin', header: '원금상환', width: 115, align: 'right', render: (s) => formatMoney(s.principalPaymentKrw) },
                { key: 'int', header: '이자비용', width: 110, align: 'right', render: (s) => formatMoney(s.interestExpenseKrw) },
                { key: 'tot', header: '월납입액', width: 115, align: 'right', render: (s) => formatMoney(s.totalInstallmentKrw) },
                { key: 'end', header: '잔여원금', width: 120, align: 'right', render: (s) => formatMoney(s.endingPrincipalKrw) },
                {
                  key: 'paid',
                  header: '상태',
                  width: 80,
                  align: 'center',
                  render: (s) => <StatusBadge label={s.isPaid ? '납입' : '미납'} tone={s.isPaid ? 'success' : 'warning'} />,
                },
              ]}
              rows={unpaidSchedules}
              rowKey={(s) => s.id}
              selectedRowId={selectedSch?.id || null}
              onRowClick={(s) => setSelectedSchId(s.id)}
              maxHeight="clamp(280px, calc(100vh - 380px), 680px)"
            />

            {canEdit && selectedSch && !selectedSch.isPaid && (
              <div
                data-manual-id="ap-pay"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-field-grid-gap)',
                  alignItems: 'flex-end',
                  padding: 'var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-header)',
                }}
              >
                <VerticalField label="납입 확정일" required width={150}>
                  <input
                    type="date"
                    value={paidDate}
                    onChange={(e) => setPaidDate(e.target.value)}
                    style={controlInputStyle}
                  />
                </VerticalField>
                <CommitActionButton
                  actionCode="AP_SETTLEMENT_PAY"
                  targetTable="fl_finance_lease_schedules"
                  targetId={selectedSch.id}
                  title={`금융리스 ${selectedSch.installmentNo}회차 납입`}
                  buildPayload={() => ({
                    kind: 'LEASE_SCHEDULE',
                    leaseId: selectedSch.leaseId,
                    scheduleId: selectedSch.id,
                    paidDate,
                  })}
                  onExecuteDirect={async () => {
                    const lease = datasets.financeLeases.find((l) => l.id === selectedSch.leaseId);
                    if (!lease) throw new Error('리스 원장을 찾을 수 없습니다.');
                    await payLeaseInstallment({ lease, schedule: selectedSch, paidDate });
                    await refreshAll();
                    notifyToast('금융리스 회차 납입 완료', 'success');
                  }}
                  label="리스회차 납입"
                />
              </div>
            )}
          </div>
        )}
      </SectionPanel>
    </div>
  );
};
