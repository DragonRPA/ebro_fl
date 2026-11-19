import {
  DEFAULT_TENANT_ID,
  centralSupabase,
  selectAllFlRows,
  setActiveFlTenantId,
  snakeToCamelRow,
} from './supabase';
import { ensureFlTenantBootstrapped } from '../services/tenantBootstrapService';
import { decryptSecret } from '../utils/cryptoVault';
import {
  ALL_FL_PAGE_IDS,
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
  type TenantProfile,
  type TierLevel,
} from '../types/domain';

export const SESSION_STORAGE_KEY = 'ebro_fl_v2_session';
export const TENANT_OVERRIDE_STORAGE_KEY = 'ebro_fl_tenant_override';

export function getTenantSessionStorageKey(tenantId: string): string {
  return tenantId === DEFAULT_TENANT_ID
    ? SESSION_STORAGE_KEY
    : `${SESSION_STORAGE_KEY}::${tenantId}`;
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

export const EMPTY_DATASETS: FlDatasets = {
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

export const DEFAULT_TENANT_PROFILE: TenantProfile = {
  id: DEFAULT_TENANT_ID,
  tenantCode: 'EBRO_FL',
  subdomain: 'fl-demo',
  solutionType: 'FL',
  displayName: '이브로지게차',
  corporateName: '주식회사 이브로지게차',
  businessNumber: '123-81-45678',
  representativeName: '이정용',
  businessAddress: '경기도 평택시 포승읍 평택항만길 100',
  businessCategory: '도소매업',
  businessItem: '지게차 및 부품 매매',
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

export async function fetchActiveTenantProfile(): Promise<TenantProfile> {
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  const sub = host.includes('.ebro.run') ? host.split('.')[0] : 'fl-demo';
  let tenantQuery = '';
  if (typeof window !== 'undefined') {
    const sp = new URLSearchParams(window.location.search);
    const rawParam = (sp.get('tenant') ?? sp.get('t') ?? '').trim().toLowerCase();
    if (rawParam) {
      if (rawParam === 'default' || rawParam === 'reset') {
        window.sessionStorage.removeItem(TENANT_OVERRIDE_STORAGE_KEY);
        tenantQuery = '';
      } else {
        window.sessionStorage.setItem(TENANT_OVERRIDE_STORAGE_KEY, rawParam);
        tenantQuery = rawParam;
      }
    } else {
      tenantQuery = (window.sessionStorage.getItem(TENANT_OVERRIDE_STORAGE_KEY) || '')
        .trim()
        .toLowerCase();
    }
  }

  const res = await centralSupabase
    .from('tenants')
    .select('*')
    .or(`solutionType.ilike.fl,id.eq.${DEFAULT_TENANT_ID}`);
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
      const matchedFeatures = (matched.features || { bankMatchingEnabled: true }) as TenantProfile['features'];
      const matchedRentalEnabled = matchedFeatures?.rentalEnabled !== false;
      const rawDisp = String(matched.displayName || '').trim();
      const rawCorp = String(matched.corporateName || '').trim();
      const rawCat = String(matched.businessCategory || '').trim();
      const rawItem = String(matched.businessItem || '').trim();
      const resolvedProfile: TenantProfile = {
        id: String(matched.id || DEFAULT_TENANT_ID),
        tenantCode: String(matched.tenantCode || 'EBRO_FL'),
        subdomain: String(matched.subdomain || 'fl-demo'),
        solutionType: String(matched.solutionType || 'FL'),
        displayName: matchedRentalEnabled
          ? rawDisp && rawDisp !== 'eBroFL 렌탈'
            ? rawDisp
            : '이브로지게차 렌탈'
          : rawDisp && rawDisp !== 'eBroFL 렌탈' && rawDisp !== '이브로지게차 렌탈'
            ? rawDisp
            : '이브로지게차',
        corporateName: matchedRentalEnabled
          ? rawCorp || '주식회사 이브로지게차렌탈'
          : rawCorp && rawCorp !== '주식회사 이브로지게차렌탈'
            ? rawCorp
            : '주식회사 이브로지게차',
        businessNumber: String(matched.businessNumber || DEFAULT_TENANT_PROFILE.businessNumber),
        representativeName: String(matched.representativeName || DEFAULT_TENANT_PROFILE.representativeName),
        businessAddress: String(matched.businessAddress || DEFAULT_TENANT_PROFILE.businessAddress),
        businessCategory: matchedRentalEnabled
          ? rawCat || '도소매·임대업'
          : rawCat && rawCat !== '도소매·임대업'
            ? rawCat
            : '도소매업',
        businessItem: matchedRentalEnabled
          ? rawItem || '지게차 매매 및 임대·정비'
          : rawItem && rawItem !== '지게차 매매 및 임대·정비'
            ? rawItem
            : '지게차 및 부품 매매',
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
        specialFeatures: Array.isArray(matched.specialFeatures)
          ? (matched.specialFeatures as string[])
          : undefined,
        features: (matched.features || { bankMatchingEnabled: true }) as TenantProfile['features'],
      };
      setActiveFlTenantId(resolvedProfile.id);
      return resolvedProfile;
    }
  }
  setActiveFlTenantId(DEFAULT_TENANT_PROFILE.id);
  return DEFAULT_TENANT_PROFILE;
}

function parseDepartmentsAndUsers(
  deptRows: Record<string, unknown>[] | null | undefined,
  userRows: Record<string, unknown>[] | null | undefined
): { departments: FlDepartment[]; users: FlUser[] } {
  const rawDepts = mapRows<FlDepartment>(deptRows, ['sortOrder']);
  const deptNameMap = new Map(rawDepts.map((d) => [d.id, d.name]));

  const users = mapRows<FlUser>(userRows, [
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
    annualLeaveGrant:
      u.annualLeaveGrant !== undefined && u.annualLeaveGrant !== null ? Number(u.annualLeaveGrant) : 15,
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
  const departments = rawDepts
    .map((d) => ({
      ...d,
      sortOrder: Number(d.sortOrder ?? 100),
      functionalTags: Array.isArray(d.functionalTags) ? d.functionalTags : [],
      managerName: d.managerId ? userNameMap.get(d.managerId) || '' : '',
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  return { departments, users };
}

export async function loadPreLoginAuthUsers(resolvedProfile: TenantProfile): Promise<{
  departments: FlDepartment[];
  users: FlUser[];
}> {
  await ensureFlTenantBootstrapped(resolvedProfile);
  const [deptRes, usrRes] = await Promise.all([
    selectAllFlRows('departments', { orderCol: 'id' }),
    selectAllFlRows('users', { orderCol: 'tier_level', ascending: false }),
  ]);
  return parseDepartmentsAndUsers(deptRes.data, usrRes.data);
}

export async function loadAllFlDatasets(resolvedProfile: TenantProfile): Promise<FlDatasets> {
  await ensureFlTenantBootstrapped(resolvedProfile);

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
    hrHistRes,
  ] = await Promise.all([
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
    selectAllFlRows('hr_histories', { orderCol: 'created_at', ascending: false }),
  ]);

  const hrHistories = mapRows<FlHrHistory>(hrHistRes.data);
  const { departments: depts, users } = parseDepartmentsAndUsers(deptRes.data, usrRes.data);

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
    'warrantyMonths',
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

  return {
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
  };
}
