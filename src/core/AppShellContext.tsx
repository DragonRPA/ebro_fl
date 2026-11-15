import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  centralSupabase,
  execDbMutation,
  flSupabase,
  registerErrorModalHandler,
  snakeToCamelRow,
} from './supabase';
import {
  getVaultItem,
  safeLocalStorageSet,
  setVaultItem,
  signSessionUser,
  verifyPassword,
  verifySessionUser,
} from '../utils/cryptoVault';
import { startGlobalAgentHealthMonitor, subscribeAgentStatus, type AgentHealthInfo } from '../services/agentService';
import {
  ALL_FL_PAGE_IDS,
  FL_MENU_GROUPS,
  TIER_LABELS,
  type FlApPayable,
  type FlApprovalPolicy,
  type FlApprovalRequest,
  type FlAssetEvent,
  type FlBankTransaction,
  type FlBilling,
  type FlCatalogPackage,
  type FlCollection,
  type FlContract,
  type FlContractLine,
  type FlDepartment,
  type FlDocumentTemplate,
  type FlExchangeRate,
  type FlFinanceLease,
  type FlFinanceLeaseSchedule,
  type FlFulfillment,
  type FlInventoryUnit,
  type FlItemMaster,
  type FlLogisticsDispatch,
  type FlPageId,
  type FlPartner,
  type FlPartnerSite,
  type FlPurchase,
  type FlPurchaseLine,
  type FlQuotation,
  type FlRentalMaintenance,
  type FlStockMovement,
  type FlTradeAftercareCase,
  type FlUser,
  type FlUserPermission,
  type MenuGroupDef,
  type TenantProfile,
  type TierLevel,
} from '../types/domain';

const SESSION_STORAGE_KEY = 'ebro_fl_v2_session';
const THEME_STORAGE_KEY = 'ebro_fl_v2_theme';

export interface ToastItem {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

export interface FlDatasets {
  departments: FlDepartment[];
  users: FlUser[];
  userPermissions: FlUserPermission[];
  approvalPolicies: FlApprovalPolicy[];
  approvalRequests: FlApprovalRequest[];
  documentTemplates: FlDocumentTemplate[];
  partners: FlPartner[];
  partnerSites: FlPartnerSite[];
  itemMasters: FlItemMaster[];
  catalogPackages: FlCatalogPackage[];
  exchangeRates: FlExchangeRate[];
  purchases: FlPurchase[];
  purchaseLines: FlPurchaseLine[];
  logisticsDispatches: FlLogisticsDispatch[];
  apPayables: FlApPayable[];
  inventoryUnits: FlInventoryUnit[];
  stockMovements: FlStockMovement[];
  quotations: FlQuotation[];
  contracts: FlContract[];
  contractLines: FlContractLine[];
  fulfillments: FlFulfillment[];
  tradeAftercareCases: FlTradeAftercareCase[];
  rentalMaintenances: FlRentalMaintenance[];
  assetEvents: FlAssetEvent[];
  billings: FlBilling[];
  collections: FlCollection[];
  bankTransactions: FlBankTransaction[];
  financeLeases: FlFinanceLease[];
  financeLeaseSchedules: FlFinanceLeaseSchedule[];
}

const EMPTY_DATASETS: FlDatasets = {
  departments: [],
  users: [],
  userPermissions: [],
  approvalPolicies: [],
  approvalRequests: [],
  documentTemplates: [],
  partners: [],
  partnerSites: [],
  itemMasters: [],
  catalogPackages: [],
  exchangeRates: [],
  purchases: [],
  purchaseLines: [],
  logisticsDispatches: [],
  apPayables: [],
  inventoryUnits: [],
  stockMovements: [],
  quotations: [],
  contracts: [],
  contractLines: [],
  fulfillments: [],
  tradeAftercareCases: [],
  rentalMaintenances: [],
  assetEvents: [],
  billings: [],
  collections: [],
  bankTransactions: [],
  financeLeases: [],
  financeLeaseSchedules: [],
};

const DEFAULT_TENANT_PROFILE: TenantProfile = {
  id: DEFAULT_TENANT_ID,
  tenantCode: 'EBRO_FL',
  subdomain: 'fl-demo',
  solutionType: 'FL',
  displayName: 'eBroFL 렌탈',
  corporateName: '주식회사 이브로지게차렌탈',
  businessNumber: '123-81-45678',
  representativeName: '이정용',
  businessAddress: '경기도 평택시 포승읍 평택항만길 100',
  businessCategory: '도소매·임대업',
  businessItem: '지게차 매매 및 임대·정비',
  tel: '031-681-8899',
  fax: '031-681-8890',
  taxEmail: 'fl-demo@ebro.run',
  allowedPages: [...ALL_FL_PAGE_IDS],
  hiddenPages: [],
  features: { bankMatchingEnabled: true },
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapRows<T>(
  rows: Record<string, unknown>[] | null | undefined,
  numFields: string[] = []
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const c = snakeToCamelRow<Record<string, unknown>>(r);
    for (const f of numFields) {
      if (f in c && c[f] !== null && c[f] !== undefined) {
        c[f] = num(c[f]);
      }
    }
    return c as T;
  });
}

