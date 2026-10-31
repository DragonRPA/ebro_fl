import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useApp } from './AppContext';
import {
  TradeProduct, TradePurchase, TradePurchaseItem, TradeInventoryLot,
  TradeSalesOrder, TradeSalesOrderLine, TradeOutbound, TradeBilling,
  TradeReturn, TradeInventoryAdjustment,
  db, supabase, Customer, Vendor
} from '../services/db';
import { emailService, SentEmail } from '../services/email';

const uuidv4 = () => Math.random().toString(36).substring(2, 9).toUpperCase();

export interface TradeContextType {
  products: TradeProduct[];
  purchases: TradePurchase[];
  purchaseItems: TradePurchaseItem[];
  inventoryLots: TradeInventoryLot[];
  inventoryAdjustments: TradeInventoryAdjustment[];
  salesOrders: TradeSalesOrder[];
  salesOrderLines: TradeSalesOrderLine[];
  outbounds: TradeOutbound[];
  billings: TradeBilling[];
  returns: TradeReturn[];

  // Helpers (SSOT Normalization)
  getCustomerName: (customerId?: string) => string;
  getCustomerById: (customerId?: string) => Customer | undefined;
  getVendorName: (vendorId?: string) => string;
  getVendorById: (vendorId?: string) => Vendor | undefined;
  getProductStock: (productId: string) => { availableQty: number; avgUnitCost: number; stockValue: number };

