import React, { useState, useMemo, useEffect } from 'react';
import { FileCheck, Send, Download, Search, CheckCircle2, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SEED_FL_CUSTOMERS, SEED_FL_CONTRACTS } from '../data/flUnifiedSeedData';
import { exportToExcel } from '../services/excel';

interface TaxInvoiceRecord {
  id: string;
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
  recipientEmail: string;
  itemSummary: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  issueType: '정발행' | '역발행';
  ntsConfirmNo: string;
  ntsStatus: 'NTS_SENT' | 'ISSUED_READY' | 'PENDING_ISSUE';
  ntsSentAt?: string;
}

const INITIAL_TAX_INVOICES: TaxInvoiceRecord[] = [
  {
    id: 'TXI-202610-001',
    invoiceNo: '20261025-41000101',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-T2609-101',
    contractNo: 'TRD-202609-101',
    contractType: 'TRADE',
    customerId: 'CUST-FL-001',
    customerName: '한빛물류센터 주식회사',
    bizRegNo: '124-81-50101',
    representative: '김한빛',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '유통 제1차 출고 · 헬리 리튬전동지게차 2.5톤 1대 외 옵션',
    supplyAmount: 29800000,
    vatAmount: 2980000,
    totalAmount: 32780000,
    issueType: '정발행',
    ntsConfirmNo: '20261025-12481501-88910231',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-25 14:20'
  },
  {
    id: 'TXI-202610-002',
    invoiceNo: '20261025-41000102',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-T2610-102',
    contractNo: 'TRD-202610-102',
    contractType: 'TRADE',
    customerId: 'CUST-FL-001',
    customerName: '한빛물류센터 주식회사',
    bizRegNo: '124-81-50101',
    representative: '김한빛',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '유통 제2차 출고 · 단조 덧발 1800mm 2조 및 전동호환부품',
    supplyAmount: 2850000,
    vatAmount: 285000,
    totalAmount: 3135000,
    issueType: '정발행',
    ntsConfirmNo: '20261025-12481501-88910232',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-25 14:22'
  },
  {
    id: 'TXI-202610-003',
    invoiceNo: '20261028-41000103',
    issueDate: '2026-10-28',
    billingYm: '2026-10',
    contractId: 'CTR-T2609-103',
    contractNo: 'TRD-202609-103',
    contractType: 'TRADE',
    customerId: 'CUST-FL-002',
    customerName: '태양중공업 주식회사',
    bizRegNo: '608-81-40202',
    representative: '박태양',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '유통 제1차 출고 · 두산밥캣 디젤지게차 5.0톤 풀캐빈 에어컨형 1대',
    supplyAmount: 64500000,
    vatAmount: 6450000,
    totalAmount: 70950000,
    issueType: '정발행',
    ntsConfirmNo: '20261028-60881402-77210941',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-28 16:05'
  },
  {
    id: 'TXI-202610-004',
    invoiceNo: '20261030-41000104',
    issueDate: '2026-10-30',
    billingYm: '2026-10',
    contractId: 'CTR-T2610-104',
    contractNo: 'TRD-202610-104',
    contractType: 'TRADE',
    customerId: 'CUST-FL-003',
    customerName: '주식회사 서해글로벌모터스',
    bizRegNo: '131-86-30303',
    representative: '이서해',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '유통 제1차 출고 · 비와이디 리튬전동지게차 3.5톤 2대',
    supplyAmount: 78000000,
    vatAmount: 7800000,
    totalAmount: 85800000,
    issueType: '정발행',
    ntsConfirmNo: '국세청 전송 대기',
    ntsStatus: 'ISSUED_READY'
  },
  {
    id: 'TXI-202610-005',
    invoiceNo: '20261031-41000105',
    issueDate: '2026-10-31',
    billingYm: '2026-10',
    contractId: 'CTR-T2610-105',
    contractNo: 'TRD-202610-105',
    contractType: 'TRADE',
    customerId: 'CUST-FL-005',
    customerName: '동남건기부품상사',
    bizRegNo: '605-24-80505',
    representative: '최동남',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '유통 제1차 출고 · 호환부품 및 정기점검 필터·윤활유 소모품 일괄',
    supplyAmount: 6420000,
    vatAmount: 642000,
    totalAmount: 7062000,
    issueType: '정발행',
    ntsConfirmNo: '미발행',
    ntsStatus: 'PENDING_ISSUE'
  },
  {
    id: 'TXI-202610-006',
    invoiceNo: '20261025-51000201',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-001',
    contractNo: 'RNT-202607-001',
    contractType: 'RENTAL',
    customerId: 'CUST-FL-001',
    customerName: '한빛물류센터 주식회사',
    bizRegNo: '124-81-50101',
    representative: '김한빛',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '렌탈 평택항만 제1물류센터 현장 · 전동 2.5톤 및 리치 1.8톤 10월분 렌탈료',
    supplyAmount: 2050000,
    vatAmount: 205000,
    totalAmount: 2255000,
    issueType: '정발행',
    ntsConfirmNo: '20261025-12481501-88910301',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-25 15:10'
  },
  {
    id: 'TXI-202610-007',
    invoiceNo: '20261030-51000202',
    issueDate: '2026-10-30',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-002',
    contractNo: 'RNT-202607-002',
    contractType: 'RENTAL',
    customerId: 'CUST-FL-002',
    customerName: '태양중공업 주식회사',
    bizRegNo: '608-81-40202',
    representative: '박태양',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '렌탈 창원 제1중공업 공장 현장 · 디젤 5.0톤 지게차 10월분 렌탈료',
    supplyAmount: 1850000,
    vatAmount: 185000,
    totalAmount: 2035000,
    issueType: '정발행',
    ntsConfirmNo: '20261030-60881402-77210990',
    ntsStatus: 'NTS_SENT',
    ntsSentAt: '2026-10-30 11:40'
  },
  {
    id: 'TXI-202610-008',
    invoiceNo: '20261025-51000203',
    issueDate: '2026-10-25',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-003',
    contractNo: 'RNT-202607-003',
    contractType: 'RENTAL',
    customerId: 'CUST-FL-003',
    customerName: '주식회사 서해글로벌모터스',
    bizRegNo: '131-86-30303',
    representative: '이서해',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '렌탈 인천신항 자동차부품 물류기지 현장 · 전동 3.0톤 지게차 10월분 렌탈료',
    supplyAmount: 1350000,
    vatAmount: 135000,
    totalAmount: 1485000,
    issueType: '정발행',
    ntsConfirmNo: '국세청 전송 대기',
    ntsStatus: 'ISSUED_READY'
  },
  {
    id: 'TXI-202610-009',
    invoiceNo: '20261031-51000204',
    issueDate: '2026-10-31',
    billingYm: '2026-10',
    contractId: 'CTR-R2607-004',
    contractNo: 'RNT-202607-004',
    contractType: 'RENTAL',
    customerId: 'CUST-FL-004',
    customerName: '대한콜드체인 주식회사',
    bizRegNo: '214-87-60404',
    representative: '정대한',
    recipientEmail: '77.victor.lee@gmail.com',
    itemSummary: '렌탈 용인 제1냉동냉장물류센터 현장 · 냉동창고형 리치트럭 2.0톤 10월분 렌탈료',
    supplyAmount: 1250000,
    vatAmount: 125000,
    totalAmount: 1375000,
    issueType: '정발행',
    ntsConfirmNo: '미발행',
    ntsStatus: 'PENDING_ISSUE'
  }
];

