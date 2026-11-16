import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_TENANT_ID,
  camelToSnakeRow,
  centralSupabase,
  execDbMutation,
  flSupabase,
  newId,
  registerErrorModalHandler,
  selectAllFlRows,
  snakeToCamelRow,
} from './supabase';
import {
  decryptSecret,
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
import { setR2TenantContext } from '../services/businessLicenseOcrService';
import {
  ALL_FL_PAGE_IDS,
  FL_MENU_GROUPS,
  TIER_LABELS,
  defaultTierPagePermission,
  normalizePaymentMethod,
  offsetToPaymentCycle,
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
  type FlHrHistory,
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
  hrHistories: FlHrHistory[];
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
  hrHistories: [],
};

const DEFAULT_TENANT_PROFILE: TenantProfile = {
  id: DEFAULT_TENANT_ID,
  tenantCode: 'EBRO_FL',
  subdomain: 'fl-demo',
  solutionType: 'FL',
  displayName: '이브로지게차 렌탈',
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

const AppShellContext = createContext<AppShellContextValue | null>(null);

const MAX_NAV_HISTORY = 50;

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
    const tenantQuery =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('tenant')?.trim().toLowerCase() || ''
        : '';
    const res = await centralSupabase.from('tenants').select('*');
    if (!res.error && Array.isArray(res.data)) {
      const flRows = res.data.filter(
        (t: Record<string, unknown>) => String(t.solutionType || '').toUpperCase() === 'FL'
      );
      const matched =
        (tenantQuery
          ? flRows.find(
              (t: Record<string, unknown>) =>
                String(t.id || '').toLowerCase() === tenantQuery ||
                String(t.tenantCode || '').toLowerCase() === tenantQuery ||
                String(t.subdomain || '').toLowerCase() === tenantQuery
            )
          : undefined) ||
        (host
          ? flRows.find((t: Record<string, unknown>) => {
              const featuresObj = t.features as Record<string, unknown> | undefined;
              const customDomain = String(featuresObj?.customDomain || '').trim().toLowerCase();
              return Boolean(customDomain) && customDomain === host;
            })
          : undefined) ||
        flRows.find((t: Record<string, unknown>) => String(t.subdomain || '').toLowerCase() === sub) ||
        res.data.find((t: Record<string, unknown>) => t.id === DEFAULT_TENANT_ID);
      if (matched) {
        const rawCiUrl = typeof matched.ciUrl === 'string' ? matched.ciUrl.trim() : '';
        const rawLogoUrl = typeof matched.logoUrl === 'string' ? matched.logoUrl.trim() : '';
        setTenantProfile({
          id: String(matched.id || DEFAULT_TENANT_ID),
          tenantCode: String(matched.tenantCode || 'EBRO_FL'),
          subdomain: String(matched.subdomain || 'fl-demo'),
          solutionType: String(matched.solutionType || 'FL'),
          displayName:
            matched.displayName && matched.displayName !== 'eBroFL 렌탈'
              ? String(matched.displayName)
              : '이브로지게차 렌탈',
          corporateName: String(matched.corporateName || DEFAULT_TENANT_PROFILE.corporateName),
          businessNumber: String(matched.businessNumber || DEFAULT_TENANT_PROFILE.businessNumber),
          representativeName: String(matched.representativeName || DEFAULT_TENANT_PROFILE.representativeName),
          businessAddress: String(matched.businessAddress || DEFAULT_TENANT_PROFILE.businessAddress),
          businessCategory: String(matched.businessCategory || DEFAULT_TENANT_PROFILE.businessCategory),
          businessItem: String(matched.businessItem || DEFAULT_TENANT_PROFILE.businessItem),
          tel: String(matched.tel || DEFAULT_TENANT_PROFILE.tel),
          fax: String(matched.fax || DEFAULT_TENANT_PROFILE.fax),
          taxEmail: String(matched.taxEmail || DEFAULT_TENANT_PROFILE.taxEmail),
          ciUrl: rawCiUrl || undefined,
          logoUrl: rawLogoUrl || undefined,
          stampImageUrl: matched.stampImageUrl ? String(matched.stampImageUrl) : undefined,
          stampBase64: matched.stampBase64 ? String(matched.stampBase64) : undefined,
          targetRepo: matched.targetRepo ? String(matched.targetRepo) : undefined,
          r2Config: ((matched.r2Config || (matched.features as Record<string, unknown> | undefined)?.r2Config) as TenantProfile['r2Config']) || undefined,
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
      ,
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
      fetchTenantProfile(),
      selectAllFlRows('departments', { orderCol: 'id' }),
      selectAllFlRows('users', { orderCol: 'tier_level', ascending: false }),
      selectAllFlRows('user_permissions'),
      selectAllFlRows('approval_policies', { orderCol: 'id' }),
      selectAllFlRows('approval_requests', { orderCol: 'requested_at', ascending: false }),
      selectAllFlRows('document_templates', { orderCol: 'id' }),
      selectAllFlRows('partners', { orderCol: 'name' }),
      selectAllFlRows('partner_sites', { orderCol: 'id' }),
      selectAllFlRows('item_masters', { orderCol: 'item_category' }),
      selectAllFlRows('catalog_packages', { orderCol: 'id' }),
      selectAllFlRows('exchange_rates', { orderCol: 'rate_date', ascending: false }),
      selectAllFlRows('purchases', { orderCol: 'effective_date', ascending: false }),
      selectAllFlRows('purchase_lines'),
      selectAllFlRows('logistics_dispatches', { orderCol: 'dispatch_date', ascending: false }),
      selectAllFlRows('ap_payables', { orderCol: 'accrual_date', ascending: false }),
      selectAllFlRows('inventory_units', { orderCol: 'acquisition_date' }),
      selectAllFlRows('stock_movements', { orderCol: 'effective_date', ascending: false }),
      selectAllFlRows('quotations', { orderCol: 'quote_date', ascending: false }),
      selectAllFlRows('contracts', { orderCol: 'contract_date', ascending: false }),
      selectAllFlRows('contract_lines', { orderCol: 'line_no' }),
      selectAllFlRows('fulfillments', { orderCol: 'created_at', ascending: false }),
      selectAllFlRows('trade_aftercare_cases', { orderCol: 'effective_date', ascending: false }),
      selectAllFlRows('rental_maintenances', { orderCol: 'effective_date', ascending: false }),
      selectAllFlRows('asset_events', { orderCol: 'effective_date', ascending: false }),
      selectAllFlRows('billings', { orderCol: 'billing_date', ascending: false }),
      selectAllFlRows('collections', { orderCol: 'collection_date', ascending: false }),
      selectAllFlRows('bank_transactions', { orderCol: 'tx_date', ascending: false }),
      selectAllFlRows('finance_leases', { orderCol: 'start_date', ascending: false }),
      selectAllFlRows('finance_lease_schedules', { orderCol: 'installment_no' }),
    ]);
    const hrHistRes = await selectAllFlRows('hr_histories', {
      orderCol: 'created_at',
      ascending: false,
    });

    const hrHistories = mapRows<FlHrHistory>(hrHistRes.data);
    const rawDepts = mapRows<FlDepartment>(deptRes.data, ['sortOrder']);
    const deptNameMap = new Map(rawDepts.map((d) => [d.id, d.name]));

    const users = mapRows<FlUser>(usrRes.data, [
      'tierLevel',
      'baseSalaryKrw',
      'hourlyWageKrw',
      'mealAllowanceKrw',
      'vehicleAllowanceKrw',
      'serviceContractKrw',
      'annualLeaveGrant',
      'annualLeaveUsed',
    ]).map((u) => ({
      ...u,
      tierLevel: Math.min(7, Math.max(1, Number(u.tierLevel || 1))) as TierLevel,
      baseSalaryKrw: Number(u.baseSalaryKrw || 0),
      // 통상임금은 수동 입력 전용이므로 자동계산 없이 저장된 수치 그대로 로드한다.
      hourlyWageKrw: Number(u.hourlyWageKrw || 0),
      mealAllowanceKrw: Number(u.mealAllowanceKrw || 0),
      vehicleAllowanceKrw: Number(u.vehicleAllowanceKrw || 0),
      serviceContractKrw: Number(u.serviceContractKrw || 0),
      annualLeaveGrant: u.annualLeaveGrant !== undefined && u.annualLeaveGrant !== null ? Number(u.annualLeaveGrant) : 15,
      annualLeaveUsed: Number(u.annualLeaveUsed || 0),
      mustChangePassword: Boolean(u.mustChangePassword),
      insNationalPension: u.insNationalPension !== false,
      insHealthInsurance: u.insHealthInsurance !== false,
      insEmploymentInsurance: u.insEmploymentInsurance !== false,
      insIndustrialAccident: u.insIndustrialAccident !== false,
      residentRegNo: u.residentRegNo ? decryptSecret(u.residentRegNo) : null,
      payrollAccountNo: u.payrollAccountNo ? decryptSecret(u.payrollAccountNo) : null,
      departmentName: u.departmentId ? deptNameMap.get(u.departmentId) || '' : '',
    }));
    const userNameMap = new Map(users.map((u) => [u.id, u.name]));
    const depts = rawDepts
      .map((d) => ({
        ...d,
        sortOrder: Number(d.sortOrder ?? 100),
        functionalTags: Array.isArray(d.functionalTags) ? d.functionalTags : [],
        managerName: d.managerId ? userNameMap.get(d.managerId) || '' : '',
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

    const partners = mapRows<FlPartner>(prtRes.data, [
      'defaultClosingDay',
      'defaultPaymentDueDay',
      'defaultPaymentMonthOffset',
    ]).map((p) => ({
      ...p,
      defaultPaymentCycle: offsetToPaymentCycle(p.defaultPaymentMonthOffset, p.defaultPaymentCycle),
      paymentMethod: normalizePaymentMethod(p.paymentMethod),
    }));
    const partnerNameMap = new Map(partners.map((p) => [p.id, p.name]));

    const purchases = mapRows<FlPurchase>(purRes.data, [
      'fxRate',
      'foreignMerchandiseTotal',
      'krwMerchandiseTotal',
      'customsDutyKrw',
      'oceanFreightKrw',
      'clearanceFeeKrw',
      'inlandFreightKrw',
      'totalLandedCostKrw',
    ]).map((r) => ({
      ...r,
      supplierName: partnerNameMap.get(r.supplierId) || r.supplierName,
    }));

    const logisticsDispatches = mapRows<FlLogisticsDispatch>(logRes.data, [
      'transportCostKrw',
      'vatKrw',
      'customerChargeKrw',
    ]).map((r) => ({
      ...r,
      carrierName: (r.carrierPartnerId && partnerNameMap.get(r.carrierPartnerId)) || r.carrierName,
    }));

    const apPayables = mapRows<FlApPayable>(apRes.data, [
      'bookedFxRate',
      'foreignAmount',
      'supplyAmountKrw',
      'vatAmountKrw',
      'totalAmountKrw',
      'paidAmountKrw',
      'settledFxRate',
      'fxGainLossKrw',
    ]).map((r) => ({
      ...r,
      partnerName: partnerNameMap.get(r.partnerId) || r.partnerName,
    }));

    const inventoryUnits = mapRows<FlInventoryUnit>(unitRes.data, [
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
    ]).map((r) => ({
      ...r,
      subleaseSupplierName:
        (r.subleaseSupplierId && partnerNameMap.get(r.subleaseSupplierId)) || r.subleaseSupplierName,
    }));

    const quotations = mapRows<FlQuotation>(qtRes.data, [
      'rentalMonths',
      'supplyAmountKrw',
      'vatAmountKrw',
      'totalAmountKrw',
    ]).map((r) => ({
      ...r,
      partnerName: partnerNameMap.get(r.partnerId) || r.partnerName,
    }));

    const contracts = mapRows<FlContract>(ctrRes.data, [
      'closingDay',
      'paymentDueDay',
      'paymentMonthOffset',
      'supplyAmountKrw',
      'vatAmountKrw',
      'totalAmountKrw',
      'monthlyRentalKrw',
      'dailyRentalKrw',
    ]).map((r) => ({
      ...r,
      paymentCycle: offsetToPaymentCycle(r.paymentMonthOffset, r.paymentCycle),
      paymentMethod: normalizePaymentMethod(r.paymentMethod),
      partnerName: partnerNameMap.get(r.partnerId) || r.partnerName,
    }));

    const fulfillments = mapRows<FlFulfillment>(fulRes.data, ['quantity', 'cogsAmountKrw']).map((r) => ({
      ...r,
      partnerName: partnerNameMap.get(r.partnerId) || r.partnerName,
    }));

    const tradeAftercareCases = mapRows<FlTradeAftercareCase>(tacRes.data, [
      'refundSupplyKrw',
      'refundVatKrw',
    ]).map((r) => ({
      ...r,
      partnerName: partnerNameMap.get(r.partnerId) || r.partnerName,
      supplierName: (r.supplierPartnerId && partnerNameMap.get(r.supplierPartnerId)) || r.supplierName,
    }));

    const rentalMaintenances = mapRows<FlRentalMaintenance>(mntRes.data, [
      'operatingHours',
      'partsCostKrw',
      'laborCostKrw',
      'externalCostKrw',
      'totalCostKrw',
      'customerChargeKrw',
    ]).map((r) => ({
      ...r,
      partnerName: (r.partnerId && partnerNameMap.get(r.partnerId)) || r.partnerName,
    }));

    const billings = mapRows<FlBilling>(bilRes.data, [
      'supplyAmountKrw',
      'vatAmountKrw',
      'totalAmountKrw',
      'paidAmountKrw',
      'unpaidBalanceKrw',
    ]).map((r) => ({
      ...r,
      partnerName: partnerNameMap.get(r.partnerId) || r.partnerName,
    }));

    const collections = mapRows<FlCollection>(colRes.data, ['amountKrw']).map((r) => ({
      ...r,
      partnerName: partnerNameMap.get(r.partnerId) || r.partnerName,
    }));

    const financeLeases = mapRows<FlFinanceLease>(flsRes.data, [
      'principalAmountKrw',
      'annualInterestRate',
      'termMonths',
      'paymentDay',
      'remainingPrincipalKrw',
    ]).map((r) => ({
      ...r,
      lenderName: partnerNameMap.get(r.lenderPartnerId) || r.lenderName,
    }));

    setDatasets({
      departments: depts,
      hrHistories,
      users,
      userPermissions: mapRows<FlUserPermission>(permRes.data, ['tierLevel']),
      approvalPolicies: mapRows<FlApprovalPolicy>(polRes.data, ['requiredTier']),
      approvalRequests: mapRows<FlApprovalRequest>(reqRes.data, ['requiredTier', 'requesterTier', 'approverTier']),
      documentTemplates: mapRows<FlDocumentTemplate>(tplRes.data),
      partners,
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
      ]).map((it) => ({
        ...it,
        itemDomain:
          it.itemDomain === 'RENTAL' || it.itemDomain === 'BOTH' ? it.itemDomain : 'TRADE',
      })),
      catalogPackages: mapRows<FlCatalogPackage>(catRes.data),
      exchangeRates: mapRows<FlExchangeRate>(fxRes.data, ['baseRateKrw', 'ttSellingRate']),
      purchases,
      purchaseLines: mapRows<FlPurchaseLine>(purlRes.data, [
        'quantity',
        'foreignUnitPrice',
        'foreignAmount',
        'allocatedMerchandiseKrw',
        'allocatedAncillaryKrw',
        'landedUnitCostKrw',
        'landedTotalCostKrw',
      ]),
      logisticsDispatches,
      apPayables,
      inventoryUnits,
      stockMovements: mapRows<FlStockMovement>(movRes.data, ['qtyDelta', 'unitCostKrw', 'amountKrw']),
      quotations,
      contracts,
      contractLines: mapRows<FlContractLine>(ctrlRes.data, [
        'lineNo',
        'quantity',
        'fulfilledQty',
        'unitPriceKrw',
        'supplyAmountKrw',
        'vatAmountKrw',
        'totalAmountKrw',
      ]),
      fulfillments,
      tradeAftercareCases,
      rentalMaintenances,
      assetEvents: mapRows<FlAssetEvent>(evtRes.data, ['operatingHours', 'deltaAmountKrw']),
      billings,
      collections,
      bankTransactions: mapRows<FlBankTransaction>(btxRes.data, ['amountKrw']),
      financeLeases,
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
        const fresh = users.find((u) => u.id === parsed.id && u.isActive && u.status === 'ACTIVE');
        if (fresh) {
          setCurrentUser(fresh);
        } else {
          window.localStorage.removeItem(SESSION_STORAGE_KEY);
          setCurrentUser(null);
        }
      }
    }
  }, [fetchTenantProfile]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await refreshAll();
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshAll]);

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
      const signed = signSessionUser({ id: target.id, role: `T${target.tierLevel}` });
      safeLocalStorageSet(SESSION_STORAGE_KEY, signed);
      setCurrentUser(target);
      resetNavHistory();
      notifyToast(`${target.name} · ${TIER_LABELS[target.tierLevel]} 로그인 완료`, 'success');
    },
    [datasets.users, notifyToast, resetNavHistory]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setCurrentUser(null);
    resetNavHistory();
  }, [resetNavHistory]);

  const canViewPage = useCallback(
    (pageId: FlPageId): boolean => {
      if (tenantProfile.hiddenPages.includes(pageId)) return false;
      if (pageId === 'bank_matching' && tenantProfile.features?.bankMatchingEnabled === false) {
        return false;
      }
      if (tenantProfile.allowedPages.length > 0) {
        const isSplitItemPage = pageId === 'trade_item_masters' || pageId === 'rental_item_masters';
        const hasAccess =
          tenantProfile.allowedPages.includes(pageId) ||
          (isSplitItemPage && tenantProfile.allowedPages.includes('item_masters'));
        if (!hasAccess) {
          return false;
        }
      }
      if (!currentUser) return false;
      if (currentUser.tierLevel >= 7) return true;
      const userRule = datasets.userPermissions.find((p) => p.userId === currentUser.id && p.pageId === pageId);
      if (userRule) return userRule.canView;
      const tierRule = datasets.userPermissions.find(
        (p) => !p.userId && p.tierLevel === currentUser.tierLevel && p.pageId === pageId
      );
      return tierRule ? tierRule.canView : defaultTierPagePermission(pageId, currentUser.tierLevel).canView;
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
      return tierRule ? tierRule.canEdit : defaultTierPagePermission(pageId, currentUser.tierLevel).canEdit;
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
      return tierRule ? tierRule.canApprove : defaultTierPagePermission(pageId, currentUser.tierLevel).canApprove;
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

  const value: AppShellContextValue = {
    isLoading,
    currentUser,
    tenantProfile,
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
    closeErrorModal: () => setErrorModalMessage(null),
    canViewPage,
    canEditPage,
    canApprovePage,
    formatMoney,
    tierLabel,
    updateTenantConfig,
    changeOwnPassword,
    updateOwnContactInfo,
  };

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
};

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used inside AppShellProvider');
  return ctx;
}
