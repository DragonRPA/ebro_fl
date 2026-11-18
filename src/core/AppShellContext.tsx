import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  centralSupabase,
  execDbMutation,
  flSupabase,
  newId,
  registerErrorModalHandler,
} from './supabase';
import {
  hashPassword,
  safeLocalStorageSet,
  signSessionUser,
  verifyPassword,
  verifySessionUser,
} from '../utils/cryptoVault';
import {
  setActiveAgentTenantCode,
  startGlobalAgentHealthMonitor,
  subscribeAgentStatus,
  syncTenantPolicyToAgent,
  type AgentHealthInfo,
} from '../services/agentService';
import { setR2TenantContext } from './r2TenantContext';
import {
  ALL_FL_PAGE_IDS,
  RENTAL_ONLY_PAGE_IDS,
  TIER_LABELS,
  defaultTierPagePermission,
  getMenuGroupsForTenant,
  isTenantRentalEnabled,
  type FlPageId,
  type FlUser,
  type MenuGroupDef,
  type TenantProfile,
  type TierLevel,
} from '../types/domain';
import {
  DEFAULT_TENANT_PROFILE,
  EMPTY_DATASETS,
  SESSION_STORAGE_KEY,
  fetchActiveTenantProfile,
  getTenantSessionStorageKey,
  loadAllFlDatasets,
  loadPreLoginAuthUsers,
  type FlDatasets,
} from './flDatasetLoader';

export type { FlDatasets };

