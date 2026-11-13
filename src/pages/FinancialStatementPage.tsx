// src/pages/FinancialStatementPage.tsx
// 재무제표 · 손익계산서 (연월 ~ 연월 구간 지정 조회)
import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Printer,
  Upload,
  ShieldCheck,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  Check,
  X,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Scale
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTrade } from '../context/TradeContext';
import {
  calculateFinancialStatementReport,
  loadSavedTaxPayments,
  saveTaxPaymentsToStorage,
  loadSavedFinancialRemark,
  saveFinancialRemarkToStorage,
  parseHometaxTaxPaymentFile,
  shiftYm,
  MAJOR_META,
  type AmountBasis,
  type BusinessScopeFilter,
  type MajorAccountCode,
  type UploadedTaxPaymentRow,
  type TaxCategoryKey,
  type FinancialRemarkRecord
} from '../services/financialStatementReportEngine';
import {
  resolveAccountSubjectStandard,
  getLinkedArticlesAndCommentaries,
  type AccountSubjectStandardInfo
} from '../data/accountSubjectStandardsMap';
import {
  ACCOUNTING_STANDARDS_META,
  STANDARD_ARTICLES
} from '../data/accountingStandardsData';

function fmtWon(n: number | undefined | null): string {
  const val = Math.round(Number(n || 0));
  if (val === 0) return '₩0';
  if (val < 0) return `-₩${Math.abs(val).toLocaleString('ko-KR')}`;
  return `₩${val.toLocaleString('ko-KR')}`;
}

function fmtNum(n: number | undefined | null): string {
  const val = Math.round(Number(n || 0));
  if (val === 0) return '-';
  return val.toLocaleString('ko-KR');
}

