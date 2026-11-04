import React, { useState, useMemo } from 'react';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { exportToExcel } from '../../services/excel';
import { db, calculateContractProfitability } from '../../services/db';
import {
  TrendingUp, Download, Printer, FileSpreadsheet, RotateCcw, X, Eye, Calendar, Factory, Building2
} from 'lucide-react';

export const TradeProfitabilityPage: React.FC = () => {
  const {
    salesOrders,
    salesOrderLines,
    purchases,
    purchaseItems,
    billings,
    products,
    outbounds,
    returns,
    getCustomerName,
    restoreGoldenTradeData
  } = useTrade();
  const { customers, sites, contracts, contractAssets, assets, repairs, refreshAllData, showErrorModal } = useApp();

  // Filter states
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'>('ALL');
  const [contractTypeFilter, setContractTypeFilter] = useState<'ALL' | 'RENTAL' | 'TRADE'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRestoringBaseline, setIsRestoringBaseline] = useState<boolean>(false);

  // View Tab: CONTRACT_TYPE (계약유형별 유통원가·렌탈원가 및 매출이익률 집계) | MONTHLY | PRODUCT | CUSTOMER | ORDER
  const [viewMode, setViewMode] = useState<'CONTRACT_TYPE' | 'MONTHLY' | 'PRODUCT' | 'CUSTOMER' | 'ORDER'>('CONTRACT_TYPE');

  // Formal Report Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [selectedOrderDetailId, setSelectedOrderDetailId] = useState<string | null>(null);

  const resetFilters = () => {
    setYearFilter('ALL');
    setStartDate('');
    setEndDate('');
    setCustomerFilter('ALL');
    setProductFilter('ALL');
    setStatusFilter('ALL');
    setContractTypeFilter('ALL');
    setSearchQuery('');
  };

  const handleRestoreBaselineData = async () => {
    setIsRestoringBaseline(true);
    try {
      await db.restoreGoldenBaselineData();
      await restoreGoldenTradeData();
      refreshAllData();
    } catch (err: any) {
      showErrorModal(`기준 골든 데이터 복원 실패: ${err?.message || String(err)}`);
    } finally {
      setIsRestoringBaseline(false);
    }
  };

  // 계약 건별 유형(렌탈원가 vs 유통원가) 매출·원가·매출총이익·이익률(%) 집계
  const contractProfitRows = useMemo(() => {
    return (contracts || []).map(c => {
      const cas = (contractAssets || []).filter(ca => ca.contractId === c.id);
      const prof = calculateContractProfitability(c, cas, assets, salesOrders, repairs);
      const custObj = (customers || []).find(cu => cu.id === c.customerId);
      const siteObj = (sites || []).find(si => si.id === c.siteId);
      const isTrade = c.contractType === 'TRADE';
      const itemAndOptionSummary = isTrade
        ? (c.tradeItemSummary || c.tradeItemsSummary || '유통 출고 품목')
        : `${cas.map(ca => ca.modelName || ca.expectedModel || '지게차').join(', ')} (${cas.length}대)${c.installedOptionsSummary ? ` · 설치형옵션: ${c.installedOptionsSummary}` : ''}`;

      return {
        contract: c,
        contractNo: c.contractNo || c.id,
        contractType: isTrade ? 'TRADE' as const : 'RENTAL' as const,
        contractTypeBadge: isTrade ? `유통 계약 · 제${c.outboundSeq || 1}차출고` : '렌탈 계약 · 현장별',
        costTypeLabel: prof.costTypeLabel || (isTrade ? '유통원가' : '렌탈원가'),
        customerId: c.customerId,
        customerName: custObj?.name || c.customerName || getCustomerName(c.customerId),
        siteName: siteObj?.name || c.siteName || '-',
        startDate: c.startDate || '-',
        endDate: c.endDate || '-',
        contractMonths: prof.contractMonths || 1,
        itemAndOptionSummary,
        revenueAmount: Number(prof.revenueAmount || 0),
        equipmentCostAmount: Number(prof.equipmentCostAmount || 0),
        optionCostAmount: Number(prof.optionCostAmount || 0),
        maintenanceCostAmount: Number(prof.maintenanceCostAmount || 0),
        costAmount: Number(prof.costAmount || 0),
        profitAmount: Number(prof.profitAmount || 0),
        marginRate: Number(prof.marginRate || 0)
      };
    });
  }, [contracts, contractAssets, assets, salesOrders, repairs, customers, sites, getCustomerName]);

  const filteredContractProfitRows = useMemo(() => {
    return contractProfitRows.filter(row => {
      if (contractTypeFilter !== 'ALL' && row.contractType !== contractTypeFilter) return false;
      if (customerFilter !== 'ALL' && row.customerId !== customerFilter) return false;
      if (yearFilter !== 'ALL' && !String(row.startDate || '').startsWith(yearFilter)) return false;
      if (startDate && row.startDate < startDate) return false;
      if (endDate && row.startDate > endDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${row.contractNo} ${row.customerName} ${row.siteName} ${row.itemAndOptionSummary} ${row.costTypeLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contractProfitRows, contractTypeFilter, customerFilter, yearFilter, startDate, endDate, searchQuery]);

  const contractTypeSummary = useMemo(() => {
    let rentalCount = 0;
    let rentalRev = 0;
    let rentalCost = 0;
    let rentalProfit = 0;

    let tradeCount = 0;
    let tradeRev = 0;
    let tradeCost = 0;
    let tradeProfit = 0;

    filteredContractProfitRows.forEach(r => {
      if (r.contractType === 'TRADE') {
        tradeCount++;
        tradeRev += r.revenueAmount;
        tradeCost += r.costAmount;
        tradeProfit += r.profitAmount;
      } else {
        rentalCount++;
        rentalRev += r.revenueAmount;
        rentalCost += r.costAmount;
        rentalProfit += r.profitAmount;
      }
    });

    const totalCount = rentalCount + tradeCount;
    const totalRev = rentalRev + tradeRev;
    const totalCost = rentalCost + tradeCost;
    const totalProfit = rentalProfit + tradeProfit;

    return {
      rentalCount,
      rentalRev,
      rentalCost,
      rentalProfit,
      rentalMarginRate: rentalRev > 0 ? Number(((rentalProfit / rentalRev) * 100).toFixed(1)) : 0,
      tradeCount,
      tradeRev,
      tradeCost,
      tradeProfit,
      tradeMarginRate: tradeRev > 0 ? Number(((tradeProfit / tradeRev) * 100).toFixed(1)) : 0,
      totalCount,
      totalRev,
      totalCost,
      totalProfit,
      totalMarginRate: totalRev > 0 ? Number(((totalProfit / totalRev) * 100).toFixed(1)) : 0,
      conservationDiff: totalRev - totalCost - totalProfit
    };
  }, [filteredContractProfitRows]);

  // Enrich each order with detailed profitability metrics
  const orderProfitRows = useMemo(() => {
    return salesOrders.map(order => {
      const lines = salesOrderLines.filter(l => l.orderId === order.id);
      const matchedOutbound = outbounds.find(ob => ob.orderId === order.id && ob.status !== 'CANCELLED');
      const orderReturns = returns.filter(
        r => (r.orderId === order.id || lines.some(l => l.id === r.orderLineId)) && (r.status || 'COMPLETED') === 'COMPLETED'
      );

      const grossSales = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
      const refundTotal = orderReturns.reduce((s, r) => s + r.refundAmount, 0);
      const netSales = order.totalSalesAmount;

      const estimatedStandardCost = lines.reduce((s, l) => {
        const prod = products.find(p => p.id === l.productId);
        const lineRetQty = orderReturns.filter(r => r.orderLineId === l.id).reduce((acc, r) => acc + r.qty, 0);
        const netQty = Math.max(0, l.qty - lineRetQty);
        return s + netQty * (prod?.standardCost || 0);
      }, 0);

      const cogs = order.totalCogsAmount > 0 ? order.totalCogsAmount : estimatedStandardCost;
      const isConfirmedCogs = order.totalCogsAmount > 0;

      const ourShippingCost = matchedOutbound && matchedOutbound.paidBy !== 'CUSTOMER'
        ? (matchedOutbound.shippingCost || 0)
        : 0;

      const grossMargin = netSales - cogs;
      const netMargin = netSales - cogs - ourShippingCost;
      const marginPct = netSales > 0 ? Number(((grossMargin / netSales) * 100).toFixed(1)) : 0;

      // 지게차 판매대수 및 부품 수량 집계
      let forkliftUnitsSold = 0;
      let partUnitsSold = 0;
      lines.forEach(l => {
        const prod = products.find(p => p.id === l.productId);
        const isEquipment = prod?.itemType === 'EQUIPMENT' || prod?.category === '전동지게차' || prod?.category === '디젤지게차' || prod?.unit === '대';
        if (isEquipment) forkliftUnitsSold += l.qty;
        else partUnitsSold += l.qty;
      });

      const firstProd = lines.length > 0 ? products.find(p => p.id === lines[0].productId) : null;
      const itemSummary = lines.length === 0 ? '품목 없음' : lines.length === 1
        ? `[${firstProd?.skuCode || 'SKU'}] ${firstProd?.name || '제품'} (${lines[0].qty}${firstProd?.unit || '대'})`
        : `[${firstProd?.skuCode || 'SKU'}] ${firstProd?.name || '제품'} 외 ${lines.length - 1}종`;

      const serialNumbers = lines.flatMap(l => l.serialNumbers || []);

      return {
        order,
        lines,
        matchedOutbound,
        orderReturns,
        customerName: getCustomerName(order.customerId),
        itemSummary,
        serialNumbers,
        forkliftUnitsSold,
        partUnitsSold,
        grossSales,
        refundTotal,
        netSales,
        cogs,
        isConfirmedCogs,
        ourShippingCost,
        grossMargin,
        netMargin,
        marginPct
      };
    });
  }, [salesOrders, salesOrderLines, outbounds, returns, products, getCustomerName]);

  // Apply filters
  const filteredOrderRows = useMemo(() => {
    return orderProfitRows.filter(row => {
      const { order, lines, customerName, itemSummary, serialNumbers } = row;

      if (statusFilter === 'ALL') {
        if (order.status === 'CANCELLED') return false;
      } else if (order.status !== statusFilter) {
        return false;
      }

      const refDate = (order.orderDate || order.createdAt || '').split('T')[0];
      if (yearFilter !== 'ALL' && !refDate.startsWith(yearFilter)) return false;
      if (startDate && refDate && refDate < startDate) return false;
      if (endDate && refDate && refDate > endDate) return false;

      if (customerFilter !== 'ALL' && order.customerId !== customerFilter) return false;

      if (productFilter !== 'ALL') {
        const hasProd = lines.some(l => l.productId === productFilter);
        if (!hasProd) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          order.id.toLowerCase().includes(q) ||
          customerName.toLowerCase().includes(q) ||
          itemSummary.toLowerCase().includes(q) ||
          serialNumbers.some(sn => sn.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [orderProfitRows, statusFilter, yearFilter, startDate, endDate, customerFilter, productFilter, searchQuery]);

  // 1) 월별·연도별 매입 및 매출실적 (월별 판매대수 및 매출총이익 통합)
  const monthlyPerformanceRows = useMemo(() => {
    const monthMap = new Map<
      string,
      {
        yearMonth: string;
        year: string;
        importPurchaseAmt: number;
        domesticPurchaseAmt: number;
        totalPurchaseAmt: number;
        orderCount: number;
        forkliftSoldUnits: number;
        partSoldUnits: number;
        salesAmount: number;
        cogsAmount: number;
        grossProfit: number;
        grossMarginPct: number;
      }
    >();

    const ensureMonth = (ym: string) => {
      if (!monthMap.has(ym)) {
        monthMap.set(ym, {
          yearMonth: ym,
          year: ym.substring(0, 4),
          importPurchaseAmt: 0,
          domesticPurchaseAmt: 0,
          totalPurchaseAmt: 0,
          orderCount: 0,
          forkliftSoldUnits: 0,
          partSoldUnits: 0,
          salesAmount: 0,
          cogsAmount: 0,
          grossProfit: 0,
          grossMarginPct: 0
        });
      }
      return monthMap.get(ym)!;
    };

    // 매입 실적 반영
    purchases
      .filter(p => p.status !== 'CANCELLED')
      .forEach(p => {
        const pDate = (p.orderDate || p.createdAt || '').split('T')[0];
        if (!pDate) return;
        if (yearFilter !== 'ALL' && !pDate.startsWith(yearFilter)) return;
        if (startDate && pDate < startDate) return;
        if (endDate && pDate > endDate) return;

        const ym = pDate.substring(0, 7);
        const rec = ensureMonth(ym);
        const amt = p.landedTotalAmount || p.totalAmount || 0;
        const isImp = p.purchaseType === 'IMPORT' || (p.currency && p.currency !== 'KRW');
        if (isImp) rec.importPurchaseAmt += amt;
        else rec.domesticPurchaseAmt += amt;
        rec.totalPurchaseAmt += amt;
      });

    // 매출 및 판매대수 실적 반영
    filteredOrderRows.forEach(row => {
      const oDate = (row.order.orderDate || row.order.createdAt || '').split('T')[0];
      if (!oDate) return;
      const ym = oDate.substring(0, 7);
      const rec = ensureMonth(ym);
      rec.orderCount += 1;
      rec.forkliftSoldUnits += row.forkliftUnitsSold;
      rec.partSoldUnits += row.partUnitsSold;
      rec.salesAmount += row.netSales;
      rec.cogsAmount += row.cogs;
      rec.grossProfit = rec.salesAmount - rec.cogsAmount;
      rec.grossMarginPct = rec.salesAmount > 0 ? Number(((rec.grossProfit / rec.salesAmount) * 100).toFixed(1)) : 0;
    });

    return Array.from(monthMap.values()).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  }, [purchases, filteredOrderRows, yearFilter, startDate, endDate]);

  // 2) 제조사·모델별 매출현황
  const productProfitRows = useMemo(() => {
    const map = new Map<string, {
      productId: string;
      skuCode: string;
      manufacturer: string;
      modelName: string;
      productName: string;
      category: string;
      unit: string;
      orderCount: number;
      soldQty: number;
      returnedQty: number;
      netSales: number;
      cogs: number;
      grossMargin: number;
      marginPct: number;
    }>();

    filteredOrderRows.forEach(row => {
      row.lines.forEach(line => {
        if (productFilter !== 'ALL' && line.productId !== productFilter) return;
        const prod = products.find(p => p.id === line.productId);
        const lineRet = row.orderReturns.filter(r => r.orderLineId === line.id);
        const retQty = lineRet.reduce((s, r) => s + r.qty, 0);
        const retRefund = lineRet.reduce((s, r) => s + r.refundAmount, 0);
        const lineNetSales = Math.max(0, line.qty * line.unitPrice - retRefund);
        const lineCogs = line.unitCogs && line.unitCogs > 0
          ? Math.max(0, line.qty - retQty) * line.unitCogs
          : Math.max(0, line.qty - retQty) * (prod?.standardCost || 0);

        const existing = map.get(line.productId) || {
          productId: line.productId,
          skuCode: prod?.skuCode || '-',
          manufacturer: prod?.manufacturer || '-',
          modelName: prod?.modelName || prod?.skuCode || '-',
          productName: prod?.name || '제품',
          category: prod?.category || '전동지게차',
          unit: prod?.unit || '대',
          orderCount: 0,
          soldQty: 0,
          returnedQty: 0,
          netSales: 0,
          cogs: 0,
          grossMargin: 0,
          marginPct: 0
        };

        existing.orderCount += 1;
        existing.soldQty += line.qty;
        existing.returnedQty += retQty;
        existing.netSales += lineNetSales;
        existing.cogs += lineCogs;
        existing.grossMargin = existing.netSales - existing.cogs;
        existing.marginPct = existing.netSales > 0
          ? Number(((existing.grossMargin / existing.netSales) * 100).toFixed(1))
          : 0;

        map.set(line.productId, existing);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.netSales - a.netSales);
  }, [filteredOrderRows, products, productFilter]);

  // 3) 거래처별 매출 및 미수금 현황
  const customerProfitRows = useMemo(() => {
    const map = new Map<string, {
      customerId: string;
      customerName: string;
      tierLabel: string;
      orderCount: number;
      forkliftUnits: number;
      grossSales: number;
      refundTotal: number;
      netSales: number;
      cogs: number;
      grossMargin: number;
      marginPct: number;
      receivableAmount: number;
    }>();

    filteredOrderRows.forEach(row => {
      const cid = row.order.customerId || 'UNKNOWN';
      const isDealer = row.order.customerTier === 'DEALER' || cid.startsWith('DEALER-') || row.customerName.includes('대리점') || row.customerName.includes('부품상사');
      const linkedBill = billings.find(b => b.orderId === row.order.id && b.status !== 'CANCELLED');
      const isPaid = linkedBill?.status === 'PAID';
      const orderVatIncluded = Math.round(row.netSales * 1.1);

      const existing = map.get(cid) || {
        customerId: cid,
        customerName: row.customerName,
        tierLabel: isDealer ? '대리점' : '최종고객',
        orderCount: 0,
        forkliftUnits: 0,
        grossSales: 0,
        refundTotal: 0,
        netSales: 0,
        cogs: 0,
        grossMargin: 0,
        marginPct: 0,
        receivableAmount: 0
      };

      existing.orderCount += 1;
      existing.forkliftUnits += row.forkliftUnitsSold;
      existing.grossSales += row.grossSales;
      existing.refundTotal += row.refundTotal;
      existing.netSales += row.netSales;
      existing.cogs += row.cogs;
      existing.grossMargin += row.grossMargin;
      if (!isPaid) {
        existing.receivableAmount += linkedBill?.totalAmount ?? orderVatIncluded;
      }
      existing.marginPct = existing.netSales > 0
        ? Number(((existing.grossMargin / existing.netSales) * 100).toFixed(1))
        : 0;

      map.set(cid, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.netSales - a.netSales);
  }, [filteredOrderRows, billings]);

  // Overall Totals
  const totals = useMemo(() => {
    const totalGrossRev = filteredOrderRows.reduce((s, r) => s + r.grossSales, 0);
    const totalRefund = filteredOrderRows.reduce((s, r) => s + r.refundTotal, 0);
    const totalRev = filteredOrderRows.reduce((s, r) => s + r.netSales, 0);
    const totalCogs = filteredOrderRows.reduce((s, r) => s + r.cogs, 0);
    const totalShipping = filteredOrderRows.reduce((s, r) => s + r.ourShippingCost, 0);
    const grossMargin = totalRev - totalCogs;
    const netMargin = totalRev - totalCogs - totalShipping;
    const marginPct = totalRev === 0 ? 0 : Number(((grossMargin / totalRev) * 100).toFixed(1));
    const totalForkliftUnits = filteredOrderRows.reduce((s, r) => s + r.forkliftUnitsSold, 0);
    const totalPurchaseAmt = monthlyPerformanceRows.reduce((s, m) => s + m.totalPurchaseAmt, 0);
    const conservationDiff = totalRev - (totalCogs + grossMargin);

    return {
      totalGrossRev,
      totalRefund,
      totalRev,
      totalCogs,
      totalShipping,
      grossMargin,
      netMargin,
      marginPct,
      totalForkliftUnits,
      totalPurchaseAmt,
      conservationDiff
    };
  }, [filteredOrderRows, monthlyPerformanceRows]);

  // Print Formal Profitability Report (A4)
  const handlePrintFormalReport = () => {
    const periodText = startDate || endDate ? `${startDate || '전체'} ~ ${endDate || '전체'}` : '전체 기간';
    const monthlyRowsHtml = monthlyPerformanceRows.map((m, i) => `
      <tr>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${i + 1}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center; font-weight:700;">${m.yearMonth}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right;">${m.importPurchaseAmt.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right;">${m.domesticPurchaseAmt.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${m.totalPurchaseAmt.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${m.forkliftSoldUnits}대</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${m.salesAmount.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right;">${m.cogsAmount.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:800; color:#15803d;">${m.grossProfit.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${m.grossMarginPct.toFixed(1)}%</td>
      </tr>
    `).join('');

    const prodRowsHtml = productProfitRows.map((p, i) => `
      <tr>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${i + 1}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center;">${p.manufacturer}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:center; font-weight:700;">${p.modelName}</td>
        <td style="padding:7px; border:1px solid #cbd5e1;">${p.productName}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${p.soldQty}${p.unit}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right;">${p.netSales.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right;">${p.cogs.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${p.grossMargin.toLocaleString()}</td>
        <td style="padding:7px; border:1px solid #cbd5e1; text-align:right; font-weight:700;">${p.marginPct.toFixed(1)}%</td>
      </tr>
    `).join('');

    const printWin = window.open('', '_blank', 'width=1050,height=950');
    if (printWin) {
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>영업실적 및 매출총이익 보고서</title>
          <style>
            body { font-family: 'Pretendard', 'Malgun Gothic', sans-serif; padding: 28px; color: #0f172a; }
            h1 { text-align: center; font-size: 22px; margin-bottom: 6px; letter-spacing: 3px; }
            .sub { text-align: center; font-size: 12px; color: #475569; margin-bottom: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
            h2 { font-size: 15px; margin: 18px 0 8px 0; color: #1e293b; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1; }
            .conservation { margin-top: 18px; padding: 12px; background: #f8fafc; border: 2px solid #0f172a; font-size: 13px; font-weight: 800; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1>영업실적 및 매출총이익 종합 보고서</h1>
          <div class="sub">조회기간: ${periodText} | 출력일시: ${new Date().toISOString().replace('T', ' ').substring(0, 16)}</div>

          <h2>1. 월별 매입 · 판매대수 · 매출총이익 실적</h2>
          <table>
            <thead>
              <tr>
                <th>순번</th>
                <th>기준연월</th>
                <th>해외수입액(원)</th>
                <th>국내매입액(원)</th>
                <th>총매입액(원)</th>
                <th>지게차 판매대수</th>
                <th>매출액(원)</th>
                <th>매출원가(원)</th>
                <th>매출총이익(원)</th>
                <th>매출이익률</th>
              </tr>
            </thead>
            <tbody>${monthlyRowsHtml}</tbody>
          </table>

          <h2>2. 제조사 · 모델별 매출 및 매출총이익 현황</h2>
          <table>
            <thead>
              <tr>
                <th>순번</th>
                <th>제조사</th>
                <th>모델명</th>
                <th>제품명</th>
                <th>판매수량</th>
                <th>매출액(원)</th>
                <th>매출원가(원)</th>
                <th>매출총이익(원)</th>
                <th>이익률(%)</th>
              </tr>
            </thead>
            <tbody>${prodRowsHtml}</tbody>
          </table>

          <div class="conservation">
            <span>수지 보존 검증: 총매출액(${totals.totalRev.toLocaleString()}원) = 매출원가(${totals.totalCogs.toLocaleString()}원) + 매출총이익(${totals.grossMargin.toLocaleString()}원)</span>
            <span>대차 차액: ₩${totals.conservationDiff.toLocaleString()}</span>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
      `);
      printWin.document.close();
    }
  };

  // Excel Download (현재 탭에 맞춰 현황자료 엑셀 다운로드)
  const handleExcelDownload = () => {
    const today = new Date().toISOString().split('T')[0];

    if (viewMode === 'CONTRACT_TYPE') {
      const rows = filteredContractProfitRows.map((r, idx) => ({
        순번: idx + 1,
        계약번호: r.contractNo,
        계약유형: r.contractTypeBadge,
        원가유형: r.costTypeLabel,
        거래처명: r.customerName,
        현장명: r.siteName,
        개시일: r.startDate,
        종료일: r.endDate,
        체결자산및출고품목: r.itemAndOptionSummary,
        계약매출액: r.revenueAmount,
        장비감가및매입원가: r.equipmentCostAmount,
        설치형옵션원가: r.optionCostAmount,
        정비배부원가: r.maintenanceCostAmount,
        원가합계: r.costAmount,
        매출총이익: r.profitAmount,
        이익률퍼센트: r.marginRate
      }));
      exportToExcel(rows, `계약유형별_유통원가렌탈원가_이익률집계_${today}`, '계약유형별원가이익률');
      return;
    }

    if (viewMode === 'MONTHLY') {
      const rows = monthlyPerformanceRows.map((m, idx) => ({
        순번: idx + 1,
        기준연월: m.yearMonth,
        연도: m.year,
        해외수입원가: m.importPurchaseAmt,
        국내매입원가: m.domesticPurchaseAmt,
        총매입액: m.totalPurchaseAmt,
        수주건수: m.orderCount,
        지게차판매대수: m.forkliftSoldUnits,
        부품판매수량: m.partSoldUnits,
        매출공급가액: m.salesAmount,
        매출원가: m.cogsAmount,
        매출총이익: m.grossProfit,
        매출이익률퍼센트: m.grossMarginPct
      }));
      exportToExcel(rows, `월별연도별_매입매출실적_${today}`, '월별매입매출실적');
      return;
    }

    if (viewMode === 'PRODUCT') {
      const rows = productProfitRows.map((p, idx) => ({
        순번: idx + 1,
        제조사: p.manufacturer,
        모델명: p.modelName,
        품목코드: p.skuCode,
        제품명: p.productName,
        분류: p.category,
        수주건수: p.orderCount,
        판매수량: p.soldQty,
        단위: p.unit,
        매출액: p.netSales,
        매출원가: p.cogs,
        매출총이익: p.grossMargin,
        매출이익률퍼센트: p.marginPct
      }));
      exportToExcel(rows, `제조사모델별_매출현황_${today}`, '제조사모델별매출현황');
      return;
    }

    if (viewMode === 'CUSTOMER') {
      const rows = customerProfitRows.map((c, idx) => ({
        순번: idx + 1,
        거래처구분: c.tierLabel,
        거래처코드: c.customerId,
        거래처명: c.customerName,
        수주건수: c.orderCount,
        지게차판매대수: c.forkliftUnits,
        매출공급가액: c.netSales,
        매출원가: c.cogs,
        매출총이익: c.grossMargin,
        매출이익률퍼센트: c.marginPct,
        현재미수금잔액: c.receivableAmount
      }));
      exportToExcel(rows, `거래처별_매출및미수금현황_${today}`, '거래처별매출현황');
      return;
    }

    const rows = filteredOrderRows.map((r, idx) => ({
      순번: idx + 1,
      수주번호: r.order.id,
      수주일자: (r.order.orderDate || r.order.createdAt || '').split('T')[0],
      거래처명: r.customerName,
      품목명세: r.itemSummary,
      출고차대번호: r.serialNumbers.join(', ') || '-',
      지게차판매대수: r.forkliftUnitsSold,
      매출액: r.netSales,
      매출원가: r.cogs,
      매출총이익: r.grossMargin,
      매출이익률퍼센트: r.marginPct
    }));
    exportToExcel(rows, `건별차대별_매출이익상세_${today}`, '건별매출이익상세');
  };

  const selectedDetailRow = selectedOrderDetailId
    ? orderProfitRows.find(r => r.order.id === selectedOrderDetailId) || null
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      {/* Top View Selector & Pipeline Bar */}
      <div className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div className="segmented-tab-group">
          <button
            onClick={() => setViewMode('CONTRACT_TYPE')}
            className={`segmented-tab-item ${viewMode === 'CONTRACT_TYPE' ? 'active' : ''}`}
          >
            계약유형별 원가·이익률 ({filteredContractProfitRows.length})
          </button>
          <button
            onClick={() => setViewMode('MONTHLY')}
            className={`segmented-tab-item ${viewMode === 'MONTHLY' ? 'active' : ''}`}
          >
            월별·연도별 매입·매출
          </button>
          <button
            onClick={() => setViewMode('PRODUCT')}
            className={`segmented-tab-item ${viewMode === 'PRODUCT' ? 'active' : ''}`}
          >
            제조사·모델별 매출
          </button>
          <button
            onClick={() => setViewMode('CUSTOMER')}
            className={`segmented-tab-item ${viewMode === 'CUSTOMER' ? 'active' : ''}`}
          >
            거래처별 매출
          </button>
          <button
            onClick={() => setViewMode('ORDER')}
            className={`segmented-tab-item ${viewMode === 'ORDER' ? 'active' : ''}`}
          >
            건별·제조번호별 이익
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleRestoreBaselineData}
            disabled={isRestoringBaseline}
            className="btn btn-secondary"
            style={{
              padding: '6px 11px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap'
            }}
          >
            <RotateCcw size={13} color="var(--success-color)" />
            <span>{isRestoringBaseline ? '복원중...' : '기준 데이터 복원'}</span>
          </button>

          <button
            onClick={() => setIsReportModalOpen(true)}
            className="btn btn-primary"
            style={{
              padding: '6px 11px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap'
            }}
          >
            <Printer size={13} />
            <span>보고서 출력</span>
          </button>

          <button
            onClick={handleExcelDownload}
            className="btn btn-secondary"
            style={{
              padding: '6px 11px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap'
            }}
          >
            <Download size={13} color="var(--success-color)" />
            <span>엑셀 내보내기</span>
          </button>
        </div>
      </div>

      {/* Unified KPI Strip (No Cards in Cards) */}
      {viewMode === 'CONTRACT_TYPE' ? (
        <div data-mid="trade_profitability-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: '10px' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>렌탈 계약 ({contractTypeSummary.rentalCount}건)</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-color)' }}>이익률 {contractTypeSummary.rentalMarginRate.toFixed(1)}%</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              매출 ₩{contractTypeSummary.rentalRev.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              렌탈원가 ₩{contractTypeSummary.rentalCost.toLocaleString()} · 이익 ₩{contractTypeSummary.rentalProfit.toLocaleString()}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>유통 계약 ({contractTypeSummary.tradeCount}건)</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-color)' }}>이익률 {contractTypeSummary.tradeMarginRate.toFixed(1)}%</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              매출 ₩{contractTypeSummary.tradeRev.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              유통원가 ₩{contractTypeSummary.tradeCost.toLocaleString()} · 이익 ₩{contractTypeSummary.tradeProfit.toLocaleString()}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>통합 계약 매출·원가 ({contractTypeSummary.totalCount}건)</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary-color)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              총매출 ₩{contractTypeSummary.totalRev.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              총원가 ₩{contractTypeSummary.totalCost.toLocaleString()}
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>통합 매출총이익</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--success-color)' }}>평균 {contractTypeSummary.totalMarginRate.toFixed(1)}%</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--success-color)', marginTop: '3px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              ₩{contractTypeSummary.totalProfit.toLocaleString()}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              대차 차액 ₩{contractTypeSummary.conservationDiff.toLocaleString()}
            </div>
          </div>
        </div>
      ) : (
        <div data-mid="trade_profitability-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: '10px' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>누적 매입·수입 총액</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary-color)', marginTop: '2px', whiteSpace: 'nowrap' }}>₩{totals.totalPurchaseAmt.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>해외수입 도착원가 + 국내매입</div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>지게차 판매대수</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px', whiteSpace: 'nowrap' }}>{totals.totalForkliftUnits.toLocaleString()}대</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>수주 {filteredOrderRows.length}건 기준</div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>총 매출실적</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary-color)', marginTop: '2px', whiteSpace: 'nowrap' }}>₩{totals.totalRev.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>매출원가 ₩{totals.totalCogs.toLocaleString()}</div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>총 매출총이익</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--success-color)', marginTop: '2px', whiteSpace: 'nowrap' }}>₩{totals.grossMargin.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>매출액 - 매출원가</div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>평균 매출총이익률</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--primary-color)', marginTop: '2px', whiteSpace: 'nowrap' }}>{totals.marginPct.toFixed(1)}%</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap' }}>순마진 ₩{totals.netMargin.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        padding: '10px 14px',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'flex-end'
      }}>
        {viewMode === 'CONTRACT_TYPE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>계약 유형 구분</label>
            <select
              value={contractTypeFilter}
              onChange={e => setContractTypeFilter(e.target.value as 'ALL' | 'RENTAL' | 'TRADE')}
              style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            >
              <option value="ALL">전체 계약 ({contractProfitRows.length}건)</option>
              <option value="RENTAL">렌탈 계약 · 렌탈원가</option>
              <option value="TRADE">유통 계약 · 유통원가</option>
            </select>
          </div>
        )}

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
          <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>조회 시작일</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>조회 종료일</label>
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

        {viewMode !== 'CONTRACT_TYPE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제조사 · 모델 선택</label>
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            >
              <option value="ALL">전체 제조사·모델</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>[{p.manufacturer || p.skuCode}] {p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '160px' }}>
          <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>검색어</label>
          <input
            type="text"
            placeholder="계약번호, 거래처명, 모델명, 제조번호..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12.5px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
          />
        </div>

        <button
          onClick={resetFilters}
          className="btn btn-secondary"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            whiteSpace: 'nowrap',
            height: '33px'
          }}
        >
          <RotateCcw size={13} />
          초기화
        </button>
      </div>

      {/* Main Analytical Grid */}
      <div style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
        {/* TAB 0: 계약유형별(렌탈원가 vs 유통원가) 매출·원가·이익률 집계 */}
        {viewMode === 'CONTRACT_TYPE' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-hover)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>계약번호</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>계약유형 · 원가구분</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>거래처 / 현장</th>
                <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>체결자산 · 출고품목 및 옵션</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>계약매출액</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>장비감가 · 본품매입원가</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>설치형옵션 · 정비원가</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>원가 합계</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>매출총이익</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>이익률</th>
              </tr>
            </thead>
            <tbody>
              {filteredContractProfitRows.map(r => (
                <tr key={r.contract.id} style={{ borderBottom: '1px solid var(--border-color)', height: '40px' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 800, color: 'var(--primary-color)', fontFamily: 'var(--font-mono)' }}>
                    <div>{r.contractNo}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 500 }}>{r.startDate}</div>
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 7px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 800,
                      backgroundColor: 'var(--bg-hover)',
                      color: r.contractType === 'TRADE' ? 'var(--primary-color)' : 'var(--success-color)',
                      border: '1px solid var(--border-color)'
                    }}>
                      {r.contractTypeBadge} · {r.costTypeLabel}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{r.customerName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.siteName}</div>
                  </td>
                  <td style={{ padding: '7px 10px', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }} title={r.itemAndOptionSummary}>
                    {r.itemAndOptionSummary}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                    ₩{r.revenueAmount.toLocaleString()}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    ₩{r.equipmentCostAmount.toLocaleString()}
                  </td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    ₩{(r.optionCostAmount + r.maintenanceCostAmount).toLocaleString()}
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
              ))}
            </tbody>
          </table>
        )}

        {/* TAB 1: 월별·연도별 매입 및 매출실적 / 판매대수 / 매출총이익 */}
        {viewMode === 'MONTHLY' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>기준연월</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>해외수입 원가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>국내매입 원가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>총 매입실적</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>수주건수</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>월별 지게차 판매대수</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>부품 판매수량</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>월별 매출실적</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출원가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>월별 매출총이익</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출이익률</th>
              </tr>
            </thead>
            <tbody>
              {monthlyPerformanceRows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    집계된 월별·연도별 매입 및 매출실적이 없습니다.
 </td>
                </tr>
              ) : (
                monthlyPerformanceRows.map(m => (
                  <tr key={m.yearMonth} style={{ borderBottom: '1px solid var(--border-color)', height: '42px' }}>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--text-main)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Calendar size={13} color="var(--primary)" />
                        {m.yearMonth}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>
                      ₩{m.importPurchaseAmt.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      ₩{m.domesticPurchaseAmt.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)' }}>
                      ₩{m.totalPurchaseAmt.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {m.orderCount}건
 </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#0284c7' }}>
                      {m.forkliftSoldUnits}대
 </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {m.partSoldUnits}개
 </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                      ₩{m.salesAmount.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#d97706', fontWeight: 700 }}>
                      ₩{m.cogsAmount.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: m.grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                      ₩{m.grossProfit.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>
                      {m.grossMarginPct.toFixed(1)}%
 </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* TAB 2: 제조사·모델별 매출현황 */}
        {viewMode === 'PRODUCT' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>제조사</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>모델명 / 품목코드</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>제품명</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>분류</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>수주건수</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>판매대수 · 수량</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출금액</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출원가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출총이익</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출이익률</th>
              </tr>
            </thead>
            <tbody>
              {productProfitRows.map(p => (
                <tr key={p.productId} style={{ borderBottom: '1px solid var(--border-color)', height: '42px' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Factory size={13} color="var(--primary)" />
                      {p.manufacturer}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                    {p.modelName} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>· {p.skuCode}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>{p.productName}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{p.category}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{p.orderCount}건</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>
                    {p.soldQty}{p.unit}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>₩{p.netSales.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#d97706', fontWeight: 700 }}>₩{p.cogs.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 800 }}>₩{p.grossMargin.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563eb', fontWeight: 800 }}>{p.marginPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* TAB 3: 거래처별 매출현황 */}
        {viewMode === 'CUSTOMER' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>구분</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>거래처명</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>수주건수</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>지게차 구매대수</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출금액</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출원가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출총이익</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>이익률</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>현재 미수금 잔액</th>
              </tr>
            </thead>
            <tbody>
              {customerProfitRows.map(c => (
                <tr key={c.customerId} style={{ borderBottom: '1px solid var(--border-color)', height: '42px' }}>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: c.tierLabel === '대리점' ? '#ede9fe' : '#e0f2fe', color: c.tierLabel === '대리점' ? '#6d28d9' : '#0369a1' }}>
                      {c.tierLabel}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Building2 size={13} color="var(--primary)" />
                      {c.customerName}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{c.orderCount}건</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#0284c7' }}>{c.forkliftUnits}대</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>₩{c.netSales.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#d97706', fontWeight: 700 }}>₩{c.cogs.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 800 }}>₩{c.grossMargin.toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2563eb', fontWeight: 800 }}>{c.marginPct.toFixed(1)}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: c.receivableAmount > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                    ₩{c.receivableAmount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* TAB 4: 건별·차대별 매출이익 상세 */}
        {viewMode === 'ORDER' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>상세</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>상태</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>수주번호 / 일자</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>거래처명</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>품목 명세</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>출고 차대번호</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>판매금액</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매입원가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출총이익</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>이익률</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrderRows.map(r => (
                <tr key={r.order.id} style={{ borderBottom: '1px solid var(--border-color)', height: '42px' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      onClick={() => setSelectedOrderDetailId(r.order.id)}
                      style={{
                        padding: '4px 9px',
                        backgroundColor: 'var(--bg-app)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Eye size={12} />
                      원가상세
 </button>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: r.order.status === 'DELIVERED' ? '#dcfce7' : r.order.status === 'SHIPPED' ? '#dbeafe' : '#fef3c7',
                      color: r.order.status === 'DELIVERED' ? '#15803d' : r.order.status === 'SHIPPED' ? '#1d4ed8' : '#b45309'
                    }}>
                      {r.order.status === 'DELIVERED' ? '납품완료' : r.order.status === 'SHIPPED' ? '배송중' : '수주확정'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{r.order.id}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(r.order.orderDate || r.order.createdAt || '').split('T')[0]}</div>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {r.customerName}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                    {r.itemSummary}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    {r.serialNumbers.join(', ') || '-'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)' }}>
                    ₩{r.netSales.toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#d97706' }}>
                    ₩{r.cogs.toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: r.grossMargin >= 0 ? '#16a34a' : '#dc2626' }}>
                    ₩{r.grossMargin.toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>
                    {r.marginPct.toFixed(1)}%
 </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom Conservation Verification Bar */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        fontSize: '13px',
        fontWeight: 700
      }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>총매출액: <strong style={{ color: 'var(--text-main)' }}>₩{(viewMode === 'CONTRACT_TYPE' ? contractTypeSummary.totalRev : totals.totalRev).toLocaleString()}</strong></span>
          <span>=</span>
          <span>총원가: <strong style={{ color: '#d97706' }}>₩{(viewMode === 'CONTRACT_TYPE' ? contractTypeSummary.totalCost : totals.totalCogs).toLocaleString()}</strong>{viewMode === 'CONTRACT_TYPE' ? ` [렌탈원가 ₩${contractTypeSummary.rentalCost.toLocaleString()} + 유통원가 ₩${contractTypeSummary.tradeCost.toLocaleString()}]` : ''}</span>
          <span>+</span>
          <span>매출총이익: <strong style={{ color: '#16a34a' }}>₩{(viewMode === 'CONTRACT_TYPE' ? contractTypeSummary.totalProfit : totals.grossMargin).toLocaleString()} · 이익률 {(viewMode === 'CONTRACT_TYPE' ? contractTypeSummary.totalMarginRate : totals.marginPct).toFixed(1)}%</strong></span>
        </div>
        <div style={{ color: '#16a34a', fontWeight: 800 }}>
          수지 대차 차액: ₩{(viewMode === 'CONTRACT_TYPE' ? contractTypeSummary.conservationDiff : totals.conservationDiff).toLocaleString()}
        </div>
      </div>

      {/* Modal 1: 수주 건별 원가/손익 상세 모달 */}
      {selectedDetailRow && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '640px', borderRadius: '10px', padding: '22px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                수주건별 손익 및 차대번호 원가 상세 · {selectedDetailRow.order.id}
              </h3>
              <button onClick={() => setSelectedOrderDetailId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <div><strong>거래처:</strong> {selectedDetailRow.customerName}</div>
                <div><strong>수주일:</strong> {(selectedDetailRow.order.orderDate || '').split('T')[0]}</div>
                <div><strong>판매금액:</strong> ₩{selectedDetailRow.netSales.toLocaleString()}</div>
                <div><strong>매출총이익:</strong> <span style={{ color: '#16a34a', fontWeight: 800 }}>₩{selectedDetailRow.grossMargin.toLocaleString()} ({selectedDetailRow.marginPct.toFixed(1)}%)</span></div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '7px', textAlign: 'left' }}>제품명</th>
                    <th style={{ padding: '7px', textAlign: 'left' }}>출고 차대번호</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>수량</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>매입원가</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>판매단가</th>
                    <th style={{ padding: '7px', textAlign: 'right' }}>판매합계</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDetailRow.lines.map(l => {
                    const prod = products.find(p => p.id === l.productId);
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '7px', fontWeight: 700 }}>[{prod?.skuCode}] {prod?.name}</td>
                        <td style={{ padding: '7px', fontFamily: 'monospace' }}>{(l.serialNumbers || []).join(', ') || '-'}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>{l.qty}{prod?.unit || '대'}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>₩{(l.unitCogs || prod?.standardCost || 0).toLocaleString()}</td>
                        <td style={{ padding: '7px', textAlign: 'right' }}>₩{l.unitPrice.toLocaleString()}</td>
                        <td style={{ padding: '7px', textAlign: 'right', fontWeight: 700 }}>₩{(l.qty * l.unitPrice).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={() => setSelectedOrderDetailId(null)}
                style={{ padding: '7px 16px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
              >
                닫기
 </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: 수익성 분석 정식 보고서 미리보기 및 출력 모달 */}
      {isReportModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px' }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            width: '960px',
            maxWidth: '96vw',
            maxHeight: '92vh',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ padding: '14px 20px', backgroundColor: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} />
                영업실적 및 매출총이익 종합 보고서 (미리보기 및 인쇄)
 </h3>
              <button onClick={() => setIsReportModalOpen(false)} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '24px', backgroundColor: '#ffffff', color: '#0f172a' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px', marginBottom: '18px' }}>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, letterSpacing: '4px' }}>영업실적 및 매출총이익 종합 보고서</h1>
                <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px' }}>
                  조회기간: {startDate || '전체'} ~ {endDate || '전체'} | 작성일: {new Date().toISOString().split('T')[0]}
                </div>
              </div>

              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
                1. 월별 매입 · 지게차 판매대수 · 매출총이익 요약
 </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>기준연월</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>해외수입액</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>국내매입액</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>총매입액</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>지게차 판매대수</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>매출액</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>매출원가</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>매출총이익</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyPerformanceRows.map(m => (
                    <tr key={m.yearMonth}>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700 }}>{m.yearMonth}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{m.importPurchaseAmt.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{m.domesticPurchaseAmt.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{m.totalPurchaseAmt.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{m.forkliftSoldUnits}대</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{m.salesAmount.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{m.cogsAmount.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 800, color: '#15803d' }}>{m.grossProfit.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{m.grossMarginPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
                2. 제조사 · 모델별 매출현황
 </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>제조사</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>모델명</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>제품명</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>판매수량</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>매출액</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>매출원가</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>매출총이익</th>
                    <th style={{ padding: '7px', border: '1px solid #cbd5e1' }}>이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {productProfitRows.map(p => (
                    <tr key={p.productId}>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', fontWeight: 700 }}>{p.manufacturer}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', fontFamily: 'monospace' }}>{p.modelName}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1' }}>{p.productName}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{p.soldQty}{p.unit}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{p.netSales.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{p.cogs.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{p.grossMargin.toLocaleString()}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700 }}>{p.marginPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 20px', backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsReportModalOpen(false)}
                style={{ padding: '8px 16px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                닫기
 </button>
              <button
                onClick={handleExcelDownload}
                style={{ padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} />
                보고서 데이터 엑셀 다운로드
 </button>
              <button
                onClick={handlePrintFormalReport}
                style={{ padding: '8px 18px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Printer size={14} />
                A4 정식 보고서 인쇄
 </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeProfitabilityPage;