export interface AppShellContextValue {
  isLoading: boolean;
  currentUser: FlUser | null;
  tenantProfile: TenantProfile;
  datasets: FlDatasets;
  activePage: FlPageId;
  theme: 'light' | 'dark';
  agentOnline: boolean;
  agentInfo: AgentHealthInfo | null;
  visibleMenuGroups: MenuGroupDef[];
  visiblePageSet: Set<FlPageId>;
  errorModalMessage: string | null;
  toasts: ToastItem[];
  navigateTo: (pageId: FlPageId) => void;
  toggleTheme: () => void;
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
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export const AppShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<FlUser | null>(null);
  const [tenantProfile, setTenantProfile] = useState<TenantProfile>(DEFAULT_TENANT_PROFILE);
  const [datasets, setDatasets] = useState<FlDatasets>(EMPTY_DATASETS);
  const [activePage, setActivePage] = useState<FlPageId>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = getVaultItem(THEME_STORAGE_KEY, 'light');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentInfo, setAgentInfo] = useState<AgentHealthInfo | null>(null);
  const [errorModalMessage, setErrorModalMessage] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    registerErrorModalHandler((msg) => setErrorModalMessage(msg));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setVaultItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const unsub = subscribeAgentStatus((online, info) => {
      setAgentOnline(online);
      setAgentInfo(info);
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

  const fetchTenantProfile = useCallback(async () => {
    const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const sub = host.includes('.ebro.run') ? host.split('.')[0] : 'fl-demo';
    const res = await centralSupabase.from('tenants').select('*');
    if (!res.error && Array.isArray(res.data)) {
      const matched =
        res.data.find((t: Record<string, unknown>) => t.subdomain === sub && t.solutionType === 'FL') ||
        res.data.find((t: Record<string, unknown>) => t.id === DEFAULT_TENANT_ID);
      if (matched) {
        setTenantProfile({
          id: String(matched.id || DEFAULT_TENANT_ID),
          tenantCode: String(matched.tenantCode || 'EBRO_FL'),
          subdomain: String(matched.subdomain || 'fl-demo'),
          solutionType: String(matched.solutionType || 'FL'),
          displayName: String(matched.displayName || 'eBroFL 렌탈'),
          corporateName: String(matched.corporateName || DEFAULT_TENANT_PROFILE.corporateName),
          businessNumber: String(matched.businessNumber || DEFAULT_TENANT_PROFILE.businessNumber),
          representativeName: String(matched.representativeName || DEFAULT_TENANT_PROFILE.representativeName),
          businessAddress: String(matched.businessAddress || DEFAULT_TENANT_PROFILE.businessAddress),
          businessCategory: String(matched.businessCategory || DEFAULT_TENANT_PROFILE.businessCategory),
          businessItem: String(matched.businessItem || DEFAULT_TENANT_PROFILE.businessItem),
          tel: String(matched.tel || DEFAULT_TENANT_PROFILE.tel),
          fax: String(matched.fax || DEFAULT_TENANT_PROFILE.fax),
          taxEmail: String(matched.taxEmail || DEFAULT_TENANT_PROFILE.taxEmail),
          stampImageUrl: matched.stampImageUrl ? String(matched.stampImageUrl) : undefined,
          stampBase64: matched.stampBase64 ? String(matched.stampBase64) : undefined,
          allowedPages: Array.isArray(matched.allowedPages) && matched.allowedPages.length > 0
            ? matched.allowedPages
            : [...ALL_FL_PAGE_IDS],
          hiddenPages: Array.isArray(matched.hiddenPages) ? matched.hiddenPages : [],
          features: (matched.features || { bankMatchingEnabled: true }) as TenantProfile['features'],
        });
      }
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [
      deptRes,
      usrRes,
      permRes,
      polRes,
      reqRes,
      tplRes,
      prtRes,
      siteRes,
      itemRes,
      catRes,
      fxRes,
      purRes,
      purlRes,
      logRes,
      apRes,
      unitRes,
      movRes,
      qtRes,
      ctrRes,
      ctrlRes,
      fulRes,
      tacRes,
      mntRes,
      evtRes,
      bilRes,
      colRes,
      btxRes,
      flsRes,
      flschRes,
    ] = await Promise.all([
      flSupabase.from('departments').select('*').order('id'),
      flSupabase.from('users').select('*').order('tier_level', { ascending: false }),
      flSupabase.from('user_permissions').select('*'),
      flSupabase.from('approval_policies').select('*').order('id'),
      flSupabase.from('approval_requests').select('*').order('requested_at', { ascending: false }),
      flSupabase.from('document_templates').select('*').order('id'),
      flSupabase.from('partners').select('*').order('name'),
      flSupabase.from('partner_sites').select('*').order('id'),
      flSupabase.from('item_masters').select('*').order('item_category'),
      flSupabase.from('catalog_packages').select('*').order('id'),
      flSupabase.from('exchange_rates').select('*').order('rate_date', { ascending: false }),
      flSupabase.from('purchases').select('*').order('effective_date', { ascending: false }),
      flSupabase.from('purchase_lines').select('*'),
      flSupabase.from('logistics_dispatches').select('*').order('dispatch_date', { ascending: false }),
      flSupabase.from('ap_payables').select('*').order('accrual_date', { ascending: false }),
      flSupabase.from('inventory_units').select('*').order('acquisition_date'),
      flSupabase.from('stock_movements').select('*').order('effective_date', { ascending: false }),
      flSupabase.from('quotations').select('*').order('quote_date', { ascending: false }),
      flSupabase.from('contracts').select('*').order('contract_date', { ascending: false }),
      flSupabase.from('contract_lines').select('*').order('line_no'),
      flSupabase.from('fulfillments').select('*').order('created_at', { ascending: false }),
      flSupabase.from('trade_aftercare_cases').select('*').order('effective_date', { ascending: false }),
      flSupabase.from('rental_maintenances').select('*').order('effective_date', { ascending: false }),
      flSupabase.from('asset_events').select('*').order('effective_date', { ascending: false }),
      flSupabase.from('billings').select('*').order('billing_date', { ascending: false }),
      flSupabase.from('collections').select('*').order('collection_date', { ascending: false }),
      flSupabase.from('bank_transactions').select('*').order('tx_date', { ascending: false }),
      flSupabase.from('finance_leases').select('*').order('start_date', { ascending: false }),
      flSupabase.from('finance_lease_schedules').select('*').order('installment_no'),
    ]);

    const depts = mapRows<FlDepartment>(deptRes.data);
    const deptNameMap = new Map(depts.map((d) => [d.id, d.name]));

    const users = mapRows<FlUser>(usrRes.data, ['tierLevel']).map((u) => ({
      ...u,
      tierLevel: Math.min(7, Math.max(1, Number(u.tierLevel || 1))) as TierLevel,
      departmentName: u.departmentId ? deptNameMap.get(u.departmentId) || '' : '',
    }));

    setDatasets({
      departments: depts,
      users,
      userPermissions: mapRows<FlUserPermission>(permRes.data, ['tierLevel']),
      approvalPolicies: mapRows<FlApprovalPolicy>(polRes.data, ['requiredTier']),
      approvalRequests: mapRows<FlApprovalRequest>(reqRes.data, ['requiredTier', 'requesterTier', 'approverTier']),
      documentTemplates: mapRows<FlDocumentTemplate>(tplRes.data),
      partners: mapRows<FlPartner>(prtRes.data, ['defaultClosingDay', 'defaultPaymentDueDay', 'defaultPaymentMonthOffset']),
      partnerSites: mapRows<FlPartnerSite>(siteRes.data),
      itemMasters: mapRows<FlItemMaster>(itemRes.data, [
        'tonnage',
        'standardCostKrw',
        'dealerPriceKrw',
        'retailPriceKrw',
        'standardMonthlyRentalKrw',
        'standardDailyRentalKrw',
        'depreciationMonths',
        'residualValueKrw',
        'safetyStock',
      ]),
      catalogPackages: mapRows<FlCatalogPackage>(catRes.data),
      exchangeRates: mapRows<FlExchangeRate>(fxRes.data, ['baseRateKrw', 'ttSellingRate']),
      purchases: mapRows<FlPurchase>(purRes.data, [
        'fxRate',
        'foreignMerchandiseTotal',
        'krwMerchandiseTotal',
        'customsDutyKrw',
        'oceanFreightKrw',
        'clearanceFeeKrw',
        'inlandFreightKrw',
        'totalLandedCostKrw',
      ]),
      purchaseLines: mapRows<FlPurchaseLine>(purlRes.data, [
        'quantity',
        'foreignUnitPrice',
        'foreignAmount',
        'allocatedMerchandiseKrw',
        'allocatedAncillaryKrw',
        'landedUnitCostKrw',
        'landedTotalCostKrw',
      ]),
      logisticsDispatches: mapRows<FlLogisticsDispatch>(logRes.data, ['transportCostKrw', 'vatKrw', 'customerChargeKrw']),
      apPayables: mapRows<FlApPayable>(apRes.data, [
        'bookedFxRate',
        'foreignAmount',
        'supplyAmountKrw',
        'vatAmountKrw',
        'totalAmountKrw',
        'paidAmountKrw',
        'settledFxRate',
        'fxGainLossKrw',
      ]),
      inventoryUnits: mapRows<FlInventoryUnit>(unitRes.data, [
        'qtyOnHand',
        'qtyReserved',
        'unitCostKrw',
        'accumulatedDepreciationKrw',
        'bookValueKrw',
        'depreciationMonths',
        'residualValueKrw',
        'subleaseMonthlyCostKrw',
        'operatingHours',
        'monthlyRentalFeeKrw',
        'dailyRentalFeeKrw',
      ]),
      stockMovements: mapRows<FlStockMovement>(movRes.data, ['qtyDelta', 'unitCostKrw', 'amountKrw']),
      quotations: mapRows<FlQuotation>(qtRes.data, ['rentalMonths', 'supplyAmountKrw', 'vatAmountKrw', 'totalAmountKrw']),
      contracts: mapRows<FlContract>(ctrRes.data, [
        'closingDay',
        'paymentDueDay',
        'paymentMonthOffset',
        'supplyAmountKrw',
        'vatAmountKrw',
        'totalAmountKrw',
        'monthlyRentalKrw',
        'dailyRentalKrw',
      ]),
      contractLines: mapRows<FlContractLine>(ctrlRes.data, [
        'lineNo',
        'quantity',
        'fulfilledQty',
        'unitPriceKrw',
        'supplyAmountKrw',
        'vatAmountKrw',
        'totalAmountKrw',
      ]),
      fulfillments: mapRows<FlFulfillment>(fulRes.data, ['quantity', 'cogsAmountKrw']),
      tradeAftercareCases: mapRows<FlTradeAftercareCase>(tacRes.data, ['refundSupplyKrw', 'refundVatKrw']),
      rentalMaintenances: mapRows<FlRentalMaintenance>(mntRes.data, [
        'operatingHours',
        'partsCostKrw',
        'laborCostKrw',
        'externalCostKrw',
        'totalCostKrw',
        'customerChargeKrw',
      ]),
      assetEvents: mapRows<FlAssetEvent>(evtRes.data, ['operatingHours', 'deltaAmountKrw']),
      billings: mapRows<FlBilling>(bilRes.data, [
        'supplyAmountKrw',
        'vatAmountKrw',
        'totalAmountKrw',
        'paidAmountKrw',
        'unpaidBalanceKrw',
      ]),
      collections: mapRows<FlCollection>(colRes.data, ['amountKrw']),
      bankTransactions: mapRows<FlBankTransaction>(btxRes.data, ['amountKrw']),
      financeLeases: mapRows<FlFinanceLease>(flsRes.data, [
        'principalAmountKrw',
        'annualInterestRate',
        'termMonths',
        'paymentDay',
        'remainingPrincipalKrw',
      ]),
      financeLeaseSchedules: mapRows<FlFinanceLeaseSchedule>(flschRes.data, [
        'installmentNo',
        'openingPrincipalKrw',
        'principalPaymentKrw',
        'interestExpenseKrw',
        'totalInstallmentKrw',
        'endingPrincipalKrw',
      ]),
    });

    // 세션 유지 사용자 최신 DB 속성 동기화
    const rawSess = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (rawSess) {
      const parsed = verifySessionUser<{ id: string }>(rawSess);
      if (parsed) {
        const fresh = users.find((u) => u.id === parsed.id && u.isActive);
        if (fresh) {
          setCurrentUser(fresh);
        } else {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          setCurrentUser(null);
        }
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await Promise.all([fetchTenantProfile(), refreshAll()]);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchTenantProfile, refreshAll]);

  const loginWithCredentials = useCallback(
    async (loginId: string, password: string) => {
      const target = datasets.users.find((u) => u.loginId === loginId.trim() && u.isActive);
      if (!target) {
        throw new Error('등록되지 않은 사용자 계정이거나 비활성 상태입니다.');
      }
      const ok = verifyPassword(password, target.passwordHash);
      if (!ok) {
        throw new Error('비밀번호가 일치하지 않습니다.');
      }
      const signed = signSessionUser({ id: target.id, role: `T${target.tierLevel}` });
      safeLocalStorageSet(SESSION_STORAGE_KEY, signed);
      setCurrentUser(target);
      setActivePage('dashboard');
      notifyToast(`${target.name} · ${TIER_LABELS[target.tierLevel]} 로그인 완료`, 'success');
    },
    [datasets.users, notifyToast]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setCurrentUser(null);
    setActivePage('dashboard');
  }, []);

  const canViewPage = useCallback(
    (pageId: FlPageId): boolean => {
      if (tenantProfile.hiddenPages.includes(pageId)) return false;
      if (pageId === 'bank_matching' && tenantProfile.features?.bankMatchingEnabled === false) {
        return false;
      }
      if (tenantProfile.allowedPages.length > 0 && !tenantProfile.allowedPages.includes(pageId)) {
        return false;
      }
      if (!currentUser) return false;
      if (currentUser.tierLevel >= 7) return true;
      const userRule = datasets.userPermissions.find((p) => p.userId === currentUser.id && p.pageId === pageId);
      if (userRule) return userRule.canView;
      const tierRule = datasets.userPermissions.find(
        (p) => !p.userId && p.tierLevel === currentUser.tierLevel && p.pageId === pageId
      );
      return tierRule ? tierRule.canView : true;
    },
    [currentUser, datasets.userPermissions, tenantProfile]
  );

  const canEditPage = useCallback(
    (pageId: FlPageId): boolean => {
      if (!currentUser) return false;
      if (currentUser.tierLevel >= 7) return true;
      const userRule = datasets.userPermissions.find((p) => p.userId === currentUser.id && p.pageId === pageId);
      if (userRule) return userRule.canEdit;
      const tierRule = datasets.userPermissions.find(
        (p) => !p.userId && p.tierLevel === currentUser.tierLevel && p.pageId === pageId
      );
      return tierRule ? tierRule.canEdit : currentUser.tierLevel >= 2;
    },
    [currentUser, datasets.userPermissions]
  );

  const canApprovePage = useCallback(
    (pageId: FlPageId): boolean => {
      if (!currentUser) return false;
      if (currentUser.tierLevel >= 7) return true;
      const userRule = datasets.userPermissions.find((p) => p.userId === currentUser.id && p.pageId === pageId);
      if (userRule) return userRule.canApprove;
      const tierRule = datasets.userPermissions.find(
        (p) => !p.userId && p.tierLevel === currentUser.tierLevel && p.pageId === pageId
      );
      return tierRule ? tierRule.canApprove : currentUser.tierLevel >= 3;
    },
    [currentUser, datasets.userPermissions]
  );

  const visibleMenuGroups = useMemo(() => {
    return FL_MENU_GROUPS.map((grp) => ({
      ...grp,
      items: grp.items.filter((item) => canViewPage(item.pageId)),
    })).filter((grp) => grp.items.length > 0);
  }, [canViewPage]);

  const visiblePageSet = useMemo(() => {
    const s = new Set<FlPageId>();
    visibleMenuGroups.forEach((g) => g.items.forEach((i) => s.add(i.pageId)));
    return s;
  }, [visibleMenuGroups]);

  const navigateTo = useCallback(
    (pageId: FlPageId) => {
      if (!canViewPage(pageId)) {
        notifyToast('현재 직급 티어에서는 해당 화면 조회 권한이 없습니다.', 'error');
        return;
      }
      setActivePage(pageId);
    },
    [canViewPage, notifyToast]
  );

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
          .update(
            camelToSnakeRow({
              features: patch.features ?? tenantProfile.features,
              taxEmail: patch.taxEmail ?? tenantProfile.taxEmail,
            })
          )
          .eq('id', tenantProfile.id)
      );
      await fetchTenantProfile();
      notifyToast('설정 저장 완료', 'success');
    },
    [fetchTenantProfile, notifyToast, tenantProfile]
  );

  const value: AppShellContextValue = {
    isLoading,
    currentUser,
    tenantProfile,
    datasets,
    activePage,
    theme,
    agentOnline,
    agentInfo,
    visibleMenuGroups,
    visiblePageSet,
    errorModalMessage,
    toasts,
    navigateTo,
    toggleTheme: () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light')),
    loginWithCredentials,
    logout,
    refreshAll,
    notifyToast,
    closeErrorModal: () => setErrorModalMessage(null),
    canViewPage,
    canEditPage,
    canApprovePage,
    formatMoney,
    tierLabel,
    updateTenantConfig,
  };

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
};

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used inside AppShellProvider');
  return ctx;
}
