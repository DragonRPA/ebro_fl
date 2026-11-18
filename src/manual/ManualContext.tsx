import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { centralSupabase, execDbMutation, newId } from '../core/supabase';
import { useAppShell } from '../core/AppShellContext';
import { getPageTitleForTenant } from './manualPageTitles';
import type { ScreenManualEntry } from './manualRegistry';
import type { FlPageId } from '../types/domain';

export interface CustomManualAnnotation {
  anchorId: string;
  note: string;
}

interface ManualContextValue {
  overlayOpen: boolean;
  setOverlayOpen: (v: boolean) => void;
  toggleOverlay: () => void;
  searchModalOpen: boolean;
  setSearchModalOpen: (v: boolean) => void;
  activeEntry: ScreenManualEntry;
  highlightedAnchorId: string | null;
  setHighlightedAnchorId: (id: string | null) => void;
  customNotes: Record<string, CustomManualAnnotation[]>;
  saveCustomAnnotation: (pageId: FlPageId, anchorId: string, note: string) => Promise<void>;
}

const ManualContext = createContext<ManualContextValue | null>(null);

export const ManualProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activePage, currentUser, isRentalEnabled, notifyToast, tenantProfile } = useAppShell();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [highlightedAnchorId, setHighlightedAnchorId] = useState<string | null>(null);
  const [customNotes, setCustomNotes] = useState<Record<string, CustomManualAnnotation[]>>({});
  const [manualRegistryMod, setManualRegistryMod] = useState<
    typeof import('./manualRegistry') | null
  >(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setOverlayOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOverlayOpen(false);
        setSearchModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if ((!overlayOpen && !searchModalOpen) || manualRegistryMod) return;
    let alive = true;
    void import('./manualRegistry').then((mod) => {
      if (alive) setManualRegistryMod(mod);
    });
    return () => {
      alive = false;
    };
  }, [overlayOpen, searchModalOpen, manualRegistryMod]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await centralSupabase
        .from('manual_annotations')
        .select('*')
        .eq('solution_type', 'FL');
      if (!alive || res.error || !Array.isArray(res.data)) return;
      const rows = res.data as Record<string, unknown>[];
      const map: Record<string, CustomManualAnnotation[]> = {};
      for (const row of rows) {
        if (row.tenant_id) continue;
        const pid = String(row.page_id || '');
        const anns = Array.isArray(row.annotations) ? (row.annotations as CustomManualAnnotation[]) : [];
        if (pid) map[pid] = anns;
      }
      for (const row of rows) {
        if (String(row.tenant_id || '') !== tenantProfile.id) continue;
        const pid = String(row.page_id || '');
        const anns = Array.isArray(row.annotations) ? (row.annotations as CustomManualAnnotation[]) : [];
        if (pid) map[pid] = anns;
      }
      setCustomNotes(map);
    })();
    return () => {
      alive = false;
    };
  }, [tenantProfile.id]);

  const toggleOverlay = useCallback(() => setOverlayOpen((p) => !p), []);

  const saveCustomAnnotation = useCallback(
    async (pageId: FlPageId, anchorId: string, note: string) => {
      const prevList = customNotes[pageId] || [];
      const nextList = [
        ...prevList.filter((a) => a.anchorId !== anchorId),
        ...(note.trim() ? [{ anchorId, note: note.trim() }] : []),
      ];

      const existing = await centralSupabase
        .from('manual_annotations')
        .select('id')
        .eq('solution_type', 'FL')
        .eq('page_id', pageId)
        .eq('tenant_id', tenantProfile.id);

      const regMod = manualRegistryMod || (await import('./manualRegistry'));
      if (!manualRegistryMod) {
        setManualRegistryMod(regMod);
      }
      const entry = regMod.FL_MANUAL_REGISTRY[pageId];
      if (Array.isArray(existing.data) && existing.data.length > 0) {
        const rowId = String((existing.data[0] as Record<string, unknown>).id);
        await execDbMutation('매뉴얼 주석 저장', () =>
          centralSupabase
            .from('manual_annotations')
            .update({
              annotations: nextList,
              tenant_id: tenantProfile.id,
              updated_by: currentUser?.name || '관리자',
              updated_at: new Date().toISOString(),
            })
            .eq('id', rowId)
        );
      } else {
        await execDbMutation('매뉴얼 주석 등록', () =>
          centralSupabase.from('manual_annotations').insert({
            id: newId('MAN'),
            tenant_id: tenantProfile.id,
            page_id: pageId,
            page_title: entry.pageTitle,
            menu_id: pageId,
            solution_type: 'FL',
            version: 2,
            annotations: nextList,
            updated_by: currentUser?.name || '관리자',
            updated_at: new Date().toISOString(),
          })
        );
      }

      setCustomNotes((prev) => ({ ...prev, [pageId]: nextList }));
      notifyToast('화면 매뉴얼 현장 주석 저장 완료', 'success');
    },
    [currentUser?.name, customNotes, manualRegistryMod, notifyToast, tenantProfile.id]
  );

  const activeEntry = useMemo<ScreenManualEntry>(() => {
    if (manualRegistryMod) {
      return manualRegistryMod.getManualEntryForTenant(activePage, isRentalEnabled);
    }
    return {
      pageId: activePage,
      pageTitle: getPageTitleForTenant(activePage, isRentalEnabled),
      groupLabel: '',
      basicDescription: '',
      processes: [],
      anchors: [],
    };
  }, [activePage, isRentalEnabled, manualRegistryMod]);

  const contextValue = useMemo<ManualContextValue>(
    () => ({
      overlayOpen,
      setOverlayOpen,
      toggleOverlay,
      searchModalOpen,
      setSearchModalOpen,
      activeEntry,
      highlightedAnchorId,
      setHighlightedAnchorId,
      customNotes,
      saveCustomAnnotation,
    }),
    [
      overlayOpen,
      toggleOverlay,
      searchModalOpen,
      activeEntry,
      highlightedAnchorId,
      customNotes,
      saveCustomAnnotation,
    ]
  );

  return <ManualContext.Provider value={contextValue}>{children}</ManualContext.Provider>;
};

export function useManual(): ManualContextValue {
  const ctx = useContext(ManualContext);
  if (!ctx) throw new Error('useManual must be used inside ManualProvider');
  return ctx;
}