export interface ToastItem {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

export interface AppShellContextValue {
  isLoading: boolean;
  currentUser: FlUser | null;
  tenantProfile: TenantProfile;
  isRentalEnabled: boolean;
  datasets: FlDatasets;
  activePage: FlPageId;
  agentOnline: boolean;
  agentInfo: AgentHealthInfo | null;
  visibleMenuGroups: MenuGroupDef[];
  visiblePageSet: Set<FlPageId>;
  errorModalMessage: string | null;
  toasts: ToastItem[];
  canGoBack: boolean;
  canGoForward: boolean;
  prevPageId: FlPageId | null;
  nextPageId: FlPageId | null;
  goBack: () => void;
  goForward: () => void;
  navigateTo: (pageId: FlPageId) => void;
  loginWithCredentials: (loginId: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAll: () => Promise<void>;
  notifyToast: (message: string, kind?: ToastItem['kind']) => void;
  closeErrorModal: () => void;
  canViewPage: (pageId: FlPageId) => boolean;
  canEditPage: (pageId: FlPageId) => boolean;
  canApprovePage: (pageId: FlPageId) => boolean;
  formatMoney: (amount: number | null | undefined, options?: { salesSensitive?: boolean }) => string;
  tierLabel: (tier?: TierLevel) => string;
  updateTenantConfig: (patch: Partial<TenantProfile>) => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateOwnContactInfo: (patch: {
    phone?: string;
    email?: string;
    address?: string;
    emergencyContact?: string;
  }) => Promise<void>;
}

const AppShellContext = React.createContext<AppShellContextValue | null>(null);
const MAX_NAV_HISTORY = 50;

function isSameAgentInfo(a: AgentHealthInfo | null, b: AgentHealthInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.version === b.version &&
    a.coreHash === b.coreHash &&
    a.callsign === b.callsign &&
    a.machineName === b.machineName &&
    a.archiveRoot === b.archiveRoot &&
    a.driveMirrorDir === b.driveMirrorDir &&
    a.isAiEnabled === b.isAiEnabled &&
    a.updateState?.status === b.updateState?.status &&
    a.updateState?.currentVersion === b.updateState?.currentVersion &&
    a.updateState?.targetVersion === b.updateState?.targetVersion &&
    a.updateState?.message === b.updateState?.message &&
    a.policy?.agentAiEnabled === b.policy?.agentAiEnabled &&
    a.policy?.tenantCode === b.policy?.tenantCode
  );
}

function readStoredSessionUserId(tenantId: string): string | null {
  if (typeof window === 'undefined') return null;
  const sessionKey = getTenantSessionStorageKey(tenantId);
  const rawSess =
    window.localStorage.getItem(sessionKey) ||
    (tenantId === DEFAULT_TENANT_ID ? window.localStorage.getItem(SESSION_STORAGE_KEY) : null);
  if (!rawSess) return null;
  const parsed = verifySessionUser<{ id: string; tenantId?: string }>(rawSess);
  if (!parsed || (parsed.tenantId && parsed.tenantId !== tenantId)) return null;
  return parsed.id;
}

export const AppShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<FlUser | null>(null);
  const [tenantProfile, setTenantProfile] = useState<TenantProfile>(DEFAULT_TENANT_PROFILE);
  const [datasets, setDatasets] = useState<FlDatasets>(EMPTY_DATASETS);
  const [activePage, setActivePage] = useState<FlPageId>('dashboard');
  const [historyStack, setHistoryStack] = useState<FlPageId[]>(['dashboard']);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const historyStackRef = useRef<FlPageId[]>(['dashboard']);
  const historyIndexRef = useRef<number>(0);
  const activePageRef = useRef<FlPageId>('dashboard');
  const lastNavActionAtRef = useRef<number>(0);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentInfo, setAgentInfo] = useState<AgentHealthInfo | null>(null);
  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const resetNavHistory = useCallback(() => {
    const initial: FlPageId[] = ['dashboard'];
    historyStackRef.current = initial;
    historyIndexRef.current = 0;
    activePageRef.current = 'dashboard';
    setHistoryStack(initial);
    setHistoryIndex(0);
    setActivePage('dashboard');
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState(
        { pageId: 'dashboard', historyIndex: 0, ebroFlNav: true },
        '',
        ''
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.history && !window.history.state?.ebroFlNav) {
      window.history.replaceState(
        { pageId: 'dashboard', historyIndex: 0, ebroFlNav: true },
        '',
        ''
      );
    }
  }, []);

  useEffect(() => {
    registerErrorModalHandler((msg) => setErrorModalMessage(msg));
  }, []);

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    try {
      window.localStorage.removeItem('ebro_fl_v2_theme');
      window.localStorage.removeItem('theme');
    } catch {
      // 무시
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeAgentStatus((online, info) => {
      setAgentOnline((prev) => (prev === online ? prev : online));
      setAgentInfo((prev) => (isSameAgentInfo(prev, info ?? null) ? prev : info ?? null));
    });
    startGlobalAgentHealthMonitor(currentUser?.loginId || 'admin');
    return unsub;
  }, [currentUser?.loginId]);

  const notifyToast = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-4), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const fetchTenantProfile = useCallback(async (): Promise<TenantProfile> => {
    const resolved = await fetchActiveTenantProfile();
    setTenantProfile(resolved);
    return resolved;
  }, []);

  const applyAuthenticatedDatasets = useCallback(
    (resolvedProfile: TenantProfile, loadedDatasets: FlDatasets) => {
      setDatasets(loadedDatasets);
      const userId = readStoredSessionUserId(resolvedProfile.id);
      if (!userId) {
        setCurrentUser(null);
        return;
      }
      const fresh = loadedDatasets.users.find(
        (u) => u.id === userId && u.isActive && u.status === 'ACTIVE'
      );
      if (fresh) {
        setCurrentUser(fresh);
      } else {
        window.localStorage.removeItem(getTenantSessionStorageKey(resolvedProfile.id));
        setCurrentUser(null);
      }
    },
    []
  );

  const refreshAll = useCallback(async () => {
    const resolvedProfile = await fetchTenantProfile();
    const loadedDatasets = await loadAllFlDatasets(resolvedProfile);
    applyAuthenticatedDatasets(resolvedProfile, loadedDatasets);
  }, [applyAuthenticatedDatasets, fetchTenantProfile]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const resolvedProfile = await fetchTenantProfile();
        if (readStoredSessionUserId(resolvedProfile.id)) {
          const loadedDatasets = await loadAllFlDatasets(resolvedProfile);
          if (active) applyAuthenticatedDatasets(resolvedProfile, loadedDatasets);
        } else {
          const { departments, users } = await loadPreLoginAuthUsers(resolvedProfile);
          if (active) {
            setDatasets({ ...EMPTY_DATASETS, departments, users });
            setCurrentUser(null);
          }
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyAuthenticatedDatasets, fetchTenantProfile]);

  useEffect(() => {
    const ch = centralSupabase
      .channel('fl-core-tenants-ci-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, () => {
        void fetchTenantProfile();
      })
      .subscribe();
    return () => {
      void centralSupabase.removeChannel(ch);
    };
  }, [fetchTenantProfile]);

  useEffect(() => {
    const effectiveR2 = tenantProfile.r2Config || tenantProfile.features?.r2Config;
    setActiveAgentTenantCode(tenantProfile.tenantCode);
    setR2TenantContext({
      tenantId: tenantProfile.id,
      tenantCode: tenantProfile.tenantCode,
      r2Config: effectiveR2,
    });
    if (agentOnline || tenantProfile.id) {
      void syncTenantPolicyToAgent(tenantProfile);
    }
  }, [tenantProfile, agentOnline]);

  const loginWithCredentials = useCallback(
    async (loginId: string, password: string) => {
      const key = loginId.trim();
      const target = datasets.users.find(
        (u) =>
          u.loginId === key ||
          (u.employeeNo && u.employeeNo.trim().toUpperCase() === key.toUpperCase())
      );
      if (!target) {
        throw new Error('등록되지 않은 아이디 또는 사번입니다.');
      }
      if (target.status === 'RETIRED') {
        throw new Error('퇴사 처리된 계정입니다. 인사 관리자에게 문의하십시오.');
      }
      if (target.status === 'LEAVE_OF_ABSENCE') {
        throw new Error('휴직 상태인 계정입니다. 복직 처리 후 로그인하십시오.');
      }
      if (!target.isActive) {
        throw new Error('비활성화된 사용자 계정입니다.');
      }
      const ok = verifyPassword(password, target.passwordHash);
      if (!ok) {
        throw new Error('비밀번호가 일치하지 않습니다.');
      }
      const signed = signSessionUser({
        id: target.id,
        role: `T${target.tierLevel}`,
        tenantId: tenantProfile.id,
      });
      safeLocalStorageSet(getTenantSessionStorageKey(tenantProfile.id), signed);
      const loadedDatasets = await loadAllFlDatasets(tenantProfile);
      const hydratedUser = loadedDatasets.users.find((u) => u.id === target.id) || target;
      setDatasets(loadedDatasets);
      setCurrentUser(hydratedUser);
      resetNavHistory();
      notifyToast(`${hydratedUser.name} · ${TIER_LABELS[hydratedUser.tierLevel]} 로그인 완료`, 'success');
    },
    [datasets.users, notifyToast, resetNavHistory, tenantProfile]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(getTenantSessionStorageKey(tenantProfile.id));
    if (tenantProfile.id === DEFAULT_TENANT_ID) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setCurrentUser(null);
    resetNavHistory();
  }, [resetNavHistory, tenantProfile.id]);

  const isRentalEnabled = useMemo(() => isTenantRentalEnabled(tenantProfile), [tenantProfile]);

  useEffect(() => {
    const scopeText = isRentalEnabled
      ? '지게차 및 부품 유통·렌탈·재고·회계 관리 시스템'
      : '지게차 및 부품 유통·재고·회계 관리 시스템';
    document.title = `${tenantProfile.displayName || '이브로 지게차'} | ${scopeText}`;
  }, [isRentalEnabled, tenantProfile.displayName]);

  const pagePermissionMap = useMemo(() => {
    const hiddenSet = new Set(tenantProfile.hiddenPages);
    const hasAllowedFilter = tenantProfile.allowedPages.length > 0;
    const allowedSet = hasAllowedFilter ? new Set(tenantProfile.allowedPages) : null;
    const rentalOnlySet = new Set<FlPageId>(RENTAL_ONLY_PAGE_IDS);
    const userPermByPage = new Map<FlPageId, (typeof datasets.userPermissions)[number]>();
    const tierPermByPage = new Map<FlPageId, (typeof datasets.userPermissions)[number]>();
    if (currentUser) {
      for (const perm of datasets.userPermissions) {
        if (perm.userId === currentUser.id) userPermByPage.set(perm.pageId, perm);
        else if (!perm.userId && perm.tierLevel === currentUser.tierLevel) tierPermByPage.set(perm.pageId, perm);
      }
    }
    const map = new Map<FlPageId, { canView: boolean; canEdit: boolean; canApprove: boolean }>();
    for (const pageId of ALL_FL_PAGE_IDS) {
      if (!isRentalEnabled && rentalOnlySet.has(pageId)) {
        map.set(pageId, { canView: false, canEdit: false, canApprove: false });
        continue;
      }
      const isSplitItem = pageId === 'trade_item_masters' || pageId === 'rental_item_masters';
      const blockedByTenant =
        hiddenSet.has(pageId) ||
        (pageId === 'bank_matching' && tenantProfile.features?.bankMatchingEnabled === false) ||
        Boolean(allowedSet && !allowedSet.has(pageId) && !(isSplitItem && allowedSet.has('item_masters')));
      if (!currentUser) {
        map.set(pageId, { canView: false, canEdit: false, canApprove: false });
        continue;
      }
      if (currentUser.tierLevel >= 7) {
        map.set(pageId, { canView: !blockedByTenant, canEdit: true, canApprove: true });
        continue;
      }
      const rule =
        userPermByPage.get(pageId) ||
        tierPermByPage.get(pageId) ||
        defaultTierPagePermission(pageId, currentUser.tierLevel);
      map.set(pageId, {
        canView: !blockedByTenant && rule.canView,
        canEdit: rule.canEdit,
        canApprove: rule.canApprove,
      });
    }
    return map;
  }, [
    currentUser,
    datasets.userPermissions,
    isRentalEnabled,
    tenantProfile.allowedPages,
    tenantProfile.features?.bankMatchingEnabled,
    tenantProfile.hiddenPages,
  ]);

  const canViewPage = useCallback(
    (pageId: FlPageId): boolean => pagePermissionMap.get(pageId)?.canView ?? false,
    [pagePermissionMap]
  );

  const canEditPage = useCallback(
    (pageId: FlPageId): boolean => pagePermissionMap.get(pageId)?.canEdit ?? false,
    [pagePermissionMap]
  );

  const canApprovePage = useCallback(
    (pageId: FlPageId): boolean => pagePermissionMap.get(pageId)?.canApprove ?? false,
    [pagePermissionMap]
  );

  const visibleMenuGroups = useMemo(() => {
    const groups = getMenuGroupsForTenant(isRentalEnabled);
    return groups
      .map((grp) => ({
        ...grp,
        items: grp.items.filter((item) => canViewPage(item.pageId)),
      }))
      .filter((grp) => grp.items.length > 0);
  }, [canViewPage, isRentalEnabled]);

  const visiblePageSet = useMemo(() => {
    const set = new Set<FlPageId>();
    visibleMenuGroups.forEach((grp) => grp.items.forEach((it) => set.add(it.pageId)));
    return set;
  }, [visibleMenuGroups]);

  const navigateTo = useCallback(
    (pageId: FlPageId) => {
      if (!canViewPage(pageId)) {
        notifyToast('현재 직급 티어에서는 해당 화면 조회 권한이 없습니다.', 'error');
        return;
      }
      if (pageId === activePageRef.current) return;
      const base = historyStackRef.current.slice(0, historyIndexRef.current + 1);
      base.push(pageId);
      if (base.length > MAX_NAV_HISTORY) {
        base.shift();
      }
      const nextIdx = base.length - 1;
      historyStackRef.current = base;
      historyIndexRef.current = nextIdx;
      activePageRef.current = pageId;
      setHistoryStack(base);
      setHistoryIndex(nextIdx);
      setActivePage(pageId);
      if (typeof window !== 'undefined' && window.history) {
        window.history.pushState(
          { pageId, historyIndex: nextIdx, ebroFlNav: true },
          '',
          ''
        );
      }
    },
    [canViewPage, notifyToast]
  );

  const stepHistory = useCallback(
    (delta: -1 | 1) => {
      const stack = historyStackRef.current;
      for (
        let i = historyIndexRef.current + delta;
        i >= 0 && i < stack.length;
        i += delta
      ) {
        const target = stack[i];
        if (target && canViewPage(target)) {
          historyIndexRef.current = i;
          activePageRef.current = target;
          setHistoryIndex(i);
          setActivePage(target);
          if (typeof window !== 'undefined' && window.history) {
            window.history.replaceState(
              { pageId: target, historyIndex: i, ebroFlNav: true },
              '',
              ''
            );
          }
          break;
        }
      }
    },
    [canViewPage]
  );

  const goBack = useCallback(() => stepHistory(-1), [stepHistory]);
  const goForward = useCallback(() => stepHistory(1), [stepHistory]);

  useEffect(() => {
    if (!currentUser) return;

    const triggerHardwareNav = (fn: () => void) => {
      const now = Date.now();
      if (now - lastNavActionAtRef.current < 120) return;
      lastNavActionAtRef.current = now;
      fn();
    };

    const handlePopState = (e: PopStateEvent) => {
      const now = Date.now();
      if (now - lastNavActionAtRef.current < 120) return;
      const state = e.state as { ebroFlNav?: boolean; pageId?: FlPageId; historyIndex?: number } | null;
      if (state?.ebroFlNav && state.pageId && canViewPage(state.pageId)) {
        lastNavActionAtRef.current = now;
        if (
          typeof state.historyIndex === 'number' &&
          historyStackRef.current[state.historyIndex]
        ) {
          historyIndexRef.current = state.historyIndex;
          setHistoryIndex(state.historyIndex);
        }
        activePageRef.current = state.pageId;
        setActivePage(state.pageId);
      }
    };

    const handleMouseSideButtonBlock = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseSideButtonUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardwareNav(goBack);
      } else if (e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardwareNav(goForward);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'BrowserBack' ||
        e.code === 'BrowserBack' ||
        (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'ArrowLeft')
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardwareNav(goBack);
      } else if (
        e.key === 'BrowserForward' ||
        e.code === 'BrowserForward' ||
        (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerHardwareNav(goForward);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('mousedown', handleMouseSideButtonBlock, { capture: true });
    window.addEventListener('auxclick', handleMouseSideButtonBlock, { capture: true });
    window.addEventListener('mouseup', handleMouseSideButtonUp, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('mousedown', handleMouseSideButtonBlock, { capture: true });
      window.removeEventListener('auxclick', handleMouseSideButtonBlock, { capture: true });
      window.removeEventListener('mouseup', handleMouseSideButtonUp, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [currentUser, canViewPage, goBack, goForward]);

  const prevPageId = useMemo(() => {
    for (let i = historyIndex - 1; i >= 0; i--) {
      const target = historyStack[i];
      if (target && canViewPage(target)) return target;
    }
    return null;
  }, [historyStack, historyIndex, canViewPage]);

  const nextPageId = useMemo(() => {
    for (let i = historyIndex + 1; i < historyStack.length; i++) {
      const target = historyStack[i];
      if (target && canViewPage(target)) return target;
    }
    return null;
  }, [historyStack, historyIndex, canViewPage]);

  const canGoBack = prevPageId !== null;
  const canGoForward = nextPageId !== null;

  const formatMoney = useCallback(
    (amount: number | null | undefined, options?: { salesSensitive?: boolean }) => {
      if (options?.salesSensitive && currentUser?.maskSalesPrice) {
        return '비공개';
      }
      const val = Math.round(Number(amount || 0));
      return `₩${val.toLocaleString('ko-KR')}`;
    },
    [currentUser?.maskSalesPrice]
  );

  const tierLabel = useCallback((tier?: TierLevel) => {
    return tier ? TIER_LABELS[tier] : '-';
  }, []);

  const updateTenantConfig = useCallback(
    async (patch: Partial<TenantProfile>) => {
      await execDbMutation('테넌트 문서설정 갱신', () =>
        centralSupabase
          .from('tenants')
          .update({
            features: patch.features ?? tenantProfile.features,
            taxEmail: patch.taxEmail ?? tenantProfile.taxEmail,
          })
          .eq('id', tenantProfile.id)
      );
      await fetchTenantProfile();
      notifyToast('설정 저장 완료', 'success');
    },
    [fetchTenantProfile, notifyToast, tenantProfile]
  );

  const changeOwnPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!currentUser) throw new Error('로그인된 사용자가 없습니다.');
      if (!verifyPassword(currentPassword, currentUser.passwordHash)) {
        throw new Error('현재 비밀번호가 일치하지 않습니다.');
      }
      const cleanNew = newPassword.trim();
      if (cleanNew.length < 4) {
        throw new Error('새 비밀번호는 4자 이상이어야 합니다.');
      }
      if (cleanNew === currentPassword) {
        throw new Error('기존 비밀번호와 다른 새 비밀번호를 입력하십시오.');
      }
      const now = new Date().toISOString();
      const nextHash = hashPassword(cleanNew);

      await execDbMutation('본인 비밀번호 변경', () =>
        flSupabase
          .from('users')
          .update({ password_hash: nextHash, must_change_password: false, updated_at: now })
          .eq('id', currentUser.id)
      );

      await execDbMutation('비밀번호 변경 이력 기록', () =>
        flSupabase.from('hr_histories').insert(
          camelToSnakeRow({
            id: newId('HRH'),
            tenantId: DEFAULT_TENANT_ID,
            userId: currentUser.id,
            eventType: '비밀번호변경',
            effectiveDate: now.slice(0, 10),
            prevSummary: '기존 비밀번호',
            nextSummary: '본인 비밀번호 변경 완료',
            reason: '임직원 본인 비밀번호 변경',
            actorId: currentUser.id,
            actorName: currentUser.name,
            createdAt: now,
          })
        )
      );

      await refreshAll();
      notifyToast('비밀번호가 변경되었습니다.', 'success');
    },
    [currentUser, notifyToast, refreshAll]
  );

  const updateOwnContactInfo = useCallback(
    async (patch: { phone?: string; email?: string; address?: string; emergencyContact?: string }) => {
      if (!currentUser) throw new Error('로그인된 사용자가 없습니다.');
      const now = new Date().toISOString();
      await execDbMutation('개인 연락처 수정', () =>
        flSupabase
          .from('users')
          .update({
            phone: patch.phone !== undefined ? patch.phone.trim() || null : currentUser.phone || null,
            email: patch.email !== undefined ? patch.email.trim() || null : currentUser.email || null,
            address:
              patch.address !== undefined ? patch.address.trim() || null : currentUser.address || null,
            emergency_contact:
              patch.emergencyContact !== undefined
                ? patch.emergencyContact.trim() || null
                : currentUser.emergencyContact || null,
            updated_at: now,
          })
          .eq('id', currentUser.id)
      );
      await refreshAll();
      notifyToast('개인 정보가 저장되었습니다.', 'success');
    },
    [currentUser, notifyToast, refreshAll]
  );

  const closeErrorModal = useCallback(() => setErrorModalMessage(null), []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      isLoading,
      currentUser,
      tenantProfile,
      isRentalEnabled,
      datasets,
      activePage,
      agentOnline,
      agentInfo,
      visibleMenuGroups,
      visiblePageSet,
      errorModalMessage,
      toasts,
      canGoBack,
      canGoForward,
      prevPageId,
      nextPageId,
      goBack,
      goForward,
      navigateTo,
      loginWithCredentials,
      logout,
      refreshAll,
      notifyToast,
      closeErrorModal,
      canViewPage,
      canEditPage,
      canApprovePage,
      formatMoney,
      tierLabel,
      updateTenantConfig,
      changeOwnPassword,
      updateOwnContactInfo,
    }),
    [
      isLoading,
      currentUser,
      tenantProfile,
      isRentalEnabled,
      datasets,
      activePage,
      agentOnline,
      agentInfo,
      visibleMenuGroups,
      visiblePageSet,
      errorModalMessage,
      toasts,
      canGoBack,
      canGoForward,
      prevPageId,
      nextPageId,
      goBack,
      goForward,
      navigateTo,
      loginWithCredentials,
      logout,
      refreshAll,
      notifyToast,
      closeErrorModal,
      canViewPage,
      canEditPage,
      canApprovePage,
      formatMoney,
      tierLabel,
      updateTenantConfig,
      changeOwnPassword,
      updateOwnContactInfo,
    ]
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
};

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used inside AppShellProvider');
  return ctx;
}
