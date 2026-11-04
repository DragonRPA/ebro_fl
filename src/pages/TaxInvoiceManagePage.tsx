import React, { useState, useMemo, useEffect } from 'react';
import { FileCheck, Send, Download, Search, CheckCircle2, Clock, ShieldAlert, Eye, RefreshCw, Plus, Ban } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SEED_FL_CUSTOMERS, SEED_FL_CONTRACTS } from '../data/flUnifiedSeedData';
import { exportToExcel } from '../services/excel';
import {
  popbillTaxInvoiceService,
  POPBILL_TEST_CONFIG,
  getPopbillStateLabel,
  type PopbillTaxStateCode
} from '../services/popbillTaxInvoiceService';

export interface TaxInvoiceRecord {
  id: string;
  mgtKey: string;
  invoiceNo: string;
  issueDate: string;
  billingYm: string;
  contractId: string;
  contractNo: string;
  contractType: 'TRADE' | 'RENTAL';
  customerId: string;
  customerName: string;
  bizRegNo: string;
  representative: string;
  address?: string;
  bizType?: string;
  bizClass?: string;
  // 테스트 기간 이메일 발송 원천 차단을 위해 수신 이메일은 항상 빈 문자열("")로 유지
  recipientEmail: '';
  itemSummary: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  issueType: '정발행' | '역발행';
  purposeType: '청구' | '영수';
  popbillStateCode: PopbillTaxStateCode;
  ntsConfirmNo: string;
  ntsStatus: 'NTS_SENT' | 'ISSUED_READY' | 'PENDING_ISSUE' | 'CANCELLED';
  ntsSentAt?: string;
  popbillMode?: string;
}

