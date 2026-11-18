import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { CommitActionButton } from '../../core/ActionCommandGateway';
import { sortUnitsFifo, todayIso } from '../../services/domainMath';
import { completeFulfillment, executeRentalExchange } from '../../services/domainFulfillmentEngine';
import {
  DataGrid,
  SectionPanel,
  StatusBadge,
  VerticalField,
  controlInputStyle,
} from '../../components/UiPrimitives';
import {
  FULFILLMENT_STATUS_KO_LABELS,
  formatKoStatus,
  koStatusTone,
} from '../../types/domain';

export const RentalFulfillmentPage: React.FC = () => {
  const { currentUser, datasets, refreshAll, notifyToast, canEditPage } = useAppShell();
  const canEdit = canEditPage('rental_fulfillment');
  const today = todayIso();

  const rentalFulfillments = useMemo(
    () =>
      datasets.fulfillments
        .filter((f) => f.fulfillmentDomain === 'RENTAL')
        .sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || '')),
    [datasets.fulfillments]
  );

  const contractById = useMemo(
    () => new Map(datasets.contracts.map((c) => [c.id, c])),
    [datasets.contracts]
  );
  const contractLineById = useMemo(
    () => new Map(datasets.contractLines.map((l) => [l.id, l])),
    [datasets.contractLines]
  );
  const unitById = useMemo(
    () => new Map(datasets.inventoryUnits.map((u) => [u.id, u])),
    [datasets.inventoryUnits]
  );

  const [selectedFulId, setSelectedFulId] = useState<string | null>(
    rentalFulfillments.find((f) => f.status === 'REQUESTED')?.id || rentalFulfillments[0]?.id || null
  );
  const selectedFul =
    rentalFulfillments.find((f) => f.id === selectedFulId) || rentalFulfillments[0] || null;
  const selectedFulLine = selectedFul
    ? contractLineById.get(selectedFul.contractLineId)
    : undefined;

  const availableRentalUnits = useMemo(
    () =>
      sortUnitsFifo(
        datasets.inventoryUnits.filter(
          (u) =>
            (u.ownershipDomain === '렌탈자산' || u.ownershipDomain === '전대자산') &&
            u.status === '보유중'
        )
      ),
    [datasets.inventoryUnits]
  );

  const [chosenUnitId, setChosenUnitId] = useState('');
  const [effDate, setEffDate] = useState(today);
  const [returnToRepair, setReturnToRepair] = useState(false);

  const resolvedUnit = useMemo(() => {
    if (!selectedFul) return null;
    if (selectedFul.actionType === '렌탈회수') {
      const targetId = selectedFul.unitId || selectedFulLine?.assignedUnitId;
      return (targetId ? unitById.get(targetId) : undefined) || null;
    }
    const matching = availableRentalUnits.filter((u) => u.itemId === selectedFul.itemId);
    const pool = matching.length > 0 ? matching : availableRentalUnits;
    return pool.find((u) => u.id === chosenUnitId) || pool[0] || null;
  }, [availableRentalUnits, chosenUnitId, selectedFul, selectedFulLine, unitById]);

  // 단일 교환 섹션 상태
  const activeRentedLines = useMemo(
    () =>
      datasets.contractLines.filter((l) => {
        if (l.lineStatus !== 'FULFILLED' || !l.assignedUnitId) return false;
        const c = contractById.get(l.contractId);
        return c?.contractDomain === 'RENTAL';
      }),
    [contractById, datasets.contractLines]
  );

  const [exOldLineId, setExOldLineId] = useState(activeRentedLines[0]?.id || '');
  const [exNewUnitId, setExNewUnitId] = useState(availableRentalUnits[0]?.id || '');
  const [exDate, setExDate] = useState(today);
  const [exRepair, setExRepair] = useState(true);
  const [exMemo, setExMemo] = useState('');

  const oldLineObj =
    activeRentedLines.find((l) => l.id === (exOldLineId || activeRentedLines[0]?.id)) || null;
  const oldContractObj = oldLineObj
    ? contractById.get(oldLineObj.contractId) || null
    : null;
  const oldUnitObj = oldLineObj?.assignedUnitId
    ? unitById.get(oldLineObj.assignedUnitId) || null
    : null;
  const newUnitObj =
    availableRentalUnits.find((u) => u.id === (exNewUnitId || availableRentalUnits[0]?.id)) ||
    null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel title="렌탈 출고 · 회수 실행완료" manualId="rful-exec">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-stack-gap)' }}>
          <DataGrid
            columns={[
              { key: 'no', header: '의뢰번호', width: 140, render: (f) => <span style={{ fontWeight: 700 }}>{f.fulfillmentNo}</span> },
              {
                key: 'act',
                header: '구분',
                width: 90,
                align: 'center',
                render: (f) => (
                  <StatusBadge
                    label={f.actionType}
                    tone={f.actionType === '교환' ? 'warning' : 'primary'}
                  />
                ),
              },
              { key: 'partner', header: '임차 거래처', render: (f) => f.partnerName },
              { key: 'eff', header: '희망완료일', width: 110, render: (f) => f.effectiveDate || '-' },
              {
                key: 'rec',
                header: '입력일시',
                width: 150,
                render: (f) => (f.recordedAt ? f.recordedAt.slice(0, 16).replace('T', ' ') : '-'),
              },
              {
                key: 'status',
                header: '상태',
                width: 95,
                align: 'center',
                render: (f) => (
                  <StatusBadge
                    label={FULFILLMENT_STATUS_KO_LABELS[f.status] || formatKoStatus(f.status)}
                    tone={koStatusTone(f.status)}
                  />
                ),
              },
            ]}
            rows={rentalFulfillments}
            rowKey={(f) => f.id}
            selectedRowId={selectedFul?.id || null}
            onRowClick={(f) => {
              setSelectedFulId(f.id);
              setChosenUnitId('');
            }}
            maxHeight="250px"
          />

          {canEdit && selectedFul && selectedFul.status === 'REQUESTED' && selectedFulLine && (
            <div
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
              {selectedFul.actionType === '렌탈출고' ? (
                <VerticalField label="배정 렌탈자산 · 전대자산 선택" required minWidth={270} flex={1}>
                  <select
                    value={resolvedUnit?.id || ''}
                    onChange={(e) => setChosenUnitId(e.target.value)}
                    style={controlInputStyle}
                  >
                    {availableRentalUnits.length === 0 ? (
                      <option value="">보유중 렌탈자산이 없습니다</option>
                    ) : (
                      availableRentalUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unitCode} · {u.itemName} · {u.serialNo || '-'} [{u.ownershipDomain}]
                        </option>
                      ))
                    )}
                  </select>
                </VerticalField>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-stack-gap)' }}>
                  <span>회수 대상 장비: {resolvedUnit?.unitCode || '-'} · {resolvedUnit?.serialNo || '-'}</span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={returnToRepair}
                      onChange={(e) => setReturnToRepair(e.target.checked)}
                    />
                    회수 후 정비중 전환
                  </label>
                </div>
              )}

              <VerticalField label="희망완료일" required width={150}>
                <input
                  type="date"
                  value={effDate}
                  onChange={(e) => setEffDate(e.target.value)}
                  style={controlInputStyle}
                />
              </VerticalField>

              <CommitActionButton
                actionCode="FULFILLMENT_COMPLETE"
                targetTable="fl_fulfillments"
                targetId={selectedFul.id}
                title={`${selectedFul.actionType} 실행완료 · ${selectedFul.fulfillmentNo}`}
                disabled={!resolvedUnit}
                buildPayload={() =>
                  resolvedUnit
                    ? {
                        fulfillmentId: selectedFul.id,
                        unitId: resolvedUnit.id,
                        effectiveDate: effDate,
                        returnToRepair,
                      }
                    : null
                }
                onExecuteDirect={async () => {
                  if (!currentUser || !resolvedUnit) return;
                  await completeFulfillment({
                    fulfillment: selectedFul,
                    contractLine: selectedFulLine,
                    unit: resolvedUnit,
                    effectiveDate: effDate,
                    actorId: currentUser.id,
                    actorName: currentUser.name,
                    returnToRepair,
                  });
                  await refreshAll();
                  notifyToast(`${selectedFul.actionType} 실행완료 처리됨`, 'success');
                }}
                label="실행완료"
              />
            </div>
          )}
        </div>
      </SectionPanel>

      <SectionPanel
        title="렌탈 단일 교환 실행 · 전일 마감 및 후장비 계약 조건 자동 상속"
        manualId="rful-exchange"
      >
        {canEdit ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 'var(--space-field-grid-gap)', alignItems: 'end' }}>
            <VerticalField label="교환 대상 대여중 계약 · 전자산" required>
              <select
                value={oldLineObj?.id || ''}
                onChange={(e) => setExOldLineId(e.target.value)}
                style={controlInputStyle}
              >
                {activeRentedLines.length === 0 ? (
                  <option value="">대여중 렌탈 계약 품목 없음</option>
                ) : (
                  activeRentedLines.map((l) => {
                    const c = contractById.get(l.contractId);
                    return (
                      <option key={l.id} value={l.id}>
                        {c?.partnerName || ''} · {l.itemName} · {l.assignedSerialNo || l.assignedUnitId}
                      </option>
                    );
                  })
                )}
              </select>
            </VerticalField>
            <VerticalField label="교환 투입 후장비" required>
              <select
                value={newUnitObj?.id || ''}
                onChange={(e) => setExNewUnitId(e.target.value)}
                style={controlInputStyle}
              >
                {availableRentalUnits.length === 0 ? (
                  <option value="">투입 가능 보유중 장비 없음</option>
                ) : (
                  availableRentalUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitCode} · {u.itemName} · {u.serialNo || '-'}
                    </option>
                  ))
                )}
              </select>
            </VerticalField>
            <VerticalField label="교환 희망완료일" required width={150}>
              <input
                type="date"
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
                style={controlInputStyle}
              />
            </VerticalField>
            <VerticalField label="비고">
              <input
                type="text"
                value={exMemo}
                onChange={(e) => setExMemo(e.target.value)}
                placeholder="현장 교환 사유"
                style={controlInputStyle}
              />
            </VerticalField>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-tight-gap)', height: 'var(--space-control-h)', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={exRepair}
                onChange={(e) => setExRepair(e.target.checked)}
              />
              회수 전자산 정비중 전환
            </label>
            <CommitActionButton
              actionCode="EXCHANGE_EXECUTE"
              targetTable="fl_fulfillments"
              targetId={oldLineObj?.id || 'EXCHANGE'}
              title={`렌탈 장비 교환 · ${oldContractObj?.partnerName || ''}`}
              disabled={!oldContractObj || !oldLineObj || !oldUnitObj || !newUnitObj}
              buildPayload={() =>
                oldContractObj && oldLineObj && oldUnitObj && newUnitObj
                  ? {
                      contractId: oldContractObj.id,
                      oldLineId: oldLineObj.id,
                      oldUnitId: oldUnitObj.id,
                      newUnitId: newUnitObj.id,
                      exchangeDate: exDate,
                      oldUnitToRepair: exRepair,
                      memo: exMemo.trim() || undefined,
                    }
                  : null
              }
              onExecuteDirect={async () => {
                if (!currentUser || !oldContractObj || !oldLineObj || !oldUnitObj || !newUnitObj) {
                  return;
                }
                await executeRentalExchange({
                  contract: oldContractObj,
                  oldLine: oldLineObj,
                  oldUnit: oldUnitObj,
                  newUnit: newUnitObj,
                  exchangeDate: exDate,
                  actorId: currentUser.id,
                  actorName: currentUser.name,
                  oldUnitToRepair: exRepair,
                  memo: exMemo.trim() || undefined,
                });
                await refreshAll();
                notifyToast('렌탈 단일 교환 실행완료', 'success');
              }}
              label="교환 실행완료"
            />
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>편집 권한이 없습니다.</div>
        )}
      </SectionPanel>
    </div>
  );
};
