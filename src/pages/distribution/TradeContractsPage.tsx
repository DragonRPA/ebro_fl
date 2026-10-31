import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet, Plus, Download, Search, RefreshCw,
  CheckCircle2, Clock, FileText, Edit2, Trash2, Check, X, Layers
} from 'lucide-react';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { TradeSalesOrder } from '../../services/db';
import { TradeContractBundleModal } from '../../components/TradeContractBundleModal';
import { exportToExcel } from '../../services/excel';
import { createHangulMatcher } from '../../utils/hangulSearch';

interface DraftOrderLine {
  key: string;
  id?: string;
  productId: string;
  qty: number;
  unitPrice: number;
  serialNumbersText: string;
  memo: string;
}

export const TradeContractsPage: React.FC = () => {
  const { customers, currentUser, showErrorModal } = useApp();
  const {
    products,
    inventoryLots,
    salesOrders,
    salesOrderLines,
    getCustomerName,
    getCustomerById,
    getProductStock,
    createSalesOrder,
    updateSalesOrder,
    acceptSalesOrder,
    cancelSalesOrder,
    deleteSalesOrder
  } = useTrade();

  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3200);
  };

  const customerOptions = useMemo(() => {
    const flCustomers = [
      { id: 'DEALER-001', name: '경기지게차판매 대리점', address: '경기도 화성시 팔탄면 서해로 1024', representative: '박진우', repContact: '031-352-8811', tier: 'DEALER' as const },
      { id: 'DEALER-002', name: '영남기계상사 대리점', address: '경상남도 김해시 골든루트로 188', representative: '최동훈', repContact: '055-338-4490', tier: 'DEALER' as const },
      { id: 'CUST-001', name: '평택항만물류 주식회사', address: '경기도 평택시 포승읍 평택항만길 85', representative: '윤영준', repContact: '031-681-1114', tier: 'END_USER' as const },
      { id: 'CUST-002', name: '대한식품냉동 물류센터', address: '충청북도 음성군 대소면 대풍산단로 44', representative: '오세철', repContact: '043-877-5114', tier: 'END_USER' as const }
    ];
    if (customers && customers.length > 0) {
      const merged = [...flCustomers];
      customers.forEach(c => {
        if (!merged.some(m => m.id === c.id)) {
          merged.push({
            id: c.id,
            name: c.name,
            address: c.address || '',
            representative: c.representative || '',
            repContact: c.repContact || '',
            tier: c.name.includes('대리점') ? 'DEALER' : 'END_USER'
          });
        }
      });
      return merged;
    }
    return flCustomers;
  }, [customers]);

  // Quick Order Bar state
  const [quickCustomerSearch, setQuickCustomerSearch] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customerOptions[0]?.id || 'DEALER-001');
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || 'p1');
  const [orderQty, setOrderQty] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inStockProducts = useMemo(() => {
    return products.filter(p => p.status === 'ACTIVE' && getProductStock(p.id).availableQty > 0);
  }, [products, getProductStock]);

  const filteredQuickCustomerOptions = useMemo(() => {
    const q = quickCustomerSearch.trim();
    if (!q) return customerOptions;
    const matcher = createHangulMatcher(q);
    return customerOptions.filter(
      c =>
        matcher(c.name || '') ||
        matcher((c as any).businessNumber || '') ||
        matcher((c as any).representative || '') ||
        matcher((c as any).repContact || '')
    );
  }, [customerOptions, quickCustomerSearch]);

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'DEALER' | 'END_USER'>('ALL');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'GENERATED' | 'SENT'>('ALL');

  // Contract Bundle Modal state
  const [modalOrderId, setModalOrderId] = useState<string | null>(null);

  // Order Create / Edit Modal state
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<TradeSalesOrder | null>(null);
  const [modalCustomerSearch, setModalCustomerSearch] = useState<string>('');
  const [formCustomerId, setFormCustomerId] = useState<string>(customerOptions[0]?.id || 'DEALER-001');
  const [formCustomerTier, setFormCustomerTier] = useState<'DEALER' | 'END_USER'>('DEALER');
  const [formOrderDate, setFormOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formDeliveryDate, setFormDeliveryDate] = useState<string>(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [formDeliveryLocation, setFormDeliveryLocation] = useState<string>('');
  const [formReceiverName, setFormReceiverName] = useState<string>('');
  const [formReceiverPhone, setFormReceiverPhone] = useState<string>('');
  const [formPaymentTerms, setFormPaymentTerms] = useState<string>('물품 납품 및 검수 완료 후 계산서 발행, 30일 이내 현금 결제');
  const [formSpecialTerms, setFormSpecialTerms] = useState<string>('1. 보증기간 차대번호 기준 12~24개월\n2. 물품 인수 검수 기한 3영업일');
  const [formMemo, setFormMemo] = useState<string>('');
  const [formLines, setFormLines] = useState<DraftOrderLine[]>([]);

  const filteredModalCustomerOptions = useMemo(() => {
    const q = modalCustomerSearch.trim();
    if (!q) return customerOptions;
    const matcher = createHangulMatcher(q);
    return customerOptions.filter(
      c =>
        matcher(c.name || '') ||
        matcher((c as any).businessNumber || '') ||
        matcher((c as any).representative || '') ||
        matcher((c as any).repContact || '')
    );
  }, [customerOptions, modalCustomerSearch]);

  const getRecommendedUnitPrice = (productId: string, tier: 'DEALER' | 'END_USER') => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return 0;
    if (tier === 'DEALER') {
      return prod.dealerPrice || Math.round(prod.standardPrice * 0.89);
    }
    return prod.standardPrice;
  };

  // Quick Order Handler
  const handleCreateOrder = async () => {
    if (inStockProducts.length === 0) {
      showErrorModal('현재 가용 재고가 남아있는 판매 가능 제품이 없습니다.');
      return;
    }
    const product = inStockProducts.find(p => p.id === selectedProductId) || inStockProducts[0];
    const customerId =
      filteredQuickCustomerOptions.some(c => c.id === selectedCustomerId)
        ? selectedCustomerId
        : filteredQuickCustomerOptions[0]?.id || selectedCustomerId || customerOptions[0]?.id || 'DEALER-001';
    const isDealer = customerId.startsWith('DEALER-') || getCustomerName(customerId).includes('대리점');
    const tier: 'DEALER' | 'END_USER' = isDealer ? 'DEALER' : 'END_USER';
    const unitPrice = getRecommendedUnitPrice(product.id, tier);

    setIsSubmitting(true);
    try {
      const created = await createSalesOrder(
        customerId,
        [
          {
            productId: product.id,
            qty: orderQty,
            unitPrice
          }
        ],
        {
          customerTier: tier
        }
      );
      showToast(`수주 [${created.id}] (${product.name} ${orderQty}개 · ${tier === 'DEALER' ? '대리점가' : '최종고객가'}) 등록이 완료되었습니다.`);
    } catch (err: any) {
      showErrorModal(`수주 등록 실패: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Detailed Create Order Modal
  const openCreateModal = () => {
    const activeProd = inStockProducts[0] || products[0];
    if (!activeProd) {
      showErrorModal('등록된 판매 가능 제품이 없습니다.');
      return;
    }
    const firstCust = customerOptions[0];
    const isDealer = firstCust?.id.startsWith('DEALER-') || firstCust?.name.includes('대리점');
    const tier: 'DEALER' | 'END_USER' = isDealer ? 'DEALER' : 'END_USER';

    setEditingOrder(null);
    setModalCustomerSearch('');
    setFormCustomerId(firstCust?.id || 'DEALER-001');
    setFormCustomerTier(tier);
    const today = new Date().toISOString().split('T')[0];
    setFormOrderDate(today);
    setFormDeliveryDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setFormDeliveryLocation((firstCust as any)?.address || '고객사 지정 현장');
    setFormReceiverName((firstCust as any)?.representative || '인수담당자');
    setFormReceiverPhone((firstCust as any)?.repContact || '010-0000-0000');
    setFormPaymentTerms('물품 납품 및 검수 완료 후 계산서 발행, 30일 이내 현금 결제');
    setFormSpecialTerms('1. 보증기간 차대번호 기준 12~24개월\n2. 물품 인수 검수 기한 3영업일');
    setFormMemo('');
    setFormLines([
      {
        key: `line-${Date.now()}`,
        productId: activeProd.id,
        qty: 1,
        unitPrice: getRecommendedUnitPrice(activeProd.id, tier),
        serialNumbersText: '',
        memo: ''
      }
    ]);
    setIsOrderModalOpen(true);
  };

  // Open Edit Order Modal
  const openEditModal = (order: TradeSalesOrder) => {
    const lines = salesOrderLines.filter(l => l.orderId === order.id);
    const cust = getCustomerById(order.customerId);
    const tier: 'DEALER' | 'END_USER' =
      order.customerTier || (order.customerId.startsWith('DEALER-') || getCustomerName(order.customerId).includes('대리점') ? 'DEALER' : 'END_USER');

    setEditingOrder(order);
    setModalCustomerSearch('');
    setFormCustomerId(order.customerId);
    setFormCustomerTier(tier);
    setFormOrderDate(order.orderDate);
    setFormDeliveryDate(order.deliveryDate || order.orderDate);
    setFormDeliveryLocation(order.deliveryLocation || cust?.address || '');
    setFormReceiverName(order.receiverName || cust?.representative || '');
    setFormReceiverPhone(order.receiverPhone || cust?.repContact || '');
    setFormPaymentTerms(order.paymentTerms || '납품 후 30일 이내 현금 결제');
    setFormSpecialTerms(order.specialTerms || '');
    setFormMemo(order.memo || '');
    setFormLines(
      lines.map(l => ({
        key: l.id,
        id: l.id,
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        serialNumbersText: (l.serialNumbers || []).join(', '),
        memo: l.memo || ''
      }))
    );
    setIsOrderModalOpen(true);
  };

  const applyTierPricingToLines = (nextTier: 'DEALER' | 'END_USER') => {
    setFormCustomerTier(nextTier);
    setFormLines(prev =>
      prev.map(l => ({
        ...l,
        unitPrice: getRecommendedUnitPrice(l.productId, nextTier)
      }))
    );
  };

  const handleCustomerChangeInModal = (custId: string) => {
    setFormCustomerId(custId);
    const cust = customerOptions.find(c => c.id === custId);
    const nextTier: 'DEALER' | 'END_USER' =
      custId.startsWith('DEALER-') || (cust?.name || '').includes('대리점') ? 'DEALER' : 'END_USER';
    setFormCustomerTier(nextTier);
    if (!editingOrder) {
      setFormLines(prev =>
        prev.map(l => ({
          ...l,
          unitPrice: getRecommendedUnitPrice(l.productId, nextTier)
        }))
      );
      if (cust) {
        setFormDeliveryLocation((cust as any).address || '');
        setFormReceiverName((cust as any).representative || '');
        setFormReceiverPhone((cust as any).repContact || '');
      }
    }
  };

  const handleAddDraftLine = () => {
    const activeProd = inStockProducts[0] || products[0];
    if (!activeProd) {
      showErrorModal('가용 재고가 남아있는 제품이 없습니다.');
      return;
    }
    setFormLines(prev => [
      ...prev,
      {
        key: `line-${Date.now()}-${Math.random()}`,
        productId: activeProd.id,
        qty: 1,
        unitPrice: getRecommendedUnitPrice(activeProd.id, formCustomerTier),
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
    const price = getRecommendedUnitPrice(nextProductId, formCustomerTier);
    setFormLines(prev =>
      prev.map(l =>
        l.key === key
          ? { ...l, productId: nextProductId, unitPrice: price, serialNumbersText: '' }
          : l
      )
    );
  };

  const handleSaveOrderModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerId) {
      showErrorModal('거래처를 선택해 주세요.');
      return;
    }
    if (formLines.length === 0) {
      showErrorModal('최소 1개 이상의 수주 품목을 입력해 주세요.');
      return;
    }

    try {
      if (editingOrder) {
        await updateSalesOrder(
          editingOrder.id,
          {
            customerId: formCustomerId,
            customerTier: formCustomerTier,
            orderDate: formOrderDate,
            deliveryDate: formDeliveryDate,
            deliveryLocation: formDeliveryLocation,
            receiverName: formReceiverName,
            receiverPhone: formReceiverPhone,
            paymentTerms: formPaymentTerms,
            specialTerms: formSpecialTerms,
            memo: formMemo
          },
          formLines.map(l => ({
            id: l.id,
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            serialNumbers: l.serialNumbersText
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            memo: l.memo
          }))
        );
        showToast(`수주 [${editingOrder.id}] 판매단가 및 매출이익 내역이 수정되었습니다.`);
      } else {
        const created = await createSalesOrder(
          formCustomerId,
          formLines.map(l => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            serialNumbers: l.serialNumbersText
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            memo: l.memo
          })),
          {
            customerTier: formCustomerTier,
            orderDate: formOrderDate,
            deliveryDate: formDeliveryDate,
            deliveryLocation: formDeliveryLocation,
            receiverName: formReceiverName,
            receiverPhone: formReceiverPhone,
            paymentTerms: formPaymentTerms,
            specialTerms: formSpecialTerms,
            salespersonName: currentUser?.name || '유통영업팀',
            memo: formMemo,
            status: 'CONFIRMED'
          }
        );
        showToast(`신규 수주 계약 [${created.id}] 체결 및 출고 파이프라인이 생성되었습니다.`);
      }
      setIsOrderModalOpen(false);
    } catch (err: any) {
      showErrorModal(err.message || '수주 저장 실패');
    }
  };

  const handleAcceptOrder = async (order: TradeSalesOrder) => {
    try {
      await acceptSalesOrder(order.id);
      showToast(`수주 [${order.id}] 건이 확정 처리되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '수주 확정 실패');
    }
  };

  const handleCancelOrder = async (order: TradeSalesOrder) => {
    if (!window.confirm(`수주 [${order.id}] 건을 취소하시겠습니까?\n(차감된 재고 로트가 원복되며 연결된 출고요청도 함께 취소됩니다.)`)) return;
    try {
      await cancelSalesOrder(order.id, '담당자 수주 취소');
      showToast(`수주 [${order.id}] 건이 취소되었으며 재고가 원복되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '수주 취소 실패');
    }
  };

  const handleDeleteOrder = async (order: TradeSalesOrder) => {
    if (!window.confirm(`수주 [${order.id}] 내역을 영구 삭제하시겠습니까?`)) return;
    try {
      await deleteSalesOrder(order.id);
      showToast(`수주 [${order.id}] 내역이 삭제되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '수주 삭제 실패');
    }
  };

  // 품목 및 차대번호 요약 헬퍼
  const getOrderItemsSummary = (orderId: string) => {
    const lines = salesOrderLines.filter(l => l.orderId === orderId);
    if (lines.length === 0) return '품목 정보 없음';
    const firstProd = products.find(p => p.id === lines[0].productId);
    const firstName = firstProd?.name || '유통제품';
    if (lines.length === 1) {
      return `${firstName} (${lines[0].qty}${firstProd?.unit || '대'})`;
    }
    return `${firstName} 외 ${lines.length - 1}건 (총 ${lines.reduce((s, l) => s + l.qty, 0)}개)`;
  };

  const getOrderSerialSummary = (orderId: string) => {
    const lines = salesOrderLines.filter(l => l.orderId === orderId);
    const serials = lines.flatMap(l => l.serialNumbers || []);
    if (serials.length === 0) return '-';
    if (serials.length === 1) return serials[0];
    return `${serials[0]} 외 ${serials.length - 1}대`;
  };

  // 필터링된 수주 목록
  const filteredOrders = useMemo(() => {
    const matcher = searchTerm.trim() ? createHangulMatcher(searchTerm.trim()) : null;
    return salesOrders
      .filter(o => {
        if (startDate && o.orderDate < startDate) return false;
        if (endDate && o.orderDate > endDate) return false;
        const effectiveTier =
          o.customerTier || (o.customerId.startsWith('DEALER-') || getCustomerName(o.customerId).includes('대리점') ? 'DEALER' : 'END_USER');
        if (tierFilter !== 'ALL' && effectiveTier !== tierFilter) return false;
        if (customerFilter !== 'ALL' && o.customerId !== customerFilter) return false;
        if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;

        const docStatus = o.contractDocStatus || 'DRAFT';
        if (statusFilter !== 'ALL' && docStatus !== statusFilter) return false;

        const lines = salesOrderLines.filter(l => l.orderId === o.id);
        if (productFilter !== 'ALL' && !lines.some(l => l.productId === productFilter)) return false;

        if (matcher) {
          const custName = getCustomerName(o.customerId);
          const itemSum = getOrderItemsSummary(o.id);
          const serialSum = lines.flatMap(l => l.serialNumbers || []).join(' ');
          const hit =
            matcher(o.id) ||
            matcher(custName) ||
            matcher(itemSum) ||
            matcher(serialSum) ||
            matcher(o.deliveryLocation || '') ||
            matcher(o.receiverName || '') ||
            matcher(o.memo || '');
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [
    salesOrders,
    salesOrderLines,
    startDate,
    endDate,
    tierFilter,
    customerFilter,
    productFilter,
    orderStatusFilter,
    statusFilter,
    searchTerm,
    getCustomerName
  ]);

  // 통계 집계 (매입원가, 판매금액, 매출총이익, 이익률)
  const stats = useMemo(() => {
    const activeOrders = salesOrders.filter(o => o.status !== 'CANCELLED');
    const totalCount = activeOrders.length;
    const totalSales = activeOrders.reduce((sum, o) => sum + o.totalSalesAmount, 0);
    const totalCogs = activeOrders.reduce((sum, o) => sum + o.totalCogsAmount, 0);
    const totalProfit = totalSales - totalCogs;
    const profitMargin = totalSales > 0 ? Math.round((totalProfit / totalSales) * 1000) / 10 : 0;
    return { totalCount, totalSales, totalCogs, totalProfit, profitMargin };
  }, [salesOrders]);

  // 엑셀 다운로드
  const handleExportExcel = () => {
    const rows = filteredOrders.map((o, idx) => {
      const effectiveTier =
        o.customerTier || (o.customerId.startsWith('DEALER-') || getCustomerName(o.customerId).includes('대리점') ? 'DEALER' : 'END_USER');
      const profit = o.totalSalesAmount - o.totalCogsAmount;
      const margin = o.totalSalesAmount > 0 ? Math.round((profit / o.totalSalesAmount) * 1000) / 10 : 0;
      return {
        순번: idx + 1,
        주문번호: o.id,
        주문일자: o.orderDate,
        납기요청일: o.deliveryDate || '-',
        거래처구분: effectiveTier === 'DEALER' ? '대리점' : '최종고객',
        거래처명: getCustomerName(o.customerId),
        품목명세: getOrderItemsSummary(o.id),
        출고차대번호: getOrderSerialSummary(o.id),
        매입원가: o.totalCogsAmount,
        판매공급가액: o.totalSalesAmount,
        매출총이익: profit,
        매출이익률퍼센트: margin,
        부가세포함합계: Math.round(o.totalSalesAmount * 1.1),
        인도장소: o.deliveryLocation || '-',
        인수담당자: o.receiverName || '-',
        수주상태: o.status,
        계약서상태: o.contractDocStatus || 'DRAFT'
      };
    });
    exportToExcel(
      rows,
      `거래처별판매_매출이익대장_${new Date().toISOString().split('T')[0]}`,
      '매출및매출이익관리'
    );
    showToast('거래처별 판매 및 매출이익 대장 엑셀 파일이 다운로드되었습니다.');
  };

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setTierFilter('ALL');
    setCustomerFilter('ALL');
    setProductFilter('ALL');
    setSearchTerm('');
    setOrderStatusFilter('ALL');
    setStatusFilter('ALL');
  };

  const hasActiveFilter =
    Boolean(startDate || endDate || searchTerm) ||
    tierFilter !== 'ALL' ||
    customerFilter !== 'ALL' ||
    productFilter !== 'ALL' ||
    orderStatusFilter !== 'ALL' ||
    statusFilter !== 'ALL';

  const draftSupplyTotal = formLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const draftEstimatedCogsTotal = formLines.reduce((s, l) => {
    const prod = products.find(p => p.id === l.productId);
    const estCost = prod ? (getProductStock(prod.id).avgUnitCost || prod.standardCost || 0) : 0;
    return s + l.qty * estCost;
  }, 0);
  const draftEstimatedProfit = draftSupplyTotal - draftEstimatedCogsTotal;
  const draftVatTotal = Math.round(draftSupplyTotal * 0.1);

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

      {/* 1. 상단 헤더 및 수주 파이프라인 바 */}
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
            data-mid="trade_contracts-header"
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
            <FileSpreadsheet size={20} color="var(--primary)" />
            <span>거래처별 판매 · 매출이익 관리</span>
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', whiteSpace: 'nowrap' }}>
            대리점 및 최종고객 판매단가 차등 적용, 차대번호 지정 수주, 제품별 매입원가·판매금액·매출이익 관리
          </div>
        </div>

        {/* 신규 수주 파이프라인 + 상세 모달 + 엑셀 다운로드 */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <input
              type="text"
              value={quickCustomerSearch}
              onChange={e => {
                const val = e.target.value;
                setQuickCustomerSearch(val);
                if (val.trim()) {
                  const matcher = createHangulMatcher(val.trim());
                  const firstMatch = customerOptions.find(
                    c =>
                      matcher(c.name || '') ||
                      matcher((c as any).businessNumber || '') ||
                      matcher((c as any).representative || '')
                  );
                  if (firstMatch) setSelectedCustomerId(firstMatch.id);
                }
              }}
              placeholder="거래처 검색..."
              style={{ width: '115px', padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
            <select
              data-mid="trade_contracts-customer-select"
              value={
                filteredQuickCustomerOptions.some(c => c.id === selectedCustomerId)
                  ? selectedCustomerId
                  : filteredQuickCustomerOptions[0]?.id || ''
              }
              onChange={e => setSelectedCustomerId(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', minWidth: '150px' }}
            >
              {filteredQuickCustomerOptions.length === 0 ? (
                <option value="">검색된 거래처 없음</option>
              ) : (
                filteredQuickCustomerOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
          </div>

          <select
            data-mid="trade_contracts-product-select"
            value={
              inStockProducts.some(p => p.id === selectedProductId)
                ? selectedProductId
                : inStockProducts[0]?.id || ''
            }
            onChange={e => setSelectedProductId(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
          >
            {inStockProducts.length === 0 ? (
              <option value="">가용 재고 제품 없음</option>
            ) : (
              inStockProducts.map(p => {
                const st = getProductStock(p.id);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} (재고: {st.availableQty}{p.unit || '대'} / 대리점 ₩{(p.dealerPrice || p.standardPrice).toLocaleString()} · 고객 ₩{p.standardPrice.toLocaleString()})
                  </option>
                );
              })
            )}
          </select>

          <input
            data-mid="trade_contracts-qty-input"
            type="number"
            min={1}
            value={orderQty}
            onChange={e => setOrderQty(Math.max(1, Number(e.target.value)))}
            style={{ width: '60px', padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
          />

          <button
            type="button"
            data-mid="trade_contracts-create-btn"
            onClick={handleCreateOrder}
            disabled={isSubmitting || inStockProducts.length === 0}
            className="btn-save"
            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            <Plus size={14} /> {isSubmitting ? '등록 중...' : '빠른 판매등록'}
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="btn-primary"
            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            <Layers size={14} /> 수주 상세 등록
          </button>

          <button
            type="button"
            data-mid="trade_contracts-excel-btn"
            onClick={handleExportExcel}
            className="btn-excel-download"
            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', cursor: 'pointer' }}
          >
            <Download size={14} /> 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* 2. KPI 요약 카드 (판매금액, 매입원가, 매출이익, 이익률) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: '12px', flexShrink: 0 }}>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>총 판매금액 (공급가액 · {stats.totalCount}건)</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
            ₩{stats.totalSales.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>총 매입원가 (도착원가 기준)</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
            ₩{stats.totalCogs.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>총 매출이익 (판매금액 - 매입원가)</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#059669', whiteSpace: 'nowrap' }}>
            ₩{stats.totalProfit.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ padding: '12px 16px', margin: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>평균 매출이익률</div>
          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
            {stats.profitMargin}%
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
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>거래처 구분</label>
          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value as any)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 (대리점+최종고객)</option>
            <option value="DEALER">대리점</option>
            <option value="END_USER">최종고객</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>주문 기간</label>
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
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>거래처 선택</label>
          <select
            value={customerFilter}
            onChange={e => setCustomerFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 거래처</option>
            {customerOptions.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
              data-mid="trade_contracts-search-input"
              placeholder="주문번호 / 거래처 / 차대번호 검색"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '6px 10px 6px 28px', fontSize: '12px', width: '190px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>거래 상태</label>
          <select
            value={orderStatusFilter}
            onChange={e => setOrderStatusFilter(e.target.value as any)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 거래상태</option>
            <option value="PENDING">수주접수</option>
            <option value="CONFIRMED">수주확정</option>
            <option value="SHIPPED">배송중</option>
            <option value="DELIVERED">납품완료</option>
            <option value="CANCELLED">취소</option>
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

      {/* 4. 중앙 본문: 고밀도 그리드 테이블 */}
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
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', width: '250px' }}>계약서 / 업무 처리</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>주문번호 / 일자</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>거래처구분</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>거래처명</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>제품 명세</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>출고 차대번호</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매입원가</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>판매금액(공급가)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>매출이익 · 이익률</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>수주 상태</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>계약서 상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    조회된 거래처 판매 및 매출이익 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(o => {
                  const docStatus = o.contractDocStatus || 'DRAFT';
                  const effectiveTier =
                    o.customerTier || (o.customerId.startsWith('DEALER-') || getCustomerName(o.customerId).includes('대리점') ? 'DEALER' : 'END_USER');
                  const profit = o.totalSalesAmount - o.totalCogsAmount;
                  const margin = o.totalSalesAmount > 0 ? Math.round((profit / o.totalSalesAmount) * 1000) / 10 : 0;

                  return (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border-color)', height: '42px' }}>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            data-mid={`trade_contracts-action-btn-${o.id}`}
                            onClick={() => setModalOrderId(o.id)}
                            className="btn-save"
                            style={{
                              padding: '4px 9px',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              borderRadius: '4px'
                            }}
                          >
                            <FileSpreadsheet size={12} /> 계약서 ➔
                          </button>

                          {o.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => handleAcceptOrder(o)}
                              style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: 'none', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                            >
                              <Check size={11} /> 확정
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
                              onClick={() => handleCancelOrder(o)}
                              style={{ padding: '4px 7px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}
                            >
                              취소
                            </button>
                          )}

                          {(o.status === 'CANCELLED' || o.status === 'PENDING') && (
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(o)}
                              style={{ padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>{o.id}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{o.orderDate}</div>
                      </td>

                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: effectiveTier === 'DEALER' ? '#ede9fe' : '#e0f2fe',
                            color: effectiveTier === 'DEALER' ? '#6d28d9' : '#0369a1'
                          }}
                        >
                          {effectiveTier === 'DEALER' ? '대리점' : '최종고객'}
                        </span>
                      </td>

                      <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {getCustomerName(o.customerId)}
                      </td>

                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {getOrderItemsSummary(o.id)}
                      </td>

                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {getOrderSerialSummary(o.id)}
                      </td>

                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        ₩{o.totalCogsAmount.toLocaleString()}
                      </td>

                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>
                        ₩{o.totalSalesAmount.toLocaleString()}
                      </td>

                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 800, color: profit >= 0 ? '#059669' : '#dc2626' }}>
                          ₩{profit.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '5px' }}>
                          ({margin}%)
                        </span>
                      </td>

                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor:
                              o.status === 'DELIVERED'
                                ? '#dcfce7'
                                : o.status === 'SHIPPED'
                                ? '#e0e7ff'
                                : o.status === 'CONFIRMED'
                                ? '#dbeafe'
                                : o.status === 'CANCELLED'
                                ? '#fee2e2'
                                : '#fef3c7',
                            color:
                              o.status === 'DELIVERED'
                                ? '#166534'
                                : o.status === 'SHIPPED'
                                ? '#3730a3'
                                : o.status === 'CONFIRMED'
                                ? '#1d4ed8'
                                : o.status === 'CANCELLED'
                                ? '#991b1b'
                                : '#b45309',
                            fontWeight: 700
                          }}
                        >
                          {o.status === 'DELIVERED'
                            ? '납품완료'
                            : o.status === 'SHIPPED'
                            ? '배송중'
                            : o.status === 'CONFIRMED'
                            ? '수주확정'
                            : o.status === 'CANCELLED'
                            ? '취소됨'
                            : '수주접수'}
                        </span>
                      </td>

                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span
                          data-mid={`trade_contracts-doc_status-${o.id}`}
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor:
                              docStatus === 'SENT'
                                ? '#dcfce7'
                                : docStatus === 'GENERATED'
                                ? '#fef3c7'
                                : 'var(--bg-secondary)',
                            color:
                              docStatus === 'SENT'
                                ? '#166534'
                                : docStatus === 'GENERATED'
                                ? '#b45309'
                                : 'var(--text-muted)',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {docStatus === 'SENT' ? (
                            <><CheckCircle2 size={11} /> 발송완료</>
                          ) : docStatus === 'GENERATED' ? (
                            <><FileText size={11} /> 양식생성됨</>
                          ) : (
                            <><Clock size={11} /> 작성대기</>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredOrders.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '2px solid var(--border-color)', fontWeight: 800 }}>
                  <td colSpan={6} style={{ padding: '10px 12px', color: 'var(--text-main)' }}>
                    조회 합계 ({filteredOrders.length}건)
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-main)' }}>
                    ₩{filteredOrders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + o.totalCogsAmount, 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)' }}>
                    ₩{filteredOrders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + o.totalSalesAmount, 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>
                    ₩{filteredOrders.filter(o => o.status !== 'CANCELLED').reduce((s, o) => s + (o.totalSalesAmount - o.totalCogsAmount), 0).toLocaleString()}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* 하단 호환용 카드 셀렉터 보존 */}
        <div data-mid="trade_contracts-cards" style={{ display: 'none' }}>
          {salesOrders.map(o => (
            <div key={o.id}>
              <div>주문번호: {o.id.substring(0, 8)}</div>
              <div>총액: {o.totalSalesAmount.toLocaleString()}원</div>
              <div>상태: {o.status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 수주 상세 등록 / 수정 모달 */}
      {isOrderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '880px', maxWidth: '96vw', maxHeight: '92vh', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                {editingOrder ? `판매 수주 및 매출이익 수정 (${editingOrder.id})` : '신규 거래처 판매 수주 상세 등록'}
              </h3>
              <button type="button" onClick={() => setIsOrderModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveOrderModal} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>거래처 단가 구분 *</label>
                  <select
                    value={formCustomerTier}
                    onChange={e => applyTierPricingToLines(e.target.value as 'DEALER' | 'END_USER')}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                  >
                    <option value="DEALER">대리점 공급가 적용</option>
                    <option value="END_USER">최종고객 판매가 적용</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>거래처 조회 및 선택 *</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={modalCustomerSearch}
                      onChange={e => {
                        const val = e.target.value;
                        setModalCustomerSearch(val);
                        if (val.trim()) {
                          const matcher = createHangulMatcher(val.trim());
                          const firstMatch = customerOptions.find(
                            c =>
                              matcher(c.name || '') ||
                              matcher((c as any).businessNumber || '') ||
                              matcher((c as any).representative || '')
                          );
                          if (firstMatch) handleCustomerChangeInModal(firstMatch.id);
                        }
                      }}
                      placeholder="거래처명 검색..."
                      style={{ width: '42%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                    />
                    <select
                      value={
                        filteredModalCustomerOptions.some(c => c.id === formCustomerId)
                          ? formCustomerId
                          : filteredModalCustomerOptions[0]?.id || ''
                      }
                      onChange={e => handleCustomerChangeInModal(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 600 }}
                    >
                      {filteredModalCustomerOptions.length === 0 ? (
                        <option value="">검색된 거래처 없음</option>
                      ) : (
                        filteredModalCustomerOptions.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>주문일자 *</label>
                  <input
                    type="date"
                    required
                    value={formOrderDate}
                    onChange={e => setFormOrderDate(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>납기요청일 *</label>
                  <input
                    type="date"
                    required
                    value={formDeliveryDate}
                    onChange={e => setFormDeliveryDate(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>인도장소 (배송지 주소) *</label>
                  <input
                    type="text"
                    required
                    value={formDeliveryLocation}
                    onChange={e => setFormDeliveryLocation(e.target.value)}
                    placeholder="납품 현장 주소"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>인수 담당자명</label>
                  <input
                    type="text"
                    value={formReceiverName}
                    onChange={e => setFormReceiverName(e.target.value)}
                    placeholder="인수자 성명"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>인수자 연락처</label>
                  <input
                    type="text"
                    value={formReceiverPhone}
                    onChange={e => setFormReceiverPhone(e.target.value)}
                    placeholder="010-0000-0000"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              {/* 수주 품목 테이블 */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>수주 품목 · 원가 및 매출이익 명세 ({formLines.length}건)</span>
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
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>수량 *</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '110px' }}>매입원가(대당)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '120px' }}>판매단가(원) *</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '115px' }}>예상 매출이익</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', width: '175px' }}>출고 차대번호 (선택)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: '45px' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formLines.map(line => {
                      const selectableProducts = products.filter(
                        p =>
                          (p.status === 'ACTIVE' && getProductStock(p.id).availableQty > 0) ||
                          p.id === line.productId
                      );
                      const prod = products.find(p => p.id === line.productId);
                      const avgCost = prod ? (getProductStock(prod.id).avgUnitCost || prod.standardCost || 0) : 0;
                      const lineProfit = (line.unitPrice - avgCost) * line.qty;
                      const availSerials = inventoryLots
                        .filter(lot => lot.productId === line.productId && lot.remainingQty > 0 && lot.serialNumber)
                        .map(lot => lot.serialNumber as string);

                      return (
                        <tr key={line.key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '8px 10px' }}>
                            <select
                              value={line.productId}
                              onChange={e => handleLineProductChange(line.key, e.target.value)}
                              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 600 }}
                            >
                              {selectableProducts.map(p => {
                                const st = getProductStock(p.id);
                                return (
                                  <option key={p.id} value={p.id}>
                                    [{p.skuCode}] {p.name} (재고: {st.availableQty}{p.unit || '대'})
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
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
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            ₩{avgCost.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              min={0}
                              required
                              value={line.unitPrice}
                              onChange={e => {
                                const val = Math.max(0, Number(e.target.value));
                                setFormLines(prev => prev.map(l => (l.key === line.key ? { ...l, unitPrice: val } : l)));
                              }}
                              style={{ width: '100%', padding: '6px 8px', fontSize: '12px', textAlign: 'right', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: lineProfit >= 0 ? '#059669' : '#dc2626' }}>
                            ₩{lineProfit.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="text"
                              list={`serials-${line.key}`}
                              placeholder={availSerials.length > 0 ? `가용: ${availSerials[0]}` : '자동 선입선출 배정'}
                              value={line.serialNumbersText}
                              onChange={e => {
                                const val = e.target.value;
                                setFormLines(prev => prev.map(l => (l.key === line.key ? { ...l, serialNumbersText: val } : l)));
                              }}
                              style={{ width: '100%', padding: '6px 8px', fontSize: '11.5px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontFamily: 'monospace' }}
                            />
                            <datalist id={`serials-${line.key}`}>
                              {availSerials.map(sn => (
                                <option key={sn} value={sn} />
                              ))}
                            </datalist>
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
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ padding: '10px 14px', backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '20px', fontSize: '12.5px' }}>
                  <div>예상 매입원가: <strong>₩{draftEstimatedCogsTotal.toLocaleString()}</strong></div>
                  <div>판매 공급가액: <strong>₩{draftSupplyTotal.toLocaleString()}</strong></div>
                  <div style={{ color: '#059669', fontWeight: 800 }}>예상 매출이익: ₩{draftEstimatedProfit.toLocaleString()}</div>
                  <div style={{ color: 'var(--primary)', fontWeight: 800 }}>부가세 포함 총액: ₩{(draftSupplyTotal + draftVatTotal).toLocaleString()}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>결제 조건</label>
                  <input
                    type="text"
                    value={formPaymentTerms}
                    onChange={e => setFormPaymentTerms(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>수주 특기사항 / 메모</label>
                  <input
                    type="text"
                    value={formMemo}
                    onChange={e => setFormMemo(e.target.value)}
                    placeholder="대리점 프로모션, 납품 현장 특이사항 등"
                    style={{ padding: '8px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}
                >
                  {editingOrder ? '수주 수정 저장' : '수주 체결 확정'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. 계약서 편집 및 이메일 발송 모달 */}
      {modalOrderId && (
        <TradeContractBundleModal
          isOpen={Boolean(modalOrderId)}
          onClose={() => setModalOrderId(null)}
          orderId={modalOrderId}
        />
      )}
    </div>
  );
};
export default TradeContractsPage;