const INITIAL_TAX_INVOICES: TaxInvoiceRecord[] = [
  {
    id: 'TXI-202610-001',
    mgtKey: 'MJ-TEST-202610-001',
    invoiceNo: '20261025-41000101',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-T2609-101',
    contractNo: 'TRD-202609-101',
    contractType: 'TRADE',
    customerId: 'CUST-MJ-001',
    customerName: '한빛물류센터 주식회사',
    bizRegNo: '124-81-50101',
    representative: '김한빛',
    address: '경기도 평택시 포승읍 평택항만길 112',
    bizType: '운수 및 창고업',
    bizClass: '항만물류하역',
    recipientEmail: '',
    itemSummary: '유통 제1차 출고 · 헬리 리튬전동지게차 2.5톤 1대 외 옵션',
    supplyAmount: 29800000,
    vatAmount: 2980000,
    totalAmount: 32780000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 304,
    ntsConfirmNo: '20261025-TEST-88910231',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-25 14:20',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-002',
    mgtKey: 'MJ-TEST-202610-002',
    invoiceNo: '20261025-41000102',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-T2610-102',
    contractNo: 'TRD-202610-102',
    contractType: 'TRADE',
    customerId: 'CUST-MJ-001',
    customerName: '한빛물류센터 주식회사',
    bizRegNo: '124-81-50101',
    representative: '김한빛',
    address: '경기도 평택시 포승읍 평택항만길 112',
    bizType: '운수 및 창고업',
    bizClass: '항만물류하역',
    recipientEmail: '',
    itemSummary: '유통 제2차 출고 · 단조 덧발 1800mm 2조 및 전동호환부품',
    supplyAmount: 2850000,
    vatAmount: 285000,
    totalAmount: 3135000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 304,
    ntsConfirmNo: '20261025-TEST-88910232',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-25 14:22',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-003',
    mgtKey: 'MJ-TEST-202610-003',
    invoiceNo: '20261028-41000103',
    issueDate: '2026-10-28',
    billingYm: '2026-10',
    contractId: 'CTR-T2609-103',
    contractNo: 'TRD-202609-103',
    contractType: 'TRADE',
    customerId: 'CUST-MJ-002',
    customerName: '태양중공업 주식회사',
    bizRegNo: '608-81-40202',
    representative: '박태양',
    address: '경상남도 창원시 성산구 공단로 405',
    bizType: '제조업',
    bizClass: '중장비 및 금속구조물',
    recipientEmail: '',
    itemSummary: '유통 제1차 출고 · 두산밥캣 디젤지게차 5.0톤 풀캐빈 에어컨형 1대',
    supplyAmount: 64500000,
    vatAmount: 6450000,
    totalAmount: 70950000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 304,
    ntsConfirmNo: '20261028-TEST-77210941',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-28 16:05',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-004',
    mgtKey: 'MJ-TEST-202610-004',
    invoiceNo: '20261030-41000104',
    issueDate: '2026-10-30',
    billingYm: '2026-10',
    contractId: 'CTR-T2610-104',
    contractNo: 'TRD-202610-104',
    contractType: 'TRADE',
    customerId: 'CUST-MJ-003',
    customerName: '주식회사 서해글로벌모터스',
    bizRegNo: '131-86-30303',
    representative: '이서해',
    address: '인천광역시 연수구 인천신항대로 770',
    bizType: '자동차부품 제조 및 물류',
    bizClass: '수출입물류',
    recipientEmail: '',
    itemSummary: '유통 제1차 출고 · 비와이디 리튬전동지게차 3.5톤 2대',
    supplyAmount: 78000000,
    vatAmount: 7800000,
    totalAmount: 85800000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 300,
    ntsConfirmNo: '20261030-TEST-30010401',
    ntsStatus: 'ISSUED_READY',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-005',
    mgtKey: 'MJ-TEST-202610-005',
    invoiceNo: '20261031-41000105',
    issueDate: '2026-10-31',
    billingYm: '2026-10',
    contractId: 'CTR-T2610-105',
    contractNo: 'TRD-202610-105',
    contractType: 'TRADE',
    customerId: 'CUST-MJ-005',
    customerName: '동남건기부품상사',
    bizRegNo: '605-24-80505',
    representative: '최동남',
    address: '부산광역시 사상구 유통단지1로 58',
    bizType: '도소매업',
    bizClass: '산업기계부품',
    recipientEmail: '',
    itemSummary: '유통 제1차 출고 · 호환부품 및 정기점검 필터·윤활유 소모품 일괄',
    supplyAmount: 6420000,
    vatAmount: 642000,
    totalAmount: 7062000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 100,
    ntsConfirmNo: '미발행',
    ntsStatus: 'PENDING_ISSUE',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-006',
    mgtKey: 'MJ-TEST-202610-006',
    invoiceNo: '20261025-51000201',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-001',
    contractNo: 'RNT-202607-001',
    contractType: 'RENTAL',
    customerId: 'CUST-MJ-001',
    customerName: '한빛물류센터 주식회사',
    bizRegNo: '124-81-50101',
    representative: '김한빛',
    address: '경기도 평택시 포승읍 평택항만길 112',
    bizType: '운수 및 창고업',
    bizClass: '항만물류하역',
    recipientEmail: '',
    itemSummary: '렌탈 평택항만 제1물류센터 현장 · 전동 2.5톤 및 리치 1.8톤 10월분 렌탈료',
    supplyAmount: 2050000,
    vatAmount: 205000,
    totalAmount: 2255000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 304,
    ntsConfirmNo: '20261025-TEST-88910301',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-25 15:10',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-007',
    mgtKey: 'MJ-TEST-202610-007',
    invoiceNo: '20261030-51000202',
    issueDate: '2026-10-30',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-002',
    contractNo: 'RNT-202607-002',
    contractType: 'RENTAL',
    customerId: 'CUST-MJ-002',
    customerName: '태양중공업 주식회사',
    bizRegNo: '608-81-40202',
    representative: '박태양',
    address: '경상남도 창원시 성산구 공단로 405',
    bizType: '제조업',
    bizClass: '중장비 및 금속구조물',
    recipientEmail: '',
    itemSummary: '렌탈 창원 제1중공업 공장 현장 · 디젤 5.0톤 지게차 10월분 렌탈료',
    supplyAmount: 1850000,
    vatAmount: 185000,
    totalAmount: 2035000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 304,
    ntsConfirmNo: '20261030-TEST-77210990',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-30 11:40',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-008',
    mgtKey: 'MJ-TEST-202610-008',
    invoiceNo: '20261025-51000203',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-003',
    contractNo: 'RNT-202607-003',
    contractType: 'RENTAL',
    customerId: 'CUST-MJ-003',
    customerName: '주식회사 서해글로벌모터스',
    bizRegNo: '131-86-30303',
    representative: '이서해',
    address: '인천광역시 연수구 인천신항대로 770',
    bizType: '자동차부품 제조 및 물류',
    bizClass: '수출입물류',
    recipientEmail: '',
    itemSummary: '렌탈 인천신항 자동차부품 물류기지 현장 · 전동 3.0톤 지게차 10월분 렌탈료',
    supplyAmount: 1350000,
    vatAmount: 135000,
    totalAmount: 1485000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 300,
    ntsConfirmNo: '20261025-TEST-30010801',
    ntsStatus: 'ISSUED_READY',
    popbillMode: '팝빌 테스트 서버'
  },
  {
    id: 'TXI-202610-009',
    mgtKey: 'MJ-TEST-202610-009',
    invoiceNo: '20261031-51000204',
    issueDate: '2026-10-31',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-004',
    contractNo: 'RNT-202607-004',
    contractType: 'RENTAL',
    customerId: 'CUST-MJ-004',
    customerName: '대한콜드체인 주식회사',
    bizRegNo: '214-87-60404',
    representative: '정대한',
    address: '경기도 용인시 처인구 백암면 물류단지로 88',
    bizType: '냉동냉장 창고업',
    bizClass: '신선물류보관',
    recipientEmail: '',
    itemSummary: '렌탈 용인 제1냉동냉장물류센터 현장 · 냉동창고형 리치트럭 2.0톤 10월분 렌탈료',
    supplyAmount: 1250000,
    vatAmount: 125000,
    totalAmount: 1375000,
    issueType: '정발행',
    purposeType: '청구',
    popbillStateCode: 100,
    ntsConfirmNo: '미발행',
    ntsStatus: 'PENDING_ISSUE',
    popbillMode: '팝빌 테스트 서버'
  }
];

const STORAGE_KEY = 'ebro_fl_popbill_test_tax_invoices_v2';