export const FinancialStatementPage: React.FC = () => {
  const app = useApp();
  const trade = useTrade();

  const tenantId = app.currentTenant?.id || 'fl-demo';
  const tenantName =
    app.currentTenant?.corporateName ||
    app.currentTenant?.displayName ||
    app.currentTenant?.tradeName ||
    '주식회사 이브로렌탈';

  // ── 1. 조회 조건 상태 (연월 ~ 연월 지정) ──
  const [startYm, setStartYm] = useState<string>('2026-01');
  const [endYm, setEndYm] = useState<string>('2026-10');
  const [businessScope, setBusinessScope] = useState<BusinessScopeFilter>('ALL');
  const [amountBasis, setAmountBasis] = useState<AmountBasis>('SUPPLY');

  // ── 2. 펼침/뷰 전환 상태 ──
  const [expandedMajors, setExpandedMajors] = useState<Record<string, boolean>>({
    REVENUE: true,
    COGS: true,
    PAYROLL: false,
    OPEX: false,
    TAX_DUES: false,
    NON_OP: false
  });
  const [activeMainSection, setActiveMainSection] = useState<
    'ALL' | 'STATEMENTS' | 'MONTHLY_MATRIX' | 'DEPRECIATION' | 'VOUCHERS'
  >('ALL');
  const [deprecTabMode, setDeprecTabMode] = useState<'MONTHLY' | 'ASSET_MODEL'>('MONTHLY');

  // ── 3. 하단 전표 드릴다운 필터 ──
  const [detailMajorFilter, setDetailMajorFilter] = useState<string>('ALL');
  const [detailMonthFilter, setDetailMonthFilter] = useState<string>('ALL');
  const [detailSubAccountFilter, setDetailSubAccountFilter] = useState<string>('ALL');
  const [detailSearchQuery, setDetailSearchQuery] = useState<string>('');
  const voucherSectionRef = useRef<HTMLDivElement>(null);

  // ── 4. 세무 납부내역 및 주석 영속 상태 ──
  const [taxPayments, setTaxPayments] = useState<UploadedTaxPaymentRow[]>(() =>
    loadSavedTaxPayments(tenantId)
  );
  const [remarkRefreshTick, setRemarkRefreshTick] = useState<number>(0);

  const normalizedRangeKey = useMemo(() => {
    const s = startYm <= endYm ? startYm : endYm;
    const e = startYm <= endYm ? endYm : startYm;
    return `${s}~${e}`;
  }, [startYm, endYm]);

  const savedRemark = useMemo(() => {
    void remarkRefreshTick;
    return loadSavedFinancialRemark(tenantId, normalizedRangeKey);
  }, [tenantId, normalizedRangeKey, remarkRefreshTick]);

  // 주석 인라인 편집 상태
  const [isEditingRemark, setIsEditingRemark] = useState(false);
  const [draftRemarkText, setDraftRemarkText] = useState('');
  const [draftWithholding, setDraftWithholding] = useState<string>('');
  const [draftVat, setDraftVat] = useState<string>('');
  const [draftCorpTax, setDraftCorpTax] = useState<string>('');
  const [draftTaxPayment, setDraftTaxPayment] = useState<string>('');

  // ── 5. 모달 상태 (중소기업회계기준 상세 / 부합검증 / 납부세액 업로드) ──
  const [selectedStandardInfo, setSelectedStandardInfo] =
    useState<AccountSubjectStandardInfo | null>(null);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [complianceChapterFilter, setComplianceChapterFilter] = useState<string>('ALL');
  const [showTaxUploadModal, setShowTaxUploadModal] = useState(false);

  // 수기 세액 추가 입력 폼 (납부세액 모달 내)
  const [newTaxCategory, setNewTaxCategory] = useState<TaxCategoryKey>('WITHHOLDING_TAX');
  const [newTaxAttrYm, setNewTaxAttrYm] = useState<string>('2026-10');
  const [newTaxPayDate, setNewTaxPayDate] = useState<string>('2026-11-10');
  const [newTaxOffice, setNewTaxOffice] = useState<string>('평택세무서');
  const [newTaxDetail, setNewTaxDetail] = useState<string>('');
  const [newTaxAmount, setNewTaxAmount] = useState<string>('');
  const taxFileInputRef = useRef<HTMLInputElement>(null);

  // 토스트 알림
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // ── 6. 재무제표 · 손익계산서 실시간 정밀 산출 ──
  const report = useMemo(() => {
    return calculateFinancialStatementReport({
      startYm,
      endYm,
      amountBasis,
      businessScope,
      tenantName,
      appData: {
        customers: app.customers,
        vendors: app.vendors,
        contracts: app.contracts,
        contractAssets: app.contractAssets,
        assets: app.assets,
        billings: app.billings,
        billingDetails: app.billingDetails,
        receivables: app.receivables,
        payments: app.payments,
        purchaseSettlements: app.purchaseSettlements,
        externalLeases: app.externalLeases,
        repairs: app.repairs,
        consumablePurchases: app.consumablePurchases,
        users: app.users,
        overtimeRecords: app.overtimeRecords,
        payrollClosings: app.payrollClosings,
        vehicleFuelLogs: app.vehicleFuelLogs,
        bankTransactions: app.bankTransactions,
        bankInitialBalances: app.bankInitialBalances,
        depreciationLogs: app.depreciationLogs
      },
      tradeData: {
        products: trade.products,
        purchases: trade.purchases,
        purchaseItems: trade.purchaseItems,
        inventoryLots: trade.inventoryLots,
        salesOrders: trade.salesOrders,
        salesOrderLines: trade.salesOrderLines,
        outbounds: trade.outbounds,
        billings: trade.billings,
        returns: trade.returns
      },
      taxPayments,
      savedRemark
    });
  }, [
    startYm,
    endYm,
    amountBasis,
    businessScope,
    tenantName,
    app.customers,
    app.vendors,
    app.contracts,
    app.contractAssets,
    app.assets,
    app.billings,
    app.billingDetails,
    app.receivables,
    app.payments,
    app.purchaseSettlements,
    app.externalLeases,
    app.repairs,
    app.consumablePurchases,
    app.users,
    app.overtimeRecords,
    app.payrollClosings,
    app.vehicleFuelLogs,
    app.bankTransactions,
    app.bankInitialBalances,
    app.depreciationLogs,
    trade.products,
    trade.purchases,
    trade.purchaseItems,
    trade.inventoryLots,
    trade.salesOrders,
    trade.salesOrderLines,
    trade.outbounds,
    trade.billings,
    trade.returns,
    taxPayments,
    savedRemark
  ]);

  // ── 7. 기간 빠른선택 핸들러 ──
  const applyPeriodPreset = (preset: string) => {
    const baseYear = Number((endYm || '2026-10').slice(0, 4)) || 2026;
    if (preset === 'YTD_2026') {
      setStartYm('2026-01');
      setEndYm('2026-10');
    } else if (preset === 'FULL_YEAR') {
      setStartYm(`${baseYear}-01`);
      setEndYm(`${baseYear}-12`);
    } else if (preset === 'RECENT_6M') {
      setStartYm(shiftYm(endYm, -5));
    } else if (preset === 'RECENT_12M') {
      setStartYm(shiftYm(endYm, -11));
    } else if (preset === 'H1') {
      setStartYm(`${baseYear}-01`);
      setEndYm(`${baseYear}-06`);
    } else if (preset === 'H2') {
      setStartYm(`${baseYear}-07`);
      setEndYm(`${baseYear}-12`);
    } else if (preset === 'Q1') {
      setStartYm(`${baseYear}-01`);
      setEndYm(`${baseYear}-03`);
    } else if (preset === 'Q2') {
      setStartYm(`${baseYear}-04`);
      setEndYm(`${baseYear}-06`);
    } else if (preset === 'Q3') {
      setStartYm(`${baseYear}-07`);
      setEndYm(`${baseYear}-09`);
    } else if (preset === 'Q4') {
      setStartYm(`${baseYear}-10`);
      setEndYm(`${baseYear}-12`);
    }
  };

  const handleStartYmChange = (val: string) => {
    if (!val) return;
    setStartYm(val);
    if (val > endYm) setEndYm(val);
  };

  const handleEndYmChange = (val: string) => {
    if (!val) return;
    setEndYm(val);
    if (val < startYm) setStartYm(val);
  };

  // ── 8. 계정 셀 클릭 -> 하단 전표 드릴다운 연동 ──
  const handleDrillDown = (majorCode: string, month: string = 'ALL', subAccount: string = 'ALL') => {
    setDetailMajorFilter(majorCode);
    setDetailMonthFilter(month);
    setDetailSubAccountFilter(subAccount);
    if (activeMainSection !== 'ALL' && activeMainSection !== 'VOUCHERS') {
      setActiveMainSection('VOUCHERS');
    }
    setTimeout(() => {
      voucherSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 60);
  };

  const openStandardGuide = (keyOrSub: string, fallbackMajor?: string) => {
    const info = resolveAccountSubjectStandard(keyOrSub, fallbackMajor);
    setSelectedStandardInfo(info);
  };

  // ── 9. 전표 필터링 결과 ──
  const subAccountOptions = useMemo(() => {
    const set = new Set<string>();
    report.details.forEach(d => {
      if (detailMajorFilter === 'ALL' || d.majorCode === detailMajorFilter) {
        set.add(d.subAccount);
      }
    });
    return Array.from(set);
  }, [report.details, detailMajorFilter]);

  const filteredDetails = useMemo(() => {
    const q = detailSearchQuery.trim().toLowerCase();
    return report.details.filter(d => {
      if (detailMajorFilter !== 'ALL' && d.majorCode !== detailMajorFilter) return false;
      if (detailMonthFilter !== 'ALL' && d.month !== detailMonthFilter) return false;
      if (detailSubAccountFilter !== 'ALL' && d.subAccount !== detailSubAccountFilter) return false;
      if (q) {
        const hay = `${d.counterparty} ${d.description} ${d.subAccount} ${d.docRefNo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    report.details,
    detailMajorFilter,
    detailMonthFilter,
    detailSubAccountFilter,
    detailSearchQuery
  ]);

  const filteredDetailSum = useMemo(() => {
    return filteredDetails.reduce(
      (acc, cur) => ({
        supply: acc.supply + cur.supplyAmount,
        vat: acc.vat + cur.vatAmount,
        total: acc.total + cur.totalAmount,
        effective: acc.effective + cur.effectiveAmount
      }),
      { supply: 0, vat: 0, total: 0, effective: 0 }
    );
  }, [filteredDetails]);

  // ── 10. 주석 및 세액 저장 핸들러 ──
  const startEditRemark = () => {
    const cur = report.statements.remark;
    setDraftRemarkText(cur.remarkText);
    const wth = cur.taxItems.find(t => t.key === 'WITHHOLDING_TAX')?.amount ?? 0;
    const vat = cur.taxItems.find(t => t.key === 'VAT')?.amount ?? 0;
    const corp = cur.taxItems.find(t => t.key === 'CORPORATE_TAX')?.amount ?? 0;
    const dues = cur.taxItems.find(t => t.key === 'TAX_PAYMENT')?.amount ?? 0;
    setDraftWithholding(String(wth));
    setDraftVat(String(vat));
    setDraftCorpTax(String(corp));
    setDraftTaxPayment(String(dues));
    setIsEditingRemark(true);
  };

  const handleSaveRemark = () => {
    try {
      const record: FinancialRemarkRecord = {
        periodKey: report.statements.remark.periodKey,
        remarkText: draftRemarkText.trim(),
        manualWithholdingTax: Math.max(0, Math.round(Number(draftWithholding || 0))),
        manualVat: Math.max(0, Math.round(Number(draftVat || 0))),
        manualCorporateTax: Math.max(0, Math.round(Number(draftCorpTax || 0))),
        manualTaxPayment: Math.max(0, Math.round(Number(draftTaxPayment || 0))),
        updatedBy: app.currentUser?.name || '관리자',
        updatedAt: new Date().toISOString().slice(0, 10)
      };
      saveFinancialRemarkToStorage(tenantId, record);
      setRemarkRefreshTick(t => t + 1);
      setIsEditingRemark(false);
      showToast('재무제표 주석 및 세무 조정 내역이 저장되었습니다.');
    } catch (err: any) {
      app.showErrorModal(`재무제표 주석 저장 중 오류가 발생했습니다: ${err?.message || String(err)}`);
    }
  };

  // ── 11. 홈택스 납부내역 엑셀 업로드 및 수기 추가 ──
  const handleTaxFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fallbackYear = Number(report.endYm.slice(0, 4)) || 2026;
      const parsed = await parseHometaxTaxPaymentFile(file, fallbackYear);
      if (parsed.length === 0) {
        app.showErrorModal('업로드한 파일에서 유효한 세액 납부 행을 찾지 못했습니다.');
        return;
      }
      const merged = [...taxPayments, ...parsed];
      saveTaxPaymentsToStorage(tenantId, merged);
      setTaxPayments(merged);
      showToast(`국세·지방세 납부내역 ${parsed.length}건이 반영되었습니다.`);
    } catch (err: any) {
      app.showErrorModal(`납부내역 파일 파싱 실패: ${err?.message || String(err)}`);
    } finally {
      if (taxFileInputRef.current) taxFileInputRef.current.value = '';
    }
  };

  const handleAddManualTaxRow = () => {
    const amt = Math.round(Number(newTaxAmount.replace(/[^0-9]/g, '') || 0));
    if (amt <= 0) {
      app.showErrorModal('납부세액을 0원보다 크게 입력해 주십시오.');
      return;
    }
    try {
      const row: UploadedTaxPaymentRow = {
        id: `TAX-MAN-${Date.now()}`,
        taxCategory: newTaxCategory,
        attributionYear: Number(newTaxAttrYm.slice(0, 4)) || 2026,
        attributionMonth: newTaxAttrYm,
        paymentDate: newTaxPayDate || `${newTaxAttrYm}-10`,
        taxOfficeName: newTaxOffice.trim() || '관할세무서',
        taxDetailName:
          newTaxDetail.trim() ||
          (newTaxCategory === 'WITHHOLDING_TAX'
            ? '원천징수세액 납부'
            : newTaxCategory === 'VAT'
            ? '부가가치세 신고납부'
            : newTaxCategory === 'CORPORATE_TAX'
            ? '법인세 신고납부'
            : '법정 세금과공과 납부'),
        paidAmount: amt,
        isInterimPrepayment: newTaxCategory === 'CORPORATE_TAX' && /중간예납/.test(newTaxDetail)
      };
      const updated = [row, ...taxPayments];
      saveTaxPaymentsToStorage(tenantId, updated);
      setTaxPayments(updated);
      setNewTaxDetail('');
      setNewTaxAmount('');
      showToast('납부세액 내역 1건이 추가되었습니다.');
    } catch (err: any) {
      app.showErrorModal(`납부세액 저장 실패: ${err?.message || String(err)}`);
    }
  };

  const handleDeleteTaxRow = (id: string) => {
    try {
      const updated = taxPayments.filter(r => r.id !== id);
      saveTaxPaymentsToStorage(tenantId, updated);
      setTaxPayments(updated);
      showToast('선택한 납부세액 내역이 삭제되었습니다.');
    } catch (err: any) {
      app.showErrorModal(`납부세액 삭제 실패: ${err?.message || String(err)}`);
    }
  };

  // ── 12. 다중 시트 엑셀 내보내기 ──
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 시트 1: 손익계산서 및 재무상태표 요약
      const stmtRows: any[][] = [
        [`${tenantName} 재무제표 및 손익계산서`],
        [
          `조회기간: ${report.startYm} ~ ${report.endYm} (${report.months.length}개월) | 집계기준: ${
            amountBasis === 'SUPPLY' ? '공급가액 기준' : '부가세 포함 총액'
          }`
        ],
        [],
        ['[손익계산서]', '금액(원)'],
        ...report.statements.pl.items.map(it => [it.label, it.amount]),
        [],
        [`[재무상태표 (${report.statements.bs.asOfDate} 기준)]`, '금액(원)'],
        ['--- 자산 ---', ''],
        ...report.statements.bs.assets.map(it => [it.label, it.amount]),
        ['자산총계', report.statements.bs.totalAssets],
        ['--- 부채 ---', ''],
        ...report.statements.bs.liabilities.map(it => [it.label, it.amount]),
        ['부채총계', report.statements.bs.totalLiabilities],
        ['--- 자본 ---', ''],
        ...report.statements.bs.equity.map(it => [it.label, it.amount]),
        ['자본총계', report.statements.bs.totalEquity],
        ['부채와자본총계', report.statements.bs.totalLiabilities + report.statements.bs.totalEquity],
        ['대차차액', report.statements.bs.balanceDiff],
        [],
        [`[현금흐름표 (${report.statements.cf.periodLabel})]`, '금액(원)'],
        ['기초 현금및현금성자산', report.statements.cf.beginningCash],
        ['Ⅰ. 영업활동 현금흐름', report.statements.cf.operatingCashFlow],
        ...report.statements.cf.operatingItems.map(it => [it.label, it.amount]),
        ['Ⅱ. 투자활동 현금흐름', report.statements.cf.investingCashFlow],
        ...report.statements.cf.investingItems.map(it => [it.label, it.amount]),
        ['Ⅲ. 재무활동 현금흐름', report.statements.cf.financingCashFlow],
        ...report.statements.cf.financingItems.map(it => [it.label, it.amount]),
        ['기말 현금및현금성자산', report.statements.cf.endingCash]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stmtRows), '4대재무제표');

      // 시트 2: 월별 계정과목 손익집계표
      const matrixHeader = ['계정과목', '전표건수', ...report.months, '기간합계'];
      const matrixBody: any[][] = [matrixHeader];
      report.accountRows.forEach(row => {
        matrixBody.push([
          row.majorLabel,
          row.count,
          ...report.months.map(m => row.monthly[m] || 0),
          row.total
        ]);
        row.subAccounts.forEach(sub => {
          matrixBody.push([
            `  · ${sub.subAccount}`,
            sub.count,
            ...report.months.map(m => sub.monthly[m] || 0),
            sub.total
          ]);
        });
        if (row.majorCode === 'COGS') {
          matrixBody.push([
            '매출총이익',
            '-',
            ...report.months.map(m => report.monthlyTotals[m]?.grossProfit || 0),
            report.summary.grossProfit
          ]);
        }
        if (row.majorCode === 'OPEX') {
          matrixBody.push([
            '영업이익',
            '-',
            ...report.months.map(m => report.monthlyTotals[m]?.operatingProfit || 0),
            report.summary.operatingProfit
          ]);
        }
        if (row.majorCode === 'TAX_DUES') {
          matrixBody.push([
            '당기순이익',
            '-',
            ...report.months.map(m => report.monthlyTotals[m]?.netIncome || 0),
            report.summary.netIncome
          ]);
        }
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrixBody), '월별계정집계표');

      // 시트 3: 월별 유형자산 감가상각 명세표
      const depHeader = [
        '귀속연월',
        '가동자산수',
        '기초순장부가액',
        '당월신규취득',
        '당월감가상각비',
        '당월처분손실',
        '기말취득원가',
        '기말감가상각누계액',
        '기말순장부가액',
        '당월임대매출',
        '당월임대순이익'
      ];
      const depRows: any[][] = [
        depHeader,
        ...report.depreciationSchedule.monthlyRollForward.map(r => [
          r.yearMonth,
          r.activeAssetCount,
          r.beginningBookValue,
          r.additionCost,
          r.depreciationExpense,
          r.disposalLoss,
          r.endingGrossCost,
          r.endingAccumDepreciation,
          r.endingBookValue,
          r.monthlyRentalRevenue,
          r.monthlyRentalNetProfit
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(depRows), '유형자산감가상각명세');

      // 시트 4: 계정별 상세 전표 내역
      const voucherHeader = [
        '일자',
        '귀속연월',
        '사업부문',
        '계정대분류',
        '세부계정과목',
        '거래처',
        '적요',
        '공급가액',
        '부가세',
        '합계금액',
        '반영금액',
        '상태',
        '증빙번호'
      ];
      const voucherRows: any[][] = [
        voucherHeader,
        ...filteredDetails.map(d => [
          d.date,
          d.month,
          d.scope === 'TRADE' ? '유통' : d.scope === 'RENTAL' ? '렌탈' : '공통',
          d.majorLabel,
          d.subAccount,
          d.counterparty,
          d.description,
          d.supplyAmount,
          d.vatAmount,
          d.totalAmount,
          d.effectiveAmount,
          d.paidStatusLabel,
          d.docRefNo
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(voucherRows), '계정별상세전표');

      XLSX.writeFile(wb, `재무제표_손익계산서_${report.startYm}_${report.endYm}.xlsx`);
      showToast('재무제표 · 손익계산서 엑셀 내보내기가 완료되었습니다.');
    } catch (err: any) {
      app.showErrorModal(`엑셀 내보내기 실패: ${err?.message || String(err)}`);
    }
  };

  // 중소기업회계기준 조문 필터링
  const chapterOptions = useMemo(() => {
    const map = new Map<string, string>();
    STANDARD_ARTICLES.forEach(a => {
      if (!map.has(a.chapterNo)) {
        map.set(a.chapterNo, `${a.chapterNo} ${a.chapterTitle}`);
      }
    });
    return Array.from(map.entries());
  }, []);

  const filteredStandardArticles = useMemo(() => {
    if (complianceChapterFilter === 'ALL') return STANDARD_ARTICLES;
    return STANDARD_ARTICLES.filter(a => a.chapterNo === complianceChapterFilter);
  }, [complianceChapterFilter]);

  const cellBaseStyle: React.CSSProperties = {
    padding: '6px 9px',
    borderBottom: '1px solid var(--table-row-border)',
    whiteSpace: 'nowrap',
    fontSize: '12px',
    color: 'var(--text-main)'
  };

  const thBaseStyle: React.CSSProperties = {
    padding: '7px 9px',
    borderBottom: '1px solid var(--table-border-color)',
    backgroundColor: 'var(--bg-header)',
    whiteSpace: 'nowrap',
    fontSize: '11.5px',
    fontWeight: 800,
    color: 'var(--text-main)'
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        minHeight: 0,
        paddingBottom: '12px'
      }}
    >
      {/* 토스트 메시지 */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            right: '20px',
            zIndex: 9999,
            padding: '9px 14px',
            borderRadius: '6px',
            border: `1px solid ${toastMsg.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
            backgroundColor: 'var(--bg-card)',
            color: toastMsg.type === 'error' ? 'var(--danger)' : 'var(--success)',
            fontSize: '12.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap'
          }}
        >
          <Check size={14} style={{ flexShrink: 0 }} />
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* ── ① 상단 조회범위(연월~연월) 및 액션 파이프라인 바 (Gutenberg Z-Pattern 좌상단 → 우상단) ── */}
      <div
        className="card no-print"
        style={{
          padding: '8px 12px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-card)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '10px'
        }}
      >
        {/* 좌상단: 조회 조건 (세로 스택 레이블 표준 준수: flex-direction: column, gap: 4px) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '4px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              보고서 명칭
            </span>
            <div
              style={{
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14.5px',
                fontWeight: 800,
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <Scale size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span>재무제표 · 손익계산서</span>
            </div>
          </div>

          {/* 조회 시작연월 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              htmlFor="fin-start-ym"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              조회 시작연월
            </label>
            <input
              id="fin-start-ym"
              type="month"
              value={startYm}
              onChange={e => handleStartYmChange(e.target.value)}
              style={{
                height: '30px',
                padding: '0 8px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            />
          </div>

          <span
            style={{
              height: '30px',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '13px',
              fontWeight: 800,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap'
            }}
          >
            ~
          </span>

          {/* 조회 종료연월 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              htmlFor="fin-end-ym"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              조회 종료연월
            </label>
            <input
              id="fin-end-ym"
              type="month"
              value={endYm}
              onChange={e => handleEndYmChange(e.target.value)}
              style={{
                height: '30px',
                padding: '0 8px',
                fontSize: '12.5px',
                fontWeight: 700,
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            />
          </div>

          {/* 기간 빠른선택 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              기간 구간 선택
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'nowrap' }}>
              {[
                { id: 'YTD_2026', label: '2026 누적' },
                { id: 'RECENT_6M', label: '6개월' },
                { id: 'RECENT_12M', label: '12개월' },
                { id: 'H1', label: '상반기' },
                { id: 'H2', label: '하반기' },
                { id: 'Q1', label: '1분기' },
                { id: 'Q2', label: '2분기' },
                { id: 'Q3', label: '3분기' },
                { id: 'Q4', label: '4분기' }
              ].map(btn => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => applyPeriodPreset(btn.id)}
                  style={{
                    height: '30px',
                    padding: '0 7px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* 사업부문 구분 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              htmlFor="fin-scope-select"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              사업부문 구분
            </label>
            <select
              id="fin-scope-select"
              value={businessScope}
              onChange={e => setBusinessScope(e.target.value as BusinessScopeFilter)}
              style={{
                height: '30px',
                padding: '0 8px',
                fontSize: '12px',
                fontWeight: 700,
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <option value="ALL">통합 합산</option>
              <option value="TRADE">유통 부문</option>
              <option value="RENTAL">렌탈 부문</option>
            </select>
          </div>

          {/* 금액 집계기준 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label
              htmlFor="fin-basis-select"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              금액 집계기준
            </label>
            <select
              id="fin-basis-select"
              value={amountBasis}
              onChange={e => setAmountBasis(e.target.value as AmountBasis)}
              style={{
                height: '30px',
                padding: '0 8px',
                fontSize: '12px',
                fontWeight: 700,
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-main)',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              <option value="SUPPLY">공급가액 기준</option>
              <option value="TOTAL">부가세 포함 총액</option>
            </select>
          </div>
        </div>

        {/* 우상단: 데이터 유입 및 출력 버튼군 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowComplianceModal(true)}
            style={{
              height: '30px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1px solid var(--primary)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--primary)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <ShieldCheck size={14} style={{ flexShrink: 0 }} />
            <span>회계기준 검증</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTaxUploadModal(true)}
            style={{
              height: '30px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Upload size={14} style={{ flexShrink: 0 }} />
            <span>납부세액 등록</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              height: '30px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Printer size={14} style={{ flexShrink: 0 }} />
            <span>보고서 인쇄</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              height: '30px',
              padding: '0 12px',
              borderRadius: '6px',
              border: '1px solid var(--primary)',
              backgroundColor: 'var(--primary)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <FileSpreadsheet size={14} style={{ flexShrink: 0 }} />
            <span>엑셀 내보내기</span>
          </button>
        </div>
      </div>

      {/* ── ② 고밀도 1줄 요약 스트립 + 섹션 보기 탭 ── */}
      <div
        style={{
          padding: '6px 12px',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          fontSize: '12px'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
            조회구간: {report.startYm} ~ {report.endYm} ({report.months.length}개월)
          </span>
          <span style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
            매출액{' '}
            <strong style={{ color: 'var(--primary)', fontWeight: 800 }}>
              {fmtWon(report.summary.revenue)}
            </strong>
          </span>
          <span style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
            매출원가{' '}
            <strong style={{ color: 'var(--text-main)', fontWeight: 800 }}>
              {fmtWon(report.summary.cogs)}
            </strong>
          </span>
          <span style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
            매출총이익{' '}
            <strong style={{ color: 'var(--success)', fontWeight: 800 }}>
              {fmtWon(report.summary.grossProfit)} ({report.summary.grossMarginPct}%)
            </strong>
          </span>
          <span style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
            영업이익{' '}
            <strong
              style={{
                color: report.summary.operatingProfit >= 0 ? 'var(--success)' : 'var(--danger)',
                fontWeight: 800
              }}
            >
              {fmtWon(report.summary.operatingProfit)} ({report.summary.operatingMarginPct}%)
            </strong>
          </span>
          <span style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
            당기순이익{' '}
            <strong
              style={{
                color: report.summary.netIncome >= 0 ? 'var(--primary)' : 'var(--danger)',
                fontWeight: 800
              }}
            >
              {fmtWon(report.summary.netIncome)} ({report.summary.netMarginPct}%)
            </strong>
          </span>
        </div>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[
            { id: 'ALL', label: '전체 보고서' },
            { id: 'STATEMENTS', label: '4대 재무제표' },
            { id: 'MONTHLY_MATRIX', label: '월별 손익집계표' },
            { id: 'DEPRECIATION', label: '감가상각 명세표' },
            { id: 'VOUCHERS', label: `상세 전표 (${report.details.length})` }
          ].map(tab => {
            const active = activeMainSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveMainSection(tab.id as any)}
                style={{
                  padding: '4px 9px',
                  borderRadius: '5px',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border-color)'}`,
                  backgroundColor: active ? 'var(--primary)' : 'var(--bg-card)',
                  color: active ? '#ffffff' : 'var(--text-main)',
                  fontSize: '11.5px',
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ③ 4대 재무제표 보드 (재무상태표 · 손익계산서 · 현금흐름표 · 재무제표 주석 및 세무 항목) ── */}
      {(activeMainSection === 'ALL' || activeMainSection === 'STATEMENTS') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
            gap: '8px'
          }}
        >
          {/* 1) 재무상태표 */}
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '7px 12px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                ① 재무상태표
              </span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                결산기준일: {report.statements.bs.asOfDate} | 단위: 원
              </span>
            </div>

            <div style={{ padding: '8px 10px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>자산 · 부채 · 자본 과목</th>
                    <th style={{ ...thBaseStyle, textAlign: 'right' }}>금액</th>
                    <th style={{ ...thBaseStyle, textAlign: 'center', width: '48px' }}>기준</th>
                  </tr>
                </thead>
                <tbody>
                  {report.statements.bs.assets.map((row, idx) => (
                    <tr
                      key={`bs-a-${idx}`}
                      onDoubleClick={() => openStandardGuide(row.standardKey || row.label)}
                      style={{
                        backgroundColor: row.isSub ? 'var(--bg-secondary)' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <td
                        style={{
                          ...cellBaseStyle,
                          fontWeight: row.isSub || row.highlight ? 800 : 500
                        }}
                      >
                        {row.label}
                      </td>
                      <td
                        style={{
                          ...cellBaseStyle,
                          textAlign: 'right',
                          fontWeight: row.isSub || row.highlight ? 800 : 600,
                          color: row.amount < 0 ? 'var(--danger)' : 'var(--text-main)'
                        }}
                      >
                        {fmtWon(row.amount)}
                      </td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openStandardGuide(row.standardKey || row.label)}
                          style={{
                            padding: '1px 6px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-card)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          조문
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800, color: 'var(--primary)' }}>
                      자산총계
                    </td>
                    <td
                      style={{
                        ...cellBaseStyle,
                        textAlign: 'right',
                        fontWeight: 800,
                        color: 'var(--primary)'
                      }}
                    >
                      {fmtWon(report.statements.bs.totalAssets)}
                    </td>
                    <td style={{ ...cellBaseStyle, textAlign: 'center' }}>-</td>
                  </tr>

                  {report.statements.bs.liabilities.map((row, idx) => (
                    <tr
                      key={`bs-l-${idx}`}
                      onDoubleClick={() => openStandardGuide(row.standardKey || row.label)}
                      style={{
                        backgroundColor: row.isSub ? 'var(--bg-secondary)' : 'transparent',
                        cursor: 'pointer'
                      }}
                    >
                      <td style={{ ...cellBaseStyle, fontWeight: row.isSub ? 800 : 500 }}>
                        {row.label}
                      </td>
                      <td
                        style={{
                          ...cellBaseStyle,
                          textAlign: 'right',
                          fontWeight: row.isSub ? 800 : 600
                        }}
                      >
                        {fmtWon(row.amount)}
                      </td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openStandardGuide(row.standardKey || row.label)}
                          style={{
                            padding: '1px 6px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-card)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          조문
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...cellBaseStyle, fontWeight: 800 }}>부채총계</td>
                    <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmtWon(report.statements.bs.totalLiabilities)}
                    </td>
                    <td style={{ ...cellBaseStyle, textAlign: 'center' }}>-</td>
                  </tr>

                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800 }}>Ⅱ. 자본</td>
                    <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmtWon(report.statements.bs.totalEquity)}
                    </td>
                    <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => openStandardGuide('BS_EQUITY')}
                        style={{
                          padding: '1px 6px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-card)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        조문
                      </button>
                    </td>
                  </tr>
                  {report.statements.bs.equity.map((row, idx) => (
                    <tr
                      key={`bs-e-${idx}`}
                      onDoubleClick={() => openStandardGuide(row.standardKey || row.label)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ ...cellBaseStyle, fontWeight: row.highlight ? 800 : 500 }}>
                        {row.label}
                      </td>
                      <td
                        style={{
                          ...cellBaseStyle,
                          textAlign: 'right',
                          fontWeight: row.highlight ? 800 : 600,
                          color: row.highlight ? 'var(--primary)' : 'var(--text-main)'
                        }}
                      >
                        {fmtWon(row.amount)}
                      </td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => openStandardGuide(row.standardKey || row.label)}
                          style={{
                            padding: '1px 6px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-card)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          조문
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800, color: 'var(--primary)' }}>
                      부채와자본총계
                    </td>
                    <td
                      style={{
                        ...cellBaseStyle,
                        textAlign: 'right',
                        fontWeight: 800,
                        color: 'var(--primary)'
                      }}
                    >
                      {fmtWon(
                        report.statements.bs.totalLiabilities + report.statements.bs.totalEquity
                      )}
                    </td>
                    <td
                      style={{
                        ...cellBaseStyle,
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 800,
                        color:
                          report.statements.bs.balanceDiff === 0
                            ? 'var(--success)'
                            : 'var(--danger)'
                      }}
                    >
                      {report.statements.bs.balanceDiff === 0 ? '일치' : '차액'}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap'
                }}
              >
                이 대차대조표는 중소기업회계기준 제6조 및 별지 제1호 서식에 따라 작성되었습니다.
              </div>
            </div>
          </div>

          {/* 2) 손익계산서 */}
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '7px 12px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                ② 손익계산서
              </span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                대상기간: {report.statements.pl.periodLabel} | 단위: 원
              </span>
            </div>

            <div style={{ padding: '8px 10px', overflowX: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>손익 과목</th>
                    <th style={{ ...thBaseStyle, textAlign: 'right' }}>기간 누적액</th>
                    <th style={{ ...thBaseStyle, textAlign: 'right' }}>구성비</th>
                    <th style={{ ...thBaseStyle, textAlign: 'center', width: '48px' }}>기준</th>
                  </tr>
                </thead>
                <tbody>
                  {report.statements.pl.items.map((row, idx) => {
                    const ratio =
                      report.summary.revenue > 0
                        ? ((row.amount / report.summary.revenue) * 100).toFixed(1)
                        : '0.0';
                    return (
                      <tr
                        key={`pl-${idx}`}
                        onDoubleClick={() => openStandardGuide(row.standardKey || row.label)}
                        style={{
                          backgroundColor: row.highlight
                            ? 'var(--bg-header)'
                            : row.isTotal || row.isSub
                            ? 'var(--bg-secondary)'
                            : 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        <td
                          style={{
                            ...cellBaseStyle,
                            fontWeight: row.isTotal || row.isSub || row.highlight ? 800 : 500,
                            color: row.highlight ? 'var(--primary)' : 'var(--text-main)'
                          }}
                        >
                          {row.label}
                        </td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            fontWeight: row.isTotal || row.isSub || row.highlight ? 800 : 600,
                            color:
                              row.amount < 0
                                ? 'var(--danger)'
                                : row.highlight
                                ? 'var(--primary)'
                                : row.isTotal
                                ? 'var(--success)'
                                : 'var(--text-main)'
                          }}
                        >
                          {fmtWon(row.amount)}
                        </td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            fontSize: '11.5px',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {ratio}%
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => openStandardGuide(row.standardKey || row.label)}
                            style={{
                              padding: '1px 6px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              backgroundColor: 'var(--bg-card)',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            조문
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap'
                }}
              >
                이 손익계산서는 중소기업회계기준 제23조 및 별지 제2호 서식에 따라 작성되었습니다.
              </div>
            </div>
          </div>

          {/* 3) 현금흐름표 */}
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '7px 12px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                ③ 현금흐름표
              </span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                대상기간: {report.statements.cf.periodLabel}
              </span>
            </div>

            <div style={{ padding: '8px 10px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>현금흐름 활동 구분</th>
                    <th style={{ ...thBaseStyle, textAlign: 'right' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800 }}>
                      기초 현금및현금성자산 ({report.startYm}-01)
                    </td>
                    <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmtWon(report.statements.cf.beginningCash)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800 }}>Ⅰ. 영업활동 현금흐름</td>
                    <td
                      style={{
                        ...cellBaseStyle,
                        textAlign: 'right',
                        fontWeight: 800,
                        color:
                          report.statements.cf.operatingCashFlow >= 0
                            ? 'var(--success)'
                            : 'var(--danger)'
                      }}
                    >
                      {fmtWon(report.statements.cf.operatingCashFlow)}
                    </td>
                  </tr>
                  {report.statements.cf.operatingItems.map((it, i) => (
                    <tr key={`cf-op-${i}`}>
                      <td style={cellBaseStyle}>{it.label}</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'right' }}>{fmtWon(it.amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800 }}>Ⅱ. 투자활동 현금흐름</td>
                    <td
                      style={{
                        ...cellBaseStyle,
                        textAlign: 'right',
                        fontWeight: 800,
                        color:
                          report.statements.cf.investingCashFlow >= 0
                            ? 'var(--text-main)'
                            : 'var(--danger)'
                      }}
                    >
                      {fmtWon(report.statements.cf.investingCashFlow)}
                    </td>
                  </tr>
                  {report.statements.cf.investingItems.map((it, i) => (
                    <tr key={`cf-inv-${i}`}>
                      <td style={cellBaseStyle}>{it.label}</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'right' }}>{fmtWon(it.amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800 }}>Ⅲ. 재무활동 현금흐름</td>
                    <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmtWon(report.statements.cf.financingCashFlow)}
                    </td>
                  </tr>
                  {report.statements.cf.financingItems.map((it, i) => (
                    <tr key={`cf-fin-${i}`}>
                      <td style={cellBaseStyle}>{it.label}</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'right' }}>{fmtWon(it.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...cellBaseStyle, fontWeight: 700 }}>
                      조회기간 순현금 증감 (Ⅰ + Ⅱ + Ⅲ)
                    </td>
                    <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 800 }}>
                      {fmtWon(report.statements.cf.netCashChange)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800, color: 'var(--primary)' }}>
                      기말 현금및현금성자산 ({report.statements.bs.asOfDate})
                    </td>
                    <td
                      style={{
                        ...cellBaseStyle,
                        textAlign: 'right',
                        fontWeight: 800,
                        color: 'var(--primary)'
                      }}
                    >
                      {fmtWon(report.statements.cf.endingCash)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                style={{
                  marginTop: '6px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap'
                }}
              >
                기말 현금및현금성자산은 ① 재무상태표 당좌자산 현금 잔액과 1원 오차 없이 일치합니다.
              </div>
            </div>
          </div>

          {/* 4) 재무제표 주석 및 세무 항목 */}
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '7px 12px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                ④ 재무제표 주석 및 세무 항목
              </span>
              <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {!isEditingRemark ? (
                  <button
                    type="button"
                    onClick={startEditRemark}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    주석·세액 편집
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveRemark}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: '1px solid var(--primary)',
                        backgroundColor: 'var(--primary)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Save size={12} />
                      <span>주석 저장</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingRemark(false)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '5px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-card)',
                        color: 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      취소
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>세무 항목</th>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>회계 반영 기준</th>
                    <th style={{ ...thBaseStyle, textAlign: 'right' }}>귀속 세액</th>
                  </tr>
                </thead>
                <tbody>
                  {report.statements.remark.taxItems.map(item => {
                    const draftValue =
                      item.key === 'WITHHOLDING_TAX'
                        ? draftWithholding
                        : item.key === 'VAT'
                        ? draftVat
                        : item.key === 'CORPORATE_TAX'
                        ? draftCorpTax
                        : draftTaxPayment;
                    const setDraft =
                      item.key === 'WITHHOLDING_TAX'
                        ? setDraftWithholding
                        : item.key === 'VAT'
                        ? setDraftVat
                        : item.key === 'CORPORATE_TAX'
                        ? setDraftCorpTax
                        : setDraftTaxPayment;

                    return (
                      <tr
                        key={item.key}
                        onDoubleClick={() => openStandardGuide(item.label, 'TAX_DUES')}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ ...cellBaseStyle, fontWeight: 700 }}>{item.label}</td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            fontSize: '11px',
                            color: 'var(--text-secondary)'
                          }}
                        >
                          {item.description}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 700 }}>
                          {isEditingRemark ? (
                            <input
                              type="number"
                              value={draftValue}
                              onChange={e => setDraft(e.target.value)}
                              style={{
                                width: '110px',
                                padding: '3px 6px',
                                textAlign: 'right',
                                fontSize: '12px',
                                fontWeight: 700,
                                border: '1px solid var(--primary)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--text-main)'
                              }}
                            />
                          ) : (
                            fmtWon(item.amount)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <td style={{ ...cellBaseStyle, fontWeight: 800 }}>
                      손익차감 반영 세액 합계
                    </td>
                    <td style={{ ...cellBaseStyle, fontSize: '11px', color: 'var(--text-secondary)' }}>
                      전체 납부세액 {fmtWon(report.statements.remark.totalTaxAmount)} 중 손익계산서 비용 귀속분
                    </td>
                    <td
                      style={{
                        ...cellBaseStyle,
                        textAlign: 'right',
                        fontWeight: 800,
                        color: 'var(--primary)'
                      }}
                    >
                      {fmtWon(report.statements.remark.deductibleTaxAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)'
                  }}
                >
                  <span>필수적 주석 기재사항 (중소기업회계기준 제55조)</span>
                  <span>
                    최종갱신: {report.statements.remark.updatedBy} · {report.statements.remark.updatedAt}
                  </span>
                </div>
                {isEditingRemark ? (
                  <textarea
                    rows={5}
                    value={draftRemarkText}
                    onChange={e => setDraftRemarkText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '11.5px',
                      lineHeight: 1.5,
                      border: '1px solid var(--primary)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)',
                      resize: 'vertical'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: '8px 10px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-secondary)',
                      fontSize: '11.5px',
                      lineHeight: 1.55,
                      color: 'var(--text-main)',
                      whiteSpace: 'pre-line'
                    }}
                  >
                    {report.statements.remark.remarkText}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ④ 월별 계정과목 손익·수지 집계표 (연월~연월 동적 컬럼 + 세부계정 드릴다운) ── */}
      {(activeMainSection === 'ALL' || activeMainSection === 'MONTHLY_MATRIX') && (
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-card)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '7px 12px',
              backgroundColor: 'var(--bg-header)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                월별 계정과목 손익·수지 집계표 ({report.startYm} ~ {report.endYm})
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                금액 셀 클릭 시 하단 전표 필터 연동
              </span>
            </div>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <button
                type="button"
                onClick={() =>
                  setExpandedMajors({
                    REVENUE: true,
                    COGS: true,
                    PAYROLL: true,
                    OPEX: true,
                    TAX_DUES: true,
                    NON_OP: true
                  })
                }
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '5px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                전체 펼치기
              </button>
              <button
                type="button"
                onClick={() =>
                  setExpandedMajors({
                    REVENUE: false,
                    COGS: false,
                    PAYROLL: false,
                    OPEX: false,
                    TAX_DUES: false,
                    NON_OP: false
                  })
                }
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '5px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                전체 접기
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th
                    style={{
                      ...thBaseStyle,
                      textAlign: 'left',
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      minWidth: '220px'
                    }}
                  >
                    계정과목 분류
                  </th>
                  <th style={{ ...thBaseStyle, textAlign: 'center', width: '54px' }}>회계기준</th>
                  <th style={{ ...thBaseStyle, textAlign: 'right', width: '64px' }}>전표수</th>
                  {report.months.map(m => (
                    <th key={m} style={{ ...thBaseStyle, textAlign: 'right', minWidth: '102px' }}>
                      {m}월
                    </th>
                  ))}
                  <th
                    style={{
                      ...thBaseStyle,
                      textAlign: 'right',
                      minWidth: '122px',
                      color: 'var(--primary)'
                    }}
                  >
                    기간합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.accountRows.map(row => {
                  const isOpen = Boolean(expandedMajors[row.majorCode]);
                  return (
                    <React.Fragment key={row.majorCode}>
                      {/* 대분류 행 */}
                      <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <td
                          onClick={() =>
                            setExpandedMajors(prev => ({
                              ...prev,
                              [row.majorCode]: !prev[row.majorCode]
                            }))
                          }
                          style={{
                            ...cellBaseStyle,
                            fontWeight: 800,
                            cursor: 'pointer',
                            position: 'sticky',
                            left: 0,
                            zIndex: 1,
                            backgroundColor: 'var(--bg-secondary)'
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>{row.majorLabel}</span>
                          </span>
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => openStandardGuide(row.majorCode)}
                            style={{
                              padding: '1px 6px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              backgroundColor: 'var(--bg-card)',
                              color: 'var(--primary)',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            기준
                          </button>
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 700 }}>
                          {row.count}건
                        </td>
                        {report.months.map(m => (
                          <td
                            key={`${row.majorCode}-${m}`}
                            onClick={() => handleDrillDown(row.majorCode, m, 'ALL')}
                            style={{
                              ...cellBaseStyle,
                              textAlign: 'right',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {fmtNum(row.monthly[m])}
                          </td>
                        ))}
                        <td
                          onClick={() => handleDrillDown(row.majorCode, 'ALL', 'ALL')}
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            fontWeight: 800,
                            color: 'var(--primary)',
                            cursor: 'pointer'
                          }}
                        >
                          {fmtWon(row.total)}
                        </td>
                      </tr>

                      {/* 세부계정 행 */}
                      {isOpen &&
                        row.subAccounts.map(sub => (
                          <tr key={`${row.majorCode}-${sub.subAccount}`}>
                            <td
                              onClick={() => handleDrillDown(row.majorCode, 'ALL', sub.subAccount)}
                              style={{
                                ...cellBaseStyle,
                                paddingLeft: '24px',
                                cursor: 'pointer',
                                position: 'sticky',
                                left: 0,
                                zIndex: 1,
                                backgroundColor: 'var(--bg-card)'
                              }}
                            >
                              · {sub.subAccount}
                            </td>
                            <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => openStandardGuide(sub.subAccount, row.majorCode)}
                                style={{
                                  padding: '1px 5px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--bg-card)',
                                  color: 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                조문
                              </button>
                            </td>
                            <td
                              style={{
                                ...cellBaseStyle,
                                textAlign: 'right',
                                color: 'var(--text-secondary)'
                              }}
                            >
                              {sub.count}건
                            </td>
                            {report.months.map(m => (
                              <td
                                key={`${row.majorCode}-${sub.subAccount}-${m}`}
                                onClick={() => handleDrillDown(row.majorCode, m, sub.subAccount)}
                                style={{
                                  ...cellBaseStyle,
                                  textAlign: 'right',
                                  cursor: 'pointer',
                                  color:
                                    (sub.monthly[m] || 0) < 0
                                      ? 'var(--danger)'
                                      : 'var(--text-main)'
                                }}
                              >
                                {fmtNum(sub.monthly[m])}
                              </td>
                            ))}
                            <td
                              onClick={() => handleDrillDown(row.majorCode, 'ALL', sub.subAccount)}
                              style={{
                                ...cellBaseStyle,
                                textAlign: 'right',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              {fmtWon(sub.total)}
                            </td>
                          </tr>
                        ))}

                      {/* 단계별 손익 요약행: 매출총이익 */}
                      {row.majorCode === 'COGS' && (
                        <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                          <td
                            style={{
                              ...cellBaseStyle,
                              fontWeight: 800,
                              color: 'var(--success)',
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              backgroundColor: 'var(--bg-header)'
                            }}
                          >
                            매출총이익 (Ⅰ - Ⅱ)
                          </td>
                          <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => openStandardGuide('SUMMARY_GROSS_PROFIT')}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--success)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              기준
                            </button>
                          </td>
                          <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 700 }}>
                            {report.summary.grossMarginPct}%
                          </td>
                          {report.months.map(m => {
                            const gp = report.monthlyTotals[m]?.grossProfit || 0;
                            return (
                              <td
                                key={`gp-${m}`}
                                style={{
                                  ...cellBaseStyle,
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  color: gp >= 0 ? 'var(--success)' : 'var(--danger)'
                                }}
                              >
                                {fmtNum(gp)}
                              </td>
                            );
                          })}
                          <td
                            style={{
                              ...cellBaseStyle,
                              textAlign: 'right',
                              fontWeight: 800,
                              color:
                                report.summary.grossProfit >= 0
                                  ? 'var(--success)'
                                  : 'var(--danger)'
                            }}
                          >
                            {fmtWon(report.summary.grossProfit)}
                          </td>
                        </tr>
                      )}

                      {/* 단계별 손익 요약행: 영업이익 */}
                      {row.majorCode === 'OPEX' && (
                        <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                          <td
                            style={{
                              ...cellBaseStyle,
                              fontWeight: 800,
                              color: 'var(--primary)',
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              backgroundColor: 'var(--bg-header)'
                            }}
                          >
                            영업이익 (매출총이익 - Ⅲ - Ⅳ)
                          </td>
                          <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => openStandardGuide('SUMMARY_OPERATING_PROFIT')}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              기준
                            </button>
                          </td>
                          <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 700 }}>
                            {report.summary.operatingMarginPct}%
                          </td>
                          {report.months.map(m => {
                            const op = report.monthlyTotals[m]?.operatingProfit || 0;
                            return (
                              <td
                                key={`op-${m}`}
                                style={{
                                  ...cellBaseStyle,
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  color: op >= 0 ? 'var(--primary)' : 'var(--danger)'
                                }}
                              >
                                {fmtNum(op)}
                              </td>
                            );
                          })}
                          <td
                            style={{
                              ...cellBaseStyle,
                              textAlign: 'right',
                              fontWeight: 800,
                              color:
                                report.summary.operatingProfit >= 0
                                  ? 'var(--primary)'
                                  : 'var(--danger)'
                            }}
                          >
                            {fmtWon(report.summary.operatingProfit)}
                          </td>
                        </tr>
                      )}

                      {/* 단계별 손익 요약행: 당기순이익 */}
                      {row.majorCode === 'TAX_DUES' && (
                        <tr style={{ backgroundColor: 'var(--bg-header)' }}>
                          <td
                            style={{
                              ...cellBaseStyle,
                              fontWeight: 800,
                              color: 'var(--primary)',
                              position: 'sticky',
                              left: 0,
                              zIndex: 1,
                              backgroundColor: 'var(--bg-header)'
                            }}
                          >
                            조회기간 당기순이익
                          </td>
                          <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => openStandardGuide('SUMMARY_NET_INCOME')}
                              style={{
                                padding: '1px 6px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-card)',
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              기준
                            </button>
                          </td>
                          <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 700 }}>
                            {report.summary.netMarginPct}%
                          </td>
                          {report.months.map(m => {
                            const ni = report.monthlyTotals[m]?.netIncome || 0;
                            return (
                              <td
                                key={`ni-${m}`}
                                style={{
                                  ...cellBaseStyle,
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  color: ni >= 0 ? 'var(--primary)' : 'var(--danger)'
                                }}
                              >
                                {fmtNum(ni)}
                              </td>
                            );
                          })}
                          <td
                            style={{
                              ...cellBaseStyle,
                              textAlign: 'right',
                              fontWeight: 800,
                              color:
                                report.summary.netIncome >= 0 ? 'var(--primary)' : 'var(--danger)'
                            }}
                          >
                            {fmtWon(report.summary.netIncome)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ⑤ 월별 유형자산 가치 변동 및 감가상각 명세표 ── */}
      {(activeMainSection === 'ALL' || activeMainSection === 'DEPRECIATION') &&
        businessScope !== 'TRADE' && (
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-card)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '7px 12px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                  월별 유형자산 가치 변동 및 감가상각 명세표
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  보유자산 {report.depreciationSchedule.assetCount}대 | 취득원가 합계{' '}
                  {fmtWon(report.depreciationSchedule.totalAcquisitionCost)} | 기말 순장부가액{' '}
                  {fmtWon(report.depreciationSchedule.endingBookValue)}
                </span>
              </div>

              <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setDeprecTabMode('MONTHLY')}
                  style={{
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '5px',
                    border: `1px solid ${
                      deprecTabMode === 'MONTHLY' ? 'var(--primary)' : 'var(--border-color)'
                    }`,
                    backgroundColor:
                      deprecTabMode === 'MONTHLY' ? 'var(--primary)' : 'var(--bg-card)',
                    color: deprecTabMode === 'MONTHLY' ? '#ffffff' : 'var(--text-main)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  연월별 장부가액 변동
                </button>
                <button
                  type="button"
                  onClick={() => setDeprecTabMode('ASSET_MODEL')}
                  style={{
                    padding: '3px 9px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '5px',
                    border: `1px solid ${
                      deprecTabMode === 'ASSET_MODEL' ? 'var(--primary)' : 'var(--border-color)'
                    }`,
                    backgroundColor:
                      deprecTabMode === 'ASSET_MODEL' ? 'var(--primary)' : 'var(--bg-card)',
                    color: deprecTabMode === 'ASSET_MODEL' ? '#ffffff' : 'var(--text-main)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  개별 자산별 명세 ({report.depreciationSchedule.assetSummaries.length}대)
                </button>
                <button
                  type="button"
                  onClick={() => openStandardGuide('DEPREC_SCHEDULE')}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '5px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--primary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  회계기준
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {deprecTabMode === 'MONTHLY' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thBaseStyle, textAlign: 'left' }}>귀속연월</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>운용대수</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>기초 순장부가액</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>당월 신규취득</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>당월 감가상각비</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>당월 처분손실</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>기말 취득원가</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>기말 감가상각누계액</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right', color: 'var(--primary)' }}>
                        기말 순장부가액
                      </th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>당월 임대매출</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>임대 순기여이익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.depreciationSchedule.monthlyRollForward.map(r => (
                      <tr key={r.yearMonth}>
                        <td style={{ ...cellBaseStyle, fontWeight: 700 }}>{r.yearMonth}</td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {r.activeAssetCount}대
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(r.beginningBookValue)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {r.additionCost > 0 ? fmtWon(r.additionCost) : '-'}
                        </td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            color: 'var(--danger)',
                            fontWeight: 600
                          }}
                        >
                          {fmtWon(r.depreciationExpense)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {r.disposalLoss > 0 ? fmtWon(r.disposalLoss) : '-'}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(r.endingGrossCost)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(r.endingAccumDepreciation)}
                        </td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            fontWeight: 800,
                            color: 'var(--primary)'
                          }}
                        >
                          {fmtWon(r.endingBookValue)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(r.monthlyRentalRevenue)}
                        </td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            fontWeight: 700,
                            color:
                              r.monthlyRentalNetProfit >= 0
                                ? 'var(--success)'
                                : 'var(--danger)'
                          }}
                        >
                          {fmtWon(r.monthlyRentalNetProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thBaseStyle, textAlign: 'left' }}>자산관리번호</th>
                      <th style={{ ...thBaseStyle, textAlign: 'left' }}>제조사 · 모델명</th>
                      <th style={{ ...thBaseStyle, textAlign: 'center' }}>취득일자</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>취득원가</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>내용연수</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>월 상각액</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>기초 장부가액</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>조회기간 상각액</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right' }}>기말 상각누계액</th>
                      <th style={{ ...thBaseStyle, textAlign: 'right', color: 'var(--primary)' }}>
                        기말 장부가액
                      </th>
                      <th style={{ ...thBaseStyle, textAlign: 'center' }}>운용상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.depreciationSchedule.assetSummaries.map(a => (
                      <tr key={a.assetId}>
                        <td style={{ ...cellBaseStyle, fontWeight: 700 }}>{a.assetNo}</td>
                        <td style={cellBaseStyle}>
                          {a.manufacturer} · {a.modelName}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                          {a.acquisitionDate}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(a.acquisitionPrice)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {a.usefulLifeMonths}개월
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(a.monthlyDeprecBase)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(a.periodBeginningBookValue)}
                        </td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            color: 'var(--danger)',
                            fontWeight: 600
                          }}
                        >
                          {fmtWon(a.periodDepreciation)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                          {fmtWon(a.periodEndingAccumDeprec)}
                        </td>
                        <td
                          style={{
                            ...cellBaseStyle,
                            textAlign: 'right',
                            fontWeight: 800,
                            color: 'var(--primary)'
                          }}
                        >
                          {fmtWon(a.periodEndingBookValue)}
                        </td>
                        <td style={{ ...cellBaseStyle, textAlign: 'center', fontWeight: 700 }}>
                          {a.statusLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      {/* ── ⑥ 하단 계정별 상세 전표 내역 ── */}
      {(activeMainSection === 'ALL' || activeMainSection === 'VOUCHERS') && (
        <div
          ref={voucherSectionRef}
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-card)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-header)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  전표 원장 조회
                </span>
                <span
                  style={{
                    height: '28px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: '13px',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  계정별 상세 전표 내역 ({filteredDetails.length}건)
                </span>
              </div>

              {/* 대분류 필터 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="vch-major-filter"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  계정 대분류
                </label>
                <select
                  id="vch-major-filter"
                  value={detailMajorFilter}
                  onChange={e => {
                    setDetailMajorFilter(e.target.value);
                    setDetailSubAccountFilter('ALL');
                  }}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <option value="ALL">전체 대분류</option>
                  {(Object.keys(MAJOR_META) as MajorAccountCode[]).map(k => (
                    <option key={k} value={k}>
                      {MAJOR_META[k].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 귀속연월 필터 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="vch-month-filter"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  귀속연월
                </label>
                <select
                  id="vch-month-filter"
                  value={detailMonthFilter}
                  onChange={e => setDetailMonthFilter(e.target.value)}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <option value="ALL">전체 연월</option>
                  {report.months.map(m => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
              </div>

              {/* 세부계정 필터 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="vch-sub-filter"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  세부 계정과목
                </label>
                <select
                  id="vch-sub-filter"
                  value={detailSubAccountFilter}
                  onChange={e => setDetailSubAccountFilter(e.target.value)}
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <option value="ALL">전체 세부계정</option>
                  {subAccountOptions.map(sa => (
                    <option key={sa} value={sa}>
                      {sa}
                    </option>
                  ))}
                </select>
              </div>

              {/* 검색어 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="vch-search-input"
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  검색어
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search
                    size={13}
                    style={{
                      position: 'absolute',
                      left: '8px',
                      color: 'var(--text-secondary)',
                      pointerEvents: 'none'
                    }}
                  />
                  <input
                    id="vch-search-input"
                    type="text"
                    value={detailSearchQuery}
                    onChange={e => setDetailSearchQuery(e.target.value)}
                    placeholder="거래처 · 적요 · 증빙번호"
                    style={{
                      height: '28px',
                      padding: '0 8px 0 26px',
                      width: '190px',
                      fontSize: '12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '5px',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-main)'
                    }}
                  />
                </div>
              </div>

              {(detailMajorFilter !== 'ALL' ||
                detailMonthFilter !== 'ALL' ||
                detailSubAccountFilter !== 'ALL' ||
                detailSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setDetailMajorFilter('ALL');
                    setDetailMonthFilter('ALL');
                    setDetailSubAccountFilter('ALL');
                    setDetailSearchQuery('');
                  }}
                  style={{
                    height: '28px',
                    padding: '0 9px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    borderRadius: '5px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <RotateCcw size={12} />
                  <span>필터 초기화</span>
                </button>
              )}
            </div>

            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
              선택 전표 합계: 공급가 {fmtWon(filteredDetailSum.supply)} | 부가세{' '}
              {fmtWon(filteredDetailSum.vat)} | 반영액{' '}
              <strong style={{ color: 'var(--primary)' }}>
                {fmtWon(filteredDetailSum.effective)}
              </strong>
            </div>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  <th style={{ ...thBaseStyle, textAlign: 'center', width: '92px' }}>일자</th>
                  <th style={{ ...thBaseStyle, textAlign: 'center', width: '68px' }}>귀속월</th>
                  <th style={{ ...thBaseStyle, textAlign: 'center', width: '64px' }}>부문</th>
                  <th style={{ ...thBaseStyle, textAlign: 'left' }}>계정대분류</th>
                  <th style={{ ...thBaseStyle, textAlign: 'left' }}>세부계정과목</th>
                  <th style={{ ...thBaseStyle, textAlign: 'left' }}>거래처</th>
                  <th style={{ ...thBaseStyle, textAlign: 'left' }}>적요 및 산출근거</th>
                  <th style={{ ...thBaseStyle, textAlign: 'right' }}>공급가액</th>
                  <th style={{ ...thBaseStyle, textAlign: 'right' }}>부가세</th>
                  <th style={{ ...thBaseStyle, textAlign: 'right', color: 'var(--primary)' }}>
                    반영금액
                  </th>
                  <th style={{ ...thBaseStyle, textAlign: 'center' }}>상태</th>
                  <th style={{ ...thBaseStyle, textAlign: 'left' }}>증빙번호</th>
                </tr>
              </thead>
              <tbody>
                {filteredDetails.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      style={{
                        ...cellBaseStyle,
                        padding: '28px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      지정된 조회 조건에 해당하는 전표 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredDetails.slice(0, 300).map(v => (
                    <tr key={v.id}>
                      <td style={{ ...cellBaseStyle, textAlign: 'center' }}>{v.date}</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center' }}>{v.month}</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center', fontWeight: 700 }}>
                        {v.scope === 'TRADE' ? '유통' : v.scope === 'RENTAL' ? '렌탈' : '공통'}
                      </td>
                      <td style={{ ...cellBaseStyle, fontWeight: 600 }}>{v.majorLabel}</td>
                      <td
                        onClick={() => openStandardGuide(v.subAccount, v.majorCode)}
                        style={{
                          ...cellBaseStyle,
                          fontWeight: 700,
                          color: 'var(--primary)',
                          cursor: 'pointer'
                        }}
                      >
                        {v.subAccount}
                      </td>
                      <td style={{ ...cellBaseStyle, fontWeight: 600 }}>{v.counterparty}</td>
                      <td
                        style={{
                          ...cellBaseStyle,
                          maxWidth: '340px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={v.description}
                      >
                        {v.description}
                      </td>
                      <td style={{ ...cellBaseStyle, textAlign: 'right' }}>
                        {fmtWon(v.supplyAmount)}
                      </td>
                      <td
                        style={{
                          ...cellBaseStyle,
                          textAlign: 'right',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {fmtWon(v.vatAmount)}
                      </td>
                      <td
                        style={{
                          ...cellBaseStyle,
                          textAlign: 'right',
                          fontWeight: 800,
                          color: v.effectiveAmount < 0 ? 'var(--danger)' : 'var(--text-main)'
                        }}
                      >
                        {fmtWon(v.effectiveAmount)}
                      </td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center', fontWeight: 700 }}>
                        {v.paidStatusLabel}
                      </td>
                      <td
                        style={{
                          ...cellBaseStyle,
                          fontSize: '11px',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {v.docRefNo}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ⑦ 최하단 복식부기 대차대조 보존 검증식 바 (Gutenberg Z-Pattern 우하단 종결) ── */}
      <div
        style={{
          padding: '8px 14px',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          backgroundColor: 'var(--bg-header)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          fontSize: '12px'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            손익 보존식: 매출 {fmtWon(report.summary.revenue)} - 원가·판관·세액{' '}
            {fmtWon(
              report.summary.cogs +
                report.summary.payroll +
                report.summary.opex +
                report.summary.deductibleTaxForPl -
                report.summary.nonOperatingNet
            )}{' '}
            = 당기순이익{' '}
            <strong style={{ color: 'var(--primary)' }}>{fmtWon(report.summary.netIncome)}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
            자산총계 {fmtWon(report.statements.bs.totalAssets)} = 부채총계{' '}
            {fmtWon(report.statements.bs.totalLiabilities)} + 자본총계{' '}
            {fmtWon(report.statements.bs.totalEquity)}
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              border: `1px solid ${
                report.statements.bs.balanceDiff === 0 ? 'var(--success)' : 'var(--danger)'
              }`,
              color: report.statements.bs.balanceDiff === 0 ? 'var(--success)' : 'var(--danger)',
              fontWeight: 800,
              whiteSpace: 'nowrap'
            }}
          >
            대차 차액 {fmtWon(report.statements.bs.balanceDiff)}
          </span>
        </div>
      </div>

      {/* ── [모달 1] 중소기업회계기준 계정별 조문 · 해설 상세 모달 ── */}
      {selectedStandardInfo && (
        <div
          onClick={() => setSelectedStandardInfo(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '820px',
              maxHeight: '86vh',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={16} color="var(--primary)" />
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)' }}>
                  {selectedStandardInfo.title}
                </span>
                <span
                  style={{
                    padding: '2px 7px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: '1px solid var(--primary)',
                    color: 'var(--primary)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {selectedStandardInfo.complianceBadge}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStandardInfo(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '14px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '12.5px',
                lineHeight: 1.6
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div>
                  <strong>분류 체계:</strong> {selectedStandardInfo.categoryLabel}
                </div>
                <div>
                  <strong>회계처리 요약:</strong> {selectedStandardInfo.appliedBasisSummary}
                </div>
                <div>
                  <strong>인식 시점:</strong> {selectedStandardInfo.recognitionTiming}
                </div>
                <div>
                  <strong>측정 원칙:</strong> {selectedStandardInfo.measurementPrinciple}
                </div>
                <div>
                  <strong>시스템 산출식:</strong> {selectedStandardInfo.erpFormulaOrLogic}
                </div>
                {selectedStandardInfo.taxLawHarmonization && (
                  <div>
                    <strong>세법 조화 특례:</strong> {selectedStandardInfo.taxLawHarmonization}
                  </div>
                )}
              </div>

              {(() => {
                const { articles, commentaries } =
                  getLinkedArticlesAndCommentaries(selectedStandardInfo);
                return (
                  <>
                    {articles.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary)' }}>
                          관련 중소기업회계기준 조문 ({articles.length}건)
                        </div>
                        {articles.map(art => (
                          <div
                            key={art.id}
                            style={{
                              padding: '10px 12px',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px'
                            }}
                          >
                            <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                              {art.chapterNo} · {art.articleNo} ({art.articleTitle})
                            </div>
                            {art.paragraphs.map((p, idx) => (
                              <div
                                key={idx}
                                style={{
                                  whiteSpace: 'pre-line',
                                  color: 'var(--text-main)',
                                  marginBottom: '4px'
                                }}
                              >
                                {p}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {commentaries.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--success)' }}>
                          법무부 · 한국회계기준원 실무 해설 ({commentaries.length}건)
                        </div>
                        {commentaries.map(com => (
                          <div
                            key={com.id}
                            style={{
                              padding: '10px 12px',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px'
                            }}
                          >
                            <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                              {com.sectionNo} {com.sectionTitle}
                            </div>
                            {com.explanations?.map((ex, i) => (
                              <div key={i} style={{ marginTop: '6px' }}>
                                <div style={{ fontWeight: 700 }}>{ex.heading}</div>
                                <div style={{ whiteSpace: 'pre-line', color: 'var(--text-secondary)' }}>
                                  {ex.body}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── [모달 2] 중소기업회계기준 전 조문 부합 검증 모달 ── */}
      {showComplianceModal && (
        <div
          onClick={() => setShowComplianceModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '900px',
              maxHeight: '86vh',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={16} color="var(--primary)" />
                <span style={{ fontSize: '14px', fontWeight: 800 }}>
                  {ACCOUNTING_STANDARDS_META.standardTitle} ({ACCOUNTING_STANDARDS_META.standardNoticeNo}) 부합 검증
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowComplianceModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '8px 14px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '12px'
              }}
            >
              <span>
                대차대조 등식 검증: 자산총계 {fmtWon(report.statements.bs.totalAssets)} = 부채+자본{' '}
                {fmtWon(
                  report.statements.bs.totalLiabilities + report.statements.bs.totalEquity
                )}{' '}
                (차액 {fmtWon(report.statements.bs.balanceDiff)})
              </span>
              <select
                value={complianceChapterFilter}
                onChange={e => setComplianceChapterFilter(e.target.value)}
                style={{
                  height: '28px',
                  padding: '0 8px',
                  fontSize: '12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '5px',
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-main)'
                }}
              >
                <option value="ALL">전체 장 조회 ({STANDARD_ARTICLES.length}개 조문)</option>
                {chapterOptions.map(([chNo, label]) => (
                  <option key={chNo} value={chNo}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                padding: '12px 14px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {filteredStandardArticles.map(art => (
                <div
                  key={art.id}
                  style={{
                    padding: '9px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    lineHeight: 1.55
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '3px' }}>
                    [{art.chapterNo}] {art.articleNo} · {art.articleTitle}
                  </div>
                  {art.paragraphs.map((p, i) => (
                    <div key={i} style={{ whiteSpace: 'pre-line', color: 'var(--text-main)' }}>
                      {p}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── [모달 3] 국세·지방세 납부세액 등록 및 엑셀 업로드 모달 ── */}
      {showTaxUploadModal && (
        <div
          onClick={() => setShowTaxUploadModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '860px',
              maxHeight: '86vh',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--bg-header)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 800 }}>
                국세 · 지방세 납부내역 관리 및 엑셀 업로드
              </span>
              <button
                type="button"
                onClick={() => setShowTaxUploadModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  세목 구분
                </label>
                <select
                  value={newTaxCategory}
                  onChange={e => setNewTaxCategory(e.target.value as TaxCategoryKey)}
                  style={{
                    height: '28px',
                    padding: '0 6px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)'
                  }}
                >
                  <option value="WITHHOLDING_TAX">원천세</option>
                  <option value="VAT">부가세</option>
                  <option value="CORPORATE_TAX">법인세</option>
                  <option value="TAX_PAYMENT">납부항목(세금과공과)</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  귀속연월
                </label>
                <input
                  type="month"
                  value={newTaxAttrYm}
                  onChange={e => setNewTaxAttrYm(e.target.value)}
                  style={{
                    height: '28px',
                    padding: '0 6px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  납부일자
                </label>
                <input
                  type="date"
                  value={newTaxPayDate}
                  onChange={e => setNewTaxPayDate(e.target.value)}
                  style={{
                    height: '28px',
                    padding: '0 6px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  관할기관
                </label>
                <input
                  type="text"
                  value={newTaxOffice}
                  onChange={e => setNewTaxOffice(e.target.value)}
                  style={{
                    height: '28px',
                    width: '100px',
                    padding: '0 6px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  세부 납부내역
                </label>
                <input
                  type="text"
                  value={newTaxDetail}
                  onChange={e => setNewTaxDetail(e.target.value)}
                  placeholder="예: 근로소득세 원천징수분"
                  style={{
                    height: '28px',
                    padding: '0 8px',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  납부세액(원)
                </label>
                <input
                  type="number"
                  value={newTaxAmount}
                  onChange={e => setNewTaxAmount(e.target.value)}
                  placeholder="0"
                  style={{
                    height: '28px',
                    width: '115px',
                    padding: '0 8px',
                    textAlign: 'right',
                    fontSize: '12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-main)'
                  }}
                />
              </div>

              <button
                type="button"
                onClick={handleAddManualTaxRow}
                style={{
                  height: '28px',
                  padding: '0 10px',
                  borderRadius: '5px',
                  border: '1px solid var(--primary)',
                  backgroundColor: 'var(--primary)',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}
              >
                <Plus size={13} />
                <span>건별 추가</span>
              </button>

              <input
                ref={taxFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleTaxFileUpload}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => taxFileInputRef.current?.click()}
                style={{
                  height: '28px',
                  padding: '0 10px',
                  borderRadius: '5px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}
              >
                <Upload size={13} />
                <span>엑셀 업로드</span>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ ...thBaseStyle, textAlign: 'center' }}>귀속연월</th>
                    <th style={{ ...thBaseStyle, textAlign: 'center' }}>납부일자</th>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>세목</th>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>관할기관</th>
                    <th style={{ ...thBaseStyle, textAlign: 'left' }}>납부 상세내역</th>
                    <th style={{ ...thBaseStyle, textAlign: 'right' }}>납부세액</th>
                    <th style={{ ...thBaseStyle, textAlign: 'center', width: '52px' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {taxPayments.map(tp => (
                    <tr key={tp.id}>
                      <td style={{ ...cellBaseStyle, textAlign: 'center', fontWeight: 700 }}>
                        {tp.attributionMonth}
                      </td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center' }}>{tp.paymentDate}</td>
                      <td style={{ ...cellBaseStyle, fontWeight: 700 }}>
                        {tp.taxCategory === 'WITHHOLDING_TAX'
                          ? '원천세'
                          : tp.taxCategory === 'VAT'
                          ? '부가세'
                          : tp.taxCategory === 'CORPORATE_TAX'
                          ? '법인세'
                          : '납부항목'}
                      </td>
                      <td style={cellBaseStyle}>{tp.taxOfficeName}</td>
                      <td style={cellBaseStyle}>{tp.taxDetailName}</td>
                      <td style={{ ...cellBaseStyle, textAlign: 'right', fontWeight: 700 }}>
                        {fmtWon(tp.paidAmount)}
                      </td>
                      <td style={{ ...cellBaseStyle, textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteTaxRow(tp.id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--danger)',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialStatementPage;