export const TaxInvoiceManagePage: React.FC = () => {
  const { customers } = useApp();
  const [records, setRecords] = useState<TaxInvoiceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ebro_fl_tax_invoices_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_TAX_INVOICES;
  });
  const [billingYmFilter, setBillingYmFilter] = useState<string>('2026-10');
  const [contractTypeFilter, setContractTypeFilter] = useState<'ALL' | 'TRADE' | 'RENTAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NTS_SENT' | 'ISSUED_READY' | 'PENDING_ISSUE'>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('ebro_fl_tax_invoices_v1', JSON.stringify(records));
    } catch {}
  }, [records]);

  const updateRecords = (updater: (prev: TaxInvoiceRecord[]) => TaxInvoiceRecord[]) => {
    setRecords(prev => updater(prev));
  };

  const customerList = useMemo(() => {
    return customers && customers.length > 0 ? customers : SEED_FL_CUSTOMERS;
  }, [customers]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
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
          r.invoiceNo.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [records, billingYmFilter, contractTypeFilter, statusFilter, customerFilter, searchTerm]);

  const summary = useMemo(() => {
    const totalSupply = filteredRecords.reduce((acc, r) => acc + r.supplyAmount, 0);
    const totalVat = filteredRecords.reduce((acc, r) => acc + r.vatAmount, 0);
    const grandTotal = totalSupply + totalVat;
    const sentTotal = filteredRecords.filter(r => r.ntsStatus === 'NTS_SENT').reduce((acc, r) => acc + r.totalAmount, 0);
    const pendingTotal = filteredRecords.filter(r => r.ntsStatus !== 'NTS_SENT').reduce((acc, r) => acc + r.totalAmount, 0);
    const diff = grandTotal - (sentTotal + pendingTotal);
    return { totalSupply, totalVat, grandTotal, sentTotal, pendingTotal, diff };
  }, [filteredRecords]);

  const handleIssueSingle = (id: string) => {
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    updateRecords(prev => prev.map(r => {
      if (r.id !== id) return r;
      const randTail = String(Math.floor(10000000 + Math.random() * 89999999));
      const cleanBiz = (r.bizRegNo || '').replace(/[^0-9]/g, '').padEnd(10, '0').slice(0, 8);
      return {
        ...r,
        ntsStatus: 'NTS_SENT',
        ntsConfirmNo: `${r.issueDate.replace(/-/g, '')}-${cleanBiz}-${randTail}`,
        ntsSentAt: nowStr
      };
    }));
    showToast('선택한 세금계산서의 전자발행 및 국세청 전송이 완료되었습니다.');
  };

  const handleBatchSendNts = () => {
    const targets = filteredRecords.filter(r => r.ntsStatus !== 'NTS_SENT');
    if (targets.length === 0) {
      showToast('현재 조건에서 미발행 또는 국세청 미전송 상태인 세금계산서가 없습니다.');
      return;
    }
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const targetIds = new Set(targets.map(t => t.id));
    updateRecords(prev => prev.map(r => {
      if (!targetIds.has(r.id)) return r;
      const randTail = String(Math.floor(10000000 + Math.random() * 89999999));
      const cleanBiz = (r.bizRegNo || '').replace(/[^0-9]/g, '').padEnd(10, '0').slice(0, 8);
      return {
        ...r,
        ntsStatus: 'NTS_SENT',
        ntsConfirmNo: `${r.issueDate.replace(/-/g, '')}-${cleanBiz}-${randTail}`,
        ntsSentAt: nowStr
      };
    }));
    showToast(`총 ${targets.length}건의 전자세금계산서 발행 및 국세청 전송을 완료했습니다.`);
  };

  const handleExportExcel = () => {
    const rows = filteredRecords.map(r => ({
      '작성일자': r.issueDate,
      '계약구분': r.contractType === 'TRADE' ? '유통계약' : '렌탈계약',
      '계약번호': r.contractNo,
      '공급받는자 상호': r.customerName,
      '사업자등록번호': r.bizRegNo,
      '대표자명': r.representative,
      '수신 이메일': r.recipientEmail,
      '품목 및 규격': r.itemSummary,
      '공급가액': r.supplyAmount,
      '세액': r.vatAmount,
      '합계금액': r.totalAmount,
      '발행구분': r.issueType,
      '국세청 승인번호': r.ntsConfirmNo,
      '전송상태': r.ntsStatus === 'NTS_SENT' ? '국세청 전송완료' : r.ntsStatus === 'ISSUED_READY' ? '발행완료·전송대기' : '발행대기'
    }));
    exportToExcel(rows, `세금계산서_발행내역_${billingYmFilter}`, '세금계산서원장');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {toastMsg && (
        <div style={{
          padding: '10px 16px',
          borderRadius: '6px',
          backgroundColor: '#dcfce7',
          border: '1px solid #86efac',
          color: '#166534',
          fontSize: '12.5px',
          fontWeight: 700
        }}>
          {toastMsg}
        </div>
      )}

      {/* 1. 좌상단 Scope & 2. 우상단 Pipeline (Gutenberg Z-Pattern) */}
      <div className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
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
              <option value="TRADE">유통 계약 · 출고 1건=1계약</option>
              <option value="RENTAL">렌탈 계약 · 고객 현장별 계약</option>
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
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>국세청 전송 상태</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
            >
              <option value="ALL">전체 상태</option>
              <option value="NTS_SENT">국세청 전송완료</option>
              <option value="ISSUED_READY">발행완료 · 전송대기</option>
              <option value="PENDING_ISSUE">발행대기</option>
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
                placeholder="상호, 사업자번호, 계약번호, 품목..."
                style={{ padding: '6px 10px 6px 28px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', width: '210px' }}
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
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileCheck size={16} color="#2563eb" />
            <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
              세금계산서 발행 및 국세청 전송 대장 ({filteredRecords.length}건)
            </span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            사업자등록번호 10자리 기준 전자세금계산서 발행 및 국세청 전송 이력
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>발행·전송 조치</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>작성일자</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>계약구분</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>계약번호</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>공급받는자 상호</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>사업자등록번호</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>품목 및 청구 내역</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>공급가액</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>세액</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>합계금액</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>국세청 승인번호</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>국세청 전송상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)', height: '40px' }}>
                  <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {r.ntsStatus === 'NTS_SENT' ? (
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#059669' }}>전송완료</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleIssueSingle(r.id)}
                        className="btn btn-primary"
                        style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        {r.ntsStatus === 'PENDING_ISSUE' ? '발행·국세청전송' : '국세청 즉시전송'}
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.issueDate}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 800,
                      backgroundColor: r.contractType === 'TRADE' ? '#eff6ff' : '#f0fdf4',
                      color: r.contractType === 'TRADE' ? '#1d4ed8' : '#15803d',
                      border: r.contractType === 'TRADE' ? '1px solid #bfdbfe' : '1px solid #bbf7d0'
                    }}>
                      {r.contractType === 'TRADE' ? '유통·출고건별' : '렌탈·현장별'}
                    </span>
                  </td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700 }}>{r.contractNo}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 800 }}>{r.customerName}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{r.bizRegNo}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.itemSummary}>
                    {r.itemSummary}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                    ₩{r.supplyAmount.toLocaleString('ko-KR')}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    ₩{r.vatAmount.toLocaleString('ko-KR')}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: '#1e40af' }}>
                    ₩{r.totalAmount.toLocaleString('ko-KR')}
                  </td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    {r.ntsConfirmNo}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {r.ntsStatus === 'NTS_SENT' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 800 }}>
                        <CheckCircle2 size={12} /> 국세청 전송완료
                      </span>
                    ) : r.ntsStatus === 'ISSUED_READY' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: 800 }}>
                        <Clock size={12} /> 발행완료·전송대기
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '11px', fontWeight: 800 }}>
                        발행대기
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
          <span>발행대상 합계총액: <strong style={{ color: '#1e40af' }}>₩{summary.grandTotal.toLocaleString('ko-KR')}</strong></span>
          <span>=</span>
          <span>국세청 전송완료액: <strong style={{ color: '#059669' }}>₩{summary.sentTotal.toLocaleString('ko-KR')}</strong></span>
          <span>+</span>
          <span>발행·전송 대기액: <strong style={{ color: '#d97706' }}>₩{summary.pendingTotal.toLocaleString('ko-KR')}</strong></span>
          <span>|</span>
          <span>대차 차액: <strong style={{ color: summary.diff === 0 ? '#059669' : '#dc2626' }}>₩{summary.diff.toLocaleString('ko-KR')}</strong></span>
        </div>

        <button
          type="button"
          onClick={handleBatchSendNts}
          className="btn btn-primary"
          style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
        >
          <Send size={14} />
          <span>미전송 세금계산서 일괄 발행 및 국세청 전송</span>
        </button>
      </div>
    </div>
  );
};
export default TaxInvoiceManagePage;
