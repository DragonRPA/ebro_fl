import React, { useMemo, useState } from 'react';
import { useAppShell } from '../../core/AppShellContext';
import { useManual } from '../../manual/ManualContext';
import { getManualEntriesForTenant } from '../../manual/manualRegistry';
import {
  DataGrid,
  SectionPanel,
  VerticalField,
  actionBtnStyle,
  controlInputStyle,
} from '../../components/UiPrimitives';
import { type FlPageId } from '../../types/domain';

export const OperationManualPage: React.FC = () => {
  const { isRentalEnabled, navigateTo, visiblePageSet } = useAppShell();
  const { setOverlayOpen, customNotes } = useManual();
  const [query, setQuery] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<FlPageId>('dashboard');

  const visibleEntries = useMemo(
    () => getManualEntriesForTenant(isRentalEnabled).filter((e) => visiblePageSet.has(e.pageId)),
    [isRentalEnabled, visiblePageSet]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleEntries;
    return visibleEntries.filter((entry) => {
      if (entry.pageTitle.toLowerCase().includes(q)) return true;
      if (entry.basicDescription.toLowerCase().includes(q)) return true;
      return entry.processes.some(
        (p) =>
          p.processName.toLowerCase().includes(q) ||
          p.purpose.toLowerCase().includes(q) ||
          p.steps.some(
            (s) =>
              s.targetLabel.toLowerCase().includes(q) ||
              s.actionDetail.toLowerCase().includes(q)
          )
      );
    });
  }, [query, visibleEntries]);

  const activeEntry =
    filtered.find((e) => e.pageId === selectedPageId) || filtered[0] || visibleEntries[0];
  const activeNotes = activeEntry ? customNotes[activeEntry.pageId] || [] : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)' }}>
      <SectionPanel title="업무 매뉴얼 검색" manualId="man-search">
        <VerticalField label="화면명 · 업무프로세스 · 조작 대상 검색" width={420}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isRentalEnabled
                ? '매입통관, 교환, 세금계산서, 금융리스 등'
                : '매입통관, 선입선출, 세금계산서, 외화결제 등'
            }
            style={controlInputStyle}
          />
        </VerticalField>
      </SectionPanel>

      <div
        data-manual-id="man-list"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(380px, 1.5fr)',
          gap: 'var(--space-page-gap)',
          alignItems: 'start',
        }}
      >
        <DataGrid
          columns={[
            { key: 'grp', header: '영역', width: 120, render: (e) => e.groupLabel },
            { key: 'title', header: '화면명', render: (e) => <span style={{ fontWeight: 700 }}>{e.pageTitle}</span> },
            { key: 'cnt', header: '업무수', width: 70, align: 'center', render: (e) => e.processes.length },
          ]}
          rows={filtered}
          rowKey={(e) => e.pageId}
          selectedRowId={activeEntry?.pageId || null}
          onRowClick={(e) => setSelectedPageId(e.pageId)}
          maxHeight="clamp(340px, calc(100vh - 250px), 800px)"
        />

        {activeEntry && (
          <SectionPanel
            title={`${activeEntry.groupLabel} · ${activeEntry.pageTitle}`}
            rightSlot={
              <div style={{ display: 'flex', gap: 'var(--space-inline-gap)' }}>
                <button
                  type="button"
                  onClick={() => navigateTo(activeEntry.pageId)}
                  style={actionBtnStyle('secondary', true)}
                >
                  해당 화면 이동
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigateTo(activeEntry.pageId);
                    setOverlayOpen(true);
                  }}
                  style={actionBtnStyle('primary', true)}
                >
                  오버레이 실행
                </button>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)', fontSize: '13px' }}>
              <div
                style={{
                  padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                  border: '1px solid var(--table-border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-app)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 'var(--space-label-gap)' }}>기본기능 설명</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {activeEntry.basicDescription}
                </div>
              </div>

              {activeEntry.processes.map((proc) => (
                <div
                  key={proc.processName}
                  style={{
                    padding: 'var(--space-subbox-pad-x)',
                    border: '1px solid var(--table-border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-app)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--primary)' }}>
                    {proc.processName}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px', marginBottom: 'var(--space-inline-gap)' }}>
                    {proc.purpose}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-tight-gap)' }}>
                    {proc.steps.map((st) => (
                      <div key={st.stepNo} style={{ lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700 }}>
                          {st.stepNo}단계 [{st.targetLabel}]
                        </span>{' '}
                        {st.actionDetail}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {activeNotes.length > 0 && (
                <div
                  style={{
                    padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-header)',
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 'var(--space-label-gap)' }}>현장 추가 주석</div>
                  {activeNotes.map((n) => (
                    <div key={n.anchorId}>
                      {n.anchorId}: {n.note}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionPanel>
        )}
      </div>
    </div>
  );
};