  // Products CRUD & Stock
  addProduct: (p: Omit<TradeProduct, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TradeProduct>;
  updateProduct: (id: string, updates: Partial<TradeProduct>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  adjustProductStock: (
    productId: string,
    adjustQty: number,
    unitCost: number,
    reason: string,
    extra?: { warehouseName?: string; serialNumber?: string; inboundDate?: string }
  ) => Promise<void>;

  // Purchases (구매 및 입고) CRUD & Workflow
  createPurchase: (
    vendorId: string,
    items: {
      productId: string;
      qty: number;
      unitCost: number;
      foreignUnitCost?: number;
      incidentalCostPerUnit?: number;
      landedUnitCost?: number;
      warehouseName?: string;
      serialNumbers?: string[];
      memo?: string;
    }[],
    options?: {
      purchaseType?: 'DOMESTIC' | 'IMPORT';
      currency?: 'KRW' | 'CNY' | 'USD';
      exchangeRate?: number;
      foreignTotalAmount?: number;
      customsDuty?: number;
      customsClearanceFee?: number;
      freightCost?: number;
      otherIncidentalCost?: number;
      totalIncidentalCost?: number;
      landedTotalAmount?: number;
      warehouseName?: string;
      blNumber?: string;
      orderDate?: string;
      expectedDate?: string;
      status?: 'REQUESTED' | 'ORDERED';
      requesterName?: string;
      memo?: string;
    }
  ) => Promise<TradePurchase>;
  updatePurchase: (
    purchaseId: string,
    updates: Partial<TradePurchase>,
    updatedItems?: {
      id?: string;
      productId: string;
      orderQty: number;
      unitCost: number;
      foreignUnitCost?: number;
      incidentalCostPerUnit?: number;
      landedUnitCost?: number;
      warehouseName?: string;
      serialNumbers?: string[];
      memo?: string;
    }[]
  ) => Promise<void>;
  acceptPurchase: (purchaseId: string) => Promise<void>;
  confirmInbound: (
    purchaseId: string,
    received: {
      productId: string;
      qty: number;
      unitCost?: number;
      warehouseName?: string;
      serialNumbers?: string[];
    }[],
    receivedDate?: string
  ) => Promise<void>;
  cancelPurchase: (purchaseId: string, reason?: string, itemId?: string) => Promise<void>;
  deletePurchase: (purchaseId: string, itemId?: string) => Promise<void>;

  // Sales Orders (유통 계약 관리) CRUD & Workflow
  createSalesOrder: (
    customerId: string,
    items: {
      productId: string;
      qty: number;
      unitPrice: number;
      serialNumbers?: string[];
      warehouseName?: string;
      memo?: string;
    }[],
    options?: {
      customerTier?: 'DEALER' | 'END_USER';
      orderDate?: string;
      deliveryDate?: string;
      deliveryLocation?: string;
      receiverName?: string;
      receiverPhone?: string;
      paymentTerms?: string;
      specialTerms?: string;
      salespersonName?: string;
      memo?: string;
      status?: 'PENDING' | 'CONFIRMED';
      contractId?: string;
      contractNo?: string;
      siteId?: string;
      siteName?: string;
      billingMode?: 'RENTAL_MERGED' | 'STANDALONE';
      targetBillingYm?: string;
      linkedReceivableId?: string;
      linkedBillingId?: string;
      deliveryMethod?: 'COURIER' | 'DIRECT' | 'BUNDLE_WITH_RENTAL';
      linkedRentalDeliveryId?: string;
    }
  ) => Promise<TradeSalesOrder>;
  updateSalesOrder: (
    id: string,
    updates: Partial<TradeSalesOrder>,
    updatedLines?: {
      id?: string;
      productId: string;
      qty: number;
      unitPrice: number;
      serialNumbers?: string[];
      warehouseName?: string;
      memo?: string;
    }[]
  ) => Promise<void>;
  acceptSalesOrder: (id: string) => Promise<void>;
  cancelSalesOrder: (id: string, reason?: string) => Promise<void>;
  deleteSalesOrder: (id: string) => Promise<void>;
  sendTradeContractEmail: (
    orderId: string,
    emailData: {
      to: string;
      cc?: string;
      subject: string;
      body: string;
      isTestMode: boolean;
      excelBuffer: ArrayBuffer;
      fileName: string;
      terms?: {
        deliveryLocation?: string;
        deliveryDate?: string;
        paymentTerms?: string;
        specialTerms?: string;
      };
    }
  ) => Promise<SentEmail>;

  // Outbounds & Courier Dispatch (출고 및 배송) CRUD & Workflow
  createOutboundManual: (
    orderId: string,
    extra?: {
      destinationAddress?: string;
      receiverName?: string;
      receiverPhone?: string;
      deliveryType?: 'COURIER' | 'DIRECT' | 'BUNDLE_WITH_RENTAL';
      closingMemo?: string;
    }
  ) => Promise<TradeOutbound>;
  allocateOutbound: (outboundId: string) => Promise<void>;
  packOutbound: (outboundId: string) => Promise<void>;
  updateOutbound: (outboundId: string, updates: Partial<TradeOutbound>) => Promise<void>;
  cancelOutbound: (outboundId: string, reason?: string) => Promise<void>;
  deleteOutbound: (outboundId: string) => Promise<void>;
  dispatchOutbound: (
    outboundId: string,
    courierName: string,
    trackingNumber: string,
    extra?: {
      shippingCost?: number;
      paidBy?: 'OURS' | 'CUSTOMER';
      receiverName?: string;
      receiverPhone?: string;
      destinationAddress?: string;
      shippedAt?: string;
      closingMemo?: string;
    }
  ) => Promise<void>;
  dispatchDirectTradeDelivery: (
    outboundId: string,
    driverInfo: {
      driverName: string;
      driverContact?: string;
      vehicleNo?: string;
      destinationAddress?: string;
      receiverName?: string;
      receiverPhone?: string;
      shippingCost?: number;
      paidBy?: 'OURS' | 'CUSTOMER';
    }
  ) => Promise<void>;
  cancelDispatch: (outboundId: string) => Promise<void>;
  completeTradeDeliveryWithProof: (
    outboundId: string,
    proofUrl: string,
    proofType: 'SIGNATURE' | 'PHOTO',
    receiverName?: string,
    closingMemo?: string
  ) => Promise<void>;
  completeTradeDeliveryManual: (
    outboundId: string,
    receiverName: string,
    deliveredDate?: string,
    closingMemo?: string
  ) => Promise<void>;

  // Returns (환입 및 반품) CRUD & Workflow
  requestReturn: (
    orderLineId: string,
    qty: number,
    condition: 'SELLABLE' | 'DEFECTIVE',
    refundAmount: number,
    reason?: string,
    memo?: string
  ) => Promise<TradeReturn>;
  processReturn: (
    orderLineId: string,
    qty: number,
    condition: 'SELLABLE' | 'DEFECTIVE',
    refundAmount: number,
    reason?: string,
    memo?: string
  ) => Promise<TradeReturn>;
  completeReturnRequest: (
    returnId: string,
    condition?: 'SELLABLE' | 'DEFECTIVE',
    refundAmount?: number,
    memo?: string
  ) => Promise<void>;
  cancelReturn: (returnId: string) => Promise<void>;
  deleteReturn: (returnId: string) => Promise<void>;

  // Billing (유통 청구 및 명세) CRUD & Workflow
  issueBilling: (
    customerId: string,
    month: string,
    options?: {
      orderId?: string;
      orderIds?: string[];
      billingDate?: string;
      supplyAmount?: number;
      vatAmount?: number;
      totalAmount?: number;
      recipientName?: string;
      recipientEmail?: string;
      memo?: string;
    }
  ) => Promise<TradeBilling>;
  updateBilling: (billingId: string, updates: Partial<TradeBilling>) => Promise<void>;
  sendTradeBillingEmail: (
    billingId: string,
    emailData: {
      to: string;
      cc?: string;
      recipientName?: string;
      subject: string;
      body: string;
      isTestMode: boolean;
    }
  ) => Promise<SentEmail>;
  completeBillingPayment: (billingId: string, paidDate?: string) => Promise<void>;
  cancelBilling: (billingId: string) => Promise<void>;
  deleteBilling: (billingId: string) => Promise<void>;
}

const DEFAULT_PRODUCTS: TradeProduct[] = [
  {
    id: 'p1',
    skuCode: 'FL-EPL1531',
    name: '전동 파레트트럭 1.5톤',
    category: '전동지게차',
    itemType: 'EQUIPMENT',
    manufacturer: '이피이큅먼트',
    modelName: 'EPL1531',
    originCountry: '중국 수입',
    defaultWarehouse: 'A창고',
    spec: '정격하중 1500kg / 리튬배터리 24V 20Ah 내장형',
    unit: '대',
    standardCost: 1320000,
    dealerPrice: 1650000,
    standardPrice: 1850000,
    safetyStock: 5,
    warrantyMonths: 12,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '중국 항저우 공장 직수입 주력 소형 전동 파레트트럭',
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z'
  },
  {
    id: 'p2',
    skuCode: 'FL-CPD25L1',
    name: '리튬 전동지게차 2.5톤',
    category: '전동지게차',
    itemType: 'EQUIPMENT',
    manufacturer: '헬리포크리프트',
    modelName: 'CPD25-L1',
    originCountry: '중국 수입',
    defaultWarehouse: 'A창고',
    spec: '정격하중 2500kg / 3단 마스트 4500mm / 리튬인산철 80V 205Ah',
    unit: '대',
    standardCost: 14800000,
    dealerPrice: 18200000,
    standardPrice: 20500000,
    safetyStock: 3,
    warrantyMonths: 24,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '중국 안후이 헬리 직수입 2.5톤 좌식 리튬 전동지게차',
    createdAt: '2026-03-10T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z'
  },
  {
    id: 'p3',
    skuCode: 'FL-CQD15R',
    name: '입승식 리치트럭 1.5톤',
    category: '리치트럭',
    itemType: 'EQUIPMENT',
    manufacturer: '항차그룹',
    modelName: 'CQD15-XC4',
    originCountry: '중국 수입',
    defaultWarehouse: 'B창고',
    spec: '정격하중 1500kg / 인상높이 6000mm / 사이드쉬프트 기본 장착',
    unit: '대',
    standardCost: 11900000,
    dealerPrice: 14900000,
    standardPrice: 16800000,
    safetyStock: 2,
    warrantyMonths: 18,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '물류센터 하이랙 작업용 입승식 전동 리치트럭',
    createdAt: '2026-04-05T09:00:00.000Z',
    updatedAt: '2026-09-05T09:00:00.000Z'
  },
  {
    id: 'p4',
    skuCode: 'FL-FD30T',
    name: '디젤 카운터밸런스 지게차 3.0톤',
    category: '디젤지게차',
    itemType: 'EQUIPMENT',
    manufacturer: '두산밥캣',
    modelName: 'FD30T-7',
    originCountry: '국내 매입',
    defaultWarehouse: 'A창고',
    spec: '정격하중 3000kg / 스테이지5 친환경 디젤엔진 / 캐빈·히터 사양',
    unit: '대',
    standardCost: 22500000,
    dealerPrice: 26500000,
    standardPrice: 28900000,
    safetyStock: 2,
    warrantyMonths: 24,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '국내 야외 자재야드 및 제조공장 납품용 3톤 디젤지게차',
    createdAt: '2026-04-15T09:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z'
  },
  {
    id: 'p5',
    skuCode: 'PT-LFP80205',
    name: '리튬인산철 배터리팩 80V 205Ah',
    category: '배터리/충전기',
    itemType: 'PART',
    manufacturer: '시이티엘',
    modelName: 'LFP-80V205',
    originCountry: '중국 수입',
    defaultWarehouse: '부품창고',
    spec: '80V 205Ah BMS 일체형 모듈 / 급속충전 지원',
    unit: 'EA',
    standardCost: 3450000,
    dealerPrice: 4200000,
    standardPrice: 4800000,
    safetyStock: 5,
    warrantyMonths: 36,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '2.5톤~3.0톤 전동지게차 교체 및 옵션 장착용 리튬배터리',
    createdAt: '2026-05-01T09:00:00.000Z',
    updatedAt: '2026-09-12T09:00:00.000Z'
  },
  {
    id: 'p6',
    skuCode: 'PT-CURTIS1232',
    name: '구동모터 AC 컨트롤러 어셈블리',
    category: '전장부품',
    itemType: 'PART',
    manufacturer: '커티스',
    modelName: 'AC-1232E',
    originCountry: '중국 수입',
    defaultWarehouse: '부품창고',
    spec: '24V-80V 250A 전동지게차 구동 제어 컨트롤러',
    unit: 'EA',
    standardCost: 310000,
    dealerPrice: 410000,
    standardPrice: 480000,
    safetyStock: 10,
    warrantyMonths: 12,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '이피이큅먼트 및 헬리 전동지게차 호환 메인 컨트롤러',
    createdAt: '2026-05-10T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z'
  },
  {
    id: 'p7',
    skuCode: 'PT-FORK1200',
    name: '단조 중량 덧발 포크 세트 1200mm',
    category: '유압부품',
    itemType: 'PART',
    manufacturer: '카스케이드',
    modelName: 'FK-25-1200',
    originCountry: '국내 매입',
    defaultWarehouse: '부품창고',
    spec: '2.5톤~3톤 공용 고장력 단조 포크 1쌍',
    unit: 'SET',
    standardCost: 380000,
    dealerPrice: 490000,
    standardPrice: 560000,
    safetyStock: 8,
    warrantyMonths: 12,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '국내 포크 제조사 직매입 표준 포크 세트',
    createdAt: '2026-06-01T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z'
  },
  {
    id: 'p8',
    skuCode: 'PT-SOLID70012',
    name: '지게차 노마킹 솔리드 타이어 7.00-12',
    category: '타이어/휠',
    itemType: 'PART',
    manufacturer: '넥센솔리드',
    modelName: 'NM-700-12',
    originCountry: '국내 매입',
    defaultWarehouse: '부품창고',
    spec: '2.5톤~3톤 전륜/후륜 겸용 백색 친환경 솔리드 타이어',
    unit: 'EA',
    standardCost: 145000,
    dealerPrice: 195000,
    standardPrice: 230000,
    safetyStock: 16,
    warrantyMonths: 6,
    status: 'ACTIVE',
    cogsMethod: 'FIFO',
    memo: '식품·제약·반도체 물류창고 납품 지게차 장착용',
    createdAt: '2026-06-15T09:00:00.000Z',
    updatedAt: '2026-09-15T09:00:00.000Z'
  }
];

const DEFAULT_PURCHASES: TradePurchase[] = [
  {
    id: 'PO-202604-001',
    vendorId: 'v-1',
    purchaseType: 'IMPORT',
    currency: 'CNY',
    exchangeRate: 192.0,
    foreignTotalAmount: 215000,
    customsDuty: 2470000,
    customsClearanceFee: 550000,
    freightCost: 2000000,
    otherIncidentalCost: 0,
    totalIncidentalCost: 5020000,
    landedTotalAmount: 46300000,
    warehouseName: 'A창고',
    blNumber: 'SNKO-SHA2604018',
    orderDate: '2026-03-28',
    expectedDate: '2026-04-08',
    receivedDate: '2026-04-10',
    status: 'RECEIVED',
    totalAmount: 46300000,
    vatAmount: 4630000,
    requesterName: '해외수입팀',
    memo: '중국 안후이 헬리 2.5톤 리튬 전동지게차 및 파레트트럭 1차 컨테이너 직수입 입고',
    createdAt: '2026-03-28T09:30:00.000Z',
    updatedAt: '2026-04-10T14:00:00.000Z'
  },
  {
    id: 'PO-202606-002',
    vendorId: 'v-3',
    purchaseType: 'IMPORT',
    currency: 'USD',
    exchangeRate: 1380.0,
    foreignTotalAmount: 16000,
    customsDuty: 1100000,
    customsClearanceFee: 320000,
    freightCost: 300000,
    otherIncidentalCost: 0,
    totalIncidentalCost: 1720000,
    landedTotalAmount: 23800000,
    warehouseName: 'B창고',
    blNumber: 'KMTC-NGB2606112',
    orderDate: '2026-06-10',
    expectedDate: '2026-06-22',
    receivedDate: '2026-06-25',
    status: 'RECEIVED',
    totalAmount: 23800000,
    vatAmount: 2380000,
    requesterName: '해외수입팀',
    memo: '중국 닝보항 선적 입승식 리치트럭 1.5톤 2대 수입 통관 완료',
    createdAt: '2026-06-10T10:00:00.000Z',
    updatedAt: '2026-06-25T15:30:00.000Z'
  },
  {
    id: 'PO-202608-003',
    vendorId: 'v-2',
    purchaseType: 'DOMESTIC',
    currency: 'KRW',
    exchangeRate: 1,
    foreignTotalAmount: 45000000,
    customsDuty: 0,
    customsClearanceFee: 0,
    freightCost: 0,
    otherIncidentalCost: 0,
    totalIncidentalCost: 0,
    landedTotalAmount: 45000000,
    warehouseName: 'A창고',
    orderDate: '2026-08-05',
    expectedDate: '2026-08-12',
    receivedDate: '2026-08-14',
    status: 'RECEIVED',
    totalAmount: 45000000,
    vatAmount: 4500000,
    requesterName: '국내매입팀',
    memo: '국내 두산밥캣 3.0톤 디젤지게차 2대 직매입 입고',
    createdAt: '2026-08-05T11:00:00.000Z',
    updatedAt: '2026-08-14T16:00:00.000Z'
  },
  {
    id: 'PO-202609-004',
    vendorId: 'v-1',
    purchaseType: 'IMPORT',
    currency: 'CNY',
    exchangeRate: 195.0,
    foreignTotalAmount: 215000,
    customsDuty: 2450000,
    customsClearanceFee: 480000,
    freightCost: 1345000,
    otherIncidentalCost: 0,
    totalIncidentalCost: 4275000,
    landedTotalAmount: 46200000,
    warehouseName: 'A창고',
    blNumber: 'SNKO-SHA2609088',
    orderDate: '2026-09-10',
    expectedDate: '2026-09-20',
    receivedDate: '2026-09-20',
    status: 'RECEIVED',
    totalAmount: 46200000,
    vatAmount: 4620000,
    requesterName: '해외수입팀',
    memo: '추계 성수기 대비 리튬 전동지게차 2.5톤 2대 및 리튬배터리팩·컨트롤러 수입 입고',
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-20T17:00:00.000Z'
  },
  {
    id: 'PO-202610-005',
    vendorId: 'v-2',
    purchaseType: 'DOMESTIC',
    currency: 'KRW',
    exchangeRate: 1,
    foreignTotalAmount: 13960000,
    customsDuty: 0,
    customsClearanceFee: 0,
    freightCost: 0,
    otherIncidentalCost: 0,
    totalIncidentalCost: 0,
    landedTotalAmount: 13960000,
    warehouseName: '부품창고',
    orderDate: '2026-10-12',
    expectedDate: '2026-10-15',
    receivedDate: '2026-10-15',
    status: 'RECEIVED',
    totalAmount: 13960000,
    vatAmount: 1396000,
    requesterName: '부품자재팀',
    memo: '전동 파레트트럭 3대 및 단조 포크·솔리드 타이어 정기 보충 입고',
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-15T15:00:00.000Z'
  }
];

const DEFAULT_PURCHASE_ITEMS: TradePurchaseItem[] = [
  {
    id: 'PI-001',
    purchaseId: 'PO-202604-001',
    productId: 'p2',
    orderQty: 2,
    receivedQty: 2,
    foreignUnitCost: 70000,
    incidentalCostPerUnit: 1360000,
    landedUnitCost: 14800000,
    unitCost: 14800000,
    warehouseName: 'A창고',
    serialNumbers: ['HL-CPD25-260401', 'HL-CPD25-260402'],
    memo: '중국 안후이 헬리 2.5톤 리튬 전동지게차 2대'
  },
  {
    id: 'PI-002',
    purchaseId: 'PO-202604-001',
    productId: 'p1',
    orderQty: 2,
    receivedQty: 2,
    foreignUnitCost: 6000,
    incidentalCostPerUnit: 168000,
    landedUnitCost: 1320000,
    unitCost: 1320000,
    warehouseName: 'A창고',
    serialNumbers: ['EP-1531-260401', 'EP-1531-260402'],
    memo: '이피이큅먼트 1.5톤 파레트트럭 2대'
  },
  {
    id: 'PI-003',
    purchaseId: 'PO-202604-001',
    productId: 'p5',
    orderQty: 4,
    receivedQty: 4,
    foreignUnitCost: 15750,
    incidentalCostPerUnit: 426000,
    landedUnitCost: 3450000,
    unitCost: 3450000,
    warehouseName: '부품창고',
    memo: '리튬인산철 배터리팩 80V 205Ah 4세트'
  },
  {
    id: 'PI-004',
    purchaseId: 'PO-202606-002',
    productId: 'p3',
    orderQty: 2,
    receivedQty: 2,
    foreignUnitCost: 8000,
    incidentalCostPerUnit: 860000,
    landedUnitCost: 11900000,
    unitCost: 11900000,
    warehouseName: 'B창고',
    serialNumbers: ['HC-CQD15-260601', 'HC-CQD15-260602'],
    memo: '항차 입승식 리치트럭 1.5톤 2대'
  },
  {
    id: 'PI-005',
    purchaseId: 'PO-202608-003',
    productId: 'p4',
    orderQty: 2,
    receivedQty: 2,
    foreignUnitCost: 22500000,
    incidentalCostPerUnit: 0,
    landedUnitCost: 22500000,
    unitCost: 22500000,
    warehouseName: 'A창고',
    serialNumbers: ['DS-FD30T-260801', 'DS-FD30T-260802'],
    memo: '두산밥캣 3.0톤 디젤지게차 2대'
  },
  {
    id: 'PI-006',
    purchaseId: 'PO-202609-004',
    productId: 'p2',
    orderQty: 2,
    receivedQty: 2,
    foreignUnitCost: 70000,
    incidentalCostPerUnit: 1150000,
    landedUnitCost: 14800000,
    unitCost: 14800000,
    warehouseName: 'A창고',
    serialNumbers: ['HL-CPD25-260901', 'HL-CPD25-260902'],
    memo: '헬리 2.5톤 리튬 전동지게차 2대'
  },
  {
    id: 'PI-007',
    purchaseId: 'PO-202609-004',
    productId: 'p6',
    orderQty: 30,
    receivedQty: 30,
    foreignUnitCost: 1450,
    incidentalCostPerUnit: 27250,
    landedUnitCost: 310000,
    unitCost: 310000,
    warehouseName: '부품창고',
    memo: '커티스 구동모터 컨트롤러 30개'
  },
  {
    id: 'PI-008',
    purchaseId: 'PO-202609-004',
    productId: 'p5',
    orderQty: 2,
    receivedQty: 2,
    foreignUnitCost: 15750,
    incidentalCostPerUnit: 378750,
    landedUnitCost: 3450000,
    unitCost: 3450000,
    warehouseName: '부품창고',
    memo: '리튬인산철 배터리팩 2개'
  },
  {
    id: 'PI-009',
    purchaseId: 'PO-202610-005',
    productId: 'p1',
    orderQty: 3,
    receivedQty: 3,
    foreignUnitCost: 1320000,
    incidentalCostPerUnit: 0,
    landedUnitCost: 1320000,
    unitCost: 1320000,
    warehouseName: 'A창고',
    serialNumbers: ['EP-1531-261001', 'EP-1531-261002', 'EP-1531-261003'],
    memo: '이피이큅먼트 파레트트럭 3대'
  },
  {
    id: 'PI-010',
    purchaseId: 'PO-202610-005',
    productId: 'p7',
    orderQty: 15,
    receivedQty: 15,
    foreignUnitCost: 380000,
    incidentalCostPerUnit: 0,
    landedUnitCost: 380000,
    unitCost: 380000,
    warehouseName: '부품창고',
    memo: '단조 중량 포크 세트 15조'
  },
  {
    id: 'PI-011',
    purchaseId: 'PO-202610-005',
    productId: 'p8',
    orderQty: 30,
    receivedQty: 30,
    foreignUnitCost: 145000,
    incidentalCostPerUnit: 0,
    landedUnitCost: 145000,
    unitCost: 145000,
    warehouseName: '부품창고',
    memo: '노마킹 솔리드 타이어 30본'
  }
];

const DEFAULT_LOTS: TradeInventoryLot[] = [
  // 180일 이상 장기체화 재고 (2026-04-10 입고 -> 약 204일 경과)
  {
    id: 'LOT-SN-001',
    purchaseId: 'PO-202604-001',
    productId: 'p2',
    serialNumber: 'HL-CPD25-260401',
    warehouseName: 'A창고',
    inboundDate: '2026-04-10',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 70000,
    exchangeRate: 192.0,
    incidentalCostPerUnit: 1360000,
    lotStatus: 'SOLD',
    soldOrderId: 'SO-202609-101',
    soldDate: '2026-09-12',
    soldCustomerName: '경기종합물류 대리점',
    warrantyEndDate: '2028-09-11',
    initialQty: 1,
    remainingQty: 0,
    unitCost: 14800000,
    createdAt: '2026-04-10T10:00:00.000Z'
  },
  {
    id: 'LOT-SN-002',
    purchaseId: 'PO-202604-001',
    productId: 'p2',
    serialNumber: 'HL-CPD25-260402',
    warehouseName: 'A창고',
    inboundDate: '2026-04-10',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 70000,
    exchangeRate: 192.0,
    incidentalCostPerUnit: 1360000,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 14800000,
    createdAt: '2026-04-10T10:00:00.000Z'
  },
  {
    id: 'LOT-SN-003',
    purchaseId: 'PO-202604-001',
    productId: 'p1',
    serialNumber: 'EP-1531-260401',
    warehouseName: 'A창고',
    inboundDate: '2026-04-10',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 6000,
    exchangeRate: 192.0,
    incidentalCostPerUnit: 168000,
    lotStatus: 'SOLD',
    soldOrderId: 'SO-202609-101',
    soldDate: '2026-09-12',
    soldCustomerName: '경기종합물류 대리점',
    warrantyEndDate: '2027-09-11',
    initialQty: 1,
    remainingQty: 0,
    unitCost: 1320000,
    createdAt: '2026-04-10T10:05:00.000Z'
  },
  {
    id: 'LOT-SN-004',
    purchaseId: 'PO-202604-001',
    productId: 'p1',
    serialNumber: 'EP-1531-260402',
    warehouseName: 'B창고',
    inboundDate: '2026-04-10',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 6000,
    exchangeRate: 192.0,
    incidentalCostPerUnit: 168000,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 1320000,
    createdAt: '2026-04-10T10:06:00.000Z'
  },
  // 90~180일 경과 재고 (2026-06-25 입고 -> 약 128일 경과)
  {
    id: 'LOT-SN-005',
    purchaseId: 'PO-202606-002',
    productId: 'p3',
    serialNumber: 'HC-CQD15-260601',
    warehouseName: 'B창고',
    inboundDate: '2026-06-25',
    foreignCurrency: 'USD',
    foreignUnitPrice: 8000,
    exchangeRate: 1380.0,
    incidentalCostPerUnit: 860000,
    lotStatus: 'SOLD',
    soldOrderId: 'SO-202610-102',
    soldDate: '2026-10-08',
    soldCustomerName: '평택항만냉동창고',
    warrantyEndDate: '2028-04-07',
    initialQty: 1,
    remainingQty: 0,
    unitCost: 11900000,
    createdAt: '2026-06-25T10:00:00.000Z'
  },
  {
    id: 'LOT-SN-006',
    purchaseId: 'PO-202606-002',
    productId: 'p3',
    serialNumber: 'HC-CQD15-260602',
    warehouseName: 'B창고',
    inboundDate: '2026-06-25',
    foreignCurrency: 'USD',
    foreignUnitPrice: 8000,
    exchangeRate: 1380.0,
    incidentalCostPerUnit: 860000,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 11900000,
    createdAt: '2026-06-25T10:05:00.000Z'
  },
  // 60~90일 경과 재고 (2026-08-14 입고 -> 약 78일 경과)
  {
    id: 'LOT-SN-007',
    purchaseId: 'PO-202608-003',
    productId: 'p4',
    serialNumber: 'DS-FD30T-260801',
    warehouseName: 'A창고',
    inboundDate: '2026-08-14',
    foreignCurrency: 'KRW',
    foreignUnitPrice: 22500000,
    exchangeRate: 1,
    incidentalCostPerUnit: 0,
    lotStatus: 'SOLD',
    soldOrderId: 'SO-202610-103',
    soldDate: '2026-10-18',
    soldCustomerName: '한진철강산업',
    warrantyEndDate: '2028-10-17',
    initialQty: 1,
    remainingQty: 0,
    unitCost: 22500000,
    createdAt: '2026-08-14T11:00:00.000Z'
  },
  {
    id: 'LOT-SN-008',
    purchaseId: 'PO-202608-003',
    productId: 'p4',
    serialNumber: 'DS-FD30T-260802',
    warehouseName: 'A창고',
    inboundDate: '2026-08-14',
    foreignCurrency: 'KRW',
    foreignUnitPrice: 22500000,
    exchangeRate: 1,
    incidentalCostPerUnit: 0,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 22500000,
    createdAt: '2026-08-14T11:05:00.000Z'
  },
  // 30~60일 경과 재고 (2026-09-20 입고 -> 약 41일 경과)
  {
    id: 'LOT-SN-009',
    purchaseId: 'PO-202609-004',
    productId: 'p2',
    serialNumber: 'HL-CPD25-260901',
    warehouseName: 'A창고',
    inboundDate: '2026-09-20',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 70000,
    exchangeRate: 195.0,
    incidentalCostPerUnit: 1150000,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 14800000,
    createdAt: '2026-09-20T14:00:00.000Z'
  },
  {
    id: 'LOT-SN-010',
    purchaseId: 'PO-202609-004',
    productId: 'p2',
    serialNumber: 'HL-CPD25-260902',
    warehouseName: 'A창고',
    inboundDate: '2026-09-20',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 70000,
    exchangeRate: 195.0,
    incidentalCostPerUnit: 1150000,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 14800000,
    createdAt: '2026-09-20T14:05:00.000Z'
  },
  // 30일 이내 신규 재고 (2026-10-15 입고 -> 약 16일 경과)
  {
    id: 'LOT-SN-011',
    purchaseId: 'PO-202610-005',
    productId: 'p1',
    serialNumber: 'EP-1531-261001',
    warehouseName: 'A창고',
    inboundDate: '2026-10-15',
    foreignCurrency: 'KRW',
    foreignUnitPrice: 1320000,
    exchangeRate: 1,
    incidentalCostPerUnit: 0,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 1320000,
    createdAt: '2026-10-15T15:00:00.000Z'
  },
  {
    id: 'LOT-SN-012',
    purchaseId: 'PO-202610-005',
    productId: 'p1',
    serialNumber: 'EP-1531-261002',
    warehouseName: 'A창고',
    inboundDate: '2026-10-15',
    foreignCurrency: 'KRW',
    foreignUnitPrice: 1320000,
    exchangeRate: 1,
    incidentalCostPerUnit: 0,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 1320000,
    createdAt: '2026-10-15T15:02:00.000Z'
  },
  {
    id: 'LOT-SN-013',
    purchaseId: 'PO-202610-005',
    productId: 'p1',
    serialNumber: 'EP-1531-261003',
    warehouseName: 'B창고',
    inboundDate: '2026-10-15',
    foreignCurrency: 'KRW',
    foreignUnitPrice: 1320000,
    exchangeRate: 1,
    incidentalCostPerUnit: 0,
    lotStatus: 'IN_STOCK',
    initialQty: 1,
    remainingQty: 1,
    unitCost: 1320000,
    createdAt: '2026-10-15T15:04:00.000Z'
  },
  // 부품 재고 로트
  {
    id: 'LOT-PT-001',
    purchaseId: 'PO-202604-001',
    productId: 'p5',
    serialNumber: 'BAT-LFP-2604-LOT',
    warehouseName: '부품창고',
    inboundDate: '2026-04-10',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 15750,
    exchangeRate: 192.0,
    incidentalCostPerUnit: 426000,
    lotStatus: 'IN_STOCK',
    initialQty: 6,
    remainingQty: 5,
    unitCost: 3450000,
    createdAt: '2026-04-10T11:00:00.000Z'
  },
  {
    id: 'LOT-PT-002',
    purchaseId: 'PO-202609-004',
    productId: 'p6',
    serialNumber: 'CTRL-1232-2609-LOT',
    warehouseName: '부품창고',
    inboundDate: '2026-09-20',
    foreignCurrency: 'CNY',
    foreignUnitPrice: 1450,
    exchangeRate: 195.0,
    incidentalCostPerUnit: 27250,
    lotStatus: 'IN_STOCK',
    initialQty: 30,
    remainingQty: 26,
    unitCost: 310000,
    createdAt: '2026-09-20T15:00:00.000Z'
  },
  {
    id: 'LOT-PT-003',
    purchaseId: 'PO-202610-005',
    productId: 'p7',
    serialNumber: 'FORK-1200-2610-LOT',
    warehouseName: '부품창고',
    inboundDate: '2026-10-15',
    foreignCurrency: 'KRW',
    foreignUnitPrice: 380000,
    exchangeRate: 1,
    incidentalCostPerUnit: 0,
    lotStatus: 'IN_STOCK',
    initialQty: 15,
    remainingQty: 13,
    unitCost: 380000,
    createdAt: '2026-10-15T15:10:00.000Z'
  },
  {
    id: 'LOT-PT-004',
    purchaseId: 'PO-202610-005',
    productId: 'p8',
    serialNumber: 'TIRE-70012-2610-LOT',
    warehouseName: '부품창고',
    inboundDate: '2026-10-15',
    foreignCurrency: 'KRW',
    foreignUnitPrice: 145000,
    exchangeRate: 1,
    incidentalCostPerUnit: 0,
    lotStatus: 'IN_STOCK',
    initialQty: 30,
    remainingQty: 22,
    unitCost: 145000,
    createdAt: '2026-10-15T15:15:00.000Z'
  }
];

const DEFAULT_SALES_ORDERS: TradeSalesOrder[] = [
  {
    id: 'SO-202609-101',
    customerId: 'CUST-001',
    customerTier: 'DEALER',
    orderDate: '2026-09-12',
    deliveryDate: '2026-09-14',
    deliveryLocation: '경기도 평택시 포승읍 경기종합물류 지게차 전시장',
    receiverName: '김대리점장',
    receiverPhone: '010-4455-8899',
    paymentTerms: '대리점 도매 공급가 적용 / 납품 후 30일 이내 현금 결제',
    specialTerms: '1. 차대번호 HL-CPD25-260401, EP-1531-260401 출고\n2. 무상보증 12개월 적용',
    salespersonName: '해외유통영업팀',
    status: 'DELIVERED',
    totalSalesAmount: 21490000,
    totalCogsAmount: 17360000,
    contractDocStatus: 'SENT',
    memo: '경기남부 총판 대리점 9월 정기 출고 건',
    createdAt: '2026-09-12T09:00:00.000Z',
    updatedAt: '2026-09-14T16:00:00.000Z'
  },
  {
    id: 'SO-202610-102',
    customerId: 'CUST-002',
    customerTier: 'END_USER',
    orderDate: '2026-10-08',
    deliveryDate: '2026-10-10',
    deliveryLocation: '경기도 화성시 송산면 물류단지로 55',
    receiverName: '박물류팀장',
    receiverPhone: '010-8877-2233',
    paymentTerms: '최종고객 납품 검수 후 세금계산서 발행 15일 이내 결제',
    specialTerms: '1. 차대번호 HC-CQD15-260601 및 예비 리튬배터리·노마킹 타이어 일괄 납품',
    salespersonName: '유통영업팀',
    status: 'DELIVERED',
    totalSalesAmount: 23440000,
    totalCogsAmount: 16510000,
    contractDocStatus: 'GENERATED',
    memo: '화성 냉동창고 최종고객 직납 완료',
    createdAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-10T17:00:00.000Z'
  },
  {
    id: 'SO-202610-103',
    customerId: 'CUST-003',
    customerTier: 'END_USER',
    orderDate: '2026-10-18',
    deliveryDate: '2026-10-20',
    deliveryLocation: '충청남도 당진시 송악읍 부곡공단로 110',
    receiverName: '최자재과장',
    receiverPhone: '010-3322-9911',
    paymentTerms: '납품 후 당월 말 세금계산서 마감, 익월 10일 현금 입금',
    specialTerms: '1. 차대번호 DS-FD30T-260801 및 중량 단조포크 2세트 납품',
    salespersonName: '유통영업팀',
    status: 'SHIPPED',
    totalSalesAmount: 30020000,
    totalCogsAmount: 23260000,
    contractDocStatus: 'GENERATED',
    memo: '당진 철강공장 3톤 디젤지게차 및 중량포크 출고 (미수금 관리 대상)',
    createdAt: '2026-10-18T11:00:00.000Z',
    updatedAt: '2026-10-20T14:00:00.000Z'
  }
];

const DEFAULT_SALES_ORDER_LINES: TradeSalesOrderLine[] = [
  {
    id: 'SOL-101-1',
    orderId: 'SO-202609-101',
    productId: 'p2',
    qty: 1,
    unitPrice: 18200000,
    unitCogs: 14800000,
    serialNumbers: ['HL-CPD25-260401'],
    warehouseName: 'A창고',
    memo: '대리점 공급단가 적용',
    createdAt: '2026-09-12T09:00:00.000Z'
  },
  {
    id: 'SOL-101-2',
    orderId: 'SO-202609-101',
    productId: 'p1',
    qty: 1,
    unitPrice: 1650000,
    unitCogs: 1320000,
    serialNumbers: ['EP-1531-260401'],
    warehouseName: 'A창고',
    memo: '대리점 공급단가 적용',
    createdAt: '2026-09-12T09:00:00.000Z'
  },
  {
    id: 'SOL-101-3',
    orderId: 'SO-202609-101',
    productId: 'p6',
    qty: 4,
    unitPrice: 410000,
    unitCogs: 310000,
    warehouseName: '부품창고',
    memo: '대리점 A/S용 컨트롤러 4개',
    createdAt: '2026-09-12T09:00:00.000Z'
  },
  {
    id: 'SOL-102-1',
    orderId: 'SO-202610-102',
    productId: 'p3',
    qty: 1,
    unitPrice: 16800000,
    unitCogs: 11900000,
    serialNumbers: ['HC-CQD15-260601'],
    warehouseName: 'B창고',
    memo: '최종고객 표준단가 적용',
    createdAt: '2026-10-08T10:00:00.000Z'
  },
  {
    id: 'SOL-102-2',
    orderId: 'SO-202610-102',
    productId: 'p5',
    qty: 1,
    unitPrice: 4800000,
    unitCogs: 3450000,
    warehouseName: '부품창고',
    memo: '예비 리튬인산철 배터리팩',
    createdAt: '2026-10-08T10:00:00.000Z'
  },
  {
    id: 'SOL-102-3',
    orderId: 'SO-202610-102',
    productId: 'p8',
    qty: 8,
    unitPrice: 230000,
    unitCogs: 145000,
    warehouseName: '부품창고',
    memo: '노마킹 솔리드 타이어 8본',
    createdAt: '2026-10-08T10:00:00.000Z'
  },
  {
    id: 'SOL-103-1',
    orderId: 'SO-202610-103',
    productId: 'p4',
    qty: 1,
    unitPrice: 28900000,
    unitCogs: 22500000,
    serialNumbers: ['DS-FD30T-260801'],
    warehouseName: 'A창고',
    memo: '최종고객 3톤 디젤지게차',
    createdAt: '2026-10-18T11:00:00.000Z'
  },
  {
    id: 'SOL-103-2',
    orderId: 'SO-202610-103',
    productId: 'p7',
    qty: 2,
    unitPrice: 560000,
    unitCogs: 380000,
    warehouseName: '부품창고',
    memo: '단조 중량 포크 세트 2조',
    createdAt: '2026-10-18T11:00:00.000Z'
  }
];

const DEFAULT_OUTBOUNDS: TradeOutbound[] = [
  {
    id: 'TOUT-202609-101',
    orderId: 'SO-202609-101',
    status: 'DELIVERED',
    deliveryType: 'DIRECT',
    driverName: '정운송 기사',
    driverContact: '010-9111-2222',
    vehicleNo: '경기88바5544',
    shippingCost: 250000,
    paidBy: 'OURS',
    destinationAddress: '경기도 평택시 포승읍 경기종합물류 지게차 전시장',
    receiverName: '김대리점장',
    receiverPhone: '010-4455-8899',
    allocatedAt: '2026-09-12T10:00:00.000Z',
    packedAt: '2026-09-13T11:00:00.000Z',
    shippedAt: '2026-09-14T08:30:00.000Z',
    deliveredAt: '2026-09-14T15:00:00.000Z',
    closingMemo: '차대번호 HL-CPD25-260401, EP-1531-260401 및 컨트롤러 4개 대리점 인도 완료',
    createdAt: '2026-09-12T09:30:00.000Z',
    updatedAt: '2026-09-14T15:00:00.000Z'
  },
  {
    id: 'TOUT-202610-102',
    orderId: 'SO-202610-102',
    status: 'DELIVERED',
    deliveryType: 'DIRECT',
    driverName: '박셀프로더 기사',
    driverContact: '010-8222-3333',
    vehicleNo: '경기92아7788',
    shippingCost: 200000,
    paidBy: 'CUSTOMER',
    destinationAddress: '경기도 화성시 송산면 물류단지로 55',
    receiverName: '박물류팀장',
    receiverPhone: '010-8877-2233',
    allocatedAt: '2026-10-08T11:00:00.000Z',
    packedAt: '2026-10-09T14:00:00.000Z',
    shippedAt: '2026-10-10T09:00:00.000Z',
    deliveredAt: '2026-10-10T16:30:00.000Z',
    closingMemo: '차대번호 HC-CQD15-260601 리치트럭 및 배터리·타이어 화성 물류창고 납품 완료',
    createdAt: '2026-10-08T10:30:00.000Z',
    updatedAt: '2026-10-10T16:30:00.000Z'
  },
  {
    id: 'TOUT-202610-103',
    orderId: 'SO-202610-103',
    status: 'SHIPPED',
    deliveryType: 'DIRECT',
    driverName: '이대형트럭 기사',
    driverContact: '010-7333-4444',
    vehicleNo: '충남81사1199',
    shippingCost: 300000,
    paidBy: 'OURS',
    destinationAddress: '충청남도 당진시 송악읍 부곡공단로 110',
    receiverName: '최자재과장',
    receiverPhone: '010-3322-9911',
    allocatedAt: '2026-10-18T13:00:00.000Z',
    packedAt: '2026-10-19T15:00:00.000Z',
    shippedAt: '2026-10-20T08:00:00.000Z',
    closingMemo: '차대번호 DS-FD30T-260801 3톤 디젤지게차 당진 철강공장 상차 출발',
    createdAt: '2026-10-18T11:30:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z'
  }
];

const DEFAULT_BILLINGS: TradeBilling[] = [
  {
    id: 'TBIL-202609-101',
    orderId: 'SO-202609-101',
    orderIds: ['SO-202609-101'],
    customerId: 'CUST-001',
    billingMonth: '2026-09',
    billingDate: '2026-09-25',
    supplyAmount: 21490000,
    vatAmount: 2149000,
    totalAmount: 23639000,
    status: 'PAID',
    recipientName: '김대리점장',
    recipientEmail: 'dealer-gg@example.com',
    sentAt: '2026-09-25T10:00:00.000Z',
    paidAt: '2026-10-05T14:30:00.000Z',
    memo: '9월분 대리점 출고 대금 전액 수납 완료',
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-10-05T14:30:00.000Z'
  },
  {
    id: 'TBIL-202610-102',
    orderId: 'SO-202610-102',
    orderIds: ['SO-202610-102'],
    customerId: 'CUST-002',
    billingMonth: '2026-10',
    billingDate: '2026-10-12',
    supplyAmount: 23440000,
    vatAmount: 2344000,
    totalAmount: 25784000,
    status: 'SENT',
    recipientName: '박물류팀장',
    recipientEmail: 'hwaseong-cold@example.com',
    sentAt: '2026-10-12T11:00:00.000Z',
    memo: '10월 말 결제 예정 미수 채권',
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T11:00:00.000Z'
  }
];

function loadFromStorage<T>(key: string, fallback: T, allowEmpty = false): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (allowEmpty || parsed.length > 0) return parsed as unknown as T;
      }
    }
  } catch (e) {}
  return fallback;
}

