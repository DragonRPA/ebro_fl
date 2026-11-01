import React, { useState, useMemo } from 'react';
import {
  ShoppingCart, Plus, Download, Search, RefreshCw, CheckCircle2,
  Clock, Ban, Edit2, Trash2, X, Check, PackageCheck, FileCheck, Ship, Calculator
} from 'lucide-react';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { TradePurchase, TradePurchaseItem } from '../../services/db';
import { exportToExcel } from '../../services/excel';
import { createHangulMatcher } from '../../utils/hangulSearch';

interface DraftPurchaseLine {
  key: string;
  id?: string;
  productId: string;
  qty: number;
  foreignUnitCost: number;
  unitCost: number;
  warehouseName: string;
  serialNumbersText: string;
  memo: string;
}

export const TradePurchasesPage: React.FC = () => {
  const { vendors, currentUser, showErrorModal } = useApp();
  const {
    products,
    purchases,
    purchaseItems,
    getVendorName,
    createPurchase,
    updatePurchase,
    acceptPurchase,
    confirmInbound,
    cancelPurchase,
    deletePurchase
  } = useTrade();

  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3200);
  };

  // Vendor list with FL fallback
  const vendorOptions = useMemo(() => {
    const flVendors = [
      { id: 'VEND-CN-BYD', name: '중국 비와이디 포크리프트 본사', bizRegNo: 'CN-BYD-8801' },
      { id: 'VEND-CN-CHL', name: '안후이 헬리 공업집단 수출공사', bizRegNo: 'CN-CHL-7702' },
      { id: 'VEND-CN-EP', name: '항저우 이피 이큅먼트 유한공사', bizRegNo: 'CN-EPE-6603' },
      { id: 'VEND-KR-HD', name: '현대제뉴인 부품총판', bizRegNo: '124-81-55219' },
      { id: 'VEND-KR-BAT', name: '한국산업배터리 주식회사', bizRegNo: '215-86-33910' }
    ];
    if (vendors && vendors.length > 0) {
      const merged: Array<{ id: string; name: string; bizRegNo?: string }> = [...flVendors];
      vendors.forEach(v => {
        if (!merged.some(m => m.id === v.id)) merged.push({ id: v.id, name: v.name, bizRegNo: v.bizRegNo });
      });
      return merged;
    }
    return flVendors;
  }, [vendors]);

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [purchaseTypeFilter, setPurchaseTypeFilter] = useState<'ALL' | 'IMPORT' | 'DOMESTIC'>('ALL');
  const [vendorFilter, setVendorFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REQUESTED' | 'ORDERED' | 'PARTIAL_RECEIVED' | 'RECEIVED' | 'CANCELLED'>('ALL');

  // Purchase Create/Edit Modal state
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<TradePurchase | null>(null);
  const [formPurchaseType, setFormPurchaseType] = useState<'IMPORT' | 'DOMESTIC'>('IMPORT');
  const [formCurrency, setFormCurrency] = useState<'KRW' | 'CNY' | 'USD'>('CNY');
  const [formExchangeRate, setFormExchangeRate] = useState<number>(195);
  const [formCustomsDuty, setFormCustomsDuty] = useState<number>(0);
  const [formCustomsClearanceFee, setFormCustomsClearanceFee] = useState<number>(0);
  const [formFreightCost, setFormFreightCost] = useState<number>(0);
  const [formOtherIncidentalCost, setFormOtherIncidentalCost] = useState<number>(0);
  const [formWarehouseName, setFormWarehouseName] = useState<string>('A창고');
  const [formBlNumber, setFormBlNumber] = useState<string>('');
  const [formVendorId, setFormVendorId] = useState<string>('');
  const [formOrderDate, setFormOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formExpectedDate, setFormExpectedDate] = useState<string>(new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]);
  const [formStatus, setFormStatus] = useState<'REQUESTED' | 'ORDERED'>('ORDERED');
  const [formRequester, setFormRequester] = useState<string>('');
  const [formMemo, setFormMemo] = useState<string>('');
  const [formLines, setFormLines] = useState<DraftPurchaseLine[]>([]);

  // Inbound Inspection Modal state
  const [inboundTarget, setInboundTarget] = useState<{
    purchase: TradePurchase;
    item: TradePurchaseItem;
    productName: string;
  } | null>(null);
  const [inboundQty, setInboundQty] = useState<number>(0);
  const [inboundCost, setInboundCost] = useState<number>(0);
  const [inboundWarehouse, setInboundWarehouse] = useState<string>('A창고');
  const [inboundSerialsText, setInboundSerialsText] = useState<string>('');
  const [inboundDate, setInboundDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Open Create Purchase Modal
  const openCreateModal = () => {
    if (products.length === 0) {
      showErrorModal('등록된 제품이 없습니다. 먼저 [제품 및 재고관리]에서 제품을 등록해 주세요.');
      return;
    }
    const firstProd = products.find(p => p.status === 'ACTIVE') || products[0];
    const isImportProd = firstProd.originCountry === '중국 수입';
    const defaultRate = isImportProd ? 195 : 1;
    const defaultBaseCost = firstProd.standardCost ?? Math.round(firstProd.standardPrice * 0.7);
    const defaultForeignCost = isImportProd ? Math.round(defaultBaseCost / defaultRate) : defaultBaseCost;

    setEditingPurchase(null);
    setFormPurchaseType(isImportProd ? 'IMPORT' : 'DOMESTIC');
    setFormCurrency(isImportProd ? 'CNY' : 'KRW');
    setFormExchangeRate(defaultRate);
    setFormCustomsDuty(0);
    setFormCustomsClearanceFee(0);
    setFormFreightCost(0);
    setFormOtherIncidentalCost(0);
    setFormWarehouseName(firstProd.defaultWarehouse || 'A창고');
    setFormBlNumber('');
    setFormVendorId(vendorOptions[0]?.id || 'VEND-CN-BYD');
    const today = new Date().toISOString().split('T')[0];
    setFormOrderDate(today);
    setFormExpectedDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setFormStatus('ORDERED');
    setFormRequester(currentUser?.name || '수입·구매팀');
    setFormMemo('');
    setFormLines([
      {
        key: `line-${Date.now()}`,
        productId: firstProd.id,
        qty: 1,
        foreignUnitCost: defaultForeignCost,
        unitCost: defaultBaseCost,
        warehouseName: firstProd.defaultWarehouse || 'A창고',
        serialNumbersText: '',
        memo: ''
      }
    ]);
    setIsPurchaseModalOpen(true);
  };

  // Open Edit Purchase Modal
  const openEditModal = (purchase: TradePurchase) => {
    const pItems = purchaseItems.filter(pi => pi.purchaseId === purchase.id);
    const isImp = purchase.purchaseType === 'IMPORT' || (purchase.currency && purchase.currency !== 'KRW');
    const rate = purchase.exchangeRate || (isImp ? 195 : 1);

    setEditingPurchase(purchase);
    setFormPurchaseType(isImp ? 'IMPORT' : 'DOMESTIC');
    setFormCurrency(purchase.currency || (isImp ? 'CNY' : 'KRW'));
    setFormExchangeRate(rate);
    setFormCustomsDuty(purchase.customsDuty || 0);
    setFormCustomsClearanceFee(purchase.customsClearanceFee || 0);
    setFormFreightCost(purchase.freightCost || 0);
    setFormOtherIncidentalCost(purchase.otherIncidentalCost || 0);
    setFormWarehouseName(purchase.warehouseName || 'A창고');
    setFormBlNumber(purchase.blNumber || '');
    setFormVendorId(purchase.vendorId);
    setFormOrderDate(purchase.orderDate);
    setFormExpectedDate(purchase.expectedDate || purchase.orderDate);
    setFormStatus(purchase.status === 'REQUESTED' ? 'REQUESTED' : 'ORDERED');
    setFormRequester(purchase.requesterName || currentUser?.name || '수입·구매팀');
    setFormMemo(purchase.memo || '');
    setFormLines(
      pItems.map(pi => ({
        key: pi.id,
        id: pi.id,
        productId: pi.productId,
        qty: pi.orderQty,
        foreignUnitCost: pi.foreignUnitCost ?? (rate > 1 ? Math.round(pi.unitCost / rate) : pi.unitCost),
        unitCost: pi.unitCost,
        warehouseName: pi.warehouseName || purchase.warehouseName || 'A창고',
        serialNumbersText: (pi.serialNumbers || []).join(', '),
        memo: pi.memo || ''
      }))
    );
    setIsPurchaseModalOpen(true);
  };

  const handleAddDraftLine = () => {
    const firstProd = products.find(p => p.status === 'ACTIVE') || products[0];
    if (!firstProd) return;
    const defaultCost = firstProd.standardCost ?? Math.round(firstProd.standardPrice * 0.7);
    const defaultForeign = formPurchaseType === 'IMPORT' && formExchangeRate > 1
      ? Math.round(defaultCost / formExchangeRate)
      : defaultCost;
    setFormLines(prev => [
      ...prev,
      {
        key: `line-${Date.now()}-${Math.random()}`,
        productId: firstProd.id,
        qty: 1,
        foreignUnitCost: defaultForeign,
        unitCost: defaultCost,
        warehouseName: firstProd.defaultWarehouse || formWarehouseName || 'A창고',
        serialNumbersText: '',
        memo: ''
      }
    ]);
  };

  const handleRemoveDraftLine = (key: string) => {
    if (formLines.length <= 1) return;
    setFormLines(prev => prev.filter(l => l.key !== key));
  };

  const handleLineProductChange = (key: string, nextProductId: string) => {
    const prod = products.find(p => p.id === nextProductId);
    const defaultCost = prod ? (prod.standardCost ?? Math.round(prod.standardPrice * 0.7)) : 0;
    const defaultForeign = formPurchaseType === 'IMPORT' && formExchangeRate > 1
      ? Math.round(defaultCost / formExchangeRate)
      : defaultCost;
    setFormLines(prev =>
      prev.map(l =>
        l.key === key
          ? {
              ...l,
              productId: nextProductId,
              foreignUnitCost: defaultForeign,
              unitCost: defaultCost,
              warehouseName: prod?.defaultWarehouse || l.warehouseName
            }
          : l
      )
    );
  };

  // 부대비용 및 품목별 도착원가 자동 계산
  const totalIncidentalCost = useMemo(() => {
    if (formPurchaseType !== 'IMPORT') return 0;
    return (
      Math.max(0, Number(formCustomsDuty) || 0) +
      Math.max(0, Number(formCustomsClearanceFee) || 0) +
      Math.max(0, Number(formFreightCost) || 0) +
      Math.max(0, Number(formOtherIncidentalCost) || 0)
    );
  }, [formPurchaseType, formCustomsDuty, formCustomsClearanceFee, formFreightCost, formOtherIncidentalCost]);

  const computedDraftLines = useMemo(() => {
    const effectiveRate = formPurchaseType === 'IMPORT' ? Math.max(0.01, Number(formExchangeRate) || 1) : 1;
    const baseKrwTotal = formLines.reduce((sum, l) => {
      const baseKrwUnit = formPurchaseType === 'IMPORT' ? Math.round(l.foreignUnitCost * effectiveRate) : l.unitCost;
      return sum + baseKrwUnit * Math.max(1, l.qty);
    }, 0);

    return formLines.map(l => {
      const qty = Math.max(1, l.qty);
      const baseKrwUnit = formPurchaseType === 'IMPORT' ? Math.round(l.foreignUnitCost * effectiveRate) : l.unitCost;
      const lineBaseKrw = baseKrwUnit * qty;
      const allocatedIncidentalTotal =
        formPurchaseType === 'IMPORT' && totalIncidentalCost > 0 && baseKrwTotal > 0
          ? Math.round((totalIncidentalCost * lineBaseKrw) / baseKrwTotal)
          : 0;
      const incidentalPerUnit = qty > 0 ? Math.round(allocatedIncidentalTotal / qty) : 0;
      const landedUnitCost = baseKrwUnit + incidentalPerUnit;
      const landedLineSupply = landedUnitCost * qty;
      return {
        ...l,
        baseKrwUnit,
        incidentalPerUnit,
        landedUnitCost,
        landedLineSupply
      };
    });
  }, [formLines, formPurchaseType, formExchangeRate, totalIncidentalCost]);

  const draftForeignTotal = useMemo(() => {
    return formLines.reduce((s, l) => s + l.qty * l.foreignUnitCost, 0);
  }, [formLines]);

  const draftTotalSupply = useMemo(() => {
    return computedDraftLines.reduce((s, l) => s + l.landedLineSupply, 0);
  }, [computedDraftLines]);

  const draftTotalVat = Math.round(draftTotalSupply * 0.1);

  const handleSavePurchaseModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVendorId) {
      showErrorModal('매입처(공급사)를 선택해 주세요.');
      return;
    }
    if (formLines.length === 0) {
      showErrorModal('최소 1개 이상의 발주 품목을 입력해 주세요.');
      return;
    }
    for (const line of computedDraftLines) {
      if (!line.productId || line.qty <= 0 || line.landedUnitCost < 0) {
        showErrorModal('모든 품목의 수량(1개 이상) 및 단가를 올바르게 입력해 주세요.');
        return;
      }
    }

    try {
      if (editingPurchase) {
        await updatePurchase(
          editingPurchase.id,
          {
            vendorId: formVendorId,
            orderDate: formOrderDate,
            expectedDate: formExpectedDate,
            status:
              editingPurchase.status === 'RECEIVED' || editingPurchase.status === 'PARTIAL_RECEIVED'
                ? editingPurchase.status
                : formStatus,
            requesterName: formRequester,
            memo: formMemo,
            purchaseType: formPurchaseType,
            currency: formPurchaseType === 'IMPORT' ? formCurrency : 'KRW',
            exchangeRate: formPurchaseType === 'IMPORT' ? formExchangeRate : 1,
            foreignTotalAmount: formPurchaseType === 'IMPORT' ? draftForeignTotal : draftTotalSupply,
            customsDuty: formPurchaseType === 'IMPORT' ? formCustomsDuty : 0,
            customsClearanceFee: formPurchaseType === 'IMPORT' ? formCustomsClearanceFee : 0,
            freightCost: formPurchaseType === 'IMPORT' ? formFreightCost : 0,
            otherIncidentalCost: formPurchaseType === 'IMPORT' ? formOtherIncidentalCost : 0,
            totalIncidentalCost,
            landedTotalAmount: draftTotalSupply,
            warehouseName: formWarehouseName,
            blNumber: formBlNumber
          },
          computedDraftLines.map(l => ({
            id: l.id,
            productId: l.productId,
            orderQty: l.qty,
            unitCost: l.landedUnitCost,
            foreignUnitCost: formPurchaseType === 'IMPORT' ? l.foreignUnitCost : l.landedUnitCost,
            incidentalCostPerUnit: l.incidentalPerUnit,
            landedUnitCost: l.landedUnitCost,
            warehouseName: l.warehouseName || formWarehouseName,
            serialNumbers: l.serialNumbersText
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            memo: l.memo
          }))
        );
        showToast(`발주번호 [${editingPurchase.id}] 내역 및 도착원가가 수정되었습니다.`);
      } else {
        const created = await createPurchase(
          formVendorId,
          computedDraftLines.map(l => ({
            productId: l.productId,
            qty: l.qty,
            unitCost: l.landedUnitCost,
            foreignUnitCost: formPurchaseType === 'IMPORT' ? l.foreignUnitCost : l.landedUnitCost,
            incidentalCostPerUnit: l.incidentalPerUnit,
            landedUnitCost: l.landedUnitCost,
            warehouseName: l.warehouseName || formWarehouseName,
            serialNumbers: l.serialNumbersText
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            memo: l.memo
          })),
          {
            orderDate: formOrderDate,
            expectedDate: formExpectedDate,
            status: formStatus,
            requesterName: formRequester,
            memo: formMemo,
            purchaseType: formPurchaseType,
            currency: formPurchaseType === 'IMPORT' ? formCurrency : 'KRW',
            exchangeRate: formPurchaseType === 'IMPORT' ? formExchangeRate : 1,
            customsDuty: formPurchaseType === 'IMPORT' ? formCustomsDuty : 0,
            customsClearanceFee: formPurchaseType === 'IMPORT' ? formCustomsClearanceFee : 0,
            freightCost: formPurchaseType === 'IMPORT' ? formFreightCost : 0,
            otherIncidentalCost: formPurchaseType === 'IMPORT' ? formOtherIncidentalCost : 0,
            warehouseName: formWarehouseName,
            blNumber: formBlNumber
          }
        );
        showToast(`신규 발주 [${created.id}] (${computedDraftLines.length}건 품목) 등록이 완료되었습니다.`);
      }
      setIsPurchaseModalOpen(false);
    } catch (err: any) {
      showErrorModal(err.message || '발주 저장 실패');
    }
  };

  // Accept Purchase
  const handleAcceptPurchase = async (p: TradePurchase) => {
    try {
      await acceptPurchase(p.id);
      showToast(`발주번호 [${p.id}] 건이 정상 접수 처리되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '발주 접수 실패');
    }
  };

  // Direct 1-click Full Inbound Confirm
  const handleQuickConfirmInbound = async (p: TradePurchase, pi: TradePurchaseItem, prodName: string) => {
    const remainQty = Math.max(0, pi.orderQty - pi.receivedQty);
    if (remainQty <= 0) {
      showErrorModal('이미 전량 입고 완료된 품목입니다.');
      return;
    }
    try {
      await confirmInbound(p.id, [
        {
          productId: pi.productId,
          qty: remainQty,
          unitCost: pi.landedUnitCost || pi.unitCost,
          warehouseName: pi.warehouseName || p.warehouseName || 'A창고',
          serialNumbers: pi.serialNumbers
        }
      ]);
      showToast(`[${prodName}] ${remainQty.toLocaleString()}개 입고 검수 확정 및 차대번호 재고 반영이 완료되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '입고 확정 실패');
    }
  };

  // Open Detailed Inbound Modal
  const openInboundModal = (p: TradePurchase, pi: TradePurchaseItem, prodName: string) => {
    const remainQty = Math.max(1, pi.orderQty - pi.receivedQty);
    setInboundTarget({ purchase: p, item: pi, productName: prodName });
    setInboundQty(remainQty);
    setInboundCost(pi.landedUnitCost || pi.unitCost);
    setInboundWarehouse(pi.warehouseName || p.warehouseName || 'A창고');
    setInboundSerialsText((pi.serialNumbers || []).join(', '));
    setInboundDate(new Date().toISOString().split('T')[0]);
  };

  const handleConfirmInboundModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboundTarget) return;
    if (inboundQty <= 0) {
      showErrorModal('입고 수량은 1개 이상이어야 합니다.');
      return;
    }
    try {
      const serials = inboundSerialsText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      await confirmInbound(
        inboundTarget.purchase.id,
        [
          {
            productId: inboundTarget.item.productId,
            qty: inboundQty,
            unitCost: inboundCost,
            warehouseName: inboundWarehouse,
            serialNumbers: serials.length > 0 ? serials : undefined
          }
        ],
        inboundDate
      );
      showToast(`[${inboundTarget.productName}] ${inboundQty.toLocaleString()}개 입고 처리가 완료되었습니다.`);
      setInboundTarget(null);
    } catch (err: any) {
      showErrorModal(err.message || '입고 확정 실패');
    }
  };

  // Cancel Purchase Item
  const handleCancelPurchase = async (p: TradePurchase, pi: TradePurchaseItem, prodName: string) => {
    if (!window.confirm(`발주번호 [${p.id}]의 품목 [${prodName}] 건을 취소하시겠습니까?\n(입고된 재고가 있을 경우 미사용 로트가 회수됩니다.)`)) return;
    try {
      await cancelPurchase(p.id, '담당자 발주 취소', pi.id);
      showToast(`발주번호 [${p.id}] 품목 [${prodName}] 건이 취소 처리되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '발주 취소 실패');
    }
  };

  // Delete Purchase Item
  const handleDeletePurchase = async (p: TradePurchase, pi: TradePurchaseItem, prodName: string) => {
    if (!window.confirm(`발주번호 [${p.id}]의 품목 [${prodName}] 내역을 삭제하시겠습니까?`)) return;
    try {
      await deletePurchase(p.id, pi.id);
      showToast(`발주번호 [${p.id}] 품목 [${prodName}] 내역이 삭제되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '발주 삭제 실패');
    }
  };

  // Flatten rows
  const enrichedRows = useMemo(() => {
    return purchaseItems
      .map(pi => {
        const p = purchases.find(x => x.id === pi.purchaseId);
        if (!p) return null;
        const prod = products.find(x => x.id === pi.productId);
        const vendorName = getVendorName(p.vendorId);
        const isImport = p.purchaseType === 'IMPORT' || (p.currency && p.currency !== 'KRW');
        const effectiveUnitCost = pi.landedUnitCost || pi.unitCost;
        const supplyAmt = pi.orderQty * effectiveUnitCost;
        const vatAmt = Math.round(supplyAmt * 0.1);
        const totalAmt = supplyAmt + vatAmt;
        const remainQty = Math.max(0, pi.orderQty - pi.receivedQty);
        return {
          pi,
          p,
          prod,
          isImport,
          productName: prod?.name || '미지정 제품',
          skuCode: prod?.skuCode || '-',
          unit: prod?.unit || '대',
          vendorName,
          effectiveUnitCost,
          supplyAmt,
          vatAmt,
          totalAmt,
          remainQty
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.p.orderDate.localeCompare(a.p.orderDate));
  }, [purchaseItems, purchases, products, getVendorName]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const matcher = searchTerm.trim() ? createHangulMatcher(searchTerm.trim()) : null;
    return enrichedRows.filter(row => {
      if (startDate && row.p.orderDate < startDate) return false;
      if (endDate && row.p.orderDate > endDate) return false;
      if (purchaseTypeFilter === 'IMPORT' && !row.isImport) return false;
      if (purchaseTypeFilter === 'DOMESTIC' && row.isImport) return false;
      if (vendorFilter !== 'ALL' && row.p.vendorId !== vendorFilter) return false;
      if (productFilter !== 'ALL' && row.pi.productId !== productFilter) return false;
      if (statusFilter !== 'ALL' && row.p.status !== statusFilter) return false;

      if (matcher) {
        const serialStr = (row.pi.serialNumbers || []).join(' ');
        const hit =
          matcher(row.p.id) ||
          matcher(row.vendorName) ||
          matcher(row.productName) ||
          matcher(row.skuCode) ||
          matcher(row.p.blNumber || '') ||
          matcher(serialStr) ||
          matcher(row.p.requesterName || '') ||
          matcher(row.p.memo || '') ||
          matcher(row.pi.memo || '');
        if (!hit) return false;
      }
      return true;
    });
  }, [enrichedRows, startDate, endDate, purchaseTypeFilter, vendorFilter, productFilter, statusFilter, searchTerm]);

  // KPI metrics
  const kpi = useMemo(() => {
    const activeRows = enrichedRows.filter(r => r.p.status !== 'CANCELLED');
    const importSupplyAmt = activeRows.filter(r => r.isImport).reduce((s, r) => s + r.supplyAmt, 0);
    const domesticSupplyAmt = activeRows.filter(r => !r.isImport).reduce((s, r) => s + r.supplyAmt, 0);
    const totalIncidental = purchases
      .filter(p => p.status !== 'CANCELLED')
      .reduce((s, p) => s + (p.totalIncidentalCost || 0), 0);
    const totalPurchaseAmt = activeRows.reduce((s, r) => s + r.totalAmt, 0);
    return {
      totalItems: enrichedRows.length,
      importSupplyAmt,
      domesticSupplyAmt,
      totalIncidental,
      totalPurchaseAmt
    };
  }, [enrichedRows, purchases]);

  // Excel Export
  const handleExportExcel = () => {
    const data = filteredRows.map((r, idx) => ({
      순번: idx + 1,
      조달구분: r.isImport ? '해외수입' : '국내매입',
      발주번호: r.p.id,
      발주일자: r.p.orderDate,
      입고완료일: r.p.receivedDate || '-',
      매입처명: r.vendorName,
      입고창고: r.pi.warehouseName || r.p.warehouseName || 'A창고',
      품목코드: r.skuCode,
      제품명: r.productName,
      단위: r.unit,
      발주수량: r.pi.orderQty,
      입고수량: r.pi.receivedQty,
      결제통화: r.p.currency || 'KRW',
      외화단가: r.pi.foreignUnitCost || r.effectiveUnitCost,
      적용환율: r.p.exchangeRate || 1,
      대당부대비용: r.pi.incidentalCostPerUnit || 0,
      도착원가단가: r.effectiveUnitCost,
      공급가액: r.supplyAmt,
      부가세: r.vatAmt,
      합계금액: r.totalAmt,
      차대번호목록: (r.pi.serialNumbers || []).join(', ') || '-',
      통관번호: r.p.blNumber || '-',
      상태:
        r.p.status === 'RECEIVED'
          ? '입고완료'
          : r.p.status === 'PARTIAL_RECEIVED'
          ? '부분입고'
          : r.p.status === 'ORDERED'
          ? '발주접수'
          : r.p.status === 'REQUESTED'
          ? '발주요청'
          : '발주취소',
      담당자: r.p.requesterName || '-',
      비고: r.pi.memo || r.p.memo || ''
    }));
    exportToExcel(
      data,
      `국내매입_해외수입원가대장_${new Date().toISOString().split('T')[0]}`,
      '매입및수입원가대장'
    );
    showToast('국내매입 및 해외수입 원가 대장 엑셀 파일이 다운로드되었습니다.');
  };

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setPurchaseTypeFilter('ALL');
    setVendorFilter('ALL');
    setProductFilter('ALL');
    setSearchTerm('');
    setStatusFilter('ALL');
  };

  const hasActiveFilter =
    Boolean(startDate || endDate || searchTerm) ||
    purchaseTypeFilter !== 'ALL' ||
    vendorFilter !== 'ALL' ||
    productFilter !== 'ALL' ||
    statusFilter !== 'ALL';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px', backgroundColor: 'var(--bg-app)', padding: '16px 20px', overflow: 'hidden' }}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '10px 18px',
            borderRadius: '6px',
            backgroundColor: toast.type === 'error' ? '#dc2626' : '#059669',
            color: '#fff',
            fontWeight: 700,
            fontSize: '13px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)'
          }}
        >
          {toast.text}
        </div>
      )}

      {/* 1. 상단 헤더 및 파이프라인 액션 바 */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          flexShrink: 0
        }}
      >
        <div>
          <h2
            data-mid="trade_purchases-header"
            style={{
              fontSize: '18px',
              fontWeight: 800,
              margin: 0,
              color: 'var(--text-main)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap'
            }}
          >
            <ShoppingCart size={20} color="var(--primary)" />
            <span>국내매입 및 해외수입 원가관리</span>
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            data-mid="trade_purchases-add-btn"
            onClick={openCreateModal}
            className="btn-primary"
            style={{
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: 700,
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Plus size={15} /> 수입·매입 발주 등록
 </button>

          <button
            type="button"
            data-mid="trade_purchases-excel-btn"
            onClick={handleExportExcel}
            className="btn-excel-download"
            style={{
              padding: '7px 14px',
              fontSize: '12.5px',
              fontWeight: 700,
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Download size={14} /> 엑셀 다운로드
 </button>
        </div>
      </div>

      {/* 2. KPI 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: '12px', flexShrink: 0 }}>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>해외수입 도착원가 누계</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
            ₩{kpi.importSupplyAmt.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>수입 부대비용 합계</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#d97706', whiteSpace: 'nowrap' }}>
            ₩{kpi.totalIncidental.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>국내매입 원가 누계</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#059669', whiteSpace: 'nowrap' }}>
            ₩{kpi.domesticSupplyAmt.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>총 매입·수입 합계</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
            ₩{kpi.totalPurchaseAmt.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 3. 통합 조회 필터 바 */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>조달 구분</label>
          <select
            value={purchaseTypeFilter}
            onChange={e => setPurchaseTypeFilter(e.target.value as any)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 구분</option>
            <option value="IMPORT">해외수입</option>
            <option value="DOMESTIC">국내매입</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>발주 기간</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>~</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ padding: '5px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>매입처</label>
          <select
            value={vendorFilter}
            onChange={e => setVendorFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 매입처</option>
            {vendorOptions.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>제품 선택</label>
          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 제품</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>[{p.skuCode}] {p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>검색어</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '8px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="발주번호, 차대번호, 통관번호, 품명"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '6px 10px 6px 28px', fontSize: '12px', width: '210px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>진행 상태</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 상태</option>
            <option value="REQUESTED">발주요청</option>
            <option value="ORDERED">발주접수</option>
            <option value="PARTIAL_RECEIVED">부분입고</option>
            <option value="RECEIVED">입고완료</option>
            <option value="CANCELLED">발주취소</option>
          </select>
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            <RefreshCw size={12} /> 필터 초기화
 </button>
        )}
      </div>

      {/* 4. 고밀도 구매/입고 그리드 */}
      <div
        className="card"
        style={{
          flex: 1,
          margin: 0,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table
            data-mid="trade_purchases-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}
          >
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', width: '230px' }}>입고 / 업무 처리</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>구분</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>발주번호 / 일자</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>매입처</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>입고창고</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>품목코드 / 제품명</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>발주 / 입고</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>외화단가 · 환율</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>대당 부대비용</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>도착원가 단가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>도착원가 공급가액</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>입고 차대번호</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    조회된 국내매입 및 해외수입 원가 데이터가 없습니다.
 </td>
                </tr>
              ) : (
                filteredRows.map(({ p, pi, isImport, productName, skuCode, unit, vendorName, effectiveUnitCost, supplyAmt, remainQty }) => (
                  <tr key={pi.id} style={{ borderBottom: '1px solid var(--border-color)', height: '42px' }}>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {p.status === 'REQUESTED' && (
                          <button
                            type="button"
                            onClick={() => handleAcceptPurchase(p)}
                            style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: 'none', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            <FileCheck size={11} /> 접수승인
 </button>
                        )}

                        {(p.status === 'ORDERED' || p.status === 'REQUESTED' || p.status === 'PARTIAL_RECEIVED') && remainQty > 0 && (
                          <>
                            <button
                              type="button"
                              data-mid="trade_purchases-confirm-btn"
                              onClick={() => handleQuickConfirmInbound(p, pi, productName)}
                              className="btn-save"
                              style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <Check size={11} /> 입고 확정
 </button>
                            <button
                              type="button"
                              onClick={() => openInboundModal(p, pi, productName)}
                              style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid #059669', backgroundColor: '#ecfdf5', color: '#047857', cursor: 'pointer' }}
                            >
                              차대검수
 </button>
                          </>
                        )}

                        {p.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            style={{ padding: '4px 7px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                          >
                            <Edit2 size={11} /> 원가수정
 </button>
                        )}

                        {p.status !== 'CANCELLED' && !(pi.receivedQty === 0 && (pi.memo || '').includes('[품목취소')) && (
                          <button
                            type="button"
                            onClick={() => handleCancelPurchase(p, pi, productName)}
                            style={{ padding: '4px 7px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                          >
                            취소
 </button>
                        )}

                        {(p.status === 'CANCELLED' || p.status === 'REQUESTED' || p.status === 'ORDERED' || pi.receivedQty === 0) && (
                          <button
                            type="button"
                            onClick={() => handleDeletePurchase(p, pi, productName)}
                            style={{ padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: isImport ? '#dbeafe' : '#f1f5f9',
                          color: isImport ? '#1d4ed8' : '#334155',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        {isImport ? <><Ship size={11} /> 해외수입</> : '국내매입'}
                      </span>
                    </td>

                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{p.id}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.orderDate}</div>
                    </td>

                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-main)' }}>
                      {vendorName}
                    </td>

                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {pi.warehouseName || p.warehouseName || 'A창고'}
                    </td>

                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 700, marginRight: '6px', fontFamily: 'monospace' }}>[{skuCode}]</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{productName}</span>
                    </td>

                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                      <span>{pi.orderQty.toLocaleString()}</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>/</span>
                      <span style={{ color: pi.receivedQty >= pi.orderQty ? '#059669' : '#d97706' }}>
                        {pi.receivedQty.toLocaleString()}{unit}
                      </span>
                    </td>

                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {isImport && pi.foreignUnitCost ? (
                        <span>
                          {p.currency} {pi.foreignUnitCost.toLocaleString()} × ₩{p.exchangeRate || 195}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>원화 직매입</span>
                      )}
                    </td>

                    <td style={{ padding: '8px 12px', textAlign: 'right', color: pi.incidentalCostPerUnit ? '#d97706' : 'var(--text-muted)', fontWeight: 600 }}>
                      {pi.incidentalCostPerUnit ? `+₩${pi.incidentalCostPerUnit.toLocaleString()}` : '-'}
                    </td>

                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-main)' }}>
                      ₩{effectiveUnitCost.toLocaleString()}
                    </td>

                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                      ₩{supplyAmt.toLocaleString()}
                    </td>

                    <td style={{ padding: '8px 12px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {pi.serialNumbers && pi.serialNumbers.length > 0 ? (
                        <span>
                          {pi.serialNumbers[0]}
                          {pi.serialNumbers.length > 1 ? ` 외 ${pi.serialNumbers.length - 1}대` : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>부품 통합재고</span>
                      )}
                    </td>

                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor:
                            p.status === 'RECEIVED'
                              ? '#dcfce7'
                              : p.status === 'PARTIAL_RECEIVED'
                              ? '#fef3c7'
                              : p.status === 'CANCELLED'
                              ? '#fee2e2'
                              : '#dbeafe',
                          color:
                            p.status === 'RECEIVED'
                              ? '#166534'
                              : p.status === 'PARTIAL_RECEIVED'
                              ? '#b45309'
                              : p.status === 'CANCELLED'
                              ? '#991b1b'
                              : '#1d4ed8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        {p.status === 'RECEIVED' ? (
                          <><CheckCircle2 size={11} /> 입고완료</>
                        ) : p.status === 'PARTIAL_RECEIVED' ? (
                          <><Clock size={11} /> 부분입고</>
                        ) : p.status === 'CANCELLED' ? (
                          <><Ban size={11} /> 발주취소</>
                        ) : p.status === 'REQUESTED' ? (
                          <><Clock size={11} /> 발주요청</>
                        ) : (
                          <><PackageCheck size={11} /> 발주접수</>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '2px solid var(--border-color)', fontWeight: 800 }}>
                  <td colSpan={6} style={{ padding: '10px 12px', color: 'var(--text-main)' }}>
                    조회 합계 ({filteredRows.length}건)
 </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-main)' }}>
                    발주 {filteredRows.reduce((s, r) => s + r.pi.orderQty, 0).toLocaleString()} / 입고 {filteredRows.reduce((s, r) => s + r.pi.receivedQty, 0).toLocaleString()}
                  </td>
                  <td colSpan={3} />
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)' }}>
                    ₩{filteredRows.reduce((s, r) => s + r.supplyAmt, 0).toLocaleString()}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 5. 수입·매입 발주 및 도착원가 계산 모달 */}
      {isPurchaseModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '920px', maxWidth: '96vw', maxHeight: '92vh', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calculator size={18} color="var(--primary)" />
                <span>{editingPurchase ? `매입·수입 원가 및 발주 수정 · ${editingPurchase.id}` : '신규 국내매입 · 해외수입 원가 등록'}</span>
              </h3>
              <button type="button" onClick={() => setIsPurchaseModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePurchaseModal} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>조달 구분 *</label>
                  <select
                    value={formPurchaseType}
                    onChange={e => {
                      const nextType = e.target.value as 'IMPORT' | 'DOMESTIC';
                      setFormPurchaseType(nextType);
                      if (nextType === 'DOMESTIC') {
                        setFormCurrency('KRW');
                        setFormExchangeRate(1);
                      } else {
                        setFormCurrency('CNY');
                        setFormExchangeRate(195);
                      }
                    }}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                  >
                    <option value="IMPORT">해외수입</option>
                    <option value="DOMESTIC">국내매입</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>매입처 *</label>
                  <select
                    data-mid="trade_purchases-vendor-select"
                    value={formVendorId}
                    onChange={e => setFormVendorId(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 600 }}
                  >
                    {vendorOptions.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>기본 입고창고</label>
                  <select
                    value={formWarehouseName}
                    onChange={e => setFormWarehouseName(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 600 }}
                  >
                    <option value="A창고">A창고</option>
                    <option value="B창고">B창고</option>
                    <option value="부품창고">부품창고</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>발주일자 *</label>
                  <input
                    type="date"
                    required
                    value={formOrderDate}
                    onChange={e => setFormOrderDate(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>입고예정일</label>
                  <input
                    type="date"
                    value={formExpectedDate}
                    onChange={e => setFormExpectedDate(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              {/* 해외수입 선택 시: 외화 환율 및 통관·운임 부대비용 산출 박스 */}
              {formPurchaseType === 'IMPORT' && (
                <div style={{ padding: '14px 16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e40af' }}>
                      외화 환율 및 부대비용 계산
 </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/exchange-rate?currency=${formCurrency}&date=${formOrderDate || ''}`);
                            const json = await res.json();
                            if (json?.success && json?.data?.baseRate) {
                              setFormExchangeRate(Number(json.data.baseRate));
                              showToast(
                                `[${json.data.baseDate}] ${formCurrency} 매매기준율 ${json.data.baseRate}원 (송금환율 ${json.data.ttsRate}원 · ${json.data.source})이 자동 적용되었습니다.`
                              );
                            }
                          } catch {
                            showToast('기준환율 조회 중 일시적 오류가 발생하여 기본 환율을 유지합니다.', 'error');
                          }
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '5px',
                          border: '1px solid #2563eb',
                          backgroundColor: '#ffffff',
                          color: '#1d4ed8',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        일일 기준환율 자동불러오기
 </button>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>
                        부대비용 합계: ₩{totalIncidentalCost.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>결제 통화</label>
                      <select
                        value={formCurrency}
                        onChange={e => {
                          const c = e.target.value as 'CNY' | 'USD' | 'KRW';
                          setFormCurrency(c);
                          if (c === 'CNY') setFormExchangeRate(195);
                          if (c === 'USD') setFormExchangeRate(1380);
                          if (c === 'KRW') setFormExchangeRate(1);
                        }}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff', fontWeight: 700 }}
                      >
                        <option value="CNY">위안화 · CNY</option>
                        <option value="USD">달러화 · USD</option>
                        <option value="KRW">원화 · KRW</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>적용 환율</label>
                      <input
                        type="number"
                        step="0.1"
                        value={formExchangeRate}
                        onChange={e => setFormExchangeRate(Math.max(0.1, Number(e.target.value)))}
                        style={{ padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff', fontWeight: 700 }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>관세</label>
                      <input
                        type="number"
                        min={0}
                        value={formCustomsDuty}
                        onChange={e => setFormCustomsDuty(Math.max(0, Number(e.target.value)))}
                        style={{ padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>통관수수료</label>
                      <input
                        type="number"
                        min={0}
                        value={formCustomsClearanceFee}
                        onChange={e => setFormCustomsClearanceFee(Math.max(0, Number(e.target.value)))}
                        style={{ padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>해상·내륙운임</label>
                      <input
                        type="number"
                        min={0}
                        value={formFreightCost}
                        onChange={e => setFormFreightCost(Math.max(0, Number(e.target.value)))}
                        style={{ padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>기타 부대비용</label>
                      <input
                        type="number"
                        min={0}
                        value={formOtherIncidentalCost}
                        onChange={e => setFormOtherIncidentalCost(Math.max(0, Number(e.target.value)))}
                        style={{ padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', whiteSpace: 'nowrap' }}>통관 · 선하증권번호</label>
                      <input
                        type="text"
                        placeholder="예: BL-2026-0301"
                        value={formBlNumber}
                        onChange={e => setFormBlNumber(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 발주 품목 명세 테이블 */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>발주 품목 및 도착원가 명세 ({formLines.length}건)</span>
                  <button
                    type="button"
                    onClick={handleAddDraftLine}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={12} /> 품목 행 추가
 </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>제품 선택 *</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '75px' }}>수량 *</th>
                      {formPurchaseType === 'IMPORT' ? (
                        <>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '110px' }}>외화단가 · {formCurrency}</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '105px' }}>대당 부대비용</th>
                        </>
                      ) : null}
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '120px' }}>대당 도착원가</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '120px' }}>공급가액</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', width: '180px' }}>입고 차대번호</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: '45px' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedDraftLines.map(line => (
                      <tr key={line.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <select
                            data-mid="trade_purchases-product-select"
                            value={line.productId}
                            onChange={e => handleLineProductChange(line.key, e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 600 }}
                          >
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                [{p.skuCode}] {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="number"
                            data-mid="trade_purchases-qty-input"
                            min={1}
                            required
                            value={line.qty}
                            onChange={e => {
                              const val = Math.max(1, Number(e.target.value));
                              setFormLines(prev => prev.map(l => (l.key === line.key ? { ...l, qty: val } : l)));
                            }}
                            style={{ width: '100%', padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                          />
                        </td>
                        {formPurchaseType === 'IMPORT' ? (
                          <>
                            <td style={{ padding: '8px 10px' }}>
                              <input
                                type="number"
                                min={0}
                                value={line.foreignUnitCost}
                                onChange={e => {
                                  const val = Math.max(0, Number(e.target.value));
                                  setFormLines(prev => prev.map(l => (l.key === line.key ? { ...l, foreignUnitCost: val } : l)));
                                }}
                                style={{ width: '100%', padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: '#1d4ed8', fontWeight: 700 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#d97706', fontWeight: 700 }}>
                              +₩{line.incidentalPerUnit.toLocaleString()}
                            </td>
                          </>
                        ) : null}
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="number"
                            data-mid="trade_purchases-cost-input"
                            min={0}
                            readOnly={formPurchaseType === 'IMPORT'}
                            value={line.landedUnitCost}
                            onChange={e => {
                              const val = Math.max(0, Number(e.target.value));
                              setFormLines(prev => prev.map(l => (l.key === line.key ? { ...l, unitCost: val } : l)));
                            }}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              fontSize: '12px',
                              textAlign: 'right',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: formPurchaseType === 'IMPORT' ? 'var(--bg-secondary)' : 'var(--bg-app)',
                              color: 'var(--text-main)',
                              fontWeight: 700
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                          ₩{line.landedLineSupply.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <input
                            type="text"
                            placeholder="예: BYD-25-260301, BYD-25-260302"
                            value={line.serialNumbersText}
                            onChange={e => {
                              const val = e.target.value;
                              setFormLines(prev => prev.map(l => (l.key === line.key ? { ...l, serialNumbersText: val } : l)));
                            }}
                            style={{ width: '100%', padding: '6px 8px', fontSize: '11.5px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontFamily: 'monospace' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            disabled={formLines.length <= 1}
                            onClick={() => handleRemoveDraftLine(line.key)}
                            style={{ border: 'none', background: 'none', color: formLines.length <= 1 ? '#cbd5e1' : '#dc2626', cursor: formLines.length <= 1 ? 'default' : 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '20px', fontSize: '12.5px' }}>
                  {formPurchaseType === 'IMPORT' && (
                    <div>외화 합계: <strong>{formCurrency} {draftForeignTotal.toLocaleString()}</strong></div>
                  )}
                  <div>도착원가 공급가액: <strong>₩{draftTotalSupply.toLocaleString()}</strong></div>
                  <div>부가세: <strong>₩{draftTotalVat.toLocaleString()}</strong></div>
                  <div style={{ color: 'var(--primary)', fontWeight: 800 }}>총 매입합계: ₩{(draftTotalSupply + draftTotalVat).toLocaleString()}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>발주 담당자</label>
                  <input
                    type="text"
                    value={formRequester}
                    onChange={e => setFormRequester(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>통관 · 발주 비고</label>
                  <input
                    type="text"
                    value={formMemo}
                    onChange={e => setFormMemo(e.target.value)}
                    placeholder="인천항 통관 내역, 관세사 메모 등"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setIsPurchaseModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}
                >
                  취소
 </button>
                <button
                  type="submit"
                  data-mid="trade_purchases-modal-submit-btn"
                  className="btn-primary"
                  style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}
                >
                  {editingPurchase ? '원가 및 발주 수정 저장' : '발주 및 도착원가 확정'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. 입고 검수 / 차대번호 검수 모달 */}
      {inboundTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '500px', maxWidth: '95vw', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                입고 검수 및 차대번호 확정 · {inboundTarget.purchase.id}
              </h3>
              <button type="button" onClick={() => setInboundTarget(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmInboundModal} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{inboundTarget.productName}</div>
                <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                  발주수량: <strong>{inboundTarget.item.orderQty}</strong> | 기입고: <strong>{inboundTarget.item.receivedQty}</strong> | 잔여수량: <strong style={{ color: '#059669' }}>{inboundTarget.item.orderQty - inboundTarget.item.receivedQty}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>금회 입고 수량 *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={inboundTarget.item.orderQty - inboundTarget.item.receivedQty}
                    value={inboundQty}
                    onChange={e => setInboundQty(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>확정 도착원가 *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={inboundCost}
                    onChange={e => setInboundCost(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>입고 창고 *</label>
                  <select
                    value={inboundWarehouse}
                    onChange={e => setInboundWarehouse(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 600 }}
                  >
                    <option value="A창고">A창고</option>
                    <option value="B창고">B창고</option>
                    <option value="부품창고">부품창고</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>입고 차대번호 목록</label>
                <input
                  type="text"
                  value={inboundSerialsText}
                  onChange={e => setInboundSerialsText(e.target.value)}
                  placeholder="예: EP-15-260301, EP-15-260302"
                  style={{ padding: '8px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>실제 입고일자 *</label>
                <input
                  type="date"
                  required
                  value={inboundDate}
                  onChange={e => setInboundDate(e.target.value)}
                  style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setInboundTarget(null)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}
                >
                  취소
 </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}
                >
                  입고 확정 및 차대 재고 반영
 </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default TradePurchasesPage;