function sanitizeStoredRecords(raw: any[]): TaxInvoiceRecord[] {
  return raw.map((item, idx) => ({
    ...item,
    mgtKey: item.mgtKey || `MJ-TEST-202610-${String(idx + 1).padStart(3, '0')}`,
    // 어떤 경우에도 저장된 이메일 주소를 공란("")으로 강제 세탁
    recipientEmail: '' as const,
    purposeType: item.purposeType || '청구',
    popbillStateCode:
      item.popbillStateCode ||
      (item.ntsStatus === 'NTS_SENT' ? 304 : item.ntsStatus === 'ISSUED_READY' ? 300 : item.ntsStatus === 'CANCELLED' ? 600 : 100),
    popbillMode: '팝빌 테스트 서버'
  }));
}

export const TaxInvoiceManagePage: React.FC = () => {
  const { customers, contracts } = useApp();
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'CONTRACT_SYNC' | 'NEW_FORM'>('LEDGER');

  const [records, setRecords] = useState<TaxInvoiceRecord[]>(() => {
    try {
      // 구버전(이메일 주소가 들어있던 키) 즉시 폐기
      localStorage.removeItem('ebro_fl_tax_invoices_v1');
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return sanitizeStoredRecords(parsed);
        }
      }
    } catch {}
    return INITIAL_TAX_INVOICES;
  });

  const [billingYmFilter, setBillingYmFilter] = useState<string>('2026-10');
  const [contractTypeFilter, setContractTypeFilter] = useState<'ALL' | 'TRADE' | 'RENTAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NTS_SENT' | 'ISSUED_READY' | 'PENDING_ISSUE' | 'CANCELLED'>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [popbillStatusText, setPopbillStatusText] = useState<string>('팝빌 테스트 서버 연동 · 이메일 발송 원천 차단');
  const [previewRecord, setPreviewRecord] = useState<TaxInvoiceRecord | null>(null);

  // 신규 테스트 계산서 작성 폼 상태
  const [draftDate, setDraftDate] = useState<string>('2026-10-31');
  const [draftContractType, setDraftContractType] = useState<'RENTAL' | 'TRADE'>('RENTAL');
  const [draftCustomerId, setDraftCustomerId] = useState<string>('CUST-MJ-001');
  const [draftPurpose, setDraftPurpose] = useState<'청구' | '영수'>('청구');
  const [draftItemSummary, setDraftItemSummary] = useState<string>('지게차 임대료 및 정기점검 청구');
  const [draftSupplyAmount, setDraftSupplyAmount] = useState<number>(1500000);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStoredRecords(records)));
    } catch {}
  }, [records]);

  useEffect(() => {
    let mounted = true;
    popbillTaxInvoiceService.checkTestServerStatus().then(res => {
      if (mounted && res?.message) {
        setPopbillStatusText(res.message);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const customerList = useMemo(() => {
    return customers && customers.length > 0 ? customers : SEED_FL_CUSTOMERS;
  }, [customers]);

  const contractList = useMemo(() => {
    return contracts && contracts.length > 0 ? contracts : SEED_FL_CONTRACTS;
  }, [contracts]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (billingYmFilter && r.billingYm !== billingYmFilter) return false;
      if (contractTypeFilter !== 'ALL' && r.contractType !== contractTypeFilter) return false;
      if (statusFilter !== 'ALL' && r.ntsStatus !== statusFilter) return false;
      if (customerFilter !== 'ALL' && r.customerId !== customerFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const match =
          r.customerName.toLowerCase().includes(q) ||
          r.bizRegNo.toLowerCase().includes(q) ||
          r.contractNo.toLowerCase().includes(q) ||
          r.itemSummary.toLowerCase().includes(q) ||
          r.mgtKey.toLowerCase().includes(q) ||
          r.invoiceNo.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [records, billingYmFilter, contractTypeFilter, statusFilter, customerFilter, searchTerm]);

  const activeRecords = useMemo(
    () => filteredRecords.filter(r => r.ntsStatus !== 'CANCELLED'),
    [filteredRecords]
  );

  const summary = useMemo(() => {
    const totalSupply = activeRecords.reduce((acc, r) => acc + r.supplyAmount, 0);
    const totalVat = activeRecords.reduce((acc, r) => acc + r.vatAmount, 0);
    const grandTotal = totalSupply + totalVat;
    const sentTotal = activeRecords
      .filter(r => r.ntsStatus === 'NTS_SENT')
      .reduce((acc, r) => acc + r.totalAmount, 0);
    const pendingTotal = activeRecords
      .filter(r => r.ntsStatus !== 'NTS_SENT')
      .reduce((acc, r) => acc + r.totalAmount, 0);
    const diff = grandTotal - (sentTotal + pendingTotal);
    return { totalSupply, totalVat, grandTotal, sentTotal, pendingTotal, diff };
  }, [activeRecords]);

  const handleCheckPopbillConnection = async () => {
    setIsBusy(true);
    try {
      const res = await popbillTaxInvoiceService.checkTestServerStatus();
      setPopbillStatusText(res.message);
      showToast(`팝빌 테스트 서버 점검 완료: ${res.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegistIssuePopbillTest = async (record: TaxInvoiceRecord) => {
    setIsBusy(true);
    try {
      const res = await popbillTaxInvoiceService.registIssueTestInvoice({
        mgtKey: record.mgtKey,
        writeDate: record.issueDate,
        issueType: record.issueType,
        purposeType: record.purposeType,
        invoiceeCorpNum: record.bizRegNo,
        invoiceeCorpName: record.customerName,
        invoiceeCEOName: record.representative,
        invoiceeAddr: record.address,
        invoiceeBizType: record.bizType,
        invoiceeBizClass: record.bizClass,
        supplyCostTotal: record.supplyAmount,
        taxTotal: record.vatAmount,
        totalAmount: record.totalAmount,
        remark1: record.itemSummary
      });

      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      setRecords(prev =>
        prev.map(r => {
          if (r.id !== record.id) return r;
          return {
            ...r,
            recipientEmail: '',
            popbillStateCode: 300,
            ntsStatus: 'ISSUED_READY',
            ntsConfirmNo: res.ntsConfirmNum || `${r.issueDate.replace(/-/g, '')}-TEST-300001`,
            ntsSentAt: nowStr
          };
        })
      );
      showToast(`[팝빌 테스트 발행 완료] 문서번호 ${record.mgtKey} · 이메일 발송 0건 (완전 차단)`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendToNtsPopbillTest = async (record: TaxInvoiceRecord) => {
    setIsBusy(true);
    try {
      if (record.ntsStatus === 'PENDING_ISSUE') {
        await popbillTaxInvoiceService.registIssueTestInvoice({
          mgtKey: record.mgtKey,
          writeDate: record.issueDate,
          issueType: record.issueType,
          purposeType: record.purposeType,
          invoiceeCorpNum: record.bizRegNo,
          invoiceeCorpName: record.customerName,
          invoiceeCEOName: record.representative,
          invoiceeAddr: record.address,
          invoiceeBizType: record.bizType,
          invoiceeBizClass: record.bizClass,
          supplyCostTotal: record.supplyAmount,
          taxTotal: record.vatAmount,
          totalAmount: record.totalAmount,
          remark1: record.itemSummary
        });
      }
      const res = await popbillTaxInvoiceService.sendToNtsTest(record.mgtKey);
      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      setRecords(prev =>
        prev.map(r => {
          if (r.id !== record.id) return r;
          const confirmNo =
            r.ntsConfirmNo && r.ntsConfirmNo !== '미발행' && r.ntsConfirmNo !== '국세청 전송 대기'
              ? r.ntsConfirmNo
              : res.ntsConfirmNum || `${r.issueDate.replace(/-/g, '')}-TEST-${String(Math.floor(10000000 + Math.random() * 89999999))}`;
          return {
            ...r,
            recipientEmail: '',
            popbillStateCode: 304,
            ntsStatus: 'NTS_SENT',
            ntsConfirmNo: confirmNo,
            ntsSentAt: nowStr
          };
        })
      );
      showToast(`[팝빌 테스트 국세청 전송 완료] 문서번호 ${record.mgtKey} · 이메일 미발송`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelPopbillTest = async (record: TaxInvoiceRecord) => {
    setIsBusy(true);
    try {
      await popbillTaxInvoiceService.cancelTestIssue(record.mgtKey);
      setRecords(prev =>
        prev.map(r => {
          if (r.id !== record.id) return r;
          return {
            ...r,
            recipientEmail: '',
            popbillStateCode: 600,
            ntsStatus: 'CANCELLED',
            ntsConfirmNo: '발행취소'
          };
        })
      );
      showToast(`[팝빌 테스트 발행취소] 문서번호 ${record.mgtKey} 취소 처리 완료 (이메일 미발송)`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleBatchSendNts = async () => {
    const targets = activeRecords.filter(r => r.ntsStatus !== 'NTS_SENT');
    if (targets.length === 0) {
      showToast('현재 조건에서 미발행 또는 국세청 미전송 상태인 세금계산서가 없습니다.');
      return;
    }
    setIsBusy(true);
    try {
      for (const item of targets) {
        await popbillTaxInvoiceService.registIssueTestInvoice({
          mgtKey: item.mgtKey,
          writeDate: item.issueDate,
          issueType: item.issueType,
          purposeType: item.purposeType,
          invoiceeCorpNum: item.bizRegNo,
          invoiceeCorpName: item.customerName,
          invoiceeCEOName: item.representative,
          supplyCostTotal: item.supplyAmount,
          taxTotal: item.vatAmount,
          totalAmount: item.totalAmount,
          remark1: item.itemSummary
        });
        await popbillTaxInvoiceService.sendToNtsTest(item.mgtKey);
      }

      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const targetIds = new Set(targets.map(t => t.id));
      setRecords(prev =>
        prev.map(r => {
          if (!targetIds.has(r.id)) return r;
          const randTail = String(Math.floor(10000000 + Math.random() * 89999999));
          return {
            ...r,
            recipientEmail: '',
            popbillStateCode: 304,
            ntsStatus: 'NTS_SENT',
            ntsConfirmNo: `${r.issueDate.replace(/-/g, '')}-TEST-${randTail}`,
            ntsSentAt: nowStr
          };
        })
      );
      showToast(`총 ${targets.length}건 팝빌 테스트 발행 및 국세청 전송 완료 (이메일 발송 0건)`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateFromContract = async (contract: any) => {
    const cust = customerList.find(
      c => c.id === contract.customerId || (contract.customerBizRegNo && c.bizRegNo === contract.customerBizRegNo)
    );
    const bizRegNo = cust?.bizRegNo || contract.customerBizRegNo || '124-81-50101';
    const customerName = cust?.name || contract.customerName || '거래처';
    const representative = (cust as any)?.ceoName || (cust as any)?.representative || '대표자';
    const isTrade = contract.contractCategory === 'TRADE' || String(contract.contractNo || '').startsWith('TRD');
    const supply = Math.round(Number(contract.totalAmount || contract.monthlyRentalFee || 1500000));
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    const seq = String(records.length + 1).padStart(3, '0');
    const mgtKey = `MJ-TEST-${billingYmFilter.replace('-', '')}-${seq}`;
    const issueDate = `${billingYmFilter}-28`;

    setIsBusy(true);
    try {
      await popbillTaxInvoiceService.registerTempInvoice({
        mgtKey,
        writeDate: issueDate,
        issueType: '정발행',
        purposeType: '청구',
        invoiceeCorpNum: bizRegNo,
        invoiceeCorpName: customerName,
        invoiceeCEOName: representative,
        supplyCostTotal: supply,
        taxTotal: vat,
        totalAmount: total,
        remark1: `${isTrade ? '유통 출고' : '렌탈 현장'} · ${contract.siteName || contract.contractNo} 청구`
      });

      const newRecord: TaxInvoiceRecord = {
        id: `TXI-${Date.now()}`,
        mgtKey,
        invoiceNo: `${issueDate.replace(/-/g, '')}-4100${seq}`,
        issueDate,
        billingYm: billingYmFilter,
        contractId: contract.id,
        contractNo: contract.contractNo || contract.id,
        contractType: isTrade ? 'TRADE' : 'RENTAL',
        customerId: cust?.id || contract.customerId || 'CUST-MJ-001',
        customerName,
        bizRegNo,
        representative,
        address: cust?.address || contract.siteAddress || '',
        recipientEmail: '',
        itemSummary: `${isTrade ? '유통 계약' : '렌탈 계약'} · ${contract.siteName || contract.modelName || '지게차 임대 및 출고'}`,
        supplyAmount: supply,
        vatAmount: vat,
        totalAmount: total,
        issueType: '정발행',
        purposeType: '청구',
        popbillStateCode: 100,
        ntsConfirmNo: '미발행',
        ntsStatus: 'PENDING_ISSUE',
        popbillMode: '팝빌 테스트 서버'
      };

      setRecords(prev => [newRecord, ...prev]);
      setActiveTab('LEDGER');
      showToast(`[팝빌 테스트 임시저장 완료] 문서번호 ${mgtKey} 생성 (이메일 미발송)`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateManualTestInvoice = async (immediateIssue: boolean) => {
    const cust = customerList.find(c => c.id === draftCustomerId) || customerList[0];
    if (!cust) return;
    const supply = Math.max(0, Math.round(Number(draftSupplyAmount || 0)));
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    const ym = draftDate.slice(0, 7);
    const seq = String(records.length + 1).padStart(3, '0');
    const mgtKey = `MJ-TEST-${ym.replace('-', '')}-${seq}`;
    const representative = (cust as any)?.ceoName || (cust as any)?.representative || '대표자';

    setIsBusy(true);
    try {
      const payload = {
        mgtKey,
        writeDate: draftDate,
        issueType: '정발행' as const,
        purposeType: draftPurpose,
        invoiceeCorpNum: cust.bizRegNo || '124-81-50101',
        invoiceeCorpName: cust.name,
        invoiceeCEOName: representative,
        invoiceeAddr: cust.address || '',
        supplyCostTotal: supply,
        taxTotal: vat,
        totalAmount: total,
        remark1: draftItemSummary
      };

      const res = immediateIssue
        ? await popbillTaxInvoiceService.registIssueTestInvoice(payload)
        : await popbillTaxInvoiceService.registerTempInvoice(payload);

      const newRecord: TaxInvoiceRecord = {
        id: `TXI-${Date.now()}`,
        mgtKey,
        invoiceNo: `${draftDate.replace(/-/g, '')}-4900${seq}`,
        issueDate: draftDate,
        billingYm: ym,
        contractId: `CTR-MANUAL-${seq}`,
        contractNo: `${draftContractType === 'TRADE' ? 'TRD' : 'RNT'}-${ym.replace('-', '')}-${seq}`,
        contractType: draftContractType,
        customerId: cust.id,
        customerName: cust.name,
        bizRegNo: cust.bizRegNo || '124-81-50101',
        representative,
        address: cust.address || '',
        recipientEmail: '',
        itemSummary: draftItemSummary,
        supplyAmount: supply,
        vatAmount: vat,
        totalAmount: total,
        issueType: '정발행',
        purposeType: draftPurpose,
        popbillStateCode: immediateIssue ? 300 : 100,
        ntsConfirmNo: immediateIssue ? res.ntsConfirmNum || `${draftDate.replace(/-/g, '')}-TEST-300${seq}` : '미발행',
        ntsStatus: immediateIssue ? 'ISSUED_READY' : 'PENDING_ISSUE',
        ntsSentAt: immediateIssue ? new Date().toISOString().slice(0, 16).replace('T', ' ') : undefined,
        popbillMode: '팝빌 테스트 서버'
      };

      setBillingYmFilter(ym);
      setRecords(prev => [newRecord, ...prev]);
      setActiveTab('LEDGER');
      showToast(
        immediateIssue
          ? `[팝빌 테스트 발행 완료] 문서번호 ${mgtKey} · 이메일 발송 차단됨`
          : `[팝빌 테스트 임시저장 완료] 문서번호 ${mgtKey} · 이메일 발송 차단됨`
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportExcel = () => {
    const rows = filteredRecords.map(r => ({
      '팝빌문서번호': r.mgtKey,
      '작성일자': r.issueDate,
      '계약구분': r.contractType === 'TRADE' ? '유통계약' : '렌탈계약',
      '계약번호': r.contractNo,
      '공급받는자 상호': r.customerName,
      '사업자등록번호': r.bizRegNo,
      '대표자명': r.representative,
      '수신 이메일': '발송차단(공란)',
      '품목 및 규격': r.itemSummary,
      '공급가액': r.supplyAmount,
      '세액': r.vatAmount,
      '합계금액': r.totalAmount,
      '발행구분': r.issueType,
      '영수/청구': r.purposeType,
      '팝빌상태코드': `${r.popbillStateCode} (${getPopbillStateLabel(r.popbillStateCode)})`,
      '국세청 승인번호': r.ntsConfirmNo
    }));
    exportToExcel(rows, `팝빌테스트_세금계산서_발행내역_${billingYmFilter}`, '세금계산서원장');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {/* 상단 팝빌 테스트 서버 & 이메일 발송 원천 차단 보안 배너 */}
      <div
        className="card"
        style={{
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          backgroundColor: 'var(--bg-card)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary-color)',
              border: '1px solid var(--border-color)',
              fontSize: '12px',
              fontWeight: 800,
              whiteSpace: 'nowrap'
            }}
          >
            <FileCheck size={13} /> 팝빌 테스트버전 연동 중
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'rgba(185, 28, 28, 0.1)',
              color: 'var(--danger-color)',
              border: '1px solid rgba(185, 28, 28, 0.25)',
              fontSize: '12px',
              fontWeight: 800,
              whiteSpace: 'nowrap'
            }}
          >
            <ShieldAlert size={13} /> 테스트 중 이메일 발송 전면 차단 · 수신메일 공란 고정
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            공급자 사업자번호: {POPBILL_TEST_CONFIG.corpNum} · {popbillStatusText}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="segmented-tab-group">
            <button
              type="button"
              onClick={() => setActiveTab('LEDGER')}
              className={`segmented-tab-item ${activeTab === 'LEDGER' ? 'active' : ''}`}
            >
              세금계산서 발행·전송 대장 ({filteredRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('CONTRACT_SYNC')}
              className={`segmented-tab-item ${activeTab === 'CONTRACT_SYNC' ? 'active' : ''}`}
            >
              계약·청구 내역 연동 생성 ({contractList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('NEW_FORM')}
              className={`segmented-tab-item ${activeTab === 'NEW_FORM' ? 'active' : ''}`}
            >
              신규 테스트 계산서 작성
            </button>
          </div>
          <button
            type="button"
            onClick={handleCheckPopbillConnection}
            disabled={isBusy}
            className="btn btn-secondary"
            style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
          >
            <RefreshCw size={13} />
            <span>테스트 서버 점검</span>
          </button>
        </div>
      </div>

      {toastMsg && (
        <div
          style={{
            padding: '9px 14px',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--primary-color)',
            color: 'var(--text-primary)',
            fontSize: '12.5px',
            fontWeight: 700
          }}
        >
          {toastMsg}
        </div>
      )}

      {activeTab === 'LEDGER' && (
        <>
          {/* 1. 좌상단 Scope & 2. 우상단 Pipeline (Gutenberg Z-Pattern) */}
          <div
            className="card"
            style={{
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>작성·귀속 연월</label>
                <input
                  type="month"
                  value={billingYmFilter}
                  onChange={e => setBillingYmFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>계약 종류 구분자</label>
                <select
                  value={contractTypeFilter}
                  onChange={e => setContractTypeFilter(e.target.value as any)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                >
                  <option value="ALL">전체 계약 · 유통 및 렌탈</option>
                  <option value="TRADE">유통 계약 · 출고 건별</option>
                  <option value="RENTAL">렌탈 계약 · 현장별</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>고객사 선택</label>
                <select
                  value={customerFilter}
                  onChange={e => setCustomerFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', minWidth: '170px' }}
                >
                  <option value="ALL">전체 고객사 ({customerList.length}개사)</option>
                  {customerList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>팝빌 전송 상태</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                >
                  <option value="ALL">전체 상태</option>
                  <option value="NTS_SENT">304 · 국세청 전송완료</option>
                  <option value="ISSUED_READY">300 · 테스트 발행완료</option>
                  <option value="PENDING_ISSUE">100 · 임시저장·발행대기</option>
                  <option value="CANCELLED">600 · 발행취소</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>통합 검색</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="상호, 사업자번호, 문서번호..."
                    style={{ padding: '6px 10px 6px 28px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', width: '200px' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handleExportExcel}
                className="btn btn-secondary"
                style={{ padding: '7px 12px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                <Download size={14} />
                <span>홈택스 양식 엑셀 내보내기</span>
              </button>
            </div>
          </div>

          {/* 3. 중앙 본문 고밀도 세금계산서 대장 그리드 */}
          <div className="card" style={{ flex: 1, padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileCheck size={15} color="var(--primary-color)" />
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  팝빌 테스트 세금계산서 발행·전송 대장 ({filteredRecords.length}건)
                </span>
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                사업자등록번호 10자리 기준 · 모든 발행 및 국세청 전송 시 이메일 발송이 100% 차단됩니다
              </span>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>팝빌 테스트 조치</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>팝빌 문서번호</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>작성일자</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>계약구분</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>공급받는자 상호</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>사업자등록번호</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>품목 및 청구 내역</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>공급가액</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>세액</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>합계금액</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>이메일 상태</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>국세청 승인번호</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>팝빌 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map(r => (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        height: '40px',
                        opacity: r.ntsStatus === 'CANCELLED' ? 0.55 : 1
                      }}
                    >
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setPreviewRecord(r)}
                            className="btn btn-secondary"
                            style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}
                          >
                            <Eye size={11} /> 계산서 보기
                          </button>
                          {r.ntsStatus === 'PENDING_ISSUE' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRegistIssuePopbillTest(r)}
                              className="btn btn-primary"
                              style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}
                            >
                              테스트 발행
                            </button>
                          )}
                          {(r.ntsStatus === 'PENDING_ISSUE' || r.ntsStatus === 'ISSUED_READY') && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSendToNtsPopbillTest(r)}
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--primary-color)', whiteSpace: 'nowrap' }}
                            >
                              국세청 전송
                            </button>
                          )}
                          {r.ntsStatus !== 'CANCELLED' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleCancelPopbillTest(r)}
                              className="btn btn-secondary"
                              style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, color: 'var(--danger-color)', whiteSpace: 'nowrap' }}
                            >
                              취소
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '11.5px', fontWeight: 700 }}>
                        {r.mgtKey}
                      </td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.issueDate}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: 'var(--bg-hover)',
                            color: r.contractType === 'TRADE' ? 'var(--primary-color)' : 'var(--success-color)',
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          {r.contractType === 'TRADE' ? '유통·출고건별' : '렌탈·현장별'}
                        </span>
                      </td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontWeight: 800 }}>{r.customerName}</td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{r.bizRegNo}</td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.itemSummary}>
                        {r.itemSummary}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                        ₩{r.supplyAmount.toLocaleString('ko-KR')}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        ₩{r.vatAmount.toLocaleString('ko-KR')}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: 'var(--primary-color)' }}>
                        ₩{r.totalAmount.toLocaleString('ko-KR')}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-hover)',
                            color: 'var(--text-secondary)',
                            fontSize: '11px',
                            fontWeight: 700
                          }}
                        >
                          <Ban size={10} /> 발송차단
                        </span>
                      </td>
                      <td style={{ padding: '5px 10px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        {r.ntsConfirmNo}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {r.ntsStatus === 'NTS_SENT' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)', color: 'var(--success-color)', fontSize: '11px', fontWeight: 800 }}>
                            <CheckCircle2 size={12} /> 304 · 전송완료
                          </span>
                        ) : r.ntsStatus === 'ISSUED_READY' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)', color: 'var(--warning-color)', fontSize: '11px', fontWeight: 800 }}>
                            <Clock size={12} /> 300 · 발행완료
                          </span>
                        ) : r.ntsStatus === 'CANCELLED' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 800 }}>
                            600 · 발행취소
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)', color: 'var(--danger-color)', fontSize: '11px', fontWeight: 800 }}>
                            100 · 임시저장
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. 우측 하단 대차대조 합계 검증 및 일괄 국세청 전송 액션 */}
          <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', backgroundColor: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', fontWeight: 800 }}>
              <span>발행대상 합계총액: <strong style={{ color: 'var(--primary-color)' }}>₩{summary.grandTotal.toLocaleString('ko-KR')}</strong></span>
              <span>=</span>
              <span>국세청 전송완료액: <strong style={{ color: 'var(--success-color)' }}>₩{summary.sentTotal.toLocaleString('ko-KR')}</strong></span>
              <span>+</span>
              <span>발행·전송 대기액: <strong style={{ color: 'var(--warning-color)' }}>₩{summary.pendingTotal.toLocaleString('ko-KR')}</strong></span>
              <span>|</span>
              <span>대차 차액: <strong style={{ color: summary.diff === 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>₩{summary.diff.toLocaleString('ko-KR')}</strong></span>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleBatchSendNts}
              className="btn btn-primary"
              style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Send size={14} />
              <span>미전송 계산서 일괄 테스트 발행·국세청 전송 (이메일 미발송)</span>
            </button>
          </div>
        </>
      )}

      {activeTab === 'CONTRACT_SYNC' && (
        <div className="card" style={{ flex: 1, padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
              체결 계약 및 출고 내역 기반 팝빌 테스트 계산서 생성 ({contractList.length}건)
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              계약 건 선택 시 수신 이메일 없이 팝빌 테스트 서버에 임시저장(100) 문서가 생성됩니다
            </span>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>연동 생성</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>계약번호</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>계약유형</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>고객사명</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>사업자등록번호</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>현장·납품처</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>기준 공급가액</th>
                </tr>
              </thead>
              <tbody>
                {contractList.map((ctr: any) => {
                  const isTrade = ctr.contractCategory === 'TRADE' || String(ctr.contractNo || '').startsWith('TRD');
                  const supply = Math.round(Number(ctr.totalAmount || ctr.monthlyRentalFee || 1500000));
                  return (
                    <tr key={ctr.id} style={{ borderBottom: '1px solid var(--border-color)', height: '40px' }}>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleCreateFromContract(ctr)}
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                        >
                          <Plus size={12} /> 테스트 계산서 생성
                        </button>
                      </td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{ctr.contractNo || ctr.id}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 700 }}>
                        {isTrade ? '유통·출고건별' : '렌탈·현장별'}
                      </td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 800 }}>{ctr.customerName}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>{ctr.customerBizRegNo || '124-81-50101'}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{ctr.siteName || '-'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                        ₩{supply.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'NEW_FORM' && (
        <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
              팝빌 테스트 전자세금계산서 수기 작성 (이메일 발송 원천 차단)
            </span>
            <span style={{ fontSize: '12px', color: 'var(--danger-color)', fontWeight: 700 }}>
              공급자·공급받는자 이메일 입력란은 테스트 보호 정책에 따라 비활성(공란) 고정됩니다
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>작성일자</label>
              <input
                type="date"
                value={draftDate}
                onChange={e => setDraftDate(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>계약 구분</label>
              <select
                value={draftContractType}
                onChange={e => setDraftContractType(e.target.value as 'RENTAL' | 'TRADE')}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              >
                <option value="RENTAL">렌탈 계약</option>
                <option value="TRADE">유통 계약</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>공급받는자 선택 (사업자등록번호 기준)</label>
              <select
                value={draftCustomerId}
                onChange={e => setDraftCustomerId(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              >
                {customerList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.bizRegNo})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>영수·청구 구분</label>
              <select
                value={draftPurpose}
                onChange={e => setDraftPurpose(e.target.value as '청구' | '영수')}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              >
                <option value="청구">청구</option>
                <option value="영수">영수</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>공급가액 (원)</label>
              <input
                type="number"
                value={draftSupplyAmount}
                onChange={e => setDraftSupplyAmount(Number(e.target.value || 0))}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>부가세액 (자동 10%)</label>
              <input
                type="text"
                readOnly
                value={`₩${Math.round(draftSupplyAmount * 0.1).toLocaleString('ko-KR')}`}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', backgroundColor: 'var(--bg-hover)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>품목 및 규격 요약</label>
              <input
                type="text"
                value={draftItemSummary}
                onChange={e => setDraftItemSummary(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--danger-color)', whiteSpace: 'nowrap' }}>수신자 이메일 (테스트 잠금)</label>
              <input
                type="text"
                readOnly
                disabled
                value="발송 차단됨 (공란 고정)"
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', backgroundColor: 'var(--bg-hover)', color: 'var(--danger-color)', fontWeight: 700 }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleCreateManualTestInvoice(false)}
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '12.5px', fontWeight: 700 }}
            >
              팝빌 테스트 임시저장 (100)
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleCreateManualTestInvoice(true)}
              className="btn btn-primary"
              style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 800 }}
            >
              팝빌 테스트 즉시발행 (300 · 이메일 미발송)
            </button>
          </div>
        </div>
      )}

      {/* 표준 전자세금계산서 미리보기 모달 */}
      {previewRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setPreviewRecord(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '760px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-color)', paddingBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  전자세금계산서 (팝빌 테스트본 · 과금 및 이메일 발송 없음)
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  팝빌 문서번호: {previewRecord.mgtKey} | 국세청 승인번호: {previewRecord.ntsConfirmNo}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700 }}
              >
                닫기
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--danger-color)', marginBottom: '8px' }}>공급자</div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.7 }}>
                  <div><strong>등록번호:</strong> {POPBILL_TEST_CONFIG.corpNum}</div>
                  <div><strong>상호(법인명):</strong> {POPBILL_TEST_CONFIG.invoicerCorpName} / <strong>성명:</strong> {POPBILL_TEST_CONFIG.invoicerCEOName}</div>
                  <div><strong>사업장 주소:</strong> {POPBILL_TEST_CONFIG.invoicerAddr}</div>
                  <div><strong>업태/종목:</strong> {POPBILL_TEST_CONFIG.invoicerBizType} · {POPBILL_TEST_CONFIG.invoicerBizClass}</div>
                  <div><strong>이메일:</strong> 공란 고정 (테스트 발송 차단)</div>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-color)', marginBottom: '8px' }}>공급받는자</div>
                <div style={{ fontSize: '12.5px', lineHeight: 1.7 }}>
                  <div><strong>등록번호:</strong> {previewRecord.bizRegNo}</div>
                  <div><strong>상호(법인명):</strong> {previewRecord.customerName} / <strong>성명:</strong> {previewRecord.representative}</div>
                  <div><strong>사업장 주소:</strong> {previewRecord.address || '등록 주소지'}</div>
                  <div><strong>계약번호:</strong> {previewRecord.contractNo}</div>
                  <div><strong>이메일:</strong> 공란 고정 (테스트 발송 차단)</div>
                </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', border: '1px solid var(--border-color)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>작성일자</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>품목 및 규격</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>공급가액</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>세액</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>합계금액</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>영수/청구</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{previewRecord.issueDate}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{previewRecord.itemSummary}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>₩{previewRecord.supplyAmount.toLocaleString('ko-KR')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>₩{previewRecord.vatAmount.toLocaleString('ko-KR')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary-color)' }}>₩{previewRecord.totalAmount.toLocaleString('ko-KR')}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{previewRecord.purposeType}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default TaxInvoiceManagePage;
