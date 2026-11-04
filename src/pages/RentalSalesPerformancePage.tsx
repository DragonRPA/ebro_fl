import React, { useState, useMemo } from 'react';
import { TrendingUp, Download, Printer, RotateCcw, Eye, X, FileSpreadsheet, Layers, Calendar } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTrade } from '../context/TradeContext';
import { db, calculateContractProfitability } from '../services/db';
import { exportToExcel } from '../services/excel';
import { RegularReportsPage } from './RegularReportsPage';

type RentalPerfTab = 'RENTAL_CONTRACT' | 'RENTAL_ASSET' | 'RENTAL_MONTHLY' | 'REGULAR_REPORT';

export const RentalSalesPerformancePage: React.FC = () => {
  const { customers, sites, contracts, contractAssets, assets, repairs, refreshAllData, showErrorModal } = useApp();
  const { salesOrders, restoreGoldenTradeData } = useTrade();

  const [activeTab, setActiveTab] = useState<RentalPerfTab>('RENTAL_CONTRACT');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [assetStatusFilter, setAssetStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [isRestoringBaseline, setIsRestoringBaseline] = useState<boolean>(false);

  const resetFilters = () => {
    setYearFilter('ALL');
    setStartDate('');
    setEndDate('');
    setCustomerFilter('ALL');
    setAssetStatusFilter('ALL');
    setSearchQuery('');
  };

  const handleRestoreBaselineData = async () => {
    setIsRestoringBaseline(true);
    try {
      await db.restoreGoldenBaselineData();
      await restoreGoldenTradeData();
      refreshAllData();
    } catch (err: any) {
      showErrorModal(`기준 데이터 복원 실패: ${err?.message || String(err)}`);
    } finally {
      setIsRestoringBaseline(false);
    }
  };

  // 1) 렌탈 계약 건별 원가(감가상각 + 설치형옵션 + 정비배부) 및 매출이익률 집계
  const rentalContractRows = useMemo(() => {
    return (contracts || [])
      .filter(c => c.contractType !== 'TRADE')
      .map(c => {
        const cas = (contractAssets || []).filter(ca => ca.contractId === c.id);
        const prof = calculateContractProfitability(c, cas, assets, salesOrders, repairs);
        const custObj = (customers || []).find(cu => cu.id === c.customerId);
        const siteObj = (sites || []).find(si => si.id === c.siteId);
        const assetSummary = cas.length > 0
          ? `${cas.map(ca => ca.modelName || ca.expectedModel || '지게차').join(', ')} (${cas.length}대)`
          : '체결자산 배정대기';
        const optionSummary = c.installedOptionsSummary
          ? `설치형옵션: ${c.installedOptionsSummary}`
          : (Array.isArray((c as any).paidOptions) && (c as any).paidOptions.length > 0 ? `유상옵션: ${(c as any).paidOptions.join(', ')}` : '표준사양');

        return {
          contract: c,
          contractId: c.id,
          contractNo: c.contractNo || c.id,
          customerId: c.customerId,
          customerName: custObj?.name || c.customerName || '고객사',
          siteName: siteObj?.name || c.siteName || '현장 미지정',
          startDate: c.startDate || '-',
          endDate: c.endDate || '-',
          contractMonths: prof.contractMonths || 1,
          assetCount: Math.max(1, cas.length),
          assetSummary,
          optionSummary,
          revenueAmount: Number(prof.revenueAmount || 0),
          equipmentCostAmount: Number(prof.equipmentCostAmount || 0),
          optionCostAmount: Number(prof.optionCostAmount || 0),
          maintenanceCostAmount: Number(prof.maintenanceCostAmount || 0),
          costAmount: Number(prof.costAmount || 0),
          profitAmount: Number(prof.profitAmount || 0),
          marginRate: Number(prof.marginRate || 0)
        };
      });
  }, [contracts, contractAssets, assets, salesOrders, repairs, customers, sites]);

  const filteredRentalContractRows = useMemo(() => {
    return rentalContractRows.filter(row => {
      if (customerFilter !== 'ALL' && row.customerId !== customerFilter) return false;
      if (yearFilter !== 'ALL' && !String(row.startDate || '').startsWith(yearFilter)) return false;
      if (startDate && row.startDate < startDate) return false;
      if (endDate && row.startDate > endDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${row.contractNo} ${row.customerName} ${row.siteName} ${row.assetSummary} ${row.optionSummary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rentalContractRows, customerFilter, yearFilter, startDate, endDate, searchQuery]);

  // 2) 자산번호별 누적 매출기여액 및 수익성 집계 (헌장 4.1조)
  const rentalAssetRows = useMemo(() => {
    return (assets || []).map(asset => {
      const linkedCas = (contractAssets || []).filter(ca => ca.assetId === asset.id);
      const activeCa = linkedCas.find(ca => ca.status === 'RENTED' || ca.status === 'DISPATCHED') || linkedCas[0];
      const activeContract = activeCa ? (contracts || []).find(c => c.id === activeCa.contractId) : undefined;
      const custObj = activeContract ? (customers || []).find(cu => cu.id === activeContract.customerId) : undefined;
      const siteObj = activeContract ? (sites || []).find(si => si.id === activeContract.siteId) : undefined;

      // 계약 기간 및 월 렌탈료 기반 매출기여액 산출
      const monthlyFee = Number(activeCa?.monthlyRentalFee || (activeContract as any)?.monthlyRentalFee || asset.monthlyRentalFee || 650000);
      const accumRevenue = Number(
        (asset as any).accumulatedRevenue ||
        (linkedCas.length > 0 ? monthlyFee * Math.max(1, linkedCas.length * 3) : (asset.status === 'RENTED' ? monthlyFee * 3 : 0))
      );
      const acqPrice = Number(asset.acquisitionPrice || (asset as any).purchasePrice || 24000000);
      const monthlyDepr = Number((asset as any).monthlyDepreciation || Math.round(acqPrice / 60));
      const assetRepairs = (repairs || []).filter(r => r.assetId === asset.id);
      const repairCost = assetRepairs.reduce((s, r) => s + Number(r.totalCost || (r as any).repairCost || 0), 0);
      const totalAssetCost = (linkedCas.length > 0 || asset.status === 'RENTED' ? monthlyDepr * 3 : monthlyDepr) + repairCost;
      const netContribution = accumRevenue - totalAssetCost;
      const contributionPct = accumRevenue > 0 ? Number(((netContribution / accumRevenue) * 100).toFixed(1)) : 0;

      const statusLabel =
        asset.status === 'RENTED'
          ? '대여중'
          : asset.status === 'AVAILABLE'
          ? '임대가능'
          : (asset.status as string) === 'REPAIRING' || (asset.status as string) === 'MAINTENANCE' || (asset.status as string) === 'REPAIR'
          ? '수리중'
          : '출고대기';

      return {
        assetId: asset.id,
        assetNo: asset.assetNo || asset.id,
        manufacturer: asset.manufacturer || '항차그룹',
        modelName: (asset as any).model || asset.modelName || '지게차',
        serialNo: asset.serialNo || (asset as any).serialNumber || '-',
        status: asset.status || 'AVAILABLE',
        statusLabel,
        customerName: custObj?.name || activeContract?.customerName || '-',
        siteName: siteObj?.name || activeContract?.siteName || ((asset as any).currentLocation || '본사 주기장'),
        acqPrice,
        monthlyDepr,
        accumRevenue,
        repairCost,
        totalAssetCost,
        netContribution,
        contributionPct
      };
    });
  }, [assets, contractAssets, contracts, customers, sites, repairs]);

  const filteredRentalAssetRows = useMemo(() => {
    return rentalAssetRows.filter(r => {
      if (assetStatusFilter !== 'ALL' && r.status !== assetStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${r.assetNo} ${r.manufacturer} ${r.modelName} ${r.serialNo} ${r.customerName} ${r.siteName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rentalAssetRows, assetStatusFilter, searchQuery]);

  // 3) 월별·연도별 렌탈 매출 및 원가 실적
  const rentalMonthlyRows = useMemo(() => {
    const map = new Map<string, {
      yearMonth: string;
      year: string;
      contractCount: number;
      assetUnits: number;
      rentalRevenue: number;
      deprCost: number;
      optionAndRepairCost: number;
      totalRentalCost: number;
      grossProfit: number;
      marginRate: number;
    }>();

    filteredRentalContractRows.forEach(r => {
      const ym = String(r.startDate || '2026-10').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      const cur = map.get(ym) || {
        yearMonth: ym,
        year: ym.slice(0, 4),
        contractCount: 0,
        assetUnits: 0,
        rentalRevenue: 0,
        deprCost: 0,
        optionAndRepairCost: 0,
        totalRentalCost: 0,
        grossProfit: 0,
        marginRate: 0
      };
      cur.contractCount += 1;
      cur.assetUnits += r.assetCount;
      cur.rentalRevenue += r.revenueAmount;
      cur.deprCost += r.equipmentCostAmount;
      cur.optionAndRepairCost += r.optionCostAmount + r.maintenanceCostAmount;
      cur.totalRentalCost += r.costAmount;
      cur.grossProfit = cur.rentalRevenue - cur.totalRentalCost;
      cur.marginRate = cur.rentalRevenue > 0 ? Number(((cur.grossProfit / cur.rentalRevenue) * 100).toFixed(1)) : 0;
      map.set(ym, cur);
    });

    return Array.from(map.values()).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  }, [filteredRentalContractRows]);

  const rentalYearlyRows = useMemo(() => {
    const map = new Map<string, {
      year: string;
      contractCount: number;
      assetUnits: number;
      rentalRevenue: number;
      deprCost: number;
      optionAndRepairCost: number;
      totalRentalCost: number;
      grossProfit: number;
      marginRate: number;
    }>();

    rentalMonthlyRows.forEach(m => {
      const cur = map.get(m.year) || {
        year: m.year,
        contractCount: 0,
        assetUnits: 0,
        rentalRevenue: 0,
        deprCost: 0,
        optionAndRepairCost: 0,
        totalRentalCost: 0,
        grossProfit: 0,
        marginRate: 0
      };
      cur.contractCount += m.contractCount;
      cur.assetUnits += m.assetUnits;
      cur.rentalRevenue += m.rentalRevenue;
      cur.deprCost += m.deprCost;
      cur.optionAndRepairCost += m.optionAndRepairCost;
      cur.totalRentalCost += m.totalRentalCost;
      cur.grossProfit = cur.rentalRevenue - cur.totalRentalCost;
      cur.marginRate = cur.rentalRevenue > 0 ? Number(((cur.grossProfit / cur.rentalRevenue) * 100).toFixed(1)) : 0;
      map.set(m.year, cur);
    });

    return Array.from(map.values()).sort((a, b) => b.year.localeCompare(a.year));
  }, [rentalMonthlyRows]);

  // 전체 렌탈 요약 KPI
  const summary = useMemo(() => {
    const count = filteredRentalContractRows.length;
    const totalAssets = filteredRentalContractRows.reduce((s, r) => s + r.assetCount, 0);
    const totalRev = filteredRentalContractRows.reduce((s, r) => s + r.revenueAmount, 0);
    const totalDepr = filteredRentalContractRows.reduce((s, r) => s + r.equipmentCostAmount, 0);
    const totalOpt = filteredRentalContractRows.reduce((s, r) => s + r.optionCostAmount, 0);
    const totalMaint = filteredRentalContractRows.reduce((s, r) => s + r.maintenanceCostAmount, 0);
    const totalCost = filteredRentalContractRows.reduce((s, r) => s + r.costAmount, 0);
    const totalProfit = totalRev - totalCost;
    const marginRate = totalRev > 0 ? Number(((totalProfit / totalRev) * 100).toFixed(1)) : 0;
    const conservationDiff = totalRev - (totalCost + totalProfit);

    return {
      count,
      totalAssets,
      totalRev,
      totalDepr,
      totalOpt,
      totalMaint,
      totalCost,
      totalProfit,
      marginRate,
      conservationDiff
    };
  }, [filteredRentalContractRows]);

  const handleExcelDownload = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (activeTab === 'RENTAL_ASSET') {
      const rows = filteredRentalAssetRows.map((r, i) => ({
        순번: i + 1,
        자산번호: r.assetNo,
        제조사: r.manufacturer,
        모델명: r.modelName,
        제조번호: r.serialNo,
        현재상태: r.statusLabel,
        거래처명: r.customerName,
        가동현장: r.siteName,
        취득가액: r.acqPrice,
        월감가상각비: r.monthlyDepr,
        누적매출기여액: r.accumRevenue,
        누적정비원가: r.repairCost,
        총투입원가: r.totalAssetCost,
        순기여이익: r.netContribution,
        기여이익률퍼센트: r.contributionPct
      }));
      exportToExcel(rows, `렌탈영업_자산번호별_매출기여수익성_${today}`, '자산별매출기여');
      return;
    }

    if (activeTab === 'RENTAL_MONTHLY') {
      const rows = rentalMonthlyRows.map((m, i) => ({
        순번: i + 1,
        기준연월: m.yearMonth,
        연도: m.year,
        체결계약건수: m.contractCount,
        가동자산대수: m.assetUnits,
        렌탈매출액: m.rentalRevenue,
        장비감가상각원가: m.deprCost,
        옵션및정비원가: m.optionAndRepairCost,
        렌탈원가합계: m.totalRentalCost,
        렌탈매출총이익: m.grossProfit,
        매출이익률퍼센트: m.marginRate
      }));
      exportToExcel(rows, `렌탈영업_월별연도별_매출원가실적_${today}`, '월별렌탈실적');
      return;
    }

    const rows = filteredRentalContractRows.map((r, i) => ({
      순번: i + 1,
      계약번호: r.contractNo,
      거래처명: r.customerName,
      현장명: r.siteName,
      개시일: r.startDate,
      종료일: r.endDate,
      체결자산: r.assetSummary,
      적용옵션: r.optionSummary,
      렌탈매출액: r.revenueAmount,
      장비감가원가: r.equipmentCostAmount,
      설치형옵션원가: r.optionCostAmount,
      정비배부원가: r.maintenanceCostAmount,
      렌탈원가합계: r.costAmount,
      렌탈매출총이익: r.profitAmount,
      이익률퍼센트: r.marginRate
    }));
    exportToExcel(rows, `렌탈영업_계약건별_원가이익률_${today}`, '렌탈계약별손익');
  };

  const handlePrintReport = () => {
    const printWin = window.open('', '_blank', 'width=1020,height=900');
    if (!printWin) return;
    const rowsHtml = filteredRentalContractRows.map((r, i) => `
      <tr>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${i + 1}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; font-weight:700;">${r.contractNo}</td>
        <td style="padding:6px; border:1px solid #cbd5e1;">${r.customerName} (${r.siteName})</td>
        <td style="padding:6px; border:1px solid #cbd5e1;">${r.assetSummary} · ${r.optionSummary}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${r.revenueAmount.toLocaleString()}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:right;">${r.equipmentCostAmount.toLocaleString()}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:right;">${(r.optionCostAmount + r.maintenanceCostAmount).toLocaleString()}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${r.costAmount.toLocaleString()}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:right; font-weight:800; color:#15803d;">${r.profitAmount.toLocaleString()}</td>
        <td style="padding:6px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${r.marginRate.toFixed(1)}%</td>
      </tr>
    `).join('');

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>렌탈 영업실적 및 원가·이익률 보고서</title>
        <style>
          body { font-family: 'Pretendard', 'Malgun Gothic', sans-serif; padding: 24px; color: #0f172a; }
          h1 { text-align: center; font-size: 20px; margin-bottom: 6px; }
          .sub { text-align: center; font-size: 12px; color: #475569; margin-bottom: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
          th { background: #f1f5f9; padding: 7px; border: 1px solid #cbd5e1; }
          .footer { margin-top: 16px; padding: 10px 14px; border: 2px solid #0f172a; font-weight: 800; font-size: 12.5px; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <h1>렌탈 영업실적 및 원가·이익률 보고서</h1>
        <div class="sub">작성일: ${new Date().toISOString().slice(0, 10)} | 대상 계약: ${summary.count}건 (체결자산 ${summary.totalAssets}대)</div>
        <table>
          <thead>
            <tr>
              <th>순번</th>
              <th>계약번호</th>
              <th>거래처 / 현장</th>
              <th>체결자산 및 옵션</th>
              <th>렌탈매출액</th>
              <th>장비감가원가</th>
              <th>옵션·정비원가</th>
              <th>렌탈원가합계</th>
              <th>렌탈매출총이익</th>
              <th>이익률</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer">
          <span>렌탈 총매출액(₩${summary.totalRev.toLocaleString()}) = 렌탈 총원가(₩${summary.totalCost.toLocaleString()}) + 렌탈 매출총이익(₩${summary.totalProfit.toLocaleString()})</span>
          <span>대차 차액: ₩${summary.conservationDiff.toLocaleString()}</span>
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  const selectedContractRow = selectedContractId
    ? rentalContractRows.find(r => r.contractId === selectedContractId) || null
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {/* 상단 헤더 및 탭 스위치 바 */}
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={17} color="var(--primary-color)" />
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              실적관리-렌탈
            </span>
          </div>

          <div className="segmented-tab-group">
            <button
              type="button"
              onClick={() => setActiveTab('RENTAL_CONTRACT')}
              className={`segmented-tab-item ${activeTab === 'RENTAL_CONTRACT' ? 'active' : ''}`}
            >
              <TrendingUp size={13} />
              <span>렌탈계약별 원가·이익률 ({filteredRentalContractRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RENTAL_ASSET')}
              className={`segmented-tab-item ${activeTab === 'RENTAL_ASSET' ? 'active' : ''}`}
            >
              <Layers size={13} />
              <span>자산번호별 매출기여 ({filteredRentalAssetRows.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RENTAL_MONTHLY')}
              className={`segmented-tab-item ${activeTab === 'RENTAL_MONTHLY' ? 'active' : ''}`}
            >
              <Calendar size={13} />
              <span>월별·연도별 렌탈실적</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('REGULAR_REPORT')}
              className={`segmented-tab-item ${activeTab === 'REGULAR_REPORT' ? 'active' : ''}`}
            >
              <FileSpreadsheet size={13} />
              <span>정기 결산보고서</span>
            </button>
          </div>
        </div>

        {activeTab !== 'REGULAR_REPORT' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleRestoreBaselineData}
              disabled={isRestoringBaseline}
              className="btn btn-secondary"
              style={{ padding: '6px 11px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
            >
              <RotateCcw size={13} color="var(--success-color)" />
              <span>{isRestoringBaseline ? '복원중...' : '기준 데이터 복원'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrintReport}
              className="btn btn-primary"
              style={{ padding: '6px 11px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
            >
              <Printer size={13} />
              <span>보고서 출력</span>
            </button>
            <button
              type="button"
              onClick={handleExcelDownload}
              className="btn btn-secondary"
              style={{ padding: '6px 11px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
            >
              <Download size={13} color="var(--success-color)" />
              <span>엑셀 내보내기</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'REGULAR_REPORT' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <RegularReportsPage />
        </div>
      ) : (
        <>
          {/* 렌탈 전용 단일 KPI 요약 바 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '10px' }}>
            <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>렌탈 체결계약 · 자산대수</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                {summary.count}건 · {summary.totalAssets}대
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>전체 보유자산 {(assets || []).length}대 기준</div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>렌탈 총매출액</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-color)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                ₩{summary.totalRev.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>월/일 렌탈료 + 유상옵션 청구액</div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>장비 감가상각 원가</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                ₩{summary.totalDepr.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>체결자산 가동기간 감가상각비</div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>설치형옵션 · 정비 원가</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--warning-color)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                ₩{(summary.totalOpt + summary.totalMaint).toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                옵션 ₩{summary.totalOpt.toLocaleString()} · 정비 ₩{summary.totalMaint.toLocaleString()}
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>렌탈 매출총이익</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--success-color)' }}>이익률 {summary.marginRate.toFixed(1)}%</span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--success-color)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                ₩{summary.totalProfit.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                렌탈원가 합계 ₩{summary.totalCost.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 필터 바 (헌장 3.4 상하 스택) */}
          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
            {activeTab !== 'RENTAL_ASSET' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '110px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>기준 연도</label>
                  <select
                    value={yearFilter}
                    onChange={e => setYearFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    <option value="ALL">전체 연도</option>
                    <option value="2026">2026년</option>
                    <option value="2025">2025년</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>개시 시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>개시 종료일</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>거래처 선택</label>
                  <select
                    value={customerFilter}
                    onChange={e => setCustomerFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    <option value="ALL">전체 거래처</option>
                    {(customers || []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {activeTab === 'RENTAL_ASSET' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>자산 상태</label>
                <select
                  value={assetStatusFilter}
                  onChange={e => setAssetStatusFilter(e.target.value)}
                  style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                >
                  <option value="ALL">전체 상태</option>
                  <option value="RENTED">대여중</option>
                  <option value="AVAILABLE">임대가능</option>
                  <option value="MAINTENANCE">수리중</option>
                </select>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>검색어</label>
              <input
                type="text"
                placeholder="계약번호, 거래처명, 현장명, 자산번호, 모델명..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
              />
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', height: '33px' }}
            >
              <RotateCcw size={13} />
              <span>초기화</span>
            </button>
          </div>

          {/* 본문 테이블 영역 */}
          <div style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            {activeTab === 'RENTAL_CONTRACT' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                    <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>상세</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>계약번호 / 기간</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>거래처 / 현장명</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>체결자산 및 설치형옵션</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>렌탈 매출액</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>장비 감가원가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>설치형옵션 원가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>정비 배부원가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>렌탈원가 합계</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>렌탈 매출총이익</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRentalContractRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        조건에 해당하는 렌탈 계약 손익 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredRentalContractRows.map(r => (
                      <tr key={r.contractId} style={{ borderBottom: '1px solid var(--border-color)', height: '40px' }}>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedContractId(r.contractId)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={12} />
                            <span>원가상세</span>
                          </button>
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 800, color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>
                          <div>{r.contractNo}</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 500 }}>{r.startDate} ~ {r.endDate} ({r.contractMonths}개월)</div>
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{r.customerName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.siteName}</div>
                        </td>
                        <td style={{ padding: '7px 10px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{r.assetSummary}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.optionSummary}</div>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                          ₩{r.revenueAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          ₩{r.equipmentCostAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          ₩{r.optionCostAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                          ₩{r.maintenanceCostAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--warning-color)', fontFamily: 'var(--font-mono)' }}>
                          ₩{r.costAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: r.profitAmount >= 0 ? 'var(--success-color)' : 'var(--danger-color)', fontFamily: 'var(--font-mono)' }}>
                          ₩{r.profitAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>
                          {r.marginRate.toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'RENTAL_ASSET' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>자산번호</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>현재 상태</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>제조사 / 모델명</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>제조번호</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>거래처 / 가동현장</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>취득가액</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>월 감가상각비</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>누적 매출기여액</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>누적 정비원가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>순기여액</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>기여이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRentalAssetRows.map(r => (
                    <tr key={r.assetId} style={{ borderBottom: '1px solid var(--border-color)', height: '40px' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 800, color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>{r.assetNo}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 800,
                          backgroundColor: r.statusLabel === '대여중' ? '#dcfce7' : r.statusLabel === '수리중' ? '#fee2e2' : '#e0f2fe',
                          color: r.statusLabel === '대여중' ? '#166534' : r.statusLabel === '수리중' ? '#991b1b' : '#0369a1'
                        }}>
                          {r.statusLabel}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--text-main)' }}>{r.manufacturer} · {r.modelName}</td>
                      <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{r.serialNo}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{r.customerName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.siteName}</div>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>₩{r.acqPrice.toLocaleString()}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>₩{r.monthlyDepr.toLocaleString()}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary-color)' }}>₩{r.accumRevenue.toLocaleString()}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--warning-color)' }}>₩{r.repairCost.toLocaleString()}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: r.netContribution >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                        ₩{r.netContribution.toLocaleString()}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--primary-color)' }}>
                        {r.contributionPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeTab === 'RENTAL_MONTHLY' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    연도별 렌탈 매출 · 원가 · 매출총이익 요약
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap', border: '1px solid var(--border-color)' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>기준연도</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>체결계약수</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>가동자산 대수</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>연간 렌탈매출액</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>장비 감가상각원가</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>설치형옵션 · 정비원가</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>렌탈원가 합계</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>연간 렌탈매출총이익</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>매출이익률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentalYearlyRows.map(y => (
                        <tr key={y.year} style={{ borderBottom: '1px solid var(--border-color)', height: '38px' }}>
                          <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800 }}>{y.year}년</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{y.contractCount}건</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary-color)' }}>{y.assetUnits}대</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>₩{y.rentalRevenue.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₩{y.deprCost.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₩{y.optionAndRepairCost.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--warning-color)', fontFamily: 'var(--font-mono)' }}>₩{y.totalRentalCost.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--success-color)', fontFamily: 'var(--font-mono)' }}>₩{y.grossProfit.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>{y.marginRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    월별 렌탈 매출 · 원가 · 매출총이익 상세
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap', border: '1px solid var(--border-color)' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>기준연월</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>체결계약수</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>가동자산 대수</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>월별 렌탈매출액</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>장비 감가상각원가</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>설치형옵션 · 정비원가</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>렌탈원가 합계</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>월별 렌탈매출총이익</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>매출이익률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentalMonthlyRows.map(m => (
                        <tr key={m.yearMonth} style={{ borderBottom: '1px solid var(--border-color)', height: '38px' }}>
                          <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800 }}>{m.yearMonth}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right' }}>{m.contractCount}건</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary-color)' }}>{m.assetUnits}대</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>₩{m.rentalRevenue.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₩{m.deprCost.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₩{m.optionAndRepairCost.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--warning-color)', fontFamily: 'var(--font-mono)' }}>₩{m.totalRentalCost.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--success-color)', fontFamily: 'var(--font-mono)' }}>₩{m.grossProfit.toLocaleString()}</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>{m.marginRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 하단 Z-패턴 수지 보존 검증 바 */}
          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 16px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', fontSize: '13px', fontWeight: 700 }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span>렌탈 총매출액: <strong style={{ color: 'var(--text-main)' }}>₩{summary.totalRev.toLocaleString()}</strong></span>
              <span>=</span>
              <span>렌탈 총원가: <strong style={{ color: 'var(--warning-color)' }}>₩{summary.totalCost.toLocaleString()}</strong> [장비감가 ₩{summary.totalDepr.toLocaleString()} + 옵션·정비 ₩{(summary.totalOpt + summary.totalMaint).toLocaleString()}]</span>
              <span>+</span>
              <span>렌탈 매출총이익: <strong style={{ color: 'var(--success-color)' }}>₩{summary.totalProfit.toLocaleString()} ({summary.marginRate.toFixed(1)}%)</strong></span>
            </div>
            <div style={{ color: 'var(--success-color)', fontWeight: 800 }}>
              수지 대차 차액: ₩{summary.conservationDiff.toLocaleString()}
            </div>
          </div>
        </>
      )}

      {/* 렌탈 계약 원가 상세 모달 */}
      {selectedContractRow && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '620px', maxWidth: '95vw', borderRadius: '10px', padding: '20px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                렌탈계약 원가 및 손익 상세 · {selectedContractRow.contractNo}
              </h3>
              <button type="button" onClick={() => setSelectedContractId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '12.5px', marginBottom: '12px' }}>
              <div><strong>거래처:</strong> {selectedContractRow.customerName}</div>
              <div><strong>현장명:</strong> {selectedContractRow.siteName}</div>
              <div><strong>계약기간:</strong> {selectedContractRow.startDate} ~ {selectedContractRow.endDate} ({selectedContractRow.contractMonths}개월)</div>
              <div><strong>체결자산:</strong> {selectedContractRow.assetSummary}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong>적용 옵션:</strong> {selectedContractRow.optionSummary}</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', border: '1px solid var(--border-color)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>원가·손익 항목</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>금액</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>산출 기준</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>계약 렌탈 매출액</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>₩{selectedContractRow.revenueAmount.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>월 렌탈료 × 계약개월수 + 유상청구비용</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 10px' }}>장비 감가상각 원가</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₩{selectedContractRow.equipmentCostAmount.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>체결자산 월 감가상각비 × 계약개월수</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 10px' }}>설치형옵션 원가</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₩{selectedContractRow.optionCostAmount.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>장착 안전옵션·부착물·캐빈·사이드시프트 원가</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '8px 10px' }}>현장·주기장 정비 배부원가</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>₩{selectedContractRow.maintenanceCostAmount.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>체결자산 정비·수리 실비 및 기준 배부액</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-hover)' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 800 }}>렌탈원가 합계</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--warning-color)', fontFamily: 'var(--font-mono)' }}>₩{selectedContractRow.costAmount.toLocaleString()}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>감가상각 + 설치형옵션 + 정비배부</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 10px', fontWeight: 800 }}>렌탈 매출총이익 (이익률)</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--success-color)', fontFamily: 'var(--font-mono)' }}>
                    ₩{selectedContractRow.profitAmount.toLocaleString()} ({selectedContractRow.marginRate.toFixed(1)}%)
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>렌탈 매출액 - 렌탈원가 합계</td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => setSelectedContractId(null)}
                className="btn btn-primary"
                style={{ padding: '7px 16px', fontSize: '12.5px', fontWeight: 700 }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RentalSalesPerformancePage;
