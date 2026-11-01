import React, { useState, useMemo } from 'react';
import {
  Printer, Eye, FileText, CheckCircle, Package, X,
  Download, Search, RefreshCw, Plus, Edit2, Ban, Trash2, Check, LayoutGrid, List, SlidersHorizontal
} from 'lucide-react';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { db, TradeOutbound, AppliedForkliftOption, ForkliftOptionGroupType, ForkliftOptionMaster } from '../../services/db';
import { FORKLIFT_OPTION_GROUPS } from '../../data/forkliftOptionMastersData';
import { generateReceiptHtml } from '../../utils/receiptGenerator';
import { exportToExcel } from '../../services/excel';
import { createHangulMatcher } from '../../utils/hangulSearch';

export const TradeOutboundPage: React.FC = () => {
  const { customers, contracts, sites, contacts, currentUser, showErrorModal } = useApp();
  const {
    outbounds,
    salesOrders,
    salesOrderLines,
    products,
    optionMasters,
    getCustomerName,
    getCustomerById,
    getProductStock,
    createSalesOrder,
    createOutboundManual,
    allocateOutbound,
    packOutbound,
    updateOutbound,
    cancelOutbound,
    deleteOutbound,
    applyOptionsToOutbound
  } = useTrade();

  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3200);
  };

  const customerOptions = useMemo(() => {
    if (customers && customers.length > 0) return customers;
    return [{ id: 'CUST-001', name: '현대건설(주)' }];
  }, [customers]);

  // View mode ('GRID' | 'CARD')
  const [viewMode, setViewMode] = useState<'GRID' | 'CARD'>('GRID');

  // Filter states (기간, 고객사, 품명, 상태)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'REQUESTED' | 'ALLOCATED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'>('ALL');

  // Preview & Proof Modals
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  // Create / Edit Outbound Modal
  const [isOutboundModalOpen, setIsOutboundModalOpen] = useState(false);
  const [editingOutbound, setEditingOutbound] = useState<TradeOutbound | null>(null);
  const [formCreateMode, setFormCreateMode] = useState<'AUTO_ORDER' | 'EXISTING_ORDER'>('AUTO_ORDER');
  const [formOrderId, setFormOrderId] = useState<string>('');
  const [formContractId, setFormContractId] = useState<string>('');
  const [formCustomerId, setFormCustomerId] = useState<string>('');
  const [formSelectedItems, setFormSelectedItems] = useState<{ productId: string; quantity: number; unitPrice: number }[]>([]);
  const [formDeliveryType, setFormDeliveryType] = useState<'COURIER' | 'DIRECT' | 'BUNDLE_WITH_RENTAL'>('COURIER');
  const [formDestinationAddress, setFormDestinationAddress] = useState<string>('');
  const [formReceiverName, setFormReceiverName] = useState<string>('');
  const [formReceiverPhone, setFormReceiverPhone] = useState<string>('');
  const [formClosingMemo, setFormClosingMemo] = useState<string>('');
  const [formAppliedOptions, setFormAppliedOptions] = useState<AppliedForkliftOption[]>([]);
  const [formOptionCategoryFilter, setFormOptionCategoryFilter] = useState<'ALL' | ForkliftOptionGroupType>('ALL');

  // 전용 옵션 장착 및 청구 반영 모달 상태
  const [optionModalOutbound, setOptionModalOutbound] = useState<TradeOutbound | null>(null);
  const [modalAppliedOptions, setModalAppliedOptions] = useState<AppliedForkliftOption[]>([]);
  const [modalOptionGroupFilter, setModalOptionGroupFilter] = useState<'ALL' | ForkliftOptionGroupType>('ALL');
  const [modalOptionSearch, setModalOptionSearch] = useState('');

  const buildAppliedOptionFromMaster = (opt: ForkliftOptionMaster, useDealerPrice = false): AppliedForkliftOption => {
    const unitPrice = opt.isFreeDefault ? 0 : (useDealerPrice ? opt.dealerPrice : opt.unitPrice);
    return {
      optionId: opt.id,
      optionCode: opt.optionCode,
      optionGroup: opt.optionGroup,
      optionGroupLabel: opt.optionGroupLabel,
      domainTypeLabel: opt.domainTypeLabel,
      name: opt.name,
      subVariant: opt.subVariant,
      specDetail: opt.specDetail,
      qty: 1,
      costPrice: opt.costPrice,
      unitPrice,
      supplyAmount: unitPrice,
      isFreeApplied: opt.isFreeDefault,
      note: opt.subVariant
    };
  };

  const openOptionModal = (ob: TradeOutbound) => {
    const order = salesOrders.find(so => so.id === ob.orderId);
    const existingOpts = ob.appliedOptions || order?.appliedOptions || [];
    setOptionModalOutbound(ob);
    setModalAppliedOptions(existingOpts.map(item => ({ ...item })));
    setModalOptionGroupFilter('ALL');
    setModalOptionSearch('');
  };

  const handleSaveOptionModal = async () => {
    if (!optionModalOutbound) return;
    try {
      const normalized = modalAppliedOptions.map(opt => {
        const qty = Math.max(1, Number(opt.qty) || 1);
        const unitPrice = opt.isFreeApplied ? 0 : Math.max(0, Number(opt.unitPrice) || 0);
        return {
          ...opt,
          qty,
          unitPrice,
          supplyAmount: qty * unitPrice
        };
      });
      await applyOptionsToOutbound(optionModalOutbound.id, normalized);
      const totalOptionAmt = normalized.reduce((s, o) => s + (o.isFreeApplied ? 0 : o.supplyAmount), 0);
      showToast(
        `출고 [${optionModalOutbound.id}] 옵션 ${normalized.length}종 장착 및 청구추가액 ₩${totalOptionAmt.toLocaleString()}원이 수주·명세서에 자동 반영되었습니다.`
      );
      setOptionModalOutbound(null);
    } catch (err: any) {
      showErrorModal(err.message || '옵션 장착 및 청구 반영 실패');
    }
  };

  const getDeliveryForOutbound = (ob: TradeOutbound) => {
    const order = salesOrders.find(so => so.id === ob.orderId);
    const lines = salesOrderLines.filter(l => l.orderId === ob.orderId);
    const cust = getCustomerById(order?.customerId);
    const custName = getCustomerName(order?.customerId);
    const appliedOpts = ob.appliedOptions || order?.appliedOptions || [];

    const baseCargos = lines.map(l => {
      const prod = products.find(p => p.id === l.productId);
      return {
        modelName: `[${prod?.skuCode || '품목'}] ${prod?.name || '유통상품'}`,
        count: l.qty,
        note: `${l.unitPrice?.toLocaleString()}원 (정상 납품)`
      };
    });

    const optionCargos = appliedOpts.map(opt => ({
      modelName: `[장착옵션·${opt.optionGroupLabel}] ${opt.name} (${opt.subVariant})`,
      count: opt.qty,
      note: opt.isFreeApplied ? '무상기본시공 (₩0)' : `옵션청구 ₩${opt.supplyAmount.toLocaleString()}원`
    }));

    const cargos = [...baseCargos, ...optionCargos];

    const dlv = db.deliveries?.find(d => d.id === ob.id);
    return (
      dlv || {
        id: ob.id,
        contractId: ob.orderId,
        type: 'OUTBOUND',
        status: ob.status,
        loadingDate: ob.shippedAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        requestDate: ob.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        customerName: custName,
        destinationAddress: ob.destinationAddress || order?.deliveryLocation || cust?.address || '서울특별시 강남구 테헤란로 152',
        receiverName: ob.receiverName || order?.receiverName || cust?.representative || '인수담당자',
        receiverPhone: ob.receiverPhone || order?.receiverPhone || cust?.repContact || '010-0000-0000',
        driverName: ob.driverName || ob.courierName || '지정 배송기사',
        driverContact: ob.driverContact || ob.trackingNumber || '-',
        vehicleNo: ob.vehicleNo || (ob.courierName ? `${ob.courierName} (${ob.trackingNumber})` : '화물 운송차량'),
        cargoItems: JSON.stringify(
          cargos.length > 0 ? cargos : [{ modelName: '유통 주문 상품', count: 1, note: '정상 납품' }]
        ),
        closingMemo:
          ob.closingMemo ||
          (ob.proofUrl ? `[${ob.proofType === 'PHOTO' ? '납품증 사진' : '전자 서명'}]: ${ob.proofUrl}` : '')
      }
    );
  };

  const handlePrintReceipt = (ob: TradeOutbound) => {
    const delivery = getDeliveryForOutbound(ob);
    const order = salesOrders.find(so => so.id === ob.orderId);
    const customer = getCustomerById(order?.customerId) || { name: getCustomerName(order?.customerId), representative: ob.receiverName || '인수자' };
    const html = generateReceiptHtml(delivery as any, order as any, customer as any, null, null, { signatureUrl: ob.proofUrl });

    const printWin = window.open('', '_blank', 'width=900,height=950');
    if (printWin) {
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>납품(인수)확인서 - ${ob.id}</title>
          <style>body { margin: 0; background: #f5f2eb; } @media print { body { margin: 0; padding: 0; } }</style>
        </head>
        <body>
          ${html}
          <script>window.onload = function() { window.print(); };</script>
        </body>
        </html>
      `);
      printWin.document.close();
    }
  };

  const handlePreviewReceipt = (ob: TradeOutbound) => {
    const delivery = getDeliveryForOutbound(ob);
    const order = salesOrders.find(so => so.id === ob.orderId);
    const customer = getCustomerById(order?.customerId) || { name: getCustomerName(order?.customerId), representative: ob.receiverName || '인수자' };
    const html = generateReceiptHtml(delivery as any, order as any, customer as any, null, null, { signatureUrl: ob.proofUrl });
    setPreviewHtml(html);
    setPreviewTitle(`납품확인서 서식 미리보기 - ${ob.id}`);
  };

  // Actions
  const handleAllocate = async (ob: TradeOutbound) => {
    try {
      await allocateOutbound(ob.id);
      showToast(`출고요청 [${ob.id}] 재고 할당(접수)이 완료되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '재고 할당 실패');
    }
  };

  const handlePack = async (ob: TradeOutbound) => {
    try {
      await packOutbound(ob.id);
      showToast(`출고요청 [${ob.id}] 패킹 및 출고검수가 완료되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '패킹 처리 실패');
    }
  };

  const handleCancelOutbound = async (ob: TradeOutbound) => {
    if (!window.confirm(`출고요청 [${ob.id}] 건의 할당/출고를 취소하시겠습니까?`)) return;
    try {
      await cancelOutbound(ob.id, '담당자 취소');
      showToast(`출고요청 [${ob.id}] 건이 취소 처리되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '출고 취소 실패');
    }
  };

  const handleDeleteOutbound = async (ob: TradeOutbound) => {
    if (!window.confirm(`출고요청 [${ob.id}] 내역을 삭제하시겠습니까?`)) return;
    try {
      await deleteOutbound(ob.id);
      showToast(`출고요청 [${ob.id}] 내역이 삭제되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '출고 삭제 실패');
    }
  };

  const applyCustomerAndContractInfo = (custId: string, contractId?: string) => {
    const activeContract = contractId ? (contracts || []).find(c => c.id === contractId) : undefined;
    const resolvedCustId = activeContract?.customerId || custId;
    const cust = getCustomerById(resolvedCustId);
    const curSite = activeContract?.siteId
      ? (sites || []).find(s => s.id === activeContract.siteId)
      : (sites || []).find(s => s.customerId === resolvedCustId && s.isActive !== false);
    const actContacts = (curSite?.contacts || []).filter(c => c.isActive !== false);
    const primaryContact =
      actContacts.find(c => c.contactType === 'SAFETY' || c.contactType === 'EQUIPMENT') ||
      actContacts[0] ||
      (activeContract?.contactId ? (contacts || []).find(c => c.id === activeContract.contactId) : undefined);

    setFormCustomerId(resolvedCustId);
    setFormContractId(contractId || '');
    setFormDestinationAddress(curSite?.address || cust?.address || '');
    setFormReceiverName(primaryContact?.name || curSite?.contactName || cust?.representative || '');
    setFormReceiverPhone(primaryContact?.contact || curSite?.contact || cust?.repContact || '');
  };

  const openCreateModal = () => {
    const activeProducts = (products || []).filter(p => p.status !== 'DISCONTINUED');
    const firstContract = (contracts || []).find(c => c.status === 'ACTIVE') || (contracts || [])[0];
    const defaultCustId = firstContract?.customerId || customerOptions[0]?.id || '';
    const freeDefaultMaster = optionMasters.find(m => m.isFreeDefault && m.isActive);

    setEditingOutbound(null);
    setFormCreateMode('AUTO_ORDER');
    setFormOrderId(salesOrders[0]?.id || '');
    setFormSelectedItems(
      activeProducts[0]
        ? [{ productId: activeProducts[0].id, quantity: 1, unitPrice: activeProducts[0].standardPrice || 0 }]
        : []
    );
    setFormAppliedOptions(freeDefaultMaster ? [buildAppliedOptionFromMaster(freeDefaultMaster)] : []);
    setFormOptionCategoryFilter('ALL');
    setFormDeliveryType('COURIER');
    setFormClosingMemo('');
    applyCustomerAndContractInfo(defaultCustId, firstContract?.id || '');
    setIsOutboundModalOpen(true);
  };

  const openEditModal = (ob: TradeOutbound) => {
    const order = salesOrders.find(so => so.id === ob.orderId);
    const cust = getCustomerById(order?.customerId);
    setEditingOutbound(ob);
    setFormOrderId(ob.orderId);
    setFormDeliveryType(ob.deliveryType || 'COURIER');
    setFormDestinationAddress(ob.destinationAddress || order?.deliveryLocation || cust?.address || '');
    setFormReceiverName(ob.receiverName || order?.receiverName || cust?.representative || '');
    setFormReceiverPhone(ob.receiverPhone || order?.receiverPhone || cust?.repContact || '');
    setFormClosingMemo(ob.closingMemo || '');
    setFormAppliedOptions((ob.appliedOptions || order?.appliedOptions || []).map(opt => ({ ...opt })));
    setFormOptionCategoryFilter('ALL');
    setIsOutboundModalOpen(true);
  };

  const handleSaveOutboundModal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalizedOptions = formAppliedOptions.map(opt => {
        const qty = Math.max(1, Number(opt.qty) || 1);
        const unitPrice = opt.isFreeApplied ? 0 : Math.max(0, Number(opt.unitPrice) || 0);
        return {
          ...opt,
          qty,
          unitPrice,
          supplyAmount: qty * unitPrice
        };
      });

      if (editingOutbound) {
        await updateOutbound(editingOutbound.id, {
          deliveryType: formDeliveryType,
          destinationAddress: formDestinationAddress,
          receiverName: formReceiverName,
          receiverPhone: formReceiverPhone,
          closingMemo: formClosingMemo
        });
        await applyOptionsToOutbound(editingOutbound.id, normalizedOptions);
        showToast(`출고요청 [${editingOutbound.id}] 배송지 및 장착 옵션 청구 정보가 수정되었습니다.`);
      } else if (formCreateMode === 'AUTO_ORDER' || !formOrderId) {
        if (!formCustomerId) {
          showErrorModal('고객사를 선택해 주세요.');
          return;
        }
        if (formSelectedItems.length === 0) {
          showErrorModal('출고할 유통 품목을 1개 이상 선택해 주세요.');
          return;
        }
        const linkedContract = formContractId ? (contracts || []).find(c => c.id === formContractId) : undefined;
        const linkedSite = linkedContract?.siteId ? (sites || []).find(s => s.id === linkedContract.siteId) : undefined;
        const orderLines = formSelectedItems.map(it => ({
          productId: it.productId,
          qty: Math.max(1, Number(it.quantity) || 1),
          unitPrice: Math.max(0, Number(it.unitPrice) || 0),
          memo: formClosingMemo || ''
        }));
        const createdOrder = await createSalesOrder(formCustomerId, orderLines, {
          status: 'CONFIRMED',
          deliveryLocation: formDestinationAddress,
          receiverName: formReceiverName,
          receiverPhone: formReceiverPhone,
          deliveryMethod: formDeliveryType,
          contractId: linkedContract?.id,
          contractNo: linkedContract?.contractNo,
          siteId: linkedSite?.id,
          siteName: linkedSite?.name,
          salespersonName: currentUser?.name || '유통영업팀',
          memo: formClosingMemo,
          appliedOptions: normalizedOptions
        });
        showToast(`수주 [${createdOrder.id}] 자동 생성 및 옵션 포함 출고 지시가 등록되었습니다.`);
      } else {
        const created = await createOutboundManual(formOrderId, {
          deliveryType: formDeliveryType,
          destinationAddress: formDestinationAddress,
          receiverName: formReceiverName,
          receiverPhone: formReceiverPhone,
          closingMemo: formClosingMemo,
          appliedOptions: normalizedOptions
        });
        showToast(`신규 출고요청 [${created.id}] 건이 등록되었습니다.`);
      }
      setIsOutboundModalOpen(false);
    } catch (err: any) {
      showErrorModal(err.message || '출고 정보 저장 실패');
    }
  };

  // Enriched Outbounds
  const enrichedOutbounds = useMemo(() => {
    return outbounds
      .map(o => {
        const order = salesOrders.find(so => so.id === o.orderId);
        const lines = salesOrderLines.filter(l => l.orderId === o.orderId);
        const totalQty = lines.reduce((s, l) => s + l.qty, 0);
        const custName = getCustomerName(order?.customerId);
        const cust = getCustomerById(order?.customerId);
        const firstProd = lines.length > 0 ? products.find(p => p.id === lines[0].productId) : undefined;
        const itemSummary =
          lines.length === 0
            ? '품목 없음'
            : lines.length === 1
            ? `${firstProd?.name || '상품'} (${lines[0].qty}개)`
            : `${firstProd?.name || '상품'} 외 ${lines.length - 1}종 (총 ${totalQty}개)`;
        const reqDate = (o.createdAt || '').split('T')[0] || order?.orderDate || '';
        const appliedOpts = o.appliedOptions || order?.appliedOptions || [];
        const optionBillingAmount =
          typeof o.optionBillingAmount === 'number'
            ? o.optionBillingAmount
            : appliedOpts.reduce((s, opt) => s + (opt.isFreeApplied ? 0 : opt.supplyAmount), 0);
        const baseOrderSupply = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
        const totalBillingSupply = order?.totalSalesAmount || (baseOrderSupply + optionBillingAmount);

        return {
          o,
          order,
          lines,
          totalQty,
          custName,
          itemSummary,
          reqDate,
          appliedOpts,
          optionBillingAmount,
          baseOrderSupply,
          totalBillingSupply,
          destination: o.destinationAddress || order?.deliveryLocation || cust?.address || '-',
          receiver: o.receiverName || order?.receiverName || cust?.representative || '-',
          receiverPhone: o.receiverPhone || order?.receiverPhone || cust?.repContact || '-'
        };
      })
      .sort((a, b) => new Date(b.o.createdAt).getTime() - new Date(a.o.createdAt).getTime());
  }, [outbounds, salesOrders, salesOrderLines, products, getCustomerName, getCustomerById]);

  // Filtered Outbounds
  const displayedOutbounds = useMemo(() => {
    const matcher = searchTerm.trim() ? createHangulMatcher(searchTerm.trim()) : null;
    return enrichedOutbounds.filter(row => {
      if (filter !== 'ALL' && row.o.status !== filter) return false;
      if (startDate && row.reqDate < startDate) return false;
      if (endDate && row.reqDate > endDate) return false;
      if (customerFilter !== 'ALL' && row.order?.customerId !== customerFilter) return false;
      if (productFilter !== 'ALL' && !row.lines.some(l => l.productId === productFilter)) return false;

      if (matcher) {
        const optText = row.appliedOpts.map(op => `${op.name} ${op.subVariant}`).join(' ');
        const hit =
          matcher(row.o.id) ||
          matcher(row.o.orderId) ||
          matcher(row.custName) ||
          matcher(row.itemSummary) ||
          matcher(optText) ||
          matcher(row.destination) ||
          matcher(row.receiver) ||
          matcher(row.o.trackingNumber || '') ||
          matcher(row.o.driverName || '');
        if (!hit) return false;
      }
      return true;
    });
  }, [enrichedOutbounds, filter, startDate, endDate, customerFilter, productFilter, searchTerm]);

  // KPI metrics
  const kpi = useMemo(() => {
    const total = enrichedOutbounds.length;
    const requested = enrichedOutbounds.filter(r => r.o.status === 'REQUESTED').length;
    const allocated = enrichedOutbounds.filter(r => r.o.status === 'ALLOCATED' || r.o.status === 'PACKED').length;
    const completed = enrichedOutbounds.filter(r => r.o.status === 'SHIPPED' || r.o.status === 'DELIVERED').length;
    const optionInstalledCount = enrichedOutbounds.filter(r => r.appliedOpts.length > 0).length;
    const optionBillingTotal = enrichedOutbounds.reduce((s, r) => s + r.optionBillingAmount, 0);
    return { total, requested, allocated, completed, optionInstalledCount, optionBillingTotal };
  }, [enrichedOutbounds]);

  // Excel Export
  const handleExportExcel = () => {
    const data = displayedOutbounds.map((r, idx) => ({
      순번: idx + 1,
      출고번호: r.o.id,
      주문번호: r.o.orderId,
      요청일자: r.reqDate,
      고객사명: r.custName,
      출고품목: r.itemSummary,
      총수량: r.totalQty,
      장착옵션내역: r.appliedOpts.length > 0 ? r.appliedOpts.map(op => `${op.name}[${op.subVariant}]`).join(', ') : '없음',
      옵션청구추가액: r.optionBillingAmount,
      합산청구공급가: r.totalBillingSupply,
      배송방식: r.o.deliveryType === 'DIRECT' ? '화물직배' : '택배배송',
      수령인: r.receiver,
      연락처: r.receiverPhone,
      배송지주소: r.destination,
      진행상태: r.o.status,
      운송정보: r.o.trackingNumber ? `${r.o.courierName} (${r.o.trackingNumber})` : r.o.driverName || '-'
    }));
    exportToExcel(
      data,
      `유통출고할당대장_${new Date().toISOString().split('T')[0]}`,
      '출고할당목록'
    );
    showToast('출고 요청 및 재고 할당 대장 엑셀 파일이 다운로드되었습니다.');
  };

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setCustomerFilter('ALL');
    setProductFilter('ALL');
    setSearchTerm('');
    setFilter('ALL');
  };

  const hasActiveFilter =
    Boolean(startDate || endDate || searchTerm) ||
    customerFilter !== 'ALL' ||
    productFilter !== 'ALL' ||
    filter !== 'ALL';

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

      {/* 1. 상단 헤더 및 파이프라인 바 */}
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
            data-mid="trade_outbounds-header"
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
            <Package size={20} color="var(--primary)" />
            <span>출고 요청 및 재고 할당</span>
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', whiteSpace: 'nowrap' }}>
            유통 수주 물류 창고 재고 할당(접수), 패킹 검수, 납품증 출력 및 출고 지시 관리
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 700,
                border: 'none',
                backgroundColor: viewMode === 'GRID' ? 'var(--primary)' : 'var(--bg-app)',
                color: viewMode === 'GRID' ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <List size={13} /> 대장 뷰
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CARD')}
              style={{
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 700,
                border: 'none',
                backgroundColor: viewMode === 'CARD' ? 'var(--primary)' : 'var(--bg-app)',
                color: viewMode === 'CARD' ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <LayoutGrid size={13} /> 카드 뷰
            </button>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            <Plus size={15} /> 출고 요청 등록
          </button>

          <button
            type="button"
            data-mid="trade_outbounds-excel-btn"
            onClick={handleExportExcel}
            className="btn-excel-download"
            style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            <Download size={14} /> 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* 2. KPI 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(165px, 1fr))', gap: '12px', flexShrink: 0 }}>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>전체 출고 요청</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{kpi.total}건</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>할당 대기</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: kpi.requested > 0 ? '#d97706' : 'var(--text-main)', whiteSpace: 'nowrap' }}>{kpi.requested}건</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>할당 / 패킹 완료</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#2563eb', whiteSpace: 'nowrap' }}>{kpi.allocated}건</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>배송중 / 납품 완료</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#059669', whiteSpace: 'nowrap' }}>{kpi.completed}건</div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid rgba(124, 58, 237, 0.35)' }}>
          <div style={{ fontSize: '11px', color: '#6d28d9', fontWeight: 700, whiteSpace: 'nowrap' }}>출고 옵션 장착 · 청구추가 합계</div>
          <div style={{ fontSize: '17px', fontWeight: 800, marginTop: '4px', color: '#6d28d9', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            +₩{kpi.optionBillingTotal.toLocaleString()} <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)' }}>({kpi.optionInstalledCount}건 장착)</span>
          </div>
        </div>
      </div>

      {/* 3. 통합 조회 필터 바 (기간, 고객사, 품명, 상태) */}
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
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>요청 기간</label>
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
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>고객사</label>
          <select
            value={customerFilter}
            onChange={e => setCustomerFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 고객사</option>
            {customerOptions.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>품명 선택</label>
          <select
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 품목</option>
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
              placeholder="출고번호, 주문번호, 수령인, 주소"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '6px 10px 6px 28px', fontSize: '12px', width: '190px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>출고 상태</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['ALL', 'REQUESTED', 'ALLOCATED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                style={{
                  border: '1px solid',
                  borderColor: filter === tab ? 'var(--primary)' : 'var(--border-color)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  fontWeight: filter === tab ? 700 : 500,
                  cursor: 'pointer',
                  backgroundColor: filter === tab ? 'var(--primary)' : 'var(--bg-app)',
                  color: filter === tab ? '#fff' : 'var(--text-muted)',
                  whiteSpace: 'nowrap'
                }}
              >
                {tab === 'ALL'
                  ? '전체'
                  : tab === 'REQUESTED'
                  ? '할당대기'
                  : tab === 'ALLOCATED'
                  ? '할당완료'
                  : tab === 'PACKED'
                  ? '패킹완료'
                  : tab === 'SHIPPED'
                  ? '배송중'
                  : tab === 'DELIVERED'
                  ? '납품완료'
                  : '취소'}
              </button>
            ))}
          </div>
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

      {/* 4. 본문 영역: 그리드 뷰 또는 카드 뷰 */}
      {viewMode === 'GRID' ? (
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', width: '370px' }}>출고 할당 / 옵션장착 / 납품증</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>출고번호</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>주문번호</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>요청일자</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>고객사명</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>출고 품목 명세</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>총 수량</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#6d28d9' }}>장착 옵션 명세</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#6d28d9' }}>옵션 청구추가액 / 합산청구액</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>수령인 / 연락처</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>배송지 주소</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>출고 상태</th>
                </tr>
              </thead>
              <tbody>
                {displayedOutbounds.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      해당 조건의 출고 요청 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  displayedOutbounds.map(({ o, custName, itemSummary, totalQty, reqDate, appliedOpts, optionBillingAmount, totalBillingSupply, destination, receiver, receiverPhone }) => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color)', height: '44px' }}>
                      {/* 1열 액션 */}
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {o.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => openOptionModal(o)}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: appliedOpts.length > 0 ? 'rgba(124, 58, 237, 0.14)' : 'var(--bg-app)',
                                color: '#6d28d9',
                                border: '1px solid rgba(124, 58, 237, 0.4)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                              title="백레스트, 사이드시프트, 캐빈, 에어컨, 덧발, 센서, 경광등, 장비보호 옵션 추가 및 청구 합산"
                            >
                              <SlidersHorizontal size={11} /> 옵션장착·청구({appliedOpts.length})
                            </button>
                          )}

                          {(o.status === 'REQUESTED' || o.status === 'CANCELLED') && (
                            <button
                              type="button"
                              data-mid="trade_outbounds-allocate-btn"
                              onClick={() => handleAllocate(o)}
                              style={{ padding: '4px 10px', backgroundColor: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <Check size={11} /> 재고 할당
                            </button>
                          )}

                          {o.status === 'ALLOCATED' && (
                            <button
                              type="button"
                              onClick={() => handlePack(o)}
                              style={{ padding: '4px 8px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
                            >
                              패킹완료
                            </button>
                          )}

                          {o.status !== 'REQUESTED' && o.status !== 'CANCELLED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handlePrintReceipt(o)}
                                style={{ padding: '4px 8px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                              >
                                <Printer size={11} /> 납품증
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePreviewReceipt(o)}
                                style={{ padding: '4px 8px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                              >
                                <Eye size={11} /> 미리보기
                              </button>
                            </>
                          )}

                          {o.status === 'DELIVERED' && o.proofUrl && (
                            <button
                              type="button"
                              onClick={() => setProofUrl(o.proofUrl || null)}
                              style={{ padding: '4px 8px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <FileText size={11} /> 서명확인
                            </button>
                          )}

                          {o.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => openEditModal(o)}
                              style={{ padding: '4px 7px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              <Edit2 size={11} /> 수정
                            </button>
                          )}

                          {o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => handleCancelOutbound(o)}
                              style={{ padding: '4px 7px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                            >
                              취소
                            </button>
                          )}

                          {(o.status === 'CANCELLED' || o.status === 'REQUESTED') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOutbound(o)}
                              style={{ padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{o.id}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}>{o.orderId}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{reqDate}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>{custName}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{itemSummary}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{totalQty.toLocaleString()}개</td>
                      <td style={{ padding: '6px 12px' }}>
                        {appliedOpts.length === 0 ? (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>미장착</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
                            {appliedOpts.slice(0, 2).map(opt => (
                              <span
                                key={opt.optionId}
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  backgroundColor: opt.isFreeApplied ? 'rgba(5, 150, 105, 0.12)' : 'rgba(124, 58, 237, 0.12)',
                                  color: opt.isFreeApplied ? '#047857' : '#6d28d9'
                                }}
                              >
                                {opt.name}
                              </span>
                            ))}
                            {appliedOpts.length > 2 && (
                              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#6d28d9' }}>외 {appliedOpts.length - 2}종</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                        <div style={{ fontWeight: 800, color: optionBillingAmount > 0 ? '#6d28d9' : 'var(--text-muted)', fontSize: '12px' }}>
                          {optionBillingAmount > 0 ? `+₩${optionBillingAmount.toLocaleString()}` : '₩0'}
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          합산청구 ₩{totalBillingSupply.toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>
                        {receiver} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({receiverPhone})</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{destination}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor:
                              o.status === 'DELIVERED'
                                ? '#dcfce7'
                                : o.status === 'SHIPPED'
                                ? '#e0e7ff'
                                : o.status === 'PACKED' || o.status === 'ALLOCATED'
                                ? '#dbeafe'
                                : o.status === 'CANCELLED'
                                ? '#fee2e2'
                                : '#fef3c7',
                            color:
                              o.status === 'DELIVERED'
                                ? '#15803d'
                                : o.status === 'SHIPPED'
                                ? '#4338ca'
                                : o.status === 'PACKED' || o.status === 'ALLOCATED'
                                ? '#1d4ed8'
                                : o.status === 'CANCELLED'
                                ? '#991b1b'
                                : '#b45309'
                          }}
                        >
                          {o.status === 'DELIVERED'
                            ? '납품완료'
                            : o.status === 'SHIPPED'
                            ? '배송중'
                            : o.status === 'PACKED'
                            ? '패킹완료'
                            : o.status === 'ALLOCATED'
                            ? '할당완료'
                            : o.status === 'CANCELLED'
                            ? '출고취소'
                            : '할당대기'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {displayedOutbounds.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '2px solid var(--border-color)', fontWeight: 800 }}>
                    <td colSpan={6} style={{ padding: '10px 12px', color: 'var(--text-main)' }}>
                      조회 합계 ({displayedOutbounds.length}건)
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)' }}>
                      총 {displayedOutbounds.reduce((s, r) => s + r.totalQty, 0).toLocaleString()}개
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6d28d9' }}>
                      옵션 장착 {displayedOutbounds.filter(r => r.appliedOpts.length > 0).length}건
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6d28d9', fontFamily: 'monospace' }}>
                      옵션청구 +₩{displayedOutbounds.reduce((s, r) => s + r.optionBillingAmount, 0).toLocaleString()} / 합산 ₩{displayedOutbounds.reduce((s, r) => s + r.totalBillingSupply, 0).toLocaleString()}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* 카드 뷰 */
        <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px', alignContent: 'start' }}>
          {displayedOutbounds.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '48px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              해당 조건의 출고 데이터가 없습니다.
            </div>
          ) : (
            displayedOutbounds.map(({ o, custName, itemSummary, totalQty, appliedOpts, optionBillingAmount, totalBillingSupply, destination, receiver }) => (
              <div
                key={o.id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'monospace' }}>{o.id}</span>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor:
                          o.status === 'DELIVERED'
                            ? '#dcfce7'
                            : o.status === 'SHIPPED'
                            ? '#e0e7ff'
                            : o.status === 'ALLOCATED' || o.status === 'PACKED'
                            ? '#dbeafe'
                            : '#fef3c7',
                        color:
                          o.status === 'DELIVERED'
                            ? '#15803d'
                            : o.status === 'SHIPPED'
                            ? '#4338ca'
                            : o.status === 'ALLOCATED' || o.status === 'PACKED'
                            ? '#1d4ed8'
                            : '#b45309'
                      }}
                    >
                      {o.status === 'DELIVERED'
                        ? '납품완료'
                        : o.status === 'SHIPPED'
                        ? '배송중'
                        : o.status === 'PACKED'
                        ? '패킹완료'
                        : o.status === 'ALLOCATED'
                        ? '할당완료'
                        : '할당대기'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>{custName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>주문번호: {o.orderId}</div>
                  <div style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 700, marginBottom: '6px' }}>
                    품목: {itemSummary} (총 {totalQty}개)
                  </div>
                  <div style={{ padding: '7px 10px', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 700, color: '#6d28d9', marginBottom: '3px' }}>
                      <span>장착 옵션 ({appliedOpts.length}종)</span>
                      <span style={{ fontFamily: 'monospace' }}>+₩{optionBillingAmount.toLocaleString()} (합산 ₩{totalBillingSupply.toLocaleString()})</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {appliedOpts.length > 0 ? appliedOpts.map(op => `${op.name}[${op.subVariant}]`).join(', ') : '장착된 옵션 없음'}
                    </div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    수령인: {receiver} | 배송지: {destination}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => openOptionModal(o)}
                    style={{ padding: '7px 10px', backgroundColor: 'rgba(124, 58, 237, 0.12)', color: '#6d28d9', border: '1px solid rgba(124, 58, 237, 0.35)', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    옵션·청구추가
                  </button>
                  {o.status === 'REQUESTED' ? (
                    <button
                      type="button"
                      data-mid="trade_outbounds-allocate-btn"
                      onClick={() => handleAllocate(o)}
                      style={{ flex: 1, padding: '8px', backgroundColor: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                    >
                      재고 할당
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePrintReceipt(o)}
                        style={{ flex: 1, padding: '7px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        <Printer size={13} /> 납품증
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePreviewReceipt(o)}
                        style={{ flex: 1, padding: '7px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        <Eye size={13} /> 미리보기
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditModal(o)}
                    style={{ padding: '7px 10px', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    수정
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 5. 출고 요청 등록 / 수정 모달 */}
      {isOutboundModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px' }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '620px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                {editingOutbound ? `출고 지시 정보 수정 (${editingOutbound.id})` : '신규 유통 출고 등록 (수주 정보 자동 생성)'}
              </h3>
              <button type="button" onClick={() => setIsOutboundModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveOutboundModal} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!editingOutbound && salesOrders.length > 0 && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setFormCreateMode('AUTO_ORDER')}
                    style={{
                      flex: 1,
                      padding: '7px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: formCreateMode === 'AUTO_ORDER' ? 800 : 600,
                      cursor: 'pointer',
                      border: formCreateMode === 'AUTO_ORDER' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      backgroundColor: formCreateMode === 'AUTO_ORDER' ? 'var(--primary)' : 'var(--bg-app)',
                      color: formCreateMode === 'AUTO_ORDER' ? '#fff' : 'var(--text-main)'
                    }}
                  >
                    출고 + 수주 자동 생성
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormCreateMode('EXISTING_ORDER');
                      const firstOrder = salesOrders.find(so => so.id === formOrderId) || salesOrders[0];
                      if (firstOrder) {
                        const cust = getCustomerById(firstOrder.customerId);
                        setFormOrderId(firstOrder.id);
                        setFormDestinationAddress(firstOrder.deliveryLocation || cust?.address || '');
                        setFormReceiverName(firstOrder.receiverName || cust?.representative || '');
                        setFormReceiverPhone(firstOrder.receiverPhone || cust?.repContact || '');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '7px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: formCreateMode === 'EXISTING_ORDER' ? 800 : 600,
                      cursor: 'pointer',
                      border: formCreateMode === 'EXISTING_ORDER' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      backgroundColor: formCreateMode === 'EXISTING_ORDER' ? 'var(--primary)' : 'var(--bg-app)',
                      color: formCreateMode === 'EXISTING_ORDER' ? '#fff' : 'var(--text-main)'
                    }}
                  >
                    기존 수주 건에서 출고 지시
                  </button>
                </div>
              )}

              {!editingOutbound && (formCreateMode === 'AUTO_ORDER' || salesOrders.length === 0) && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>연동 렌탈 계약 선택 (선택 시 수주·현장 자동 입력)</label>
                      <select
                        value={formContractId}
                        onChange={e => {
                          const nextCid = e.target.value;
                          const matchedContract = (contracts || []).find(c => c.id === nextCid);
                          applyCustomerAndContractInfo(matchedContract?.customerId || formCustomerId, nextCid);
                        }}
                        style={{ padding: '8px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                      >
                        <option value="">-- 계약 미지정 (고객사 직접 선택) --</option>
                        {(contracts || []).map(c => {
                            const sName = (sites || []).find(s => s.id === c.siteId)?.name || '';
                            return (
                              <option key={c.id} value={c.id}>
                                [{c.contractNo}] {getCustomerName(c.customerId)}{sName ? ` - ${sName}` : ''}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>고객사 *</label>
                      <select
                        value={formCustomerId}
                        onChange={e => applyCustomerAndContractInfo(e.target.value, '')}
                        style={{ padding: '8px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                      >
                        {customerOptions.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 출고 품목 원클릭 선택 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>출고 품목 선택 (클릭 시 담기) *</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', maxHeight: '120px', overflowY: 'auto' }}>
                      {(products || []).filter(p => p.status !== 'DISCONTINUED').map(prod => {
                        const sel = formSelectedItems.find(it => it.productId === prod.id);
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => {
                              setFormSelectedItems(prev => {
                                const exists = prev.find(it => it.productId === prod.id);
                                if (exists) {
                                  return prev.map(it => it.productId === prod.id ? { ...it, quantity: it.quantity + 1 } : it);
                                }
                                return [...prev, { productId: prod.id, quantity: 1, unitPrice: prod.standardPrice || 0 }];
                              });
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: sel ? 700 : 500,
                              cursor: 'pointer',
                              border: sel ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                              backgroundColor: sel ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-card)',
                              color: sel ? 'var(--primary)' : 'var(--text-main)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>+ {prod.name}</span>
                            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                              (₩{(prod.standardPrice || 0).toLocaleString()} / 재고 {getProductStock(prod.id).availableQty}{prod.unit})
                            </span>
                            {sel && (
                              <span style={{ padding: '1px 5px', borderRadius: '999px', backgroundColor: 'var(--primary)', color: '#fff', fontSize: '10px', fontWeight: 800 }}>
                                {sel.quantity}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {formSelectedItems.length > 0 && (
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)' }}>
                              <th style={{ padding: '6px 8px', textAlign: 'left' }}>품목명</th>
                              <th style={{ padding: '6px 8px', textAlign: 'center', width: '80px' }}>수량</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', width: '110px' }}>판매단가 (원)</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>공급가액</th>
                              <th style={{ padding: '6px 6px', textAlign: 'center', width: '40px' }}>삭제</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formSelectedItems.map((it, idx) => {
                              const prod = products.find(p => p.id === it.productId);
                              const rowAmt = (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0);
                              return (
                                <tr key={it.productId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                  <td style={{ padding: '5px 8px', fontWeight: 700 }}>{prod?.name || '품목'}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                    <input
                                      type="number"
                                      min={1}
                                      value={it.quantity}
                                      onChange={e => {
                                        const nextQty = Math.max(1, parseInt(e.target.value, 10) || 1);
                                        setFormSelectedItems(prev => prev.map((row, i) => i === idx ? { ...row, quantity: nextQty } : row));
                                      }}
                                      style={{ width: '56px', padding: '3px 6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                    />
                                  </td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                    <input
                                      type="number"
                                      min={0}
                                      value={it.unitPrice}
                                      onChange={e => {
                                        const nextPrice = Math.max(0, parseInt(e.target.value, 10) || 0);
                                        setFormSelectedItems(prev => prev.map((row, i) => i === idx ? { ...row, unitPrice: nextPrice } : row));
                                      }}
                                      style={{ width: '96px', padding: '3px 6px', textAlign: 'right', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                    />
                                  </td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                                    ₩{rowAmt.toLocaleString()}원
                                  </td>
                                  <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => setFormSelectedItems(prev => prev.filter((_, i) => i !== idx))}
                                      style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px' }}
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!editingOutbound && formCreateMode === 'EXISTING_ORDER' && salesOrders.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>대상 수주 계약 선택 *</label>
                  <select
                    value={formOrderId}
                    onChange={e => {
                      const nextOid = e.target.value;
                      setFormOrderId(nextOid);
                      const matchedOrder = salesOrders.find(so => so.id === nextOid);
                      if (matchedOrder) {
                        const cust = getCustomerById(matchedOrder.customerId);
                        setFormDestinationAddress(matchedOrder.deliveryLocation || cust?.address || '');
                        setFormReceiverName(matchedOrder.receiverName || cust?.representative || '');
                        setFormReceiverPhone(matchedOrder.receiverPhone || cust?.repContact || '');
                      }
                    }}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    {salesOrders.map(so => (
                      <option key={so.id} value={so.id}>
                        [{so.id}] {getCustomerName(so.customerId)} (₩{so.totalSalesAmount.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 지게차 출고 장착 옵션 선택 및 청구 추가 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(124, 58, 237, 0.35)', backgroundColor: 'rgba(124, 58, 237, 0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <SlidersHorizontal size={14} /> 출고 장착 옵션 선택 · 청구 자동 합산
                  </label>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6d28d9', fontFamily: 'monospace' }}>
                    옵션 청구추가액: +₩{formAppliedOptions.reduce((s, o) => s + (o.isFreeApplied ? 0 : o.qty * o.unitPrice), 0).toLocaleString()}원
                  </span>
                </div>

                {/* 분류 탭 */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setFormOptionCategoryFilter('ALL')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: formOptionCategoryFilter === 'ALL' ? 700 : 500,
                      border: formOptionCategoryFilter === 'ALL' ? '1px solid #6d28d9' : '1px solid var(--border-color)',
                      backgroundColor: formOptionCategoryFilter === 'ALL' ? '#6d28d9' : 'var(--bg-card)',
                      color: formOptionCategoryFilter === 'ALL' ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    전체
                  </button>
                  {FORKLIFT_OPTION_GROUPS.map(g => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setFormOptionCategoryFilter(g.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: formOptionCategoryFilter === g.id ? 700 : 500,
                        border: formOptionCategoryFilter === g.id ? '1px solid #6d28d9' : '1px solid var(--border-color)',
                        backgroundColor: formOptionCategoryFilter === g.id ? '#6d28d9' : 'var(--bg-card)',
                        color: formOptionCategoryFilter === g.id ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>

                {/* 옵션 마스터 원클릭 버튼 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '115px', overflowY: 'auto', padding: '6px', borderRadius: '6px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  {optionMasters
                    .filter(m => m.isActive && (formOptionCategoryFilter === 'ALL' || m.optionGroup === formOptionCategoryFilter))
                    .map(opt => {
                      const exists = formAppliedOptions.some(a => a.optionId === opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setFormAppliedOptions(prev => {
                              if (prev.some(a => a.optionId === opt.id)) {
                                return prev.filter(a => a.optionId !== opt.id);
                              }
                              return [...prev, buildAppliedOptionFromMaster(opt)];
                            });
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: exists ? 700 : 500,
                            border: exists ? '1px solid #6d28d9' : '1px solid var(--border-color)',
                            backgroundColor: exists ? 'rgba(124, 58, 237, 0.14)' : 'var(--bg-app)',
                            color: exists ? '#6d28d9' : 'var(--text-main)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>{exists ? '✓' : '+'} {opt.name} [{opt.subVariant}]</span>
                          <span style={{ fontSize: '10px', color: opt.isFreeDefault ? '#047857' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {opt.isFreeDefault ? '무상기본' : `+₩${opt.unitPrice.toLocaleString()}`}
                          </span>
                        </button>
                      );
                    })}
                </div>

                {formAppliedOptions.length > 0 && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
                    <table style={{ width: '100%', fontSize: '11.5px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '5px 8px', textAlign: 'left' }}>장착 옵션명 / 세부규격</th>
                          <th style={{ padding: '5px 6px', textAlign: 'center', width: '65px' }}>수량</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right', width: '105px' }}>청구단가</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right', width: '95px' }}>청구공급가</th>
                          <th style={{ padding: '5px 6px', textAlign: 'center', width: '40px' }}>제외</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formAppliedOptions.map((ao, idx) => (
                          <tr key={ao.optionId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '5px 8px' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{ao.name}</div>
                              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{ao.optionGroupLabel} · {ao.subVariant}</div>
                            </td>
                            <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                              <input
                                type="number"
                                min={1}
                                value={ao.qty}
                                onChange={e => {
                                  const nextQty = Math.max(1, parseInt(e.target.value, 10) || 1);
                                  setFormAppliedOptions(prev => prev.map((r, i) => i === idx ? { ...r, qty: nextQty, supplyAmount: r.isFreeApplied ? 0 : nextQty * r.unitPrice } : r));
                                }}
                                style={{ width: '48px', padding: '2px 4px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                              />
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                              <input
                                type="number"
                                min={0}
                                step={10000}
                                disabled={ao.isFreeApplied}
                                value={ao.isFreeApplied ? 0 : ao.unitPrice}
                                onChange={e => {
                                  const nextPrice = Math.max(0, parseInt(e.target.value, 10) || 0);
                                  setFormAppliedOptions(prev => prev.map((r, i) => i === idx ? { ...r, unitPrice: nextPrice, supplyAmount: r.qty * nextPrice } : r));
                                }}
                                style={{ width: '88px', padding: '2px 5px', textAlign: 'right', borderRadius: '4px', border: '1px solid var(--border-color)', fontFamily: 'monospace' }}
                              />
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: ao.isFreeApplied ? '#047857' : '#6d28d9', fontFamily: 'monospace' }}>
                              {ao.isFreeApplied ? '무상 (₩0)' : `+₩${(ao.qty * ao.unitPrice).toLocaleString()}`}
                            </td>
                            <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setFormAppliedOptions(prev => prev.filter((_, i) => i !== idx))}
                                style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '12px' }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>희망 운송 방식</label>
                <select
                  value={formDeliveryType}
                  onChange={e => setFormDeliveryType(e.target.value as any)}
                  style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                >
                  <option value="COURIER">택배 발송</option>
                  <option value="BUNDLE_WITH_RENTAL">출고 장비 동봉</option>
                  <option value="DIRECT">화물 직배</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>인수 담당자명 *</label>
                  <input
                    type="text"
                    required
                    value={formReceiverName}
                    onChange={e => setFormReceiverName(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>인수자 연락처 *</label>
                  <input
                    type="text"
                    required
                    value={formReceiverPhone}
                    onChange={e => setFormReceiverPhone(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>배송지 주소 *</label>
                <input
                  type="text"
                  required
                  value={formDestinationAddress}
                  onChange={e => setFormDestinationAddress(e.target.value)}
                  style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>출고 / 패킹 특이사항 메모</label>
                <input
                  type="text"
                  value={formClosingMemo}
                  onChange={e => setFormClosingMemo(e.target.value)}
                  placeholder="완충 포장 요청 등 메모 입력"
                  style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setIsOutboundModalOpen(false)}
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
                  {editingOutbound ? '수정 저장' : '수주 자동생성 및 출고 확정'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. 전용 출고 지게차 옵션 장착 및 청구 반영 모달 */}
      {optionModalOutbound && (() => {
        const targetOrder = salesOrders.find(so => so.id === optionModalOutbound.orderId);
        const targetLines = salesOrderLines.filter(l => l.orderId === optionModalOutbound.orderId);
        const baseItemsSupply = targetLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
        const modalOptionSupply = modalAppliedOptions.reduce((s, o) => s + (o.isFreeApplied ? 0 : (Number(o.qty) || 1) * (Number(o.unitPrice) || 0)), 0);
        const modalOptionCost = modalAppliedOptions.reduce((s, o) => s + (Number(o.qty) || 1) * (Number(o.costPrice) || 0), 0);
        const combinedSupply = baseItemsSupply + modalOptionSupply;
        const combinedVat = Math.round(combinedSupply * 0.1);
        const combinedTotal = combinedSupply + combinedVat;

        const filteredMasters = optionMasters.filter(m => {
          if (!m.isActive) return false;
          if (modalOptionGroupFilter !== 'ALL' && m.optionGroup !== modalOptionGroupFilter) return false;
          if (modalOptionSearch.trim()) {
            const q = modalOptionSearch.trim().toLowerCase();
            return (
              m.name.toLowerCase().includes(q) ||
              m.subVariant.toLowerCase().includes(q) ||
              m.optionGroupLabel.toLowerCase().includes(q) ||
              m.optionCode.toLowerCase().includes(q)
            );
          }
          return true;
        });

        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300, padding: '16px' }}>
            <div style={{ backgroundColor: 'var(--bg-card)', width: '980px', maxWidth: '96vw', maxHeight: '92vh', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)' }}>
              {/* 헤더 */}
              <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SlidersHorizontal size={18} color="#6d28d9" />
                    <span>출고 지게차 옵션 장착 및 청구액 합산 [{optionModalOutbound.id}]</span>
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    주문번호: {optionModalOutbound.orderId} · 거래처: {getCustomerName(targetOrder?.customerId)} · 선택된 옵션은 수주 금액 및 매출 명세서 청구액에 자동 추가됩니다.
                  </div>
                </div>
                <button type="button" onClick={() => setOptionModalOutbound(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <X size={20} />
                </button>
              </div>

              {/* 본문 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 옵션 분류 필터 바 + 단가 일괄 전환 버튼 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setModalOptionGroupFilter('ALL')}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '5px',
                        fontSize: '11.5px',
                        fontWeight: modalOptionGroupFilter === 'ALL' ? 800 : 600,
                        border: modalOptionGroupFilter === 'ALL' ? '1px solid #6d28d9' : '1px solid var(--border-color)',
                        backgroundColor: modalOptionGroupFilter === 'ALL' ? '#6d28d9' : 'var(--bg-app)',
                        color: modalOptionGroupFilter === 'ALL' ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      전체 옵션 ({optionMasters.filter(m => m.isActive).length})
                    </button>
                    {FORKLIFT_OPTION_GROUPS.map(grp => (
                      <button
                        key={grp.id}
                        type="button"
                        onClick={() => setModalOptionGroupFilter(grp.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '5px',
                          fontSize: '11.5px',
                          fontWeight: modalOptionGroupFilter === grp.id ? 800 : 600,
                          border: modalOptionGroupFilter === grp.id ? '1px solid #6d28d9' : '1px solid var(--border-color)',
                          backgroundColor: modalOptionGroupFilter === grp.id ? '#6d28d9' : 'var(--bg-app)',
                          color: modalOptionGroupFilter === grp.id ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                      >
                        {grp.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="text"
                      value={modalOptionSearch}
                      onChange={e => setModalOptionSearch(e.target.value)}
                      placeholder="백레스트, 캐빈, 덧발, 에어컨 검색"
                      style={{ padding: '6px 10px', fontSize: '12px', width: '190px', borderRadius: '5px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setModalAppliedOptions(prev =>
                          prev.map(ao => {
                            const master = optionMasters.find(m => m.id === ao.optionId);
                            if (!master || ao.isFreeApplied) return ao;
                            return { ...ao, unitPrice: master.dealerPrice, supplyAmount: ao.qty * master.dealerPrice };
                          })
                        );
                      }}
                      style={{ padding: '6px 10px', fontSize: '11.5px', fontWeight: 700, borderRadius: '5px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: '#1d4ed8', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      대리점 공급단가 일괄적용
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalAppliedOptions(prev =>
                          prev.map(ao => {
                            const master = optionMasters.find(m => m.id === ao.optionId);
                            if (!master || ao.isFreeApplied) return ao;
                            return { ...ao, unitPrice: master.unitPrice, supplyAmount: ao.qty * master.unitPrice };
                          })
                        );
                      }}
                      style={{ padding: '6px 10px', fontSize: '11.5px', fontWeight: 700, borderRadius: '5px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: '#059669', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      표준 청구단가 일괄적용
                    </button>
                  </div>
                </div>

                {/* 옵션 마스터 선택 그리드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(285px, 1fr))', gap: '8px', maxHeight: '235px', overflowY: 'auto', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                  {filteredMasters.map(opt => {
                    const isSelected = modalAppliedOptions.some(a => a.optionId === opt.id);
                    return (
                      <div
                        key={opt.id}
                        onClick={() => {
                          setModalAppliedOptions(prev => {
                            if (prev.some(a => a.optionId === opt.id)) {
                              return prev.filter(a => a.optionId !== opt.id);
                            }
                            return [...prev, buildAppliedOptionFromMaster(opt)];
                          });
                        }}
                        style={{
                          padding: '9px 11px',
                          borderRadius: '6px',
                          border: isSelected ? '2px solid #6d28d9' : '1px solid var(--border-color)',
                          backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.1)' : 'var(--bg-card)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '4px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                            {opt.optionGroupLabel} · {opt.domainTypeLabel}
                          </span>
                          <span style={{ fontSize: '11.5px', fontWeight: 800, color: opt.isFreeDefault ? '#047857' : '#6d28d9', fontFamily: 'monospace' }}>
                            {opt.isFreeDefault ? '무상기본 (₩0)' : `+₩${opt.unitPrice.toLocaleString()}`}
                          </span>
                        </div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-main)' }}>
                          {isSelected ? '✓ ' : '+ '}{opt.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                          세부규격: {opt.subVariant}
                        </div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>원가 ₩{opt.costPrice.toLocaleString()} / 대리점 ₩{opt.dealerPrice.toLocaleString()}</span>
                          <span>장착 {opt.installLeadHours}시간</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 선택된 장착 옵션 및 청구 단가 조정 테이블 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
                    선택된 출고 장착 옵션 및 청구 반영 명세 ({modalAppliedOptions.length}건)
                  </div>
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>옵션분류</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>장착 옵션명 / 세부규격(문열림·길이)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', width: '75px' }}>수량</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', width: '90px' }}>유/무상 구분</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '130px' }}>청구단가 (원)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', width: '125px' }}>옵션 청구공급가</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>장착·시공 메모</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', width: '55px' }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalAppliedOptions.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: '26px', textAlign: 'center', color: 'var(--text-muted)' }}>
                              상단 옵션 카드를 클릭하여 출고 지게차에 장착할 옵션(백레스트, 사이드시프트, 캐빈, 에어컨, 덧발, 센서, 경광등, 무상옵션)을 추가하세요.
                            </td>
                          </tr>
                        ) : (
                          modalAppliedOptions.map((ao, idx) => {
                            const master = optionMasters.find(m => m.id === ao.optionId);
                            const rowSupply = ao.isFreeApplied ? 0 : (Number(ao.qty) || 1) * (Number(ao.unitPrice) || 0);
                            return (
                              <tr key={ao.optionId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '7px 10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                  {ao.optionGroupLabel}
                                </td>
                                <td style={{ padding: '7px 10px' }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{ao.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--primary)' }}>{ao.subVariant}</div>
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                  <input
                                    type="number"
                                    min={1}
                                    value={ao.qty}
                                    onChange={e => {
                                      const nextQty = Math.max(1, parseInt(e.target.value, 10) || 1);
                                      setModalAppliedOptions(prev =>
                                        prev.map((r, i) => (i === idx ? { ...r, qty: nextQty, supplyAmount: r.isFreeApplied ? 0 : nextQty * r.unitPrice } : r))
                                      );
                                    }}
                                    style={{ width: '56px', padding: '4px 6px', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                  />
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalAppliedOptions(prev =>
                                        prev.map((r, i) => {
                                          if (i !== idx) return r;
                                          const nextFree = !r.isFreeApplied;
                                          const restoredPrice = nextFree ? 0 : (r.unitPrice > 0 ? r.unitPrice : (master?.unitPrice || 150000));
                                          return {
                                            ...r,
                                            isFreeApplied: nextFree,
                                            unitPrice: restoredPrice,
                                            supplyAmount: nextFree ? 0 : r.qty * restoredPrice
                                          };
                                        })
                                      );
                                    }}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      border: 'none',
                                      cursor: 'pointer',
                                      backgroundColor: ao.isFreeApplied ? 'rgba(5, 150, 105, 0.14)' : 'rgba(37, 99, 235, 0.12)',
                                      color: ao.isFreeApplied ? '#047857' : '#1d4ed8'
                                    }}
                                  >
                                    {ao.isFreeApplied ? '무상적용' : '유상청구'}
                                  </button>
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    min={0}
                                    step={10000}
                                    disabled={ao.isFreeApplied}
                                    value={ao.isFreeApplied ? 0 : ao.unitPrice}
                                    onChange={e => {
                                      const nextPrice = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setModalAppliedOptions(prev =>
                                        prev.map((r, i) => (i === idx ? { ...r, unitPrice: nextPrice, supplyAmount: r.qty * nextPrice } : r))
                                      );
                                    }}
                                    style={{ width: '108px', padding: '4px 6px', textAlign: 'right', borderRadius: '4px', border: '1px solid var(--border-color)', fontFamily: 'monospace', fontWeight: 700 }}
                                  />
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: ao.isFreeApplied ? '#047857' : '#6d28d9', fontFamily: 'monospace' }}>
                                  {ao.isFreeApplied ? '₩0 (무상)' : `+₩${rowSupply.toLocaleString()}`}
                                </td>
                                <td style={{ padding: '7px 10px' }}>
                                  <input
                                    type="text"
                                    value={ao.note || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setModalAppliedOptions(prev => prev.map((r, i) => (i === idx ? { ...r, note: val } : r)));
                                    }}
                                    placeholder="장착 위치·세부 사양 메모"
                                    style={{ width: '100%', padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                  />
                                </td>
                                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => setModalAppliedOptions(prev => prev.filter((_, i) => i !== idx))}
                                    style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 하단 대차대조 합산 요약 및 최종 확정 버튼 (Gutenberg Z-Pattern Terminal Action) */}
              <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12.5px', fontWeight: 700, flexWrap: 'wrap' }}>
                  <span>장비·품목 공급가액: <strong style={{ fontFamily: 'monospace' }}>₩{baseItemsSupply.toLocaleString()}</strong></span>
                  <span>+</span>
                  <span style={{ color: '#6d28d9' }}>옵션 유상청구 합계: <strong style={{ fontFamily: 'monospace' }}>+₩{modalOptionSupply.toLocaleString()}</strong> (원가 ₩{modalOptionCost.toLocaleString()})</span>
                  <span>=</span>
                  <span style={{ color: 'var(--primary)', fontSize: '13.5px' }}>
                    변경 후 총 청구 공급가액: <strong style={{ fontFamily: 'monospace' }}>₩{combinedSupply.toLocaleString()}</strong> (부가세 포함 ₩{combinedTotal.toLocaleString()})
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setOptionModalOutbound(null)}
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOptionModal}
                    className="btn-primary"
                    style={{ padding: '8px 18px', fontSize: '12.5px', fontWeight: 800, borderRadius: '6px', cursor: 'pointer', backgroundColor: '#6d28d9', border: 'none', color: '#fff' }}
                  >
                    옵션 장착 확정 및 청구액 즉시 반영
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Preview Modal */}
      {previewHtml && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '850px', maxHeight: '90vh', borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '12px 20px', backgroundColor: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{previewTitle}</h3>
              <button onClick={() => setPreviewHtml(null)} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, padding: '20px', overflow: 'auto', backgroundColor: 'var(--bg-app)' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
            <div style={{ padding: '12px 20px', backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setPreviewHtml(null)} style={{ padding: '6px 16px', backgroundColor: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Modal */}
      {proofUrl && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '800px', maxHeight: '92vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <div style={{ padding: '14px 20px', backgroundColor: '#064e3b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={18} /> 납품증빙 서명 확인
              </h3>
              <button onClick={() => setProofUrl(null)} style={{ border: 'none', background: 'none', color: '#fff', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, padding: '20px', overflow: 'auto', textAlign: 'center', backgroundColor: 'var(--bg-app)' }}>
              <img src={proofUrl} alt="서명된 납품확인서" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: '12px 20px', backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setProofUrl(null)} style={{ padding: '6px 16px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default TradeOutboundPage;
