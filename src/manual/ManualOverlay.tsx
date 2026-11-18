import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, X } from 'lucide-react';
import { useAppShell } from '../core/AppShellContext';
import { useManual } from './ManualContext';
import { getManualEntriesForTenant, type ScreenManualEntry } from './manualRegistry';

interface AnchorRect {
  anchorId: string;
  stepNo: number;
  title: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export const ManualOverlay: React.FC = () => {
  const { activePage, navigateTo, currentUser, isRentalEnabled, visiblePageSet } = useAppShell();
  const {
    overlayOpen,
    setOverlayOpen,
    searchModalOpen,
    setSearchModalOpen,
    activeEntry,
    highlightedAnchorId,
    setHighlightedAnchorId,
    customNotes,
    saveCustomAnnotation,
  } = useManual();

  const [selectedProcessIdx, setSelectedProcessIdx] = useState(0);
  const [rects, setRects] = useState<AnchorRect[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [editingAnchor, setEditingAnchor] = useState<string | null>(null);

  useEffect(() => {
    setSelectedProcessIdx(0);
    setHighlightedAnchorId(null);
    setEditingAnchor(null);
  }, [activePage, setHighlightedAnchorId]);

  useEffect(() => {
    if (!overlayOpen) {
      setRects([]);
      return;
    }

    const measure = () => {
      const els = Array.from(document.querySelectorAll('[data-manual-id]'));
      const seen = new Map<string, number>();
      const out: AnchorRect[] = [];
      const currentProc = activeEntry.processes[selectedProcessIdx] || activeEntry.processes[0];

      els.forEach((el) => {
        const id = el.getAttribute('data-manual-id');
        if (!id || seen.has(id)) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const stepMatch = currentProc?.steps.find((s) => s.manualAnchorId === id);
        const anchorMeta = activeEntry.anchors.find((a) => a.anchorId === id);
        const stepNo = stepMatch?.stepNo || out.length + 1;
        seen.set(id, stepNo);
        out.push({
          anchorId: id,
          stepNo,
          title: anchorMeta?.title || id,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        });
      });
      setRects(out);
    };

    measure();
    const timer = window.setInterval(measure, 350);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [overlayOpen, activeEntry, selectedProcessIdx]);

  const searchResults = useMemo<ScreenManualEntry[]>(() => {
    const q = searchTerm.trim().toLowerCase();
    const pool = getManualEntriesForTenant(isRentalEnabled).filter((e) => visiblePageSet.has(e.pageId));
    if (!q) return pool;
    return pool.filter((entry) => {
      if (entry.pageTitle.toLowerCase().includes(q)) return true;
      if (entry.basicDescription.toLowerCase().includes(q)) return true;
      return entry.processes.some(
        (p) =>
          p.processName.toLowerCase().includes(q) ||
          p.purpose.toLowerCase().includes(q) ||
          p.steps.some(
            (s) => s.targetLabel.toLowerCase().includes(q) || s.actionDetail.toLowerCase().includes(q)
          )
      );
    });
  }, [isRentalEnabled, searchTerm, visiblePageSet]);

  const pageNotes = customNotes[activeEntry.pageId] || [];
  const activeProcess = activeEntry.processes[selectedProcessIdx] || activeEntry.processes[0];

  return (
    <>
      {overlayOpen && (
        <div
          data-manual-ui="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9990,
            pointerEvents: 'none',
          }}
        >
          {/* 상단 반투명 바 + 조작 가이드 */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.28)',
              pointerEvents: 'auto',
            }}
            onClick={() => setOverlayOpen(false)}
          />

          {/* 실화면 DOM 요소 하이라이트 박스 */}
          {rects.map((rect) => {
            const isActive = highlightedAnchorId === rect.anchorId;
            return (
              <div
                key={rect.anchorId}
                onClick={(e) => {
                  e.stopPropagation();
                  setHighlightedAnchorId(rect.anchorId);
                }}
                style={{
                  position: 'fixed',
                  top: `${Math.max(4, rect.top - 4)}px`,
                  left: `${Math.max(4, rect.left - 4)}px`,
                  width: `${rect.width + 8}px`,
                  height: `${rect.height + 8}px`,
                  border: isActive ? '2px solid #dc2626' : '2px solid var(--primary)',
                  borderRadius: '6px',
                  backgroundColor: isActive ? 'rgba(220, 38, 38, 0.10)' : 'rgba(29, 78, 216, 0.08)',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  zIndex: 9992,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '-2px',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    backgroundColor: isActive ? '#dc2626' : 'var(--primary)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {rect.stepNo}. {rect.title}
                </span>
              </div>
            );
          })}

          {/* 우측 매뉴얼 오버레이 가이드 패널 */}
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: '56px',
              right: '16px',
              bottom: '16px',
              width: '410px',
              maxWidth: 'calc(100vw - 32px)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              pointerEvents: 'auto',
              zIndex: 9995,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: 'var(--space-modal-head-pad-y) var(--space-btn-pad-x)',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-inline-gap)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-inline-gap)', minWidth: 0 }}>
                <BookOpen size={16} />
                <span style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap' }}>
                  화면 조작 매뉴얼 · {activeEntry.pageTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOverlayOpen(false)}
                style={{
                  padding: '2px 6px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <X size={14} /> 닫기
              </button>
            </div>

            <div style={{ padding: 'var(--space-panel-pad-y)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-page-gap)', flex: 1 }}>
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px' }}>
                  기본기능 설명
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    lineHeight: 1.5,
                    color: 'var(--text-main)',
                    padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-app)',
                  }}
                >
                  {activeEntry.basicDescription}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  업무 프로세스 명칭
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-tight-gap)' }}>
                  {activeEntry.processes.map((proc, idx) => (
                    <button
                      key={proc.processName}
                      type="button"
                      onClick={() => setSelectedProcessIdx(idx)}
                      style={{
                        padding: 'var(--space-tab-item-pad-y) var(--space-compact-pad-x)',
                        borderRadius: '6px',
                        border: selectedProcessIdx === idx ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                        backgroundColor: selectedProcessIdx === idx ? 'var(--primary)' : 'var(--bg-app)',
                        color: selectedProcessIdx === idx ? '#ffffff' : 'var(--text-main)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {proc.processName}
                    </button>
                  ))}
                </div>
              </div>

              {activeProcess && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-inline-gap)' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>
                    화면 조작 순서
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{activeProcess.purpose}</div>
                  {activeProcess.steps.map((st) => {
                    const isHl = highlightedAnchorId === st.manualAnchorId;
                    const note = pageNotes.find((n) => n.anchorId === st.manualAnchorId);
                    return (
                      <div
                        key={st.stepNo}
                        onClick={() => setHighlightedAnchorId(st.manualAnchorId)}
                        style={{
                          padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                          borderRadius: '6px',
                          border: isHl ? '1.5px solid #dc2626' : '1px solid var(--border-color)',
                          backgroundColor: isHl ? 'var(--danger-light)' : 'var(--bg-app)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-label-gap)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--text-main)' }}>
                            {st.stepNo}단계 · {st.targetLabel}
                          </span>
                          {(currentUser?.tierLevel || 1) >= 4 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAnchor(st.manualAnchorId);
                                setNoteDraft(note?.note || '');
                              }}
                              style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              주석 편집
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                          {st.actionDetail}
                        </div>
                        {note && (
                          <div style={{ fontSize: '11.5px', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
                            현장 기준: {note.note}
                          </div>
                        )}
                        {editingAnchor === st.manualAnchorId && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="현장 추가 안내 입력"
                              style={{
                                flex: 1,
                                padding: '5px 8px',
                                fontSize: '12px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--text-main)',
                              }}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                await saveCustomAnnotation(activeEntry.pageId, st.manualAnchorId, noteDraft);
                                setEditingAnchor(null);
                              }}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '4px',
                                border: 'none',
                                backgroundColor: 'var(--primary)',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              저장
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                padding: 'var(--space-subbox-pad-y) var(--space-btn-pad-x)',
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-header)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setOverlayOpen(false);
                  setSearchModalOpen(true);
                }}
                style={{
                  padding: 'calc(6px - 2pt) var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                <Search size={13} /> 전체 매뉴얼 검색
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverlayOpen(false);
                  navigateTo('operation_manual');
                }}
                style={{
                  padding: 'calc(6px - 2pt) var(--space-subbox-pad-x)',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                전체 매뉴얼 화면 이동
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 전역 매뉴얼 빠른 검색 창 */}
      {searchModalOpen && (
        <div
          data-manual-ui="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'calc(24px - 2pt)',
          }}
          onClick={() => setSearchModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '820px',
              maxWidth: '100%',
              maxHeight: '82vh',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: 'var(--space-modal-head-pad-y) var(--space-modal-head-pad-x)',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-field-grid-gap)',
              }}
            >
              <Search size={16} />
              <input
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="메뉴명, 업무 프로세스 명칭, 화면 조작 키워드 검색"
                style={{
                  flex: 1,
                  padding: 'calc(7px - 2pt) var(--space-control-pad-x)',
                  fontSize: '13px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-main)',
                }}
              />
              <button
                type="button"
                onClick={() => setSearchModalOpen(false)}
                style={{
                  padding: 'calc(6px - 2pt) var(--space-compact-pad-x)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-app)',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                닫기
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: 'var(--space-modal-head-pad-y) var(--space-modal-head-pad-x)', display: 'flex', flexDirection: 'column', gap: 'var(--space-field-grid-gap)' }}>
              {searchResults.map((entry) => (
                <div
                  key={entry.pageId}
                  style={{
                    padding: 'var(--space-subbox-pad-y) var(--space-subbox-pad-x)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-app)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-tight-gap)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                        {entry.groupLabel}
                      </span>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                        {entry.pageTitle}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          navigateTo(entry.pageId);
                          setSearchModalOpen(false);
                          window.setTimeout(() => setOverlayOpen(true), 120);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '5px',
                          border: 'none',
                          backgroundColor: 'var(--primary)',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        화면 이동 후 오버레이 보기
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{entry.basicDescription}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {entry.processes.map((p) => (
                      <span
                        key={p.processName}
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-card)',
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.processName}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  일치하는 매뉴얼 항목이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