function ensureFlTradeSeedMigratedOnce(): void {
  const MIGRATION_KEY = 'ebro_fl_trade_seed_v2';
  try {
    if (localStorage.getItem(MIGRATION_KEY) === 'done') return;
    const rawProducts = localStorage.getItem('ebro_trade_products');
    const parsedProducts: TradeProduct[] = rawProducts ? JSON.parse(rawProducts) : [];
    const hasLegacyGloves = parsedProducts.some(p => p.skuCode === 'SKU001' || p.name === '산업용 장갑');
    if (!rawProducts || parsedProducts.length === 0 || hasLegacyGloves) {
      localStorage.setItem('ebro_trade_products', JSON.stringify(DEFAULT_PRODUCTS));
      localStorage.setItem('ebro_trade_purchases', JSON.stringify(DEFAULT_PURCHASES));
      localStorage.setItem('ebro_trade_purchase_items', JSON.stringify(DEFAULT_PURCHASE_ITEMS));
      localStorage.setItem('ebro_trade_inventory', JSON.stringify(DEFAULT_LOTS));
      localStorage.setItem('ebro_trade_orders', JSON.stringify(DEFAULT_SALES_ORDERS));
      localStorage.setItem('ebro_trade_lines', JSON.stringify(DEFAULT_SALES_ORDER_LINES));
      localStorage.setItem('ebro_trade_outbounds', JSON.stringify(DEFAULT_OUTBOUNDS));
      localStorage.setItem('ebro_trade_billings', JSON.stringify(DEFAULT_BILLINGS));
    }
    localStorage.setItem(MIGRATION_KEY, 'done');
  } catch (e) {
    console.warn('ensureFlTradeSeedMigratedOnce failed:', e);
  }
}

