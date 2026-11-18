// eBroFL v2.0 — 조달·재고·유통·렌탈·채권·채무·리스 원장 도메인 타입 SSOT
import type {
  CurrencyCode,
  ItemCategory,
  ManagementType,
  OwnershipDomain,
  PaymentCycleType,
  PaymentMethodType,
  UnitStatus,
} from './domainCoreTypes';

export interface FlPurchase {
  id: string;
  tenantId: string;
  purchaseNo: string;
  purchaseType: 'IMPORT' | 'DOMESTIC';
  supplierId: string;
  supplierName: string;
  targetDomain: 'TRADE' | 'RENTAL';
  blNo?: string | null;
  lcNo?: string | null;
  currencyCode: CurrencyCode;
  fxRate: number;
  fxDate?: string | null;
  foreignMerchandiseTotal: number;
  krwMerchandiseTotal: number;
  customsDutyKrw: number;
  oceanFreightKrw: number;
  clearanceFeeKrw: number;
  inlandFreightKrw: number;
  totalLandedCostKrw: number;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlPurchaseLine {
  id: string;
  tenantId: string;
  purchaseId: string;
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory: ItemCategory;
  managementType: ManagementType;
  quantity: number;
  foreignUnitPrice: number;
  foreignAmount: number;
  allocatedMerchandiseKrw: number;
  allocatedAncillaryKrw: number;
  landedUnitCostKrw: number;
  landedTotalCostKrw: number;
  serialList: string[];
  lotNo?: string | null;
  warehouseLocation: string;
}

export interface FlLogisticsDispatch {
  id: string;
  tenantId: string;
  dispatchNo: string;
  dispatchPurpose: '일반운송' | '납품운송' | '회수운송' | '교환' | '자체이동';
  carrierPartnerId?: string | null;
  carrierName: string;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleNo?: string | null;
  originAddress: string;
  destinationAddress: string;
  relatedRefType?: string | null;
  relatedRefId?: string | null;
  transportCostKrw: number;
  vatKrw: number;
  costBearer: 'OURS' | 'CUSTOMER' | 'SUPPLIER';
  customerChargeKrw: number;
  settlementStatus: 'UNSETTLED' | 'SETTLED' | 'PAID';
  settlementYm?: string | null;
  dispatchDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlApPayable {
  id: string;
  tenantId: string;
  payableNo: string;
  payableType: 'PURCHASE' | 'LOGISTICS' | 'FINANCE_LEASE' | 'SUBLEASE_RENT' | 'EXTERNAL_REPAIR';
  partnerId: string;
  partnerName: string;
  refTable?: string | null;
  refId?: string | null;
  currencyCode: CurrencyCode;
  bookedFxRate: number;
  foreignAmount: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  paidAmountKrw: number;
  settledFxRate?: number | null;
  fxGainLossKrw: number;
  status: 'UNPAID' | 'PARTIAL' | 'PAID';
  dueDate?: string | null;
  accrualDate: string;
  paidDate?: string | null;
  memo?: string | null;
}

export interface FlInventoryUnit {
  id: string;
  tenantId: string;
  unitCode: string;
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory: ItemCategory;
  managementType: ManagementType;
  ownershipDomain: OwnershipDomain;
  serialNo?: string | null;
  lotNo?: string | null;
  qtyOnHand: number;
  qtyReserved: number;
  unitCostKrw: number;
  accumulatedDepreciationKrw: number;
  bookValueKrw: number;
  depreciationMonths: number;
  residualValueKrw: number;
  status: UnitStatus;
  acquisitionType: 'PURCHASE' | 'FINANCE_LEASE' | 'SUBLEASE' | 'ACCOUNT_TRANSFER' | 'RETURN';
  acquisitionDate: string;
  purchaseLineId?: string | null;
  financeLeaseId?: string | null;
  subleaseSupplierId?: string | null;
  subleaseSupplierName?: string | null;
  subleaseMonthlyCostKrw: number;
  currentContractId?: string | null;
  currentPartnerId?: string | null;
  currentSiteId?: string | null;
  warehouseLocation: string;
  operatingHours: number;
  monthlyRentalFeeKrw: number;
  dailyRentalFeeKrw: number;
  warrantyMonths?: number;
  warrantyStartDate?: string | null;
  warrantyEndDate?: string | null;
  warrantyNote?: string | null;
  memo?: string | null;
}

export interface FlStockMovement {
  id: string;
  tenantId: string;
  movementType:
    | 'INBOUND'
    | 'ACCOUNT_TRANSFER'
    | 'TRADE_RESERVE'
    | 'TRADE_OUTBOUND'
    | 'TRADE_RETURN'
    | 'RENTAL_OUTBOUND'
    | 'RENTAL_RETURN'
    | 'EXCHANGE_OUT'
    | 'EXCHANGE_IN'
    | 'REPAIR_OUT'
    | 'DISPOSAL';
  unitId: string;
  itemId: string;
  fromDomain?: string | null;
  toDomain?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  qtyDelta: number;
  unitCostKrw: number;
  amountKrw: number;
  refTable?: string | null;
  refId?: string | null;
  actorId: string;
  actorName: string;
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface QuotationLine {
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory?: ItemCategory;
  managementType?: ManagementType;
  qty: number;
  unitPriceKrw: number;
  supplyAmountKrw: number;
  optionSummary?: string;
}

export interface FlQuotation {
  id: string;
  tenantId: string;
  quoteNo: string;
  quoteDomain: 'TRADE' | 'RENTAL';
  partnerId: string;
  partnerName: string;
  siteId?: string | null;
  salespersonId: string;
  salespersonName: string;
  quoteDate: string;
  validUntil: string;
  rentalMonths: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  lines: QuotationLine[];
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'CANCELLED';
  convertedContractId?: string | null;
  memo?: string | null;
}

export interface FlContract {
  id: string;
  tenantId: string;
  contractNo: string;
  contractDomain: 'TRADE' | 'RENTAL';
  quotationId?: string | null;
  partnerId: string;
  partnerName: string;
  siteId?: string | null;
  siteName?: string | null;
  siteAddress?: string | null;
  salespersonId: string;
  salespersonName: string;
  contractDate: string;
  startDate: string;
  endDate: string;
  closingDay: number;
  paymentCycle: PaymentCycleType;
  paymentDueDay: number;
  paymentMonthOffset: number;
  paymentMethod: PaymentMethodType | string;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  monthlyRentalKrw: number;
  dailyRentalKrw: number;
  status: 'DRAFT' | 'ACTIVE' | 'FULFILLING' | 'COMPLETED' | 'TERMINATED' | 'CANCELLED';
  specialTerms?: string | null;
  memo?: string | null;
}

export interface FlContractLine {
  id: string;
  tenantId: string;
  contractId: string;
  lineNo: number;
  itemId: string;
  sku: string;
  itemName: string;
  itemCategory: ItemCategory;
  managementType: ManagementType;
  quantity: number;
  fulfilledQty: number;
  unitPriceKrw: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  optionSummary?: string | null;
  warrantyMonths?: number;
  warrantyNote?: string | null;
  assignedUnitId?: string | null;
  assignedSerialNo?: string | null;
  assignedLotNo?: string | null;
  lineStatus: 'ACTIVE' | 'FULFILLED' | 'REPLACED_OUT' | 'RETURNED' | 'CANCELLED';
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
  predecessorUnitId?: string | null;
  memo?: string | null;
}

export interface FlFulfillment {
  id: string;
  tenantId: string;
  fulfillmentNo: string;
  fulfillmentDomain: 'TRADE' | 'RENTAL';
  actionType: '유통출고' | '렌탈출고' | '렌탈회수' | '교환';
  contractId: string;
  contractLineId: string;
  partnerId: string;
  partnerName: string;
  siteId?: string | null;
  itemId: string;
  unitId?: string | null;
  replacementUnitId?: string | null;
  quantity: number;
  cogsAmountKrw: number;
  status: 'REQUESTED' | 'COMPLETED' | 'CANCELLED';
  effectiveDate?: string | null;
  recordedAt?: string | null;
  executedBy?: string | null;
  memo?: string | null;
}

export interface FlTradeAftercareCase {
  id: string;
  tenantId: string;
  caseNo: string;
  contractId: string;
  partnerId: string;
  partnerName: string;
  unitId: string;
  serialNo?: string | null;
  caseType: '공급사 정비중개' | '반품환불' | '반품교환';
  warrantyApplied?: boolean;
  supplierPartnerId?: string | null;
  supplierName?: string | null;
  refundSupplyKrw: number;
  refundVatKrw: number;
  replacementUnitId?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlRentalMaintenance {
  id: string;
  tenantId: string;
  maintNo: string;
  maintType: '주기장정비' | '현장정비' | '순회정비';
  unitId: string;
  serialNo?: string | null;
  contractId?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  mechanicId?: string | null;
  mechanicName?: string | null;
  vendorPartnerId?: string | null;
  operatingHours: number;
  partsUsed: { unitId: string; itemId: string; itemName: string; qty: number; unitCostKrw: number }[];
  partsCostKrw: number;
  laborCostKrw: number;
  externalCostKrw: number;
  totalCostKrw: number;
  isCustomerBillable: boolean;
  customerChargeKrw: number;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  effectiveDate: string;
  recordedAt: string;
  memo?: string | null;
}

export interface FlAssetEvent {
  id: string;
  tenantId: string;
  unitId: string;
  contractId?: string | null;
  eventType:
    | 'PURCHASE'
    | 'LEASE_INIT'
    | 'ACCOUNT_TRANSFER'
    | 'RENTAL_START'
    | 'EXCHANGE_OUT'
    | 'EXCHANGE_IN'
    | 'RENTAL_RETURN'
    | 'MAINTENANCE'
    | 'TRADE_OUTBOUND'
    | 'TRADE_RETURN'
    | 'DEPRECIATION'
    | 'DISPOSAL';
  predecessorUnitId?: string | null;
  successorUnitId?: string | null;
  operatingHours: number;
  deltaAmountKrw: number;
  effectiveDate: string;
  recordedAt: string;
  actorName?: string | null;
  memo?: string | null;
}

export interface BillingLine {
  description: string;
  qty: number;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  unitId?: string;
  contractLineId?: string;
  fulfillmentId?: string;
  maintId?: string;
  dispatchId?: string;
  billingYmTag?: string;
}

export interface FlBilling {
  id: string;
  tenantId: string;
  billingNo: string;
  billingYm: string;
  billingDomain: 'TRADE' | 'RENTAL' | 'MIXED';
  contractId: string;
  partnerId: string;
  partnerName: string;
  billingDate: string;
  dueDate: string;
  supplyAmountKrw: number;
  vatAmountKrw: number;
  totalAmountKrw: number;
  paidAmountKrw: number;
  unpaidBalanceKrw: number;
  taxInvoiceIssued: boolean;
  taxInvoiceNo?: string | null;
  taxInvoiceIssuedAt?: string | null;
  statementSentAt?: string | null;
  lines: BillingLine[];
  status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  memo?: string | null;
}

export interface FlCollection {
  id: string;
  tenantId: string;
  collectionNo: string;
  billingId: string;
  partnerId: string;
  partnerName: string;
  collectionDate: string;
  amountKrw: number;
  paymentMethod: string;
  bankTxId?: string | null;
  recordedBy: string;
  memo?: string | null;
}

export interface FlBankTransaction {
  id: string;
  tenantId: string;
  txDate: string;
  txDirection: 'IN' | 'OUT';
  bankName: string;
  accountNo?: string | null;
  counterpartyName: string;
  amountKrw: number;
  matchedType?: 'AR_BILLING' | 'AP_PAYABLE' | 'LEASE_INSTALLMENT' | null;
  matchedId?: string | null;
  matchStatus: 'UNMATCHED' | 'MATCHED' | 'EXCLUDED';
  memo?: string | null;
}

export interface FlFinanceLease {
  id: string;
  tenantId: string;
  leaseNo: string;
  lenderPartnerId: string;
  lenderName: string;
  unitId?: string | null;
  unitIds: string[];
  serialNo?: string | null;
  principalAmountKrw: number;
  annualInterestRate: number;
  termMonths: number;
  repaymentMethod: '원리금균등' | '원금균등';
  startDate: string;
  endDate: string;
  paymentDay: number;
  remainingPrincipalKrw: number;
  status: 'ACTIVE' | 'PAID_OFF' | 'TERMINATED';
  memo?: string | null;
}

export interface FlFinanceLeaseSchedule {
  id: string;
  tenantId: string;
  leaseId: string;
  installmentNo: number;
  dueYm: string;
  dueDate: string;
  openingPrincipalKrw: number;
  principalPaymentKrw: number;
  interestExpenseKrw: number;
  totalInstallmentKrw: number;
  endingPrincipalKrw: number;
  isPaid: boolean;
  paidDate?: string | null;
  bankTxId?: string | null;
}