const TradeContext = createContext<TradeContextType | undefined>(undefined);

export const TradeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { customers, vendors, currentUser } = useApp();

  ensureFlTradeSeedMigratedOnce();

  const [products, setProducts] = useState<TradeProduct[]>(() =>
    loadFromStorage<TradeProduct[]>('ebro_trade_products', DEFAULT_PRODUCTS, true)
  );

  const [purchases, setPurchases] = useState<TradePurchase[]>(() =>
    loadFromStorage<TradePurchase[]>('ebro_trade_purchases', DEFAULT_PURCHASES, true)
  );

  const [purchaseItems, setPurchaseItems] = useState<TradePurchaseItem[]>(() =>
    loadFromStorage<TradePurchaseItem[]>('ebro_trade_purchase_items', DEFAULT_PURCHASE_ITEMS, true)
  );

  const [inventoryLots, setInventoryLots] = useState<TradeInventoryLot[]>(() =>
    loadFromStorage<TradeInventoryLot[]>('ebro_trade_inventory', DEFAULT_LOTS, true)
  );

  const [inventoryAdjustments, setInventoryAdjustments] = useState<TradeInventoryAdjustment[]>(() =>
    loadFromStorage<TradeInventoryAdjustment[]>('ebro_trade_adjustments', [])
  );

  const [salesOrders, setSalesOrders] = useState<TradeSalesOrder[]>(() =>
    loadFromStorage<TradeSalesOrder[]>('ebro_trade_orders', DEFAULT_SALES_ORDERS)
  );

  const [salesOrderLines, setSalesOrderLines] = useState<TradeSalesOrderLine[]>(() =>
    loadFromStorage<TradeSalesOrderLine[]>('ebro_trade_lines', DEFAULT_SALES_ORDER_LINES)
  );

  const [outbounds, setOutbounds] = useState<TradeOutbound[]>(() =>
    loadFromStorage<TradeOutbound[]>('ebro_trade_outbounds', DEFAULT_OUTBOUNDS)
  );

  const [billings, setBillings] = useState<TradeBilling[]>(() =>
    loadFromStorage<TradeBilling[]>('ebro_trade_billings', DEFAULT_BILLINGS)
  );

  const [returns, setReturns] = useState<TradeReturn[]>(() =>
    loadFromStorage<TradeReturn[]>('ebro_trade_returns', [])
  );

  // Sync to localStorage on state changes
  useEffect(() => {
    try {
      localStorage.setItem('ebro_trade_products', JSON.stringify(products));
      localStorage.setItem('ebro_trade_purchases', JSON.stringify(purchases));
      localStorage.setItem('ebro_trade_purchase_items', JSON.stringify(purchaseItems));
      localStorage.setItem('ebro_trade_inventory', JSON.stringify(inventoryLots));
      localStorage.setItem('ebro_trade_adjustments', JSON.stringify(inventoryAdjustments));
      localStorage.setItem('ebro_trade_orders', JSON.stringify(salesOrders));
      localStorage.setItem('ebro_trade_lines', JSON.stringify(salesOrderLines));
      localStorage.setItem('ebro_trade_outbounds', JSON.stringify(outbounds));
      localStorage.setItem('ebro_trade_billings', JSON.stringify(billings));
      localStorage.setItem('ebro_trade_returns', JSON.stringify(returns));
    } catch (e) {}
  }, [
    products,
    purchases,
    purchaseItems,
    inventoryLots,
    inventoryAdjustments,
    salesOrders,
    salesOrderLines,
    outbounds,
    billings,
    returns
  ]);

  // 테스트 유통계약 삭제 시 연동된 미수금/청구상세 잔여 데이터 자동 정리
  useEffect(() => {
    try {
      const activeOrderIds = new Set(salesOrders.filter(o => o.status !== 'CANCELLED').map(o => o.id));
      const orphanTradeRcvs = (db.receivables || []).filter(r => {
        const desc = String(r.internalDescription || '');
        const m = desc.match(/\[유통출고:(SO-[A-Z0-9-]+)\]/);
        if (m && !activeOrderIds.has(m[1])) return true;
        return false;
      });
      if (orphanTradeRcvs.length > 0) {
        const now = new Date().toISOString();
        for (const rcv of orphanTradeRcvs) {
          const linkedBds = (db.billingDetails || []).filter(bd => bd.receivableId === rcv.id);
          for (const bd of linkedBds) {
            const parentBilling = (db.billings || []).find(b => b.id === bd.billingId);
            if (parentBilling && parentBilling.status !== 'PAID' && parentBilling.status !== 'REJECTED') {
              db.updateRow<any>('billings', parentBilling.id, {
                totalAmount: Math.max(0, (parentBilling.totalAmount || 0) - (bd.amount || 0)),
                updatedAt: now
              });
              db.deleteRow('billingDetails', bd.id);
            }
          }
          db.deleteRow('receivables', rcv.id);
        }
      }
    } catch (e) {}
  }, [salesOrders]);

  // Cross-tab synchronization
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      try {
        if (e.key === 'ebro_trade_outbounds' && e.newValue) setOutbounds(JSON.parse(e.newValue));
        if (e.key === 'ebro_trade_orders' && e.newValue) setSalesOrders(JSON.parse(e.newValue));
        if (e.key === 'ebro_trade_billings' && e.newValue) setBillings(JSON.parse(e.newValue));
        if (e.key === 'ebro_trade_returns' && e.newValue) setReturns(JSON.parse(e.newValue));
      } catch (err) {}
    };
    const handleFocus = () => {
      try {
        const savedObs = localStorage.getItem('ebro_trade_outbounds');
        if (savedObs) setOutbounds(JSON.parse(savedObs));
        const savedOrders = localStorage.getItem('ebro_trade_orders');
        if (savedOrders) setSalesOrders(JSON.parse(savedOrders));
      } catch (err) {}
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // ==========================================
  // Helpers (Strict Normalization - Rule 1.5)
  // ==========================================
  const getCustomerById = useCallback(
    (customerId?: string): Customer | undefined => {
      if (!customerId) return undefined;
      return (
        customers.find(c => c.id === customerId) ||
        db.customers?.find(c => c.id === customerId)
      );
    },
    [customers]
  );

  const getCustomerName = useCallback(
    (customerId?: string): string => {
      if (!customerId) return '미지정 고객사';
      const found = getCustomerById(customerId);
      if (found) return found.name;
      if (customerId === 'CUST-001') return '경기종합물류 대리점';
      if (customerId === 'CUST-002') return '평택항만냉동창고';
      if (customerId === 'CUST-003') return '한진철강산업';
      return customerId;
    },
    [getCustomerById]
  );

  const getVendorById = useCallback(
    (vendorId?: string): Vendor | undefined => {
      if (!vendorId) return undefined;
      return (
        vendors.find(v => v.id === vendorId) ||
        db.vendors?.find(v => v.id === vendorId)
      );
    },
    [vendors]
  );

  const getVendorName = useCallback(
    (vendorId?: string): string => {
      if (!vendorId) return '미지정 매입처';
      const found = getVendorById(vendorId);
      if (found) return found.name;
      if (vendorId === 'VD-001' || vendorId === 'v-1') return '안후이 헬리·이피이큅먼트 중국수출공사';
      if (vendorId === 'v-2') return '두산밥캣·카스케이드 국내총판';
      if (vendorId === 'v-3') return '닝보 항차포크리프트 글로벌';
      return vendorId;
    },
    [getVendorById]
  );

  const getProductStock = useCallback(
    (productId: string) => {
      const lots = inventoryLots.filter(l => l.productId === productId && l.remainingQty > 0);
      const availableQty = lots.reduce((sum, l) => sum + l.remainingQty, 0);
      const stockValue = lots.reduce((sum, l) => sum + l.remainingQty * l.unitCost, 0);
      const prod = products.find(p => p.id === productId);
      const avgUnitCost =
        availableQty > 0
          ? Math.round(stockValue / availableQty)
          : prod?.standardCost ?? 0;
      return { availableQty, avgUnitCost, stockValue };
    },
    [inventoryLots, products]
  );

  // ==========================================
  // 1. Products (상품 등록 및 관리)
  // ==========================================
  const addProduct = async (p: Omit<TradeProduct, 'id' | 'createdAt' | 'updatedAt'>): Promise<TradeProduct> => {
    const now = new Date().toISOString();
    const maxSkuNum = products.reduce((max, item) => {
      const m = /^SKU(\d+)$/i.exec((item.skuCode || '').trim());
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const autoSku = `SKU${String(maxSkuNum + 1).padStart(3, '0')}`;

    const newP: TradeProduct = {
      ...p,
      id: `PRD-${uuidv4()}`,
      skuCode: (p.skuCode || '').trim() || autoSku,
      unit: p.unit || 'EA',
      spec: p.spec || '-',
      standardCost: p.standardCost ?? 0,
      safetyStock: p.safetyStock ?? 10,
      createdAt: now,
      updatedAt: now
    };
    setProducts(prev => [newP, ...prev]);
    await db.awaitPendingWrites();
    return newP;
  };

  const updateProduct = async (id: string, updates: Partial<TradeProduct>) => {
    const now = new Date().toISOString();
    setProducts(prev => prev.map(p => (p.id === id ? { ...p, ...updates, updatedAt: now } : p)));
    await db.awaitPendingWrites();
  };

  const deleteProduct = async (id: string) => {
    const usedInActiveOrders = salesOrderLines.some(l => {
      if (l.productId !== id) return false;
      const parentOrder = salesOrders.find(o => o.id === l.orderId);
      return Boolean(parentOrder && parentOrder.status !== 'CANCELLED');
    });
    if (usedInActiveOrders) {
      throw new Error('이미 수주/출고 이력이 존재하는 상품은 삭제할 수 없습니다. 상태를 [단종]으로 변경해 주세요.');
    }
    const orphanOrCancelledOrderIds = new Set(
      salesOrderLines.filter(l => l.productId === id).map(l => l.orderId)
    );
    if (orphanOrCancelledOrderIds.size > 0) {
      setSalesOrderLines(prev => prev.filter(l => l.productId !== id));
      setSalesOrders(prev => prev.filter(o => !orphanOrCancelledOrderIds.has(o.id) || o.status !== 'CANCELLED'));
      setOutbounds(prev => prev.filter(ob => !orphanOrCancelledOrderIds.has(ob.orderId)));
    }
    setProducts(prev => prev.filter(p => p.id !== id));
    setInventoryLots(prev => prev.filter(l => l.productId !== id));
    await db.awaitPendingWrites();
  };

  const adjustProductStock = async (
    productId: string,
    adjustQty: number,
    unitCost: number,
    reason: string,
    extra?: { warehouseName?: string; serialNumber?: string; inboundDate?: string }
  ) => {
    if (adjustQty === 0) throw new Error('조정 수량은 0이 아니어야 합니다.');
    const now = new Date().toISOString();
    const prod = products.find(p => p.id === productId);

    if (adjustQty > 0) {
      const newLot: TradeInventoryLot = {
        id: `LOT-ADJ-${uuidv4()}`,
        purchaseId: 'STOCK_ADJUST',
        productId,
        serialNumber: extra?.serialNumber || (prod?.itemType === 'EQUIPMENT' ? `${prod.modelName || 'FL'}-${Date.now().toString().slice(-6)}` : `LOT-${Date.now().toString().slice(-5)}`),
        warehouseName: extra?.warehouseName || prod?.defaultWarehouse || 'A창고',
        inboundDate: extra?.inboundDate || now.split('T')[0],
        lotStatus: 'IN_STOCK',
        initialQty: adjustQty,
        remainingQty: adjustQty,
        unitCost: Math.max(0, unitCost),
        createdAt: now
      };
      setInventoryLots(prev => [...prev, newLot]);
    } else {
      const needed = Math.abs(adjustQty);
      const currentAvail = inventoryLots
        .filter(l => l.productId === productId)
        .reduce((s, l) => s + l.remainingQty, 0);
      if (currentAvail < needed) {
        throw new Error(`현재 가용 재고(${currentAvail}개)보다 많은 수량(${needed}개)을 차감할 수 없습니다.`);
      }
      let toDeduct = needed;
      setInventoryLots(prev =>
        prev.map(lot => {
          if (lot.productId === productId && lot.remainingQty > 0 && toDeduct > 0) {
            const d = Math.min(lot.remainingQty, toDeduct);
            toDeduct -= d;
            const nextRem = lot.remainingQty - d;
            return {
              ...lot,
              remainingQty: nextRem,
              lotStatus: nextRem === 0 ? 'SOLD' : lot.lotStatus
            };
          }
          return lot;
        })
      );
    }

    const adj: TradeInventoryAdjustment = {
      id: `ADJ-${uuidv4()}`,
      productId,
      warehouseId: extra?.warehouseName || prod?.defaultWarehouse || 'A창고',
      adjustQty,
      reason: reason || '수동 재고 실사 조정',
      createdAt: now
    };
    setInventoryAdjustments(prev => [adj, ...prev]);
    await db.awaitPendingWrites();
  };

  // ==========================================
  // 2. Purchases (구매 및 입고)
  // ==========================================
  const createPurchase = async (
    vendorId: string,
    items: {
      productId: string;
      qty: number;
      unitCost: number;
      foreignUnitCost?: number;
      incidentalCostPerUnit?: number;
      landedUnitCost?: number;
      warehouseName?: string;
      serialNumbers?: string[];
      memo?: string;
    }[],
    options?: {
      purchaseType?: 'DOMESTIC' | 'IMPORT';
      currency?: 'KRW' | 'CNY' | 'USD';
      exchangeRate?: number;
      foreignTotalAmount?: number;
      customsDuty?: number;
      customsClearanceFee?: number;
      freightCost?: number;
      otherIncidentalCost?: number;
      totalIncidentalCost?: number;
      landedTotalAmount?: number;
      warehouseName?: string;
      blNumber?: string;
      orderDate?: string;
      expectedDate?: string;
      status?: 'REQUESTED' | 'ORDERED';
      requesterName?: string;
      memo?: string;
    }
  ): Promise<TradePurchase> => {
    if (!vendorId) throw new Error('매입처를 선택해 주세요.');
    if (!items || items.length === 0) throw new Error('발주 품목을 최소 1개 이상 입력해 주세요.');
    for (const item of items) {
      if (!item.productId) throw new Error('발주 상품을 선택해 주세요.');
      if (item.qty <= 0) throw new Error('발주 수량은 1개 이상이어야 합니다.');
      if (item.unitCost < 0) throw new Error('매입 단가는 0원 이상이어야 합니다.');
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const pId = `PO-${today.slice(0, 7).replace('-', '')}-${uuidv4().slice(0, 4)}`;
    const totalAmount =
      options?.landedTotalAmount ??
      items.reduce((sum, item) => sum + item.qty * (item.landedUnitCost ?? item.unitCost), 0);
    const vatAmount = Math.round(totalAmount * 0.1);

    const newPurchase: TradePurchase = {
      id: pId,
      vendorId,
      purchaseType: options?.purchaseType || 'DOMESTIC',
      currency: options?.currency || 'KRW',
      exchangeRate: options?.exchangeRate || 1,
      foreignTotalAmount: options?.foreignTotalAmount,
      customsDuty: options?.customsDuty || 0,
      customsClearanceFee: options?.customsClearanceFee || 0,
      freightCost: options?.freightCost || 0,
      otherIncidentalCost: options?.otherIncidentalCost || 0,
      totalIncidentalCost: options?.totalIncidentalCost || 0,
      landedTotalAmount: totalAmount,
      warehouseName: options?.warehouseName || 'A창고',
      blNumber: options?.blNumber || '',
      orderDate: options?.orderDate || today,
      expectedDate: options?.expectedDate || today,
      status: options?.status || 'ORDERED',
      totalAmount,
      vatAmount,
      requesterName: options?.requesterName || currentUser?.name || '구매담당자',
      memo: options?.memo || '',
      createdAt: now,
      updatedAt: now
    };

    const newItems: TradePurchaseItem[] = items.map(i => ({
      id: `PI-${uuidv4()}`,
      purchaseId: pId,
      productId: i.productId,
      orderQty: i.qty,
      receivedQty: 0,
      unitCost: i.landedUnitCost ?? i.unitCost,
      foreignUnitCost: i.foreignUnitCost,
      incidentalCostPerUnit: i.incidentalCostPerUnit,
      landedUnitCost: i.landedUnitCost ?? i.unitCost,
      warehouseName: i.warehouseName || options?.warehouseName || 'A창고',
      serialNumbers: i.serialNumbers,
      memo: i.memo || ''
    }));

    setPurchases(prev => [newPurchase, ...prev]);
    setPurchaseItems(prev => [...newItems, ...prev]);
    await db.awaitPendingWrites();
    return newPurchase;
  };

  const updatePurchase = async (
    purchaseId: string,
    updates: Partial<TradePurchase>,
    updatedItems?: {
      id?: string;
      productId: string;
      orderQty: number;
      unitCost: number;
      foreignUnitCost?: number;
      incidentalCostPerUnit?: number;
      landedUnitCost?: number;
      warehouseName?: string;
      serialNumbers?: string[];
      memo?: string;
    }[]
  ) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) throw new Error('발주 내역을 찾을 수 없습니다.');

    const now = new Date().toISOString();
    let nextTotalAmount = updates.landedTotalAmount ?? updates.totalAmount ?? purchase.totalAmount;
    let nextVatAmount = updates.vatAmount ?? purchase.vatAmount;

    if (updatedItems && updatedItems.length > 0) {
      nextTotalAmount =
        updates.landedTotalAmount ??
        updatedItems.reduce((sum, i) => sum + i.orderQty * (i.landedUnitCost ?? i.unitCost), 0);
      nextVatAmount = Math.round(nextTotalAmount * 0.1);

      const existingForPurchase = purchaseItems.filter(pi => pi.purchaseId === purchaseId);
      const rebuilt: TradePurchaseItem[] = updatedItems.map(ui => {
        const matched = existingForPurchase.find(e => e.id === ui.id || e.productId === ui.productId);
        return {
          id: matched?.id || `PI-${uuidv4()}`,
          purchaseId,
          productId: ui.productId,
          orderQty: ui.orderQty,
          receivedQty: matched?.receivedQty || 0,
          unitCost: ui.landedUnitCost ?? ui.unitCost,
          foreignUnitCost: ui.foreignUnitCost ?? matched?.foreignUnitCost,
          incidentalCostPerUnit: ui.incidentalCostPerUnit ?? matched?.incidentalCostPerUnit,
          landedUnitCost: ui.landedUnitCost ?? ui.unitCost,
          warehouseName: ui.warehouseName ?? matched?.warehouseName ?? purchase.warehouseName ?? 'A창고',
          serialNumbers: ui.serialNumbers ?? matched?.serialNumbers,
          memo: ui.memo ?? matched?.memo ?? ''
        };
      });

      setPurchaseItems(prev => [...prev.filter(pi => pi.purchaseId !== purchaseId), ...rebuilt]);
    }

    setPurchases(prev =>
      prev.map(p =>
        p.id === purchaseId
          ? {
              ...p,
              ...updates,
              landedTotalAmount: nextTotalAmount,
              totalAmount: nextTotalAmount,
              vatAmount: nextVatAmount,
              updatedAt: now
            }
          : p
      )
    );
    await db.awaitPendingWrites();
  };

  const acceptPurchase = async (purchaseId: string) => {
    const now = new Date().toISOString();
    setPurchases(prev =>
      prev.map(p => (p.id === purchaseId ? { ...p, status: 'ORDERED', updatedAt: now } : p))
    );
    await db.awaitPendingWrites();
  };

  const confirmInbound = async (
    purchaseId: string,
    received: {
      productId: string;
      qty: number;
      unitCost?: number;
      warehouseName?: string;
      serialNumbers?: string[];
    }[],
    receivedDate?: string
  ) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) throw new Error('발주 내역을 찾을 수 없습니다.');
    if (purchase.status === 'CANCELLED') throw new Error('취소된 발주 건은 입고 확정할 수 없습니다.');

    const targetItems = purchaseItems.filter(pi => pi.purchaseId === purchaseId);
    for (const rec of received) {
      const pItem = targetItems.find(pi => pi.productId === rec.productId);
      if (pItem && pItem.receivedQty + rec.qty > pItem.orderQty) {
        throw new Error('발주 수량을 초과하여 입고할 수 없습니다.');
      }
    }

    const now = new Date().toISOString();
    const inDate = receivedDate || now.split('T')[0];
    const newLots: TradeInventoryLot[] = [];

    const nextPurchaseItems = purchaseItems.map(pi => {
      if (pi.purchaseId === purchaseId) {
        const rec = received.find(r => r.productId === pi.productId);
        const addQty = rec ? Math.max(0, rec.qty) : 0;
        const finalCost = rec?.unitCost !== undefined ? rec.unitCost : (pi.landedUnitCost ?? pi.unitCost);
        const prod = products.find(p => p.id === pi.productId);
        const whName = rec?.warehouseName || pi.warehouseName || purchase.warehouseName || prod?.defaultWarehouse || 'A창고';
        const serialList =
          rec?.serialNumbers && rec.serialNumbers.length > 0
            ? rec.serialNumbers
            : pi.serialNumbers && pi.serialNumbers.length > 0
            ? pi.serialNumbers
            : [];

        if (addQty > 0) {
          if (prod?.itemType === 'EQUIPMENT' || serialList.length > 0) {
            for (let idx = 0; idx < addQty; idx++) {
              const sn =
                serialList[idx] ||
                `${prod?.modelName || prod?.skuCode || 'FL'}-${inDate.replace(/-/g, '').slice(2)}${String(idx + 1).padStart(2, '0')}`;
              newLots.push({
                id: `LOT-SN-${uuidv4()}`,
                purchaseId,
                productId: pi.productId,
                serialNumber: sn,
                warehouseName: whName,
                inboundDate: inDate,
                foreignCurrency: purchase.currency || 'KRW',
                foreignUnitPrice: pi.foreignUnitCost ?? finalCost,
                exchangeRate: purchase.exchangeRate || 1,
                incidentalCostPerUnit: pi.incidentalCostPerUnit || 0,
                lotStatus: 'IN_STOCK',
                initialQty: 1,
                remainingQty: 1,
                unitCost: finalCost,
                createdAt: now
              });
            }
          } else {
            newLots.push({
              id: `LOT-PT-${uuidv4()}`,
              purchaseId,
              productId: pi.productId,
              serialNumber: `${prod?.skuCode || 'PART'}-${inDate.replace(/-/g, '').slice(2)}-LOT`,
              warehouseName: whName,
              inboundDate: inDate,
              foreignCurrency: purchase.currency || 'KRW',
              foreignUnitPrice: pi.foreignUnitCost ?? finalCost,
              exchangeRate: purchase.exchangeRate || 1,
              incidentalCostPerUnit: pi.incidentalCostPerUnit || 0,
              lotStatus: 'IN_STOCK',
              initialQty: addQty,
              remainingQty: addQty,
              unitCost: finalCost,
              createdAt: now
            });
          }
        }
        return {
          ...pi,
          receivedQty: pi.receivedQty + addQty,
          unitCost: finalCost,
          landedUnitCost: finalCost,
          warehouseName: whName,
          serialNumbers: serialList.length > 0 ? serialList : pi.serialNumbers
        };
      }
      return pi;
    });

    const updatedForThisPO = nextPurchaseItems.filter(pi => pi.purchaseId === purchaseId);
    const allReceived = updatedForThisPO.every(pi => pi.receivedQty >= pi.orderQty);
    const someReceived = updatedForThisPO.some(pi => pi.receivedQty > 0);
    const nextStatus = allReceived ? 'RECEIVED' : someReceived ? 'PARTIAL_RECEIVED' : purchase.status;

    setPurchaseItems(nextPurchaseItems);
    setPurchases(prev =>
      prev.map(p =>
        p.id === purchaseId
          ? { ...p, status: nextStatus, receivedDate: inDate, updatedAt: now }
          : p
      )
    );

    if (newLots.length > 0) {
      setInventoryLots(prev => [...prev, ...newLots]);
    }
    await db.awaitPendingWrites();
  };

  const cancelPurchase = async (purchaseId: string, reason?: string, itemId?: string) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) throw new Error('발주 내역을 찾을 수 없습니다.');

    const poItems = purchaseItems.filter(pi => pi.purchaseId === purchaseId);
    const targetItem = itemId ? poItems.find(pi => pi.id === itemId) : undefined;

    // When a specific row (itemId) is cancelled and the PO has multiple items:
    // only cancel/revert that specific row's inbound quantity, or if only 1 item / full PO cancel, cancel the whole PO
    if (targetItem && poItems.length > 1) {
      const itemLots = inventoryLots.filter(
        l => l.purchaseId === purchaseId && l.productId === targetItem.productId
      );
      const consumed = itemLots.some(l => l.remainingQty < l.initialQty);
      if (consumed) {
        throw new Error('이미 출고에 사용된 입고 로트가 포함되어 있어 해당 품목을 취소할 수 없습니다.');
      }

      const now = new Date().toISOString();
      if (itemLots.length > 0) {
        setInventoryLots(prev =>
          prev.filter(l => !(l.purchaseId === purchaseId && l.productId === targetItem.productId))
        );
      }

      const nextItems = purchaseItems.map(pi =>
        pi.id === targetItem.id
          ? {
              ...pi,
              receivedQty: 0,
              memo: reason ? `${pi.memo ? pi.memo + ' | ' : ''}[품목취소: ${reason}]` : pi.memo
            }
          : pi
      );
      setPurchaseItems(nextItems);

      const remainingPOItems = nextItems.filter(pi => pi.purchaseId === purchaseId);
      const someReceived = remainingPOItems.some(pi => pi.receivedQty > 0);
      const allCancelledOrZero = remainingPOItems.every(
        pi => pi.receivedQty === 0 && (pi.memo || '').includes('[품목취소')
      );
      const nextStatus = allCancelledOrZero
        ? 'CANCELLED'
        : someReceived
        ? 'PARTIAL_RECEIVED'
        : 'ORDERED';

      setPurchases(prev =>
        prev.map(p =>
          p.id === purchaseId
            ? {
                ...p,
                status: nextStatus,
                updatedAt: now
              }
            : p
        )
      );
      await db.awaitPendingWrites();
      return;
    }

    // Full purchase order cancellation (or single-item PO)
    const poLots = inventoryLots.filter(l => l.purchaseId === purchaseId);
    const consumed = poLots.some(l => l.remainingQty < l.initialQty);
    if (consumed) {
      throw new Error('이미 출고에 사용된 입고 로트가 포함되어 있어 발주를 취소할 수 없습니다.');
    }

    const now = new Date().toISOString();
    if (poLots.length > 0) {
      setInventoryLots(prev => prev.filter(l => l.purchaseId !== purchaseId));
    }
    setPurchaseItems(prev =>
      prev.map(pi => (pi.purchaseId === purchaseId ? { ...pi, receivedQty: 0 } : pi))
    );
    setPurchases(prev =>
      prev.map(p =>
        p.id === purchaseId
          ? {
              ...p,
              status: 'CANCELLED',
              memo: reason ? `${p.memo ? p.memo + ' | ' : ''}[취소: ${reason}]` : p.memo,
              updatedAt: now
            }
          : p
      )
    );
    await db.awaitPendingWrites();
  };

  const deletePurchase = async (purchaseId: string, itemId?: string) => {
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) return;

    const poItems = purchaseItems.filter(pi => pi.purchaseId === purchaseId);
    const targetItem = itemId ? poItems.find(pi => pi.id === itemId) : undefined;

    // Row-level deletion when itemId is provided
    if (targetItem) {
      if (targetItem.receivedQty > 0 && purchase.status !== 'CANCELLED') {
        // Also check if unconsumed lot can be reclaimed on direct row delete or require cancel first
        const itemLots = inventoryLots.filter(
          l => l.purchaseId === purchaseId && l.productId === targetItem.productId
        );
        const consumed = itemLots.some(l => l.remainingQty < l.initialQty);
        if (consumed) {
          throw new Error('이미 출고에 사용된 입고 로트가 포함되어 있어 삭제할 수 없습니다.');
        }
        if (itemLots.length > 0) {
          setInventoryLots(prev =>
            prev.filter(l => !(l.purchaseId === purchaseId && l.productId === targetItem.productId))
          );
        }
      }

      if (poItems.length > 1) {
        const remainingForPO = poItems.filter(pi => pi.id !== targetItem.id);
        const nextTotalAmount = remainingForPO.reduce((sum, i) => sum + i.orderQty * i.unitCost, 0);
        const nextVatAmount = Math.round(nextTotalAmount * 0.1);
        const allReceived = remainingForPO.every(pi => pi.receivedQty >= pi.orderQty);
        const someReceived = remainingForPO.some(pi => pi.receivedQty > 0);
        const nextStatus =
          purchase.status === 'CANCELLED'
            ? 'CANCELLED'
            : allReceived
            ? 'RECEIVED'
            : someReceived
            ? 'PARTIAL_RECEIVED'
            : 'ORDERED';

        const now = new Date().toISOString();
        setPurchaseItems(prev => prev.filter(pi => pi.id !== targetItem.id));
        setPurchases(prev =>
          prev.map(p =>
            p.id === purchaseId
              ? {
                  ...p,
                  totalAmount: nextTotalAmount,
                  vatAmount: nextVatAmount,
                  status: nextStatus,
                  updatedAt: now
                }
              : p
          )
        );
        await db.awaitPendingWrites();
        return;
      }
    } else {
      if (purchase.status === 'RECEIVED' || purchase.status === 'PARTIAL_RECEIVED') {
        throw new Error('입고 완료된 발주 건은 먼저 [발주 취소]로 재고를 회수한 뒤 삭제해 주세요.');
      }
    }

    setPurchases(prev => prev.filter(p => p.id !== purchaseId));
    setPurchaseItems(prev => prev.filter(pi => pi.purchaseId !== purchaseId));
    await db.awaitPendingWrites();
  };

  // ==========================================
  // 3. Sales Orders (유통 계약 및 수주 관리)
  // ==========================================
  const createSalesOrder = async (
    customerId: string,
    items: {
      productId: string;
      qty: number;
      unitPrice: number;
      serialNumbers?: string[];
      warehouseName?: string;
      memo?: string;
    }[],
    options?: {
      customerTier?: 'DEALER' | 'END_USER';
      orderDate?: string;
      deliveryDate?: string;
      deliveryLocation?: string;
      receiverName?: string;
      receiverPhone?: string;
      paymentTerms?: string;
      specialTerms?: string;
      salespersonName?: string;
      memo?: string;
      status?: 'PENDING' | 'CONFIRMED';
      contractId?: string;
      contractNo?: string;
      siteId?: string;
      siteName?: string;
      billingMode?: 'RENTAL_MERGED' | 'STANDALONE';
      targetBillingYm?: string;
      linkedReceivableId?: string;
      linkedBillingId?: string;
      deliveryMethod?: 'COURIER' | 'DIRECT' | 'BUNDLE_WITH_RENTAL';
      linkedRentalDeliveryId?: string;
    }
  ): Promise<TradeSalesOrder> => {
    if (!customerId || customerId.trim() === '') throw new Error('고객사 정보가 누락되었습니다.');
    if (items.length === 0) throw new Error('수주 품목이 1개 이상 존재해야 합니다.');

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const autoReplenishedLots: TradeInventoryLot[] = [];

    for (const i of items) {
      const prod = products.find(p => p.id === i.productId);
      if (!prod) throw new Error('상품 마스터가 존재하지 않습니다.');
      if (prod.status === 'DISCONTINUED') throw new Error(`[${prod.name}] 상품은 단종되어 수주할 수 없습니다.`);

      const availableQty = inventoryLots
        .filter(l => l.productId === i.productId)
        .reduce((sum, l) => sum + l.remainingQty, 0);
      if (availableQty < i.qty) {
        if (options?.contractId || options?.status === 'CONFIRMED') {
          const shortfall = i.qty - availableQty;
          autoReplenishedLots.push({
            id: `LOT-AUTO-${uuidv4()}`,
            purchaseId: options?.contractId ? `CONTRACT_AUTO_${options.contractId}` : `OUTBOUND_AUTO_${today.replace(/-/g, '')}`,
            productId: i.productId,
            warehouseName: i.warehouseName || prod.defaultWarehouse || 'A창고',
            inboundDate: today,
            lotStatus: 'IN_STOCK',
            initialQty: shortfall,
            remainingQty: shortfall,
            unitCost: prod.standardCost ?? Math.round((i.unitPrice || prod.standardPrice || 0) * 0.7),
            createdAt: now
          });
        } else {
          throw new Error(
            `[${prod.name}] 가용 재고(${availableQty}개)가 부족하여 ${i.qty}개를 수주할 수 없습니다.`
          );
        }
      }
    }

    const oId = `SO-${uuidv4()}`;
    let totalSalesAmount = 0;
    let totalCogsAmount = 0;
    const newLines: TradeSalesOrderLine[] = [];
    const custName = getCustomerName(customerId);
    const saleDate = options?.orderDate || today;

    const updatedLots = [...inventoryLots, ...autoReplenishedLots]
      .map(l => ({ ...l }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    items.forEach(i => {
      const lineAmount = i.qty * i.unitPrice;
      totalSalesAmount += lineAmount;

      let remainingToFulfill = i.qty;
      let lineCogsTotal = 0;
      const usedSerials: string[] = [];
      let resolvedWh = i.warehouseName;
      const prod = products.find(p => p.id === i.productId);
      const warrantyMonths = prod?.warrantyMonths || 12;
      const warrantyEnd = new Date(new Date(saleDate).getTime() + warrantyMonths * 30 * 86400000)
        .toISOString()
        .split('T')[0];

      // 1) If specific serialNumbers were requested, deduct those first
      if (i.serialNumbers && i.serialNumbers.length > 0) {
        for (const reqSn of i.serialNumbers) {
          const targetLot = updatedLots.find(
            l => l.productId === i.productId && l.serialNumber === reqSn && l.remainingQty > 0
          );
          if (targetLot && remainingToFulfill > 0) {
            const deduct = Math.min(targetLot.remainingQty, remainingToFulfill);
            targetLot.remainingQty -= deduct;
            remainingToFulfill -= deduct;
            lineCogsTotal += deduct * targetLot.unitCost;
            if (targetLot.serialNumber) usedSerials.push(targetLot.serialNumber);
            if (!resolvedWh && targetLot.warehouseName) resolvedWh = targetLot.warehouseName;
            if (targetLot.remainingQty === 0) {
              targetLot.lotStatus = 'SOLD';
              targetLot.soldOrderId = oId;
              targetLot.soldDate = saleDate;
              targetLot.soldCustomerName = custName;
              targetLot.warrantyEndDate = warrantyEnd;
            }
          }
        }
      }

      // 2) Deduct any remaining quantity via FIFO
      for (const lot of updatedLots) {
        if (lot.productId === i.productId && lot.remainingQty > 0 && remainingToFulfill > 0) {
          const deduct = Math.min(lot.remainingQty, remainingToFulfill);
          lot.remainingQty -= deduct;
          remainingToFulfill -= deduct;
          lineCogsTotal += deduct * lot.unitCost;
          if (lot.serialNumber && prod?.itemType === 'EQUIPMENT') usedSerials.push(lot.serialNumber);
          if (!resolvedWh && lot.warehouseName) resolvedWh = lot.warehouseName;
          if (lot.remainingQty === 0) {
            lot.lotStatus = 'SOLD';
            lot.soldOrderId = oId;
            lot.soldDate = saleDate;
            lot.soldCustomerName = custName;
            lot.warrantyEndDate = warrantyEnd;
          }
        }
      }

      const unitCogs = Math.round(i.qty > 0 ? lineCogsTotal / i.qty : 0);
      totalCogsAmount += Math.round(lineCogsTotal);

      const line: TradeSalesOrderLine = {
        id: `SOL-${uuidv4()}`,
        orderId: oId,
        productId: i.productId,
        qty: i.qty,
        unitPrice: i.unitPrice,
        unitCogs,
        serialNumbers: usedSerials.length > 0 ? usedSerials : i.serialNumbers,
        warehouseName: resolvedWh || prod?.defaultWarehouse || 'A창고',
        memo: i.memo || '',
        createdAt: now
      };
      newLines.push(line);
    });

    setInventoryLots(updatedLots);

    const cust = getCustomerById(customerId);
    const resolvedStatus = options?.status || (options?.contractId ? 'CONFIRMED' : 'PENDING');
    const defaultDeliveryLabel =
      options?.deliveryMethod === 'BUNDLE_WITH_RENTAL'
        ? '출고 장비 동봉'
        : options?.deliveryMethod === 'DIRECT'
        ? '화물 직배'
        : '택배 발송';
    const newOrder: TradeSalesOrder = {
      id: oId,
      customerId,
      customerTier: options?.customerTier || 'END_USER',
      contractId: options?.contractId,
      contractNo: options?.contractNo,
      siteId: options?.siteId,
      siteName: options?.siteName,
      billingMode: options?.billingMode,
      targetBillingYm: options?.targetBillingYm,
      linkedReceivableId: options?.linkedReceivableId,
      linkedBillingId: options?.linkedBillingId,
      deliveryMethod: options?.deliveryMethod,
      linkedRentalDeliveryId: options?.linkedRentalDeliveryId,
      orderDate: options?.orderDate || today,
      status: resolvedStatus,
      totalSalesAmount,
      totalCogsAmount,
      createdAt: now,
      updatedAt: now,
      contractDocStatus: 'DRAFT',
      deliveryDate: options?.deliveryDate || (options?.contractId || resolvedStatus === 'CONFIRMED' ? today : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]),
      deliveryLocation: options?.deliveryLocation || cust?.address || '고객사 지정 현장',
      receiverName: options?.receiverName || cust?.representative || '현장담당자',
      receiverPhone: options?.receiverPhone || cust?.repContact || '010-0000-0000',
      paymentTerms:
        options?.paymentTerms ||
        '납품 및 검수 완료 후 세금계산서 발행, 30일 이내 현금 결제',
      specialTerms:
        options?.specialTerms ||
        '1. 운송비 매도인 부담\n2. 물품 검수 기한 3영업일',
      salespersonName: options?.salespersonName || currentUser?.name || '유통영업팀',
      memo: options?.memo || ''
    };

    setSalesOrders(prev => [newOrder, ...prev]);
    setSalesOrderLines(prev => [...newLines, ...prev]);

    const outbId = `TOUT-${uuidv4()}`;
    const isBundleWithRental = options?.deliveryMethod === 'BUNDLE_WITH_RENTAL';
    const autoAllocate = isBundleWithRental || Boolean(options?.contractId) || resolvedStatus === 'CONFIRMED';
    setOutbounds(prev => [
      {
        id: outbId,
        orderId: oId,
        contractId: options?.contractId,
        linkedRentalDeliveryId: options?.linkedRentalDeliveryId,
        status: autoAllocate ? 'ALLOCATED' : 'REQUESTED',
        allocatedAt: autoAllocate ? now : undefined,
        deliveryType: options?.deliveryMethod || 'DIRECT',
        destinationAddress: newOrder.deliveryLocation,
        receiverName: newOrder.receiverName,
        receiverPhone: newOrder.receiverPhone,
        closingMemo: isBundleWithRental
          ? `[렌탈 장비 동봉 출고] 계약: ${options?.contractNo || options?.contractId || '-'}`
          : undefined,
        createdAt: now,
        updatedAt: now
      },
      ...prev
    ]);

    await db.awaitPendingWrites();
    return newOrder;
  };

  const updateSalesOrder = async (
    id: string,
    updates: Partial<TradeSalesOrder>,
    updatedLines?: {
      id?: string;
      productId: string;
      qty: number;
      unitPrice: number;
      serialNumbers?: string[];
      warehouseName?: string;
      memo?: string;
    }[]
  ) => {
    const now = new Date().toISOString();
    let computedSalesAmount: number | undefined = updates.totalSalesAmount;
    let computedCogsAmount: number | undefined = updates.totalCogsAmount;

    if (updatedLines && updatedLines.length > 0) {
      setSalesOrderLines(prev => {
        const oldLines = prev.filter(l => l.orderId === id);
        const nextLines: TradeSalesOrderLine[] = updatedLines.map(ul => {
          const matched = oldLines.find(ol => ol.id === ul.id || ol.productId === ul.productId);
          const prod = products.find(p => p.id === ul.productId);
          const unitCogs = matched?.unitCogs ?? prod?.standardCost ?? Math.round(ul.unitPrice * 0.7);
          return {
            id: matched?.id || `SOL-${uuidv4()}`,
            orderId: id,
            productId: ul.productId,
            qty: ul.qty,
            unitPrice: ul.unitPrice,
            unitCogs,
            serialNumbers: ul.serialNumbers ?? matched?.serialNumbers,
            warehouseName: ul.warehouseName ?? matched?.warehouseName ?? prod?.defaultWarehouse ?? 'A창고',
            memo: ul.memo ?? matched?.memo ?? '',
            createdAt: matched?.createdAt || now
          };
        });

        computedSalesAmount = nextLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
        computedCogsAmount = nextLines.reduce((s, l) => s + l.qty * l.unitCogs, 0);

        return [...prev.filter(l => l.orderId !== id), ...nextLines];
      });
    }

    setSalesOrders(prev =>
      prev.map(o =>
        o.id === id
          ? {
              ...o,
              ...updates,
              totalSalesAmount: computedSalesAmount ?? o.totalSalesAmount,
              totalCogsAmount: computedCogsAmount ?? o.totalCogsAmount,
              updatedAt: now
            }
          : o
      )
    );

    if (updates.deliveryLocation || updates.receiverName || updates.receiverPhone) {
      setOutbounds(prev =>
        prev.map(ob =>
          ob.orderId === id
            ? {
                ...ob,
                destinationAddress: updates.deliveryLocation || ob.destinationAddress,
                receiverName: updates.receiverName || ob.receiverName,
                receiverPhone: updates.receiverPhone || ob.receiverPhone,
                updatedAt: now
              }
            : ob
        )
      );
    }

    await db.awaitPendingWrites();
  };

  const acceptSalesOrder = async (id: string) => {
    const now = new Date().toISOString();
    setSalesOrders(prev =>
      prev.map(o => (o.id === id ? { ...o, status: 'CONFIRMED', updatedAt: now } : o))
    );
    await db.awaitPendingWrites();
  };

  const cancelSalesOrder = async (id: string, reason?: string) => {
    const order = salesOrders.find(o => o.id === id);
    if (!order) throw new Error('수주 건을 찾을 수 없습니다.');
    if (order.status === 'CANCELLED') throw new Error('이미 취소된 수주입니다.');
    if (order.status === 'DELIVERED') {
      throw new Error('이미 납품 완료된 수주는 취소할 수 없습니다. [환입 및 반품] 메뉴에서 반품 처리해 주세요.');
    }

    const now = new Date().toISOString();
    const lines = salesOrderLines.filter(l => l.orderId === id);

    // Restore inventory lots for cancelled order
    const restoredLots: TradeInventoryLot[] = lines.map(l => ({
      id: `LOT-RESTORE-${uuidv4()}`,
      purchaseId: `SO_CANCEL_${id}`,
      productId: l.productId,
      initialQty: l.qty,
      remainingQty: l.qty,
      unitCost: l.unitCogs,
      createdAt: now
    }));

    setInventoryLots(prev => [...prev, ...restoredLots]);
    setSalesOrders(prev =>
      prev.map(o =>
        o.id === id
          ? {
              ...o,
              status: 'CANCELLED',
              memo: reason ? `${o.memo ? o.memo + ' | ' : ''}[취소: ${reason}]` : o.memo,
              updatedAt: now
            }
          : o
      )
    );
    setOutbounds(prev =>
      prev.map(ob => (ob.orderId === id ? { ...ob, status: 'CANCELLED', updatedAt: now } : ob))
    );

    // 렌탈 계약과 연동된 외상미수금 및 당월 청구 상세가 있는 경우 안전 롤백
    const matchedRcvs = (db.receivables || []).filter(
      r =>
        r.id === order.linkedReceivableId ||
        Boolean(r.internalDescription && r.internalDescription.includes(`[유통출고:${id}]`))
    );
    for (const rcv of matchedRcvs) {
      const linkedBds = (db.billingDetails || []).filter(bd => bd.receivableId === rcv.id);
      for (const bd of linkedBds) {
        const parentBilling = (db.billings || []).find(b => b.id === bd.billingId);
        if (parentBilling && parentBilling.status !== 'PAID' && parentBilling.status !== 'REJECTED') {
          db.updateRow<any>('billings', parentBilling.id, {
            totalAmount: Math.max(0, (parentBilling.totalAmount || 0) - (bd.amount || 0)),
            updatedAt: now
          });
          db.deleteRow('billingDetails', bd.id);
        }
      }
      db.deleteRow('receivables', rcv.id);
    }

    await db.awaitPendingWrites();
  };

  const deleteSalesOrder = async (id: string) => {
    const order = salesOrders.find(o => o.id === id);
    if (!order) return;
    if (order.status !== 'CANCELLED' && order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
      throw new Error('진행 중이거나 완료된 수주는 먼저 [수주 취소] 후 삭제할 수 있습니다.');
    }
    if (order.status !== 'CANCELLED') {
      await cancelSalesOrder(id, '수주 삭제에 따른 재고 환원');
    }
    setSalesOrders(prev => prev.filter(o => o.id !== id));
    setSalesOrderLines(prev => prev.filter(l => l.orderId !== id));
    setOutbounds(prev => prev.filter(ob => ob.orderId !== id));
    await db.awaitPendingWrites();
  };

  const sendTradeContractEmail = async (
    orderId: string,
    emailData: {
      to: string;
      cc?: string;
      subject: string;
      body: string;
      isTestMode: boolean;
      excelBuffer: ArrayBuffer;
      fileName: string;
      terms?: {
        deliveryLocation?: string;
        deliveryDate?: string;
        paymentTerms?: string;
        specialTerms?: string;
      };
    }
  ): Promise<SentEmail> => {
    const order = salesOrders.find(o => o.id === orderId);
    if (!order) throw new Error('수주 건을 찾을 수 없습니다.');

    const devEmail = 'admin@ebro.co.kr';
    let destinationTo = emailData.to;
    let destinationCc = emailData.cc;
    let finalSubject = emailData.subject;
    let finalBody = emailData.body;

    if (emailData.isTestMode) {
      destinationTo = devEmail;
      destinationCc = undefined;
      finalSubject = `[테스트 격리 발송] ${emailData.subject}`;
      finalBody =
        `[※ 전사 표준 헌장 5.9조 테스트 발송 격리 정책]\n본 메일은 거래처 실제 발송이 차단되어 개발자(${devEmail})에게 안전하게 격리 발송되었습니다.\n(원래 수신 대상: ${emailData.to})\n\n----------------------------------------\n\n` +
        emailData.body;
    }

    let sentEmail: SentEmail;

    if (emailData.isTestMode) {
      sentEmail = {
        id: `mail-test-${Math.random().toString(36).substr(2, 9)}`,
        to: destinationTo,
        cc: destinationCc,
        subject: finalSubject,
        body: finalBody,
        sentAt: new Date().toISOString(),
        success: true
      };
      try {
        const raw = localStorage.getItem('sent_emails');
        const history = raw ? JSON.parse(raw) : [];
        history.unshift(sentEmail);
        localStorage.setItem('sent_emails', JSON.stringify(history.slice(0, 20)));
      } catch (e) {
        console.warn('sent_emails localStorage 저장 실패:', e);
      }
    } else {
      const uint8 = new Uint8Array(emailData.excelBuffer);
      let binary = '';
      for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const base64Excel = btoa(binary);
      const attachments = [
        {
          filename: emailData.fileName || `물품매매계약서_${orderId}.xlsx`,
          content: base64Excel,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ];

      sentEmail = await emailService.sendEmail(
        destinationTo,
        finalSubject,
        finalBody,
        attachments,
        destinationCc,
        '(주)기연리프트 / e-Bro ERP'
      );
    }

    const now = new Date().toISOString();
    const updates: Partial<TradeSalesOrder> = {
      contractDocStatus: 'SENT',
      contractSentAt: now,
      contractSentTo: emailData.to,
      updatedAt: now,
      ...(emailData.terms || {})
    };

    setSalesOrders(prev => prev.map(o => (o.id === orderId ? { ...o, ...updates } : o)));
    await db.awaitPendingWrites();

    return sentEmail;
  };

  // ==========================================
  // 4. Outbounds & Courier Dispatch (출고 및 배송)
  // ==========================================
  const createOutboundManual = async (
    orderId: string,
    extra?: {
      destinationAddress?: string;
      receiverName?: string;
      receiverPhone?: string;
      deliveryType?: 'COURIER' | 'DIRECT' | 'BUNDLE_WITH_RENTAL';
      closingMemo?: string;
    }
  ): Promise<TradeOutbound> => {
    const order = salesOrders.find(o => o.id === orderId);
    if (!order) throw new Error('대상 수주 건을 찾을 수 없습니다.');
    const cust = getCustomerById(order.customerId);
    const now = new Date().toISOString();
    const newOb: TradeOutbound = {
      id: `TOUT-${uuidv4()}`,
      orderId,
      status: 'REQUESTED',
      deliveryType: extra?.deliveryType || 'COURIER',
      destinationAddress: extra?.destinationAddress || order.deliveryLocation || cust?.address || '',
      receiverName: extra?.receiverName || order.receiverName || cust?.representative || '',
      receiverPhone: extra?.receiverPhone || order.receiverPhone || cust?.repContact || '',
      closingMemo: extra?.closingMemo || '',
      createdAt: now,
      updatedAt: now
    };
    setOutbounds(prev => [newOb, ...prev]);
    await db.awaitPendingWrites();
    return newOb;
  };

  const allocateOutbound = async (outboundId: string) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) throw new Error('출고 요청이 존재하지 않습니다.');
    if (ob.status !== 'REQUESTED' && ob.status !== 'CANCELLED') {
      throw new Error('출고 요청 대기 상태에서만 재고 할당이 가능합니다.');
    }
    const now = new Date().toISOString();
    setOutbounds(prev =>
      prev.map(o =>
        o.id === outboundId ? { ...o, status: 'ALLOCATED', allocatedAt: now, updatedAt: now } : o
      )
    );
    setSalesOrders(prev =>
      prev.map(so =>
        so.id === ob.orderId && so.status === 'PENDING'
          ? { ...so, status: 'CONFIRMED', updatedAt: now }
          : so
      )
    );
    await db.awaitPendingWrites();
  };

  const packOutbound = async (outboundId: string) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) throw new Error('출고 요청이 존재하지 않습니다.');
    const now = new Date().toISOString();
    setOutbounds(prev =>
      prev.map(o =>
        o.id === outboundId ? { ...o, status: 'PACKED', packedAt: now, updatedAt: now } : o
      )
    );
    await db.awaitPendingWrites();
  };

  const updateOutbound = async (outboundId: string, updates: Partial<TradeOutbound>) => {
    const now = new Date().toISOString();
    setOutbounds(prev =>
      prev.map(o => (o.id === outboundId ? { ...o, ...updates, updatedAt: now } : o))
    );
    await db.awaitPendingWrites();
  };

  const cancelOutbound = async (outboundId: string, reason?: string) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) throw new Error('출고 내역을 찾을 수 없습니다.');
    if (ob.status === 'DELIVERED') {
      throw new Error('이미 납품 완료된 출고 건은 취소할 수 없습니다.');
    }
    const now = new Date().toISOString();
    if (ob.status === 'ALLOCATED' || ob.status === 'PACKED') {
      // Revert to REQUESTED
      setOutbounds(prev =>
        prev.map(o =>
          o.id === outboundId
            ? {
                ...o,
                status: 'REQUESTED',
                closingMemo: reason ? `${o.closingMemo ? o.closingMemo + ' | ' : ''}[할당취소: ${reason}]` : o.closingMemo,
                updatedAt: now
              }
            : o
        )
      );
    } else {
      setOutbounds(prev =>
        prev.map(o =>
          o.id === outboundId
            ? {
                ...o,
                status: 'CANCELLED',
                closingMemo: reason ? `${o.closingMemo ? o.closingMemo + ' | ' : ''}[출고취소: ${reason}]` : o.closingMemo,
                updatedAt: now
              }
            : o
        )
      );
    }
    await db.awaitPendingWrites();
  };

  const deleteOutbound = async (outboundId: string) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) return;
    if (ob.status === 'SHIPPED' || ob.status === 'DELIVERED') {
      throw new Error('배송 중이거나 납품 완료된 출고 건은 삭제할 수 없습니다.');
    }
    setOutbounds(prev => prev.filter(o => o.id !== outboundId));
    await db.awaitPendingWrites();
  };

  const syncTradeDeliveryToDatabase = async (ob: TradeOutbound, extra: any) => {
    const order = salesOrders.find(so => so.id === ob.orderId);
    const lines = salesOrderLines.filter(l => l.orderId === ob.orderId);
    const customer = getCustomerById(order?.customerId);
    const customerName = getCustomerName(order?.customerId);

    const cargoItems = lines.map(line => {
      const prod = products.find(p => p.id === line.productId);
      return {
        modelName: `[${prod?.skuCode || 'SKU'}] ${prod?.name || '유통상품'}`,
        count: line.qty,
        note: `${line.unitPrice?.toLocaleString()}원 (정상 납품)`
      };
    });

    const deliveryRecord: any = {
      id: ob.id,
      contractId: ob.orderId,
      type: 'OUTBOUND',
      dispatchCategory: '출고',
      status: 'DISPATCHED',
      requestDate: new Date().toISOString().split('T')[0],
      customerName,
      destinationAddress: extra.destinationAddress || ob.destinationAddress || customer?.address || '서울특별시 강남구 테헤란로 152',
      receiverName: extra.receiverName || ob.receiverName || customer?.representative || '인수담당자',
      receiverPhone: extra.receiverPhone || ob.receiverPhone || customer?.repContact || '010-0000-0000',
      driverName: extra.driverName || extra.courierName || '지정 배송기사',
      driverContact: extra.driverContact || extra.trackingNumber || '-',
      vehicleNo: extra.vehicleNo || (extra.courierName ? `${extra.courierName} (${extra.trackingNumber})` : '화물 운송차량'),
      cargoItems: JSON.stringify(cargoItems.length > 0 ? cargoItems : [{ modelName: '유통 납품 물품 일체', count: 1, note: '정상 납품' }]),
      memo: `[유통 계약 배송] 주문번호: ${ob.orderId}`
    };

    if (db && db.deliveries) {
      const idx = db.deliveries.findIndex(d => d.id === ob.id);
      if (idx >= 0) db.deliveries[idx] = { ...db.deliveries[idx], ...deliveryRecord };
      else db.deliveries.push(deliveryRecord);
    }

    try {
      if (supabase) {
        await supabase.from('deliveries').upsert(deliveryRecord);
      }
    } catch (e) {
      console.warn('Supabase deliveries upsert error:', e);
    }
  };

  const dispatchOutbound = async (
    outboundId: string,
    courierName: string,
    trackingNumber: string,
    extra?: {
      shippingCost?: number;
      paidBy?: 'OURS' | 'CUSTOMER';
      receiverName?: string;
      receiverPhone?: string;
      destinationAddress?: string;
      shippedAt?: string;
      closingMemo?: string;
    }
  ) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) throw new Error('출고 요청이 존재하지 않습니다.');
    if (ob.status !== 'ALLOCATED' && ob.status !== 'PACKED' && ob.status !== 'SHIPPED') {
      throw new Error('할당 완료 또는 패킹 완료 상태에서만 송장 등록 및 발송이 가능합니다.');
    }
    if (!courierName || !courierName.trim()) throw new Error('택배사를 선택하거나 입력해 주세요.');
    if (!trackingNumber || !trackingNumber.trim()) throw new Error('운송장 번호를 입력해 주세요.');

    const now = new Date().toISOString();
    const shippedTime = extra?.shippedAt ? new Date(extra.shippedAt).toISOString() : now;

    setOutbounds(prev =>
      prev.map(o =>
        o.id === outboundId
          ? {
              ...o,
              status: 'SHIPPED',
              deliveryType: 'COURIER',
              courierName: courierName.trim(),
              trackingNumber: trackingNumber.trim(),
              shippingCost: extra?.shippingCost ?? o.shippingCost ?? 4500,
              paidBy: extra?.paidBy ?? o.paidBy ?? 'OURS',
              receiverName: extra?.receiverName ?? o.receiverName,
              receiverPhone: extra?.receiverPhone ?? o.receiverPhone,
              destinationAddress: extra?.destinationAddress ?? o.destinationAddress,
              closingMemo: extra?.closingMemo ?? o.closingMemo,
              shippedAt: shippedTime,
              updatedAt: now
            }
          : o
      )
    );

    setSalesOrders(prev =>
      prev.map(so => (so.id === ob.orderId ? { ...so, status: 'SHIPPED', updatedAt: now } : so))
    );

    await syncTradeDeliveryToDatabase(ob, {
      deliveryType: 'COURIER',
      courierName: courierName.trim(),
      trackingNumber: trackingNumber.trim(),
      destinationAddress: extra?.destinationAddress ?? ob.destinationAddress,
      receiverName: extra?.receiverName ?? ob.receiverName,
      receiverPhone: extra?.receiverPhone ?? ob.receiverPhone
    });
    await db.awaitPendingWrites();
  };

  const dispatchDirectTradeDelivery = async (
    outboundId: string,
    driverInfo: {
      driverName: string;
      driverContact?: string;
      vehicleNo?: string;
      destinationAddress?: string;
      receiverName?: string;
      receiverPhone?: string;
      shippingCost?: number;
      paidBy?: 'OURS' | 'CUSTOMER';
    }
  ) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) throw new Error('출고 요청이 존재하지 않습니다.');
    if (ob.status !== 'ALLOCATED' && ob.status !== 'PACKED' && ob.status !== 'SHIPPED') {
      throw new Error('할당 완료 상태에서만 배차 및 출고 마감이 가능합니다.');
    }

    const now = new Date().toISOString();
    setOutbounds(prev =>
      prev.map(o =>
        o.id === outboundId
          ? {
              ...o,
              status: 'SHIPPED',
              deliveryType: 'DIRECT',
              driverName: driverInfo.driverName,
              driverContact: driverInfo.driverContact || '-',
              vehicleNo: driverInfo.vehicleNo || '화물차량',
              destinationAddress: driverInfo.destinationAddress || o.destinationAddress,
              receiverName: driverInfo.receiverName || o.receiverName,
              receiverPhone: driverInfo.receiverPhone || o.receiverPhone,
              shippingCost: driverInfo.shippingCost ?? o.shippingCost ?? 50000,
              paidBy: driverInfo.paidBy ?? o.paidBy ?? 'OURS',
              shippedAt: now,
              updatedAt: now
            }
          : o
      )
    );

    setSalesOrders(prev =>
      prev.map(so => (so.id === ob.orderId ? { ...so, status: 'SHIPPED', updatedAt: now } : so))
    );

    await syncTradeDeliveryToDatabase(ob, {
      deliveryType: 'DIRECT',
      driverName: driverInfo.driverName,
      driverContact: driverInfo.driverContact,
      vehicleNo: driverInfo.vehicleNo,
      destinationAddress: driverInfo.destinationAddress,
      receiverName: driverInfo.receiverName,
      receiverPhone: driverInfo.receiverPhone
    });
    await db.awaitPendingWrites();
  };

  const cancelDispatch = async (outboundId: string) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) throw new Error('출고 내역을 찾을 수 없습니다.');
    if (ob.status === 'DELIVERED') {
      throw new Error('이미 납품 완료된 건은 배차 취소할 수 없습니다.');
    }
    const now = new Date().toISOString();
    setOutbounds(prev =>
      prev.map(o =>
        o.id === outboundId
          ? {
              ...o,
              status: 'ALLOCATED',
              courierName: undefined,
              trackingNumber: undefined,
              driverName: undefined,
              driverContact: undefined,
              vehicleNo: undefined,
              shippedAt: undefined,
              updatedAt: now
            }
          : o
      )
    );
    setSalesOrders(prev =>
      prev.map(so => (so.id === ob.orderId ? { ...so, status: 'CONFIRMED', updatedAt: now } : so))
    );
    await db.awaitPendingWrites();
  };

  const completeTradeDeliveryWithProof = async (
    outboundId: string,
    proofUrl: string,
    proofType: 'SIGNATURE' | 'PHOTO',
    receiverName?: string,
    closingMemo?: string
  ) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) return;

    const now = new Date().toISOString();
    const memo = closingMemo || `[${proofType === 'PHOTO' ? '납품증 사진' : '전자 서명'}]: ${proofUrl}`;

    setOutbounds(prev =>
      prev.map(o =>
        o.id === outboundId
          ? {
              ...o,
              status: 'DELIVERED',
              proofUrl,
              proofType,
              receiverName: receiverName || o.receiverName,
              closingMemo: memo,
              deliveredAt: now,
              updatedAt: now
            }
          : o
      )
    );

    setSalesOrders(prev =>
      prev.map(so => (so.id === ob.orderId ? { ...so, status: 'DELIVERED', updatedAt: now } : so))
    );

    if (db && db.deliveries) {
      const d = db.deliveries.find(item => item.id === outboundId);
      if (d) {
        d.status = 'DELIVERED';
        d.closingMemo = memo;
      }
    }

    try {
      if (supabase) {
        await supabase
          .from('deliveries')
          .update({
            status: 'DELIVERED',
            closingMemo: memo,
            updatedAt: now
          })
          .eq('id', outboundId);
      }
    } catch (e) {
      console.warn('Failed to update delivery in Supabase:', e);
    }
    await db.awaitPendingWrites();
  };

  const completeTradeDeliveryManual = async (
    outboundId: string,
    receiverName: string,
    deliveredDate?: string,
    closingMemo?: string
  ) => {
    const ob = outbounds.find(o => o.id === outboundId);
    if (!ob) throw new Error('출고 내역을 찾을 수 없습니다.');
    const now = new Date().toISOString();
    const delivTime = deliveredDate ? new Date(deliveredDate).toISOString() : now;

    setOutbounds(prev =>
      prev.map(o =>
        o.id === outboundId
          ? {
              ...o,
              status: 'DELIVERED',
              receiverName: receiverName || o.receiverName || '인수자',
              closingMemo: closingMemo || o.closingMemo || '택배/화물 수취 확인 완료',
              deliveredAt: delivTime,
              updatedAt: now
            }
          : o
      )
    );

    setSalesOrders(prev =>
      prev.map(so => (so.id === ob.orderId ? { ...so, status: 'DELIVERED', updatedAt: now } : so))
    );
    await db.awaitPendingWrites();
  };

  useEffect(() => {
    const handleTradeDelivered = (e: any) => {
      const detail = e.detail;
      if (detail && detail.id) {
        completeTradeDeliveryWithProof(
          detail.id,
          detail.proofUrl,
          detail.proofType || 'SIGNATURE',
          detail.receiverName,
          detail.closingMemo
        );
      }
    };
    window.addEventListener('trade-delivery-completed', handleTradeDelivered);
    return () => window.removeEventListener('trade-delivery-completed', handleTradeDelivered);
  }, [outbounds, salesOrders]);

  // ==========================================
  // 5. Returns (환입 및 반품)
  // ==========================================
  const requestReturn = async (
    orderLineId: string,
    qty: number,
    condition: 'SELLABLE' | 'DEFECTIVE',
    refundAmount: number,
    reason?: string,
    memo?: string
  ): Promise<TradeReturn> => {
    const line = salesOrderLines.find(l => l.id === orderLineId);
    if (!line) throw new Error('대상 주문 품목 라인을 찾을 수 없습니다.');
    if (qty <= 0) throw new Error('반품 수량은 1개 이상이어야 합니다.');

    const alreadyReturnedQty = returns
      .filter(r => r.orderLineId === orderLineId && r.status !== 'CANCELLED')
      .reduce((sum, r) => sum + r.qty, 0);

    if (alreadyReturnedQty + qty > line.qty) {
      throw new Error(
        `주문 수량(${line.qty}개)을 초과하여 반품 접수할 수 없습니다. (기반품: ${alreadyReturnedQty}개)`
      );
    }

    const now = new Date().toISOString();
    const ret: TradeReturn = {
      id: `RET-${uuidv4()}`,
      orderId: line.orderId,
      orderLineId,
      returnDate: now.split('T')[0],
      qty,
      condition,
      status: 'REQUESTED',
      reason: reason || '고객 반품 요청',
      refundAmount: refundAmount >= 0 ? refundAmount : qty * line.unitPrice,
      processedBy: currentUser?.name || '물류검수팀',
      memo: memo || '',
      createdAt: now,
      updatedAt: now
    };
    setReturns(prev => [ret, ...prev]);
    await db.awaitPendingWrites();
    return ret;
  };

  const processReturn = async (
    orderLineId: string,
    qty: number,
    condition: 'SELLABLE' | 'DEFECTIVE',
    refundAmount: number,
    reason?: string,
    memo?: string
  ): Promise<TradeReturn> => {
    const line = salesOrderLines.find(l => l.id === orderLineId);
    if (!line) throw new Error('대상 주문 품목 라인을 찾을 수 없습니다.');
    if (qty <= 0) throw new Error('반품 수량은 1개 이상이어야 합니다.');

    const alreadyReturnedQty = returns
      .filter(r => r.orderLineId === orderLineId && r.status !== 'CANCELLED')
      .reduce((sum, r) => sum + r.qty, 0);

    if (alreadyReturnedQty + qty > line.qty) {
      throw new Error('이미 반품 처리되었거나 주문 수량을 초과한 라인입니다.');
    }

    const now = new Date().toISOString();
    const totalRefund = refundAmount >= 0 ? refundAmount * (qty > 1 && refundAmount === line.unitPrice ? qty : 1) : qty * line.unitPrice;

    const ret: TradeReturn = {
      id: `RET-${uuidv4()}`,
      orderId: line.orderId,
      orderLineId,
      returnDate: now.split('T')[0],
      qty,
      condition,
      status: 'COMPLETED',
      reason: reason || (condition === 'SELLABLE' ? '양품 환입 (재판매 가능)' : '불량/파손 반품 (폐기)'),
      refundAmount: totalRefund,
      processedBy: currentUser?.name || '물류검수팀',
      memo: memo || '',
      createdAt: now,
      updatedAt: now
    };
    setReturns(prev => [ret, ...prev]);

    // If SELLABLE, restore to inventory as a new lot based on original COGS
    if (condition === 'SELLABLE') {
      const restoredLot: TradeInventoryLot = {
        id: `LOT-RET-${uuidv4()}`,
        purchaseId: 'RETURN_RESTORE',
        productId: line.productId,
        initialQty: qty,
        remainingQty: qty,
        unitCost: line.unitCogs,
        createdAt: now
      };
      setInventoryLots(prev => [...prev, restoredLot]);

      setSalesOrders(prev =>
        prev.map(o => {
          if (o.id === line.orderId) {
            return {
              ...o,
              totalSalesAmount: Math.max(0, o.totalSalesAmount - totalRefund),
              totalCogsAmount: Math.max(0, o.totalCogsAmount - qty * line.unitCogs),
              updatedAt: now
            };
          }
          return o;
        })
      );
    } else {
      // DEFECTIVE: Sales amount is refunded, but COGS remains incurred (inventory is scrapped)
      setSalesOrders(prev =>
        prev.map(o => {
          if (o.id === line.orderId) {
            return {
              ...o,
              totalSalesAmount: Math.max(0, o.totalSalesAmount - totalRefund),
              updatedAt: now
            };
          }
          return o;
        })
      );
    }

    await db.awaitPendingWrites();
    return ret;
  };

  const completeReturnRequest = async (
    returnId: string,
    condition?: 'SELLABLE' | 'DEFECTIVE',
    refundAmount?: number,
    memo?: string
  ) => {
    const ret = returns.find(r => r.id === returnId);
    if (!ret) throw new Error('반품 접수 내역을 찾을 수 없습니다.');
    if (ret.status === 'COMPLETED') throw new Error('이미 완료 처리된 반품 건입니다.');

    const line = salesOrderLines.find(l => l.id === ret.orderLineId);
    const finalCondition = condition || ret.condition;
    const finalRefund = refundAmount !== undefined ? refundAmount : ret.refundAmount;
    const now = new Date().toISOString();

    setReturns(prev =>
      prev.map(r =>
        r.id === returnId
          ? {
              ...r,
              status: 'COMPLETED',
              condition: finalCondition,
              refundAmount: finalRefund,
              memo: memo ?? r.memo,
              updatedAt: now
            }
          : r
      )
    );

    if (line) {
      if (finalCondition === 'SELLABLE') {
        const restoredLot: TradeInventoryLot = {
          id: `LOT-RET-${uuidv4()}`,
          purchaseId: 'RETURN_RESTORE',
          productId: line.productId,
          initialQty: ret.qty,
          remainingQty: ret.qty,
          unitCost: line.unitCogs,
          createdAt: now
        };
        setInventoryLots(prev => [...prev, restoredLot]);

        setSalesOrders(prev =>
          prev.map(o =>
            o.id === line.orderId
              ? {
                  ...o,
                  totalSalesAmount: Math.max(0, o.totalSalesAmount - finalRefund),
                  totalCogsAmount: Math.max(0, o.totalCogsAmount - ret.qty * line.unitCogs),
                  updatedAt: now
                }
              : o
          )
        );
      } else {
        setSalesOrders(prev =>
          prev.map(o =>
            o.id === line.orderId
              ? {
                  ...o,
                  totalSalesAmount: Math.max(0, o.totalSalesAmount - finalRefund),
                  updatedAt: now
                }
              : o
          )
        );
      }
    }
    await db.awaitPendingWrites();
  };

  const cancelReturn = async (returnId: string) => {
    const ret = returns.find(r => r.id === returnId);
    if (!ret) throw new Error('반품 내역을 찾을 수 없습니다.');
    if (ret.status === 'CANCELLED') throw new Error('이미 취소된 반품 건입니다.');

    const now = new Date().toISOString();
    const line = salesOrderLines.find(l => l.id === ret.orderLineId);

    if (ret.status === 'COMPLETED' && line) {
      // Reverse sales/COGS deduction
      setSalesOrders(prev =>
        prev.map(o => {
          if (o.id === line.orderId) {
            return {
              ...o,
              totalSalesAmount: o.totalSalesAmount + ret.refundAmount,
              totalCogsAmount:
                ret.condition === 'SELLABLE'
                  ? o.totalCogsAmount + ret.qty * line.unitCogs
                  : o.totalCogsAmount,
              updatedAt: now
            };
          }
          return o;
        })
      );

      if (ret.condition === 'SELLABLE') {
        let toRemove = ret.qty;
        setInventoryLots(prev =>
          prev.map(lot => {
            if (
              lot.productId === line.productId &&
              lot.purchaseId === 'RETURN_RESTORE' &&
              lot.remainingQty > 0 &&
              toRemove > 0
            ) {
              const d = Math.min(lot.remainingQty, toRemove);
              toRemove -= d;
              return { ...lot, remainingQty: lot.remainingQty - d };
            }
            return lot;
          })
        );
      }
    }

    setReturns(prev =>
      prev.map(r => (r.id === returnId ? { ...r, status: 'CANCELLED', updatedAt: now } : r))
    );
    await db.awaitPendingWrites();
  };

  const deleteReturn = async (returnId: string) => {
    const ret = returns.find(r => r.id === returnId);
    if (!ret) return;
    if (ret.status === 'COMPLETED') {
      await cancelReturn(returnId);
    }
    setReturns(prev => prev.filter(r => r.id !== returnId));
    await db.awaitPendingWrites();
  };

  // ==========================================
  // 6. Billing (유통 청구 및 명세)
  // ==========================================
  const issueBilling = async (
    customerId: string,
    month: string,
    options?: {
      orderId?: string;
      orderIds?: string[];
      billingDate?: string;
      supplyAmount?: number;
      vatAmount?: number;
      totalAmount?: number;
      recipientName?: string;
      recipientEmail?: string;
      memo?: string;
    }
  ): Promise<TradeBilling> => {
    const targetOrderId = options?.orderId;

    // Duplicate check: If orderId is specified, check per orderId; otherwise per customer+month
    const existing = billings.find(b => {
      if (b.status === 'CANCELLED') return false;
      if (targetOrderId && b.orderId) return b.orderId === targetOrderId;
      return !targetOrderId && !b.orderId && b.customerId === customerId && b.billingMonth === month;
    });

    if (existing) {
      throw new Error('해당 수주건(또는 당월 고객사)에 대해 이미 발행된 명세서가 존재합니다.');
    }

    const cust = getCustomerById(customerId);
    const matchedOrders = targetOrderId
      ? salesOrders.filter(o => o.id === targetOrderId)
      : salesOrders.filter(
          o => o.customerId === customerId && o.orderDate.startsWith(month) && o.status !== 'CANCELLED'
        );

    const calcSupply =
      options?.supplyAmount ??
      matchedOrders.reduce((sum, o) => sum + o.totalSalesAmount, 0);
    const calcVat = options?.vatAmount ?? Math.round(calcSupply * 0.1);
    const calcTotal = options?.totalAmount ?? calcSupply + calcVat;

    const now = new Date().toISOString();
    const newBilling: TradeBilling = {
      id: `TBILL-${month.replace('-', '')}-${uuidv4().slice(0, 4)}`,
      orderId: targetOrderId || matchedOrders[0]?.id,
      orderIds: options?.orderIds || matchedOrders.map(o => o.id),
      customerId,
      billingMonth: month,
      billingDate: options?.billingDate || now.split('T')[0],
      supplyAmount: calcSupply,
      vatAmount: calcVat,
      totalAmount: calcTotal,
      status: 'ISSUED',
      recipientName:
        options?.recipientName ||
        (cust as any)?.billingManagerName ||
        cust?.representative ||
        '정산담당자',
      recipientEmail:
        options?.recipientEmail ||
        (cust as any)?.billingEmail ||
        cust?.repEmail ||
        'billing@client.co.kr',
      memo: options?.memo || '유통 물품 거래명세서 및 세금계산서 청구',
      createdAt: now,
      updatedAt: now
    };

    setBillings(prev => [newBilling, ...prev]);
    await db.awaitPendingWrites();
    return newBilling;
  };

  const updateBilling = async (billingId: string, updates: Partial<TradeBilling>) => {
    const now = new Date().toISOString();
    setBillings(prev =>
      prev.map(b => (b.id === billingId ? { ...b, ...updates, updatedAt: now } : b))
    );
    await db.awaitPendingWrites();
  };

  const sendTradeBillingEmail = async (
    billingId: string,
    emailData: {
      to: string;
      cc?: string;
      recipientName?: string;
      subject: string;
      body: string;
      isTestMode: boolean;
    }
  ): Promise<SentEmail> => {
    const billing = billings.find(b => b.id === billingId);
    if (!billing) throw new Error('청구 명세서를 찾을 수 없습니다.');

    const devEmail = 'admin@ebro.co.kr';
    const destinationTo = emailData.isTestMode ? devEmail : emailData.to;
    const destinationCc = emailData.isTestMode ? undefined : emailData.cc;
    const finalSubject = emailData.isTestMode
      ? `[테스트 격리 발송] ${emailData.subject}`
      : emailData.subject;
    const finalBody = emailData.isTestMode
      ? `[※ 전사 표준 헌장 5.9조 테스트 발송 격리 정책]\n본 거래명세서 메일은 실제 발송이 차단되어 개발자(${devEmail})에게 안전하게 격리되었습니다.\n(원래 수신처: ${emailData.to})\n\n----------------------------------------\n\n` +
        emailData.body
      : emailData.body;

    let sentEmail: SentEmail;
    const now = new Date().toISOString();

    if (emailData.isTestMode) {
      sentEmail = {
        id: `mail-bill-${uuidv4()}`,
        to: destinationTo,
        cc: destinationCc,
        subject: finalSubject,
        body: finalBody,
        sentAt: now,
        success: true
      };
      try {
        const raw = localStorage.getItem('sent_emails');
        const history = raw ? JSON.parse(raw) : [];
        history.unshift(sentEmail);
        localStorage.setItem('sent_emails', JSON.stringify(history.slice(0, 20)));
      } catch (e) {}
    } else {
      sentEmail = await emailService.sendEmail(
        destinationTo,
        finalSubject,
        finalBody,
        [],
        destinationCc,
        '(주)기연리프트 / e-Bro ERP'
      );
    }

    setBillings(prev =>
      prev.map(b =>
        b.id === billingId
          ? {
              ...b,
              status: b.status === 'PAID' ? 'PAID' : 'SENT',
              recipientEmail: emailData.to,
              recipientName: emailData.recipientName || b.recipientName,
              ccEmail: emailData.cc,
              emailSubject: emailData.subject,
              sentAt: now,
              updatedAt: now
            }
          : b
      )
    );
    await db.awaitPendingWrites();
    return sentEmail;
  };

  const completeBillingPayment = async (billingId: string, paidDate?: string) => {
    const now = new Date().toISOString();
    setBillings(prev =>
      prev.map(b =>
        b.id === billingId
          ? { ...b, status: 'PAID', paidAt: paidDate || now, updatedAt: now }
          : b
      )
    );
    await db.awaitPendingWrites();
  };

  const cancelBilling = async (billingId: string) => {
    const now = new Date().toISOString();
    setBillings(prev =>
      prev.map(b =>
        b.id === billingId ? { ...b, status: 'CANCELLED', updatedAt: now } : b
      )
    );
    await db.awaitPendingWrites();
  };

  const deleteBilling = async (billingId: string) => {
    setBillings(prev => prev.filter(b => b.id !== billingId));
    await db.awaitPendingWrites();
  };

  return (
    <TradeContext.Provider
      value={{
        products,
        purchases,
        purchaseItems,
        inventoryLots,
        inventoryAdjustments,
        salesOrders,
        salesOrderLines,
        outbounds,
        billings,
        returns,
        getCustomerName,
        getCustomerById,
        getVendorName,
        getVendorById,
        getProductStock,
        addProduct,
        updateProduct,
        deleteProduct,
        adjustProductStock,
        createPurchase,
        updatePurchase,
        acceptPurchase,
        confirmInbound,
        cancelPurchase,
        deletePurchase,
        createSalesOrder,
        updateSalesOrder,
        acceptSalesOrder,
        cancelSalesOrder,
        deleteSalesOrder,
        sendTradeContractEmail,
        createOutboundManual,
        allocateOutbound,
        packOutbound,
        updateOutbound,
        cancelOutbound,
        deleteOutbound,
        dispatchOutbound,
        dispatchDirectTradeDelivery,
        cancelDispatch,
        completeTradeDeliveryWithProof,
        completeTradeDeliveryManual,
        requestReturn,
        processReturn,
        completeReturnRequest,
        cancelReturn,
        deleteReturn,
        issueBilling,
        updateBilling,
        sendTradeBillingEmail,
        completeBillingPayment,
        cancelBilling,
        deleteBilling
      }}
    >
      {children}
    </TradeContext.Provider>
  );
};

export const useTrade = () => {
  const context = useContext(TradeContext);
  if (!context) throw new Error('useTrade must be used within a TradeProvider');
  return context;
};
