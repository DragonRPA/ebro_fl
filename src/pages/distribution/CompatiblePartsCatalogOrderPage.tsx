import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Search,
  Printer,
  ShoppingBag,
  Layers,
  CheckCircle2,
  Wrench,
  Package,
  Plus,
  Minus,
  RotateCcw,
  Eye,
  Code2,
  X,
  Building2,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import {
  BENCHMARK_PARTS_COMPANIES,
  CATALOG_TO_ORDER_STRATEGY,
  COMPATIBLE_PARTS_CATALOG,
  PART_CATEGORIES,
  TARGET_FORKLIFT_MODELS,
  CompatiblePartCatalogItem,
  PartCategoryType,
  PartDiagramSvgType
} from '../../data/compatiblePartsCatalogData';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { exportToExcel } from '../../services/excel';

// 부품별 정밀 기술 치수 도면 렌더러
const PartTechnicalDiagramSvg: React.FC<{
  type: PartDiagramSvgType;
  size?: 'sm' | 'lg';
}> = ({ type, size = 'sm' }) => {
  const w = size === 'lg' ? 220 : 68;
  const h = size === 'lg' ? 140 : 46;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 160 104"
      style={{
        backgroundColor: '#F8FAFC',
        border: '1px solid #CBD5E1',
        borderRadius: '6px',
        flexShrink: 0,
        display: 'block'
      }}
    >
      {/* 도면 모눈 그리드 배경 */}
      <defs>
        <pattern id={`grid-${type}-${size}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#E2E8F0" strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect width="160" height="104" fill={`url(#grid-${type}-${size})`} />

      {type === 'SOLID_TIRE' && (
        <g>
          <circle cx="54" cy="52" r="34" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
          <circle cx="54" cy="52" r="24" fill="#334155" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="3 2" />
          <circle cx="54" cy="52" r="14" fill="#F1F5F9" stroke="#0F172A" strokeWidth="2" />
          <circle cx="54" cy="52" r="4" fill="#475569" />
          <rect x="104" y="18" width="28" height="68" rx="4" fill="#1E293B" stroke="#0F172A" strokeWidth="1.8" />
          <line x1="100" y1="14" x2="136" y2="14" stroke="#2563EB" strokeWidth="1.5" />
          <text x="118" y="11" fontSize="9" fontWeight="700" fill="#1D4ED8" textAnchor="middle">폭 B</text>
          <text x="54" y="98" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">외경 ØD · 림 Ød</text>
        </g>
      )}

      {type === 'PU_DRIVE_WHEEL' && (
        <g>
          <circle cx="56" cy="50" r="32" fill="#EA580C" stroke="#9A3412" strokeWidth="2" />
          <circle cx="56" cy="50" r="21" fill="#E2E8F0" stroke="#334155" strokeWidth="2" />
          <circle cx="56" cy="50" r="8" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.5" />
          <circle cx="56" cy="36" r="2.2" fill="#0F172A" />
          <circle cx="69" cy="45" r="2.2" fill="#0F172A" />
          <circle cx="64" cy="61" r="2.2" fill="#0F172A" />
          <circle cx="48" cy="61" r="2.2" fill="#0F172A" />
          <circle cx="43" cy="45" r="2.2" fill="#0F172A" />
          <rect x="106" y="20" width="24" height="60" rx="3" fill="#EA580C" stroke="#9A3412" strokeWidth="1.5" />
          <text x="80" y="96" fontSize="9" fontWeight="700" fill="#9A3412" textAnchor="middle">Ø230 × 75 · 5홀</text>
        </g>
      )}

      {type === 'FORGED_FORK' && (
        <g>
          <path d="M 26 16 L 38 16 L 38 72 L 138 72 L 144 76 L 30 76 L 26 70 Z" fill="#334155" stroke="#0F172A" strokeWidth="2" />
          <rect x="22" y="24" width="6" height="10" fill="#2563EB" />
          <rect x="22" y="52" width="6" height="10" fill="#2563EB" />
          <line x1="38" y1="86" x2="144" y2="86" stroke="#2563EB" strokeWidth="1.5" />
          <text x="90" y="97" fontSize="9" fontWeight="700" fill="#1D4ED8" textAnchor="middle">길이 L · 두께 T × 폭 W</text>
        </g>
      )}

      {type === 'FORK_SLEEVE' && (
        <g>
          <polygon points="18,40 132,40 144,48 144,54 18,54" fill="#F59E0B" stroke="#B45309" strokeWidth="2" />
          <rect x="22" y="34" width="8" height="24" rx="2" fill="#1E293B" />
          <line x1="18" y1="70" x2="144" y2="70" stroke="#1D4ED8" strokeWidth="1.5" />
          <text x="80" y="84" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">덧발 L=1,800mm · 내폭 135</text>
        </g>
      )}

      {type === 'SIDE_SHIFTER' && (
        <g>
          <rect x="18" y="22" width="124" height="14" fill="#1E293B" stroke="#0F172A" strokeWidth="1.5" />
          <rect x="18" y="64" width="124" height="12" fill="#334155" stroke="#0F172A" strokeWidth="1.5" />
          <rect x="42" y="42" width="76" height="14" rx="3" fill="#2563EB" stroke="#1E3A8A" strokeWidth="1.5" />
          <line x1="26" y1="49" x2="134" y2="49" stroke="#93C5FD" strokeWidth="2" />
          <text x="80" y="94" fontSize="9" fontWeight="700" fill="#1D4ED8" textAnchor="middle">폭 980mm · 시프트 ±100mm</text>
        </g>
      )}

      {type === 'MAST_BEARING' && (
        <g>
          <circle cx="54" cy="50" r="32" fill="#CBD5E1" stroke="#0F172A" strokeWidth="2.2" />
          <circle cx="54" cy="50" r="22" fill="#64748B" stroke="#1E293B" strokeWidth="1.5" />
          <circle cx="54" cy="50" r="13" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
          <rect x="104" y="18" width="26" height="64" rx="5" fill="#94A3B8" stroke="#0F172A" strokeWidth="2" />
          <line x1="104" y1="37" x2="130" y2="37" stroke="#0F172A" strokeWidth="1.5" />
          <line x1="104" y1="63" x2="130" y2="63" stroke="#0F172A" strokeWidth="1.5" />
          <text x="80" y="96" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">내경 d × 외경 D × 폭 B</text>
        </g>
      )}

      {type === 'LIFT_CHAIN' && (
        <g>
          {[24, 56, 88, 120].map((cx, i) => (
            <g key={i}>
              <rect x={cx - 12} y="32" width="28" height="16" rx="8" fill="#475569" stroke="#0F172A" strokeWidth="1.6" />
              <rect x={cx - 12} y="52" width="28" height="16" rx="8" fill="#64748B" stroke="#0F172A" strokeWidth="1.6" />
              <circle cx={cx} cy="40" r="3.5" fill="#F8FAFC" stroke="#0F172A" strokeWidth="1.2" />
              <circle cx={cx} cy="60" r="3.5" fill="#F8FAFC" stroke="#0F172A" strokeWidth="1.2" />
            </g>
          ))}
          <text x="80" y="92" fontSize="9" fontWeight="700" fill="#1E3A8A" textAnchor="middle">판형 체인 LH1223 / LH1623</text>
        </g>
      )}

      {type === 'AC_CONTROLLER' && (
        <g>
          <rect x="24" y="14" width="112" height="68" rx="6" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
          {[36, 56, 76, 96, 116].map((x, idx) => (
            <circle key={idx} cx={x} cy="30" r="5" fill="#F59E0B" stroke="#78350F" strokeWidth="1.2" />
          ))}
          <rect x="36" y="46" width="88" height="24" rx="3" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.2" />
          <text x="80" y="62" fontSize="9.5" fontWeight="800" fill="#38BDF8" textAnchor="middle">CURTIS AC 80V/24V</text>
          <text x="80" y="96" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">B+ B- U V W 5단자 방열팩</text>
        </g>
      )}

      {type === 'CONTACTOR_RELAY' && (
        <g>
          <rect x="46" y="16" width="68" height="64" rx="4" fill="#1E3A8A" stroke="#0F172A" strokeWidth="2" />
          <rect x="54" y="8" width="16" height="10" fill="#D97706" stroke="#78350F" strokeWidth="1.2" />
          <rect x="90" y="8" width="16" height="10" fill="#D97706" stroke="#78350F" strokeWidth="1.2" />
          <text x="80" y="52" fontSize="10" fontWeight="800" fill="#FFFFFF" textAnchor="middle">SW200 400A</text>
          <text x="80" y="95" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">M10 주접점 컨택터</text>
        </g>
      )}

      {type === 'ALTERNATOR' && (
        <g>
          <circle cx="64" cy="48" r="28" fill="#64748B" stroke="#0F172A" strokeWidth="2" />
          <circle cx="64" cy="48" r="12" fill="#1E293B" stroke="#F8FAFC" strokeWidth="1.5" />
          <rect x="96" y="28" width="22" height="40" rx="3" fill="#334155" stroke="#0F172A" strokeWidth="1.8" />
          <text x="80" y="94" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">24V 90A 풀리 Ø76mm</text>
        </g>
      )}

      {type === 'POWER_CONNECTOR' && (
        <g>
          <rect x="28" y="22" width="46" height="52" rx="5" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
          <rect x="86" y="22" width="46" height="52" rx="5" fill="#334155" stroke="#0F172A" strokeWidth="2" />
          <line x1="74" y1="40" x2="86" y2="40" stroke="#EF4444" strokeWidth="3" />
          <line x1="74" y1="56" x2="86" y2="56" stroke="#2563EB" strokeWidth="3" />
          <text x="80" y="92" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">320A DC150V 암·수 커넥터</text>
        </g>
      )}

      {type === 'LFP_BATTERY_PACK' && (
        <g>
          <rect x="22" y="18" width="116" height="62" rx="5" fill="#065F46" stroke="#064E3B" strokeWidth="2" />
          <rect x="32" y="28" width="96" height="42" rx="3" fill="#047857" stroke="#A7F3D0" strokeWidth="1.2" />
          <text x="80" y="53" fontSize="10.5" fontWeight="800" fill="#ECFDF5" textAnchor="middle">LFP / TRACTION PACK</text>
          <text x="80" y="95" fontSize="9" fontWeight="700" fill="#065F46" textAnchor="middle">BMS 내장 산업용 배터리팩</text>
        </g>
      )}

      {type === 'SEAL_KIT' && (
        <g>
          <circle cx="48" cy="48" r="26" fill="none" stroke="#0284C7" strokeWidth="5" />
          <circle cx="88" cy="44" r="20" fill="none" stroke="#0F172A" strokeWidth="4" />
          <circle cx="116" cy="56" r="14" fill="none" stroke="#EA580C" strokeWidth="3.5" />
          <text x="80" y="94" fontSize="9" fontWeight="700" fill="#0369A1" textAnchor="middle">로드경 Ø50/55 우레탄 씰키트</text>
        </g>
      )}

      {type === 'WET_DISC_BRAKE' && (
        <g>
          <circle cx="58" cy="48" r="30" fill="#B45309" stroke="#78350F" strokeWidth="2" />
          <circle cx="58" cy="48" r="16" fill="#F8FAFC" stroke="#78350F" strokeWidth="2" strokeDasharray="3 2" />
          <circle cx="104" cy="48" r="28" fill="#64748B" stroke="#1E293B" strokeWidth="2" />
          <circle cx="104" cy="48" r="15" fill="#F8FAFC" stroke="#1E293B" strokeWidth="1.5" />
          <text x="80" y="94" fontSize="9" fontWeight="700" fill="#78350F" textAnchor="middle">Ø224 × 34T 습식 디스크 12매</text>
        </g>
      )}

      {type === 'KINGPIN_KIT' && (
        <g>
          <rect x="68" y="14" width="20" height="66" rx="3" fill="#475569" stroke="#0F172A" strokeWidth="2" />
          <rect x="60" y="24" width="36" height="12" rx="2" fill="#2563EB" stroke="#1E3A8A" strokeWidth="1.5" />
          <rect x="60" y="58" width="36" height="12" rx="2" fill="#2563EB" stroke="#1E3A8A" strokeWidth="1.5" />
          <text x="80" y="95" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">킹핀 Ø28 × 182mm 리페어키트</text>
        </g>
      )}

      {type === 'FILTER_PACKAGE' && (
        <g>
          <rect x="24" y="22" width="26" height="52" rx="3" fill="#F59E0B" stroke="#B45309" strokeWidth="1.8" />
          <rect x="58" y="26" width="24" height="48" rx="3" fill="#2563EB" stroke="#1D4ED8" strokeWidth="1.8" />
          <rect x="90" y="18" width="28" height="56" rx="3" fill="#E2E8F0" stroke="#475569" strokeWidth="1.8" />
          <rect x="124" y="28" width="18" height="46" rx="3" fill="#10B981" stroke="#047857" strokeWidth="1.8" />
          <text x="80" y="92" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">오일·연료·에어·유압 4종 세트</text>
        </g>
      )}

      {type === 'SUSPENSION_SEAT' && (
        <g>
          <path d="M 52 16 L 66 16 L 70 52 L 114 52 L 114 66 L 54 66 Z" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
          <rect x="56" y="68" width="54" height="12" rx="2" fill="#475569" stroke="#0F172A" strokeWidth="1.5" />
          <line x1="62" y1="68" x2="104" y2="80" stroke="#F59E0B" strokeWidth="2" />
          <line x1="62" y1="80" x2="104" y2="68" stroke="#F59E0B" strokeWidth="2" />
          <text x="80" y="95" fontSize="9" fontWeight="700" fill="#0F172A" textAnchor="middle">레일 230~330mm · OPS 센서</text>
        </g>
      )}
    </svg>
  );
};

export const CompatiblePartsCatalogOrderPage: React.FC = () => {
  const { products, addProduct, createSalesOrder } = useTrade();
  const { customers, showNoticeModal, showErrorModal } = useApp();

  // ① 좌상단 스코프 상태 (Z-Pattern Start)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || 'c1');
  const [priceTier, setPriceTier] = useState<'DEALER' | 'RETAIL'>('DEALER');
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [onlySelectedOrderItems, setOnlySelectedOrderItems] = useState<boolean>(false);

  // 품목별 주문수량 상태 (partId -> qty)
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({
    'cp-01': 4, // 7.00-12 통타이어 4본 기본 샘플 세팅
    'cp-07': 1, // 1,800mm 포크 덧발 1조
    'cp-09': 8, // 마스트 가이드 베어링 8개
    'cp-20': 2  // 유압실린더 씰 오버홀 키트 2세트
  });

  // 모달 상태
  const [showStrategyModal, setShowStrategyModal] = useState<boolean>(false);
  const [activePartDetail, setActivePartDetail] = useState<CompatiblePartCatalogItem | null>(null);
  const [showOrderSheetPrintModal, setShowOrderSheetPrintModal] = useState<boolean>(false);
  const [printSheetMode, setPrintSheetMode] = useState<'FULL_CATALOG_FORM' | 'SELECTED_ORDER_ONLY'>('FULL_CATALOG_FORM');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  const selectedCustomer = useMemo(
    () => customers.find((c: any) => c.id === selectedCustomerId) || customers[0],
    [customers, selectedCustomerId]
  );

  // 필터링된 카탈로그 리스트
  const filteredCatalog = useMemo(() => {
    return COMPATIBLE_PARTS_CATALOG.filter(item => {
      if (selectedModelFilter !== 'ALL' && !item.compatibleModels.includes(selectedModelFilter)) {
        return false;
      }
      if (selectedCategoryFilter !== 'ALL' && item.category !== selectedCategoryFilter) {
        return false;
      }
      if (onlySelectedOrderItems && (orderQuantities[item.id] || 0) <= 0) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const haystack = [
          item.sku,
          ...item.oemCrossRefCodes,
          item.partName,
          item.category,
          item.specSummary,
          ...item.compatibleModels,
          ...item.compatibleBrands,
          item.manufacturer
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }, [selectedModelFilter, selectedCategoryFilter, onlySelectedOrderItems, searchKeyword, orderQuantities]);

  // 주문 합계 및 마진 대차대조 집계
  const orderSummary = useMemo(() => {
    let selectedLineCount = 0;
    let totalUnitQty = 0;
    let supplyAmount = 0;
    let totalLandedCost = 0;

    const orderedLines: {
      item: CompatiblePartCatalogItem;
      qty: number;
      unitPrice: number;
      lineSupply: number;
      lineCost: number;
      lineMargin: number;
    }[] = [];

    COMPATIBLE_PARTS_CATALOG.forEach(item => {
      const qty = orderQuantities[item.id] || 0;
      if (qty > 0) {
        const unitPrice = priceTier === 'DEALER' ? item.dealerPriceKrw : item.retailPriceKrw;
        const lineSupply = unitPrice * qty;
        const lineCost = item.landedCostKrw * qty;
        const lineMargin = lineSupply - lineCost;

        selectedLineCount += 1;
        totalUnitQty += qty;
        supplyAmount += lineSupply;
        totalLandedCost += lineCost;

        orderedLines.push({
          item,
          qty,
          unitPrice,
          lineSupply,
          lineMargin,
          lineCost
        });
      }
    });

    const vatAmount = Math.round(supplyAmount * 0.1);
    const totalOrderAmount = supplyAmount + vatAmount;
    const expectedGrossProfit = supplyAmount - totalLandedCost;
    const marginRate = supplyAmount > 0 ? (expectedGrossProfit / supplyAmount) * 100 : 0;

    return {
      selectedLineCount,
      totalUnitQty,
      supplyAmount,
      vatAmount,
      totalOrderAmount,
      totalLandedCost,
      expectedGrossProfit,
      marginRate,
      orderedLines
    };
  }, [orderQuantities, priceTier]);

  const handleQtyChange = (partId: string, nextQty: number) => {
    const safeQty = Math.max(0, Math.floor(Number.isFinite(nextQty) ? nextQty : 0));
    setOrderQuantities(prev => ({
      ...prev,
      [partId]: safeQty
    }));
  };

  // 기종별 정기소모품 패키지 1클릭 자동담기
  const handleApplyModelMaintenancePreset = () => {
    const targetModel = selectedModelFilter === 'ALL' ? 'CPD25-GB2Li' : selectedModelFilter;
    const nextMap: Record<string, number> = {};
    COMPATIBLE_PARTS_CATALOG.forEach(item => {
      if (item.compatibleModels.includes(targetModel)) {
        if (item.category === '타이어·휠·캐스터') nextMap[item.id] = 2;
        else if (item.category === '마스트·롤러·체인' && item.sku.includes('BRG')) nextMap[item.id] = 4;
        else if (item.category === '유압·제동·조향' && item.sku.includes('SEALKIT')) nextMap[item.id] = 1;
        else if (item.category === '필터·시트·안전용품') nextMap[item.id] = 1;
      }
    });
    setOrderQuantities(nextMap);
    showNoticeModal(
      `[${targetModel}] 기종에 호환되는 필수 소모품(타이어·마스트베어링·씰키트·안전품목) 표준 발주 수량이 주문서에 자동 반영되었습니다.`
    );
  };

  // 엑셀 카탈로그 겸 주문서 다운로드
  const handleExportCatalogOrderExcel = () => {
    const rows = filteredCatalog.map((item, idx) => {
      const qty = orderQuantities[item.id] || 0;
      const unitPrice = priceTier === 'DEALER' ? item.dealerPriceKrw : item.retailPriceKrw;
      return {
        순번: idx + 1,
        자사호환품번: item.sku,
        순정교차품번: item.oemCrossRefCodes.join(', '),
        계통분류: item.category,
        부품명: item.partName,
        부품등급: item.partGrade,
        원산지구분: item.originCountry,
        핵심규격: item.specSummary,
        적용가능모델: item.compatibleModels.join(', '),
        적용톤급: item.tonnageRange,
        단위: item.unitName,
        최소주문수량: item.moq,
        현재고: item.stockQty,
        보관창고위치: item.warehouseLocation,
        대리점공급단가: item.dealerPriceKrw,
        권장소비자단가: item.retailPriceKrw,
        적용단가: unitPrice,
        주문수량: qty,
        주문공급가액: unitPrice * qty,
        발송기준: item.deliveryPolicy
      };
    });

    exportToExcel(
      rows,
      `지게차_호환부품_카탈로그_겸_주문서_${selectedModelFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      '호환부품카탈로그주문서'
    );
  };

  // 유통 수주·출고 주문 즉시 확정 (TradeContext 연동)
  const handleConfirmErpSalesOrder = async () => {
    if (orderSummary.orderedLines.length === 0) {
      showErrorModal('주문 수량이 1개 이상 입력된 호환부품이 없습니다. 카탈로그에서 수량을 먼저 입력해 주십시오.');
      return;
    }
    if (!selectedCustomer) {
      showErrorModal('주문할 거래처(대리점 또는 고객사)를 선택해 주십시오.');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const orderLinePayload: {
        productId: string;
        qty: number;
        unitPrice: number;
        warehouseName?: string;
        memo?: string;
      }[] = [];

      for (const line of orderSummary.orderedLines) {
        const existingProd = products.find(p => p.skuCode === line.item.sku);
        let targetProductId = existingProd?.id;

        if (!targetProductId) {
          const created = await addProduct({
            skuCode: line.item.sku,
            name: line.item.partName,
            category: line.item.category,
            itemType: 'PART',
            manufacturer: line.item.manufacturer,
            modelName: line.item.compatibleModels.join(', '),
            originCountry: line.item.originCountry === '중국 직수입' ? '중국 수입' : '국내 매입',
            defaultWarehouse: 'B창고',
            spec: `${line.item.specSummary} | 호환품번: ${line.item.oemCrossRefCodes.join(', ')}`,
            unit: line.item.unitName,
            standardCost: line.item.landedCostKrw,
            dealerPrice: line.item.dealerPriceKrw,
            standardPrice: line.item.retailPriceKrw,
            safetyStock: line.item.moq * 2,
            warrantyMonths: 6,
            status: 'ACTIVE',
            cogsMethod: 'FIFO',
            memo: `호환부품 카탈로그 자동연동 (${line.item.tonnageRange})`
          });
          targetProductId = created.id;
        }

        orderLinePayload.push({
          productId: targetProductId,
          qty: line.qty,
          unitPrice: line.unitPrice,
          warehouseName: 'B창고',
          memo: `호환기종: ${line.item.compatibleModels.join('/')} · 순정교차: ${line.item.oemCrossRefCodes[0] || '-'}`
        });
      }

      const createdOrder = await createSalesOrder(selectedCustomer.id, orderLinePayload, {
        customerTier: priceTier === 'DEALER' ? 'DEALER' : 'END_USER',
        orderDate: new Date().toISOString().slice(0, 10),
        deliveryDate: new Date().toISOString().slice(0, 10),
        deliveryLocation: (selectedCustomer as any).address || '거래처 지정 도착지',
        receiverName: (selectedCustomer as any).contactPerson || selectedCustomer.name,
        receiverPhone: (selectedCustomer as any).phone || (selectedCustomer as any).contactPhone || '',
        paymentTerms: priceTier === 'DEALER' ? '월말 마감 익월 10일 현금결제' : '출고 전 완납',
        specialTerms: `호환부품 카탈로그 겸 주문서 직결 발주 (${selectedModelFilter === 'ALL' ? '전 기종 통합' : selectedModelFilter})`,
        status: 'CONFIRMED',
        deliveryMethod: 'COURIER',
        memo: `호환부품 카탈로그 주문 확정 (${orderSummary.selectedLineCount}종 / 총 ${orderSummary.totalUnitQty}점)`
      });

      showNoticeModal(
        `수주번호 [${createdOrder.id}]로 호환부품 ${orderSummary.selectedLineCount}종 (총 주문액 ₩${orderSummary.totalOrderAmount.toLocaleString()}) 수주 및 출고 요청이 확정되었습니다.`
      );
    } catch (err: any) {
      showErrorModal(`호환부품 수주 확정 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100dvh - 64px)',
        backgroundColor: '#F8FAFC',
        overflow: 'hidden'
      }}
    >
      {/* 상단 타이틀 & 4대 벤치마킹/전략 요약 헤더 */}
      <div
        style={{
          padding: '12px 20px',
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexShrink: 0,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', whiteSpace: 'nowrap' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#1E3A8A',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <FileSpreadsheet size={19} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0, whiteSpace: 'nowrap' }}>
                호환부품 카탈로그 · 주문서
              </h1>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1px solid #BFDBFE',
                  whiteSpace: 'nowrap'
                }}
              >
                8대 주력 지게차 × 7대 계통 24종 표준 호환품번 수록
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px', whiteSpace: 'nowrap' }}>
              포크엘 · 파츠케이 · 티브이에이치 · 한지파츠 카탈로그 수집 및 HTML/CSS 구조 분석 기반 일체형 발주 워크벤치
            </div>
          </div>
        </div>

        {/* ② 우상단 파이프라인 액션 버튼군 (Gutenberg Z-Pattern Step 2) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowStrategyModal(true)}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #3B82F6',
              backgroundColor: '#EFF6FF',
              color: '#1D4ED8',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Code2 size={15} />
            <span>벤치마킹 기업 · HTML분석 · 전환전략</span>
          </button>

          <button
            type="button"
            onClick={handleApplyModelMaintenancePreset}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Sparkles size={14} color="#D97706" />
            <span>기종별 필수소모품 일괄담기</span>
          </button>

          <button
            type="button"
            onClick={handleExportCatalogOrderExcel}
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #16A34A',
              backgroundColor: '#F0FDF4',
              color: '#15803D',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <FileSpreadsheet size={14} />
            <span>엑셀 카탈로그 주문서 내보내기</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPrintSheetMode('FULL_CATALOG_FORM');
              setShowOrderSheetPrintModal(true);
            }}
            style={{
              padding: '7px 13px',
              borderRadius: '6px',
              border: '1px solid #0F172A',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Printer size={14} />
            <span>카탈로그 겸 주문서 양식 인쇄</span>
          </button>
        </div>
      </div>

      {/* ① 좌상단 스코프 및 필터 바 (상하 스택 레이블 표준 준수 - 헌장 3.4) */}
      <div
        style={{
          padding: '10px 20px',
          backgroundColor: '#F1F5F9',
          borderBottom: '1px solid #CBD5E1',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexShrink: 0,
          overflowX: 'auto'
        }}
      >
        {/* 주문 거래처 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
            주문 거래처 (대리점·고객사)
          </label>
          <select
            value={selectedCustomerId}
            onChange={e => setSelectedCustomerId(e.target.value)}
            style={{
              height: '32px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#0F172A',
              minWidth: '185px'
            }}
          >
            {customers.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.customerType === 'DEALER' || c.name.includes('대리점') ? '대리점' : '최종고객'})
              </option>
            ))}
          </select>
        </div>

        {/* 단가 적용 기준 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
            카탈로그 단가 기준
          </label>
          <div
            style={{
              display: 'flex',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              padding: '2px',
              gap: '2px'
            }}
          >
            <button
              type="button"
              onClick={() => setPriceTier('DEALER')}
              style={{
                padding: '0 10px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: priceTier === 'DEALER' ? '#1E3A8A' : 'transparent',
                color: priceTier === 'DEALER' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              대리점 공급가
            </button>
            <button
              type="button"
              onClick={() => setPriceTier('RETAIL')}
              style={{
                padding: '0 10px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: priceTier === 'RETAIL' ? '#1E3A8A' : 'transparent',
                color: priceTier === 'RETAIL' ? '#FFFFFF' : '#475569',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              권장 소비자가
            </button>
          </div>
        </div>

        {/* 적용가능 지게차 모델 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
            적용가능 지게차 모델 (기종별 호환 매트릭스)
          </label>
          <select
            value={selectedModelFilter}
            onChange={e => setSelectedModelFilter(e.target.value)}
            style={{
              height: '32px',
              padding: '0 10px',
              borderRadius: '6px',
              border: selectedModelFilter !== 'ALL' ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              backgroundColor: selectedModelFilter !== 'ALL' ? '#EFF6FF' : '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#0F172A',
              minWidth: '240px'
            }}
          >
            <option value="ALL">전체 지게차 모델 호환부품 ({COMPATIBLE_PARTS_CATALOG.length}종)</option>
            {TARGET_FORKLIFT_MODELS.map(m => (
              <option key={m.modelName} value={m.modelName}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* 부품 계통 분류 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
            부품 계통 분류
          </label>
          <select
            value={selectedCategoryFilter}
            onChange={e => setSelectedCategoryFilter(e.target.value)}
            style={{
              height: '32px',
              padding: '0 10px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#0F172A',
              minWidth: '165px'
            }}
          >
            <option value="ALL">전체 계통 (7대 어셈블리)</option>
            {PART_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* 품번 · 순정품번 · 규격 통합 검색 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
            호환품번 · 순정품번 · 치수규격 검색
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} color="#64748B" style={{ position: 'absolute', left: '10px' }} />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="예: 7.00-12, MG30811, 1238E, 덧발, 1800, 커티스..."
              style={{
                width: '100%',
                height: '32px',
                padding: '0 10px 0 30px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                fontSize: '12.5px',
                color: '#0F172A'
              }}
            />
          </div>
        </div>

        {/* 주문담긴 품목만 보기 토글 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
            주문서 필터
          </label>
          <button
            type="button"
            onClick={() => setOnlySelectedOrderItems(prev => !prev)}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: '6px',
              border: onlySelectedOrderItems ? '1.5px solid #1D4ED8' : '1px solid #CBD5E1',
              backgroundColor: onlySelectedOrderItems ? '#DBEAFE' : '#FFFFFF',
              color: onlySelectedOrderItems ? '#1E3A8A' : '#334155',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            주문수량 입력품목만 ({orderSummary.selectedLineCount}종)
          </button>
        </div>
      </div>

      {/* ③ 중앙 본문: 고밀도 카탈로그 겸 인라인 주문서 그리드 (화면 세로 영역 80%+ 확보) */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12.5px',
            backgroundColor: '#FFFFFF'
          }}
        >
          <thead
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              backgroundColor: '#0F172A',
              color: '#F8FAFC'
            }}
          >
            <tr>
              <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                상세 · 선택
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                규격도면
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                자사 호환품번 / 순정 교차품번
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                계통분류 / 부품명 / 등급
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                핵심 실측 규격 (치수 · 사양)
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                적용가능 지게차 모델 (호환 기종)
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                현재고 · 창고위치
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                {priceTier === 'DEALER' ? '대리점 공급단가' : '권장 소비자단가'}
              </th>
              <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155', backgroundColor: '#1E3A8A' }}>
                주문수량 입력
              </th>
              <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', backgroundColor: '#1E3A8A' }}>
                주문 공급가액
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredCatalog.map((item, idx) => {
              const qty = orderQuantities[item.id] || 0;
              const isSelected = qty > 0;
              const unitPrice = priceTier === 'DEALER' ? item.dealerPriceKrw : item.retailPriceKrw;
              const lineAmount = unitPrice * qty;
              const unitMarginRate = Math.round(((unitPrice - item.landedCostKrw) / unitPrice) * 100);

              return (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid #E2E8F0',
                    backgroundColor: isSelected ? '#EFF6FF' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'
                  }}
                >
                  {/* 1. 상세 액션 + 체크박스 (가장 왼쪽 컬럼 고정 원칙 - 헌장 3.2) */}
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => handleQtyChange(item.id, e.target.checked ? Math.max(item.moq, 1) : 0)}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => setActivePartDetail(item)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          color: '#1E3A8A',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        도면·상세 ➔
                      </button>
                    </div>
                  </td>

                  {/* 2. 규격도면 SVG */}
                  <td style={{ padding: '5px 8px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div
                      onClick={() => setActivePartDetail(item)}
                      style={{ cursor: 'pointer', display: 'inline-block' }}
                      title="클릭하여 치수 규격 도면 확대"
                    >
                      <PartTechnicalDiagramSvg type={item.diagramType} size="sm" />
                    </div>
                  </td>

                  {/* 3. 자사 호환품번 / 순정 교차품번 */}
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '12.5px', fontFamily: 'monospace' }}>
                      {item.sku}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'nowrap' }}>
                      {item.oemCrossRefCodes.slice(0, 2).map(code => (
                        <span
                          key={code}
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            border: '1px solid #CBD5E1',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          순정호환 {code}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* 4. 계통분류 / 부품명 / 등급 */}
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: '#E0E7FF',
                          color: '#1E40AF',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.category}
                      </span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: item.partGrade === '순정 OEM' ? '#DCFCE7' : item.partGrade === 'A급 재생 호환' ? '#FEF3C7' : '#F1F5F9',
                          color: item.partGrade === '순정 OEM' ? '#166534' : item.partGrade === 'A급 재생 호환' ? '#92400E' : '#334155',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.partGrade} · {item.originCountry}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '13px', whiteSpace: 'nowrap' }}>
                      {item.partName}
                    </div>
                  </td>

                  {/* 5. 핵심 실측 규격 */}
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {item.specSummary}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap' }}>
                      제조·공급: {item.manufacturer} | 최소주문: {item.moq}{item.unitName}
                    </div>
                  </td>

                  {/* 6. 적용가능 지게차 모델 */}
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                      {item.compatibleModels.map(m => {
                        const isMatchedModel = selectedModelFilter === m;
                        return (
                          <span
                            key={m}
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: isMatchedModel ? '#1D4ED8' : '#EFF6FF',
                              color: isMatchedModel ? '#FFFFFF' : '#1E40AF',
                              border: '1px solid #BFDBFE',
                              whiteSpace: 'nowrap',
                              flexShrink: 0
                            }}
                          >
                            {m}
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px', whiteSpace: 'nowrap' }}>
                      {item.tonnageRange}
                    </div>
                  </td>

                  {/* 7. 현재고 / 창고위치 */}
                  <td style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ fontWeight: 800, color: item.stockQty <= 5 ? '#DC2626' : '#15803D', fontSize: '12.5px' }}>
                      {item.stockQty.toLocaleString()} {item.unitName}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {item.warehouseLocation}
                    </div>
                  </td>

                  {/* 8. 적용 단가 (대리점가 / 소비자가 / 마진율) */}
                  <td style={{ padding: '7px 10px', textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '13.5px' }}>
                      ₩{unitPrice.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {priceTier === 'DEALER'
                        ? `소비자가 ₩${item.retailPriceKrw.toLocaleString()}`
                        : `대리점가 ₩${item.dealerPriceKrw.toLocaleString()}`}{' '}
                      · 이익률 {unitMarginRate}%
                    </div>
                  </td>

                  {/* 9. 인라인 주문수량 스테퍼 */}
                  <td style={{ padding: '7px 10px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(item.id, qty - 1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={qty}
                        onChange={e => handleQtyChange(item.id, Number(e.target.value))}
                        style={{
                          width: '52px',
                          height: '26px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: isSelected ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                          fontWeight: 800,
                          fontSize: '13px',
                          color: isSelected ? '#1D4ED8' : '#0F172A'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleQtyChange(item.id, qty + 1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </td>

                  {/* 10. 주문 공급가액 */}
                  <td
                    style={{
                      padding: '7px 12px',
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                      fontWeight: 800,
                      fontSize: '13.5px',
                      color: isSelected ? '#1D4ED8' : '#94A3B8'
                    }}
                  >
                    {isSelected ? `₩${lineAmount.toLocaleString()}` : '₩0'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ④ 우하단 대차대조 합계 검증 및 최종 수주 확정 바 (Gutenberg Z-Pattern Terminal Action) */}
      <div
        style={{
          padding: '12px 20px',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          borderTop: '2px solid #1E3A8A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexShrink: 0,
          flexWrap: 'wrap'
        }}
      >
        {/* 대차대조 검증식 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#93C5FD' }}>
            선택 품목: <strong style={{ color: '#FFFFFF' }}>{orderSummary.selectedLineCount}종 ({orderSummary.totalUnitQty}점)</strong>
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0' }}>
            📄 총 주문합계 <strong style={{ color: '#38BDF8', fontSize: '15px' }}>₩{orderSummary.totalOrderAmount.toLocaleString()}</strong>
            {' = '}
            🟢 공급가액 <strong>₩{orderSummary.supplyAmount.toLocaleString()}</strong>
            {' + '}
            부가세 <strong>₩{orderSummary.vatAmount.toLocaleString()}</strong>
          </div>
          <div
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.18)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#6EE7B7',
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            ⚖️ 예상 매출이익 ₩{orderSummary.expectedGrossProfit.toLocaleString()} (마진율 {orderSummary.marginRate.toFixed(1)}% · 원가차액 ₩0)
          </div>
        </div>

        {/* 우하단 최종 완결 버튼군 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setOrderQuantities({})}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #475569',
              backgroundColor: '#1E293B',
              color: '#CBD5E1',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap'
            }}
          >
            <RotateCcw size={14} />
            <span>수량 초기화</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPrintSheetMode('SELECTED_ORDER_ONLY');
              setShowOrderSheetPrintModal(true);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: '1px solid #60A5FA',
              backgroundColor: '#1E3A8A',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Printer size={15} />
            <span>선택품목 견적 · 주문서 발행</span>
          </button>

          <button
            type="button"
            disabled={isSubmittingOrder}
            onClick={handleConfirmErpSalesOrder}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              border: '1px solid #3B82F6',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              fontSize: '13.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <CheckCircle2 size={16} />
            <span>{isSubmittingOrder ? '수주 생성 중...' : '유통 수주 · 출고 주문 확정'}</span>
          </button>
        </div>
      </div>

      {/* 모달 1: 호환부품 전문 기업 벤치마킹 · HTML/CSS 분석 · 자체 카탈로그 전환 전략 */}
      {showStrategyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1180px',
              maxHeight: '90dvh',
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '16px 22px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0 }}>
                  지게차 호환부품 전문 기업 조사 · 판매사이트 HTML/CSS 분석 · 자체 카탈로그 겸 주문서 전환 전략
                </h2>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>
                  국내외 4대 호환부품 전문 플랫폼의 웹 DOM/CSS 구조 해부 및 당사 일체형 발주 카탈로그 전환 마스터플랜
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStrategyModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#CBD5E1',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={22} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* 섹션 A: 자체 카탈로그 겸 주문서 전환 4단계 전략 */}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>
                  Ⅰ. 자체 카탈로그 겸 주문서 전환 4단계 핵심 전략
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  {CATALOG_TO_ORDER_STRATEGY.map(phase => (
                    <div
                      key={phase.stepNumber}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#F8FAFC'
                      }}
                    >
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1E3A8A', marginBottom: '4px' }}>
                        {phase.phaseTitle}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                        목표: {phase.coreObjective}
                      </div>
                      <ul style={{ margin: '0 0 8px 16px', padding: 0, fontSize: '12px', color: '#334155', lineHeight: 1.55 }}>
                        {phase.keyExecutionItems.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                      <div
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          backgroundColor: '#EFF6FF',
                          color: '#1D4ED8',
                          fontSize: '11.5px',
                          fontWeight: 700
                        }}
                      >
                        기대 편익: {phase.expectedBusinessImpact}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 섹션 B: 호환부품 전문 판매 기업 4대 벤치마킹 및 HTML/CSS 구조 분석 */}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>
                  Ⅱ. 호환부품 전문 판매 기업 벤치마킹 및 판매사이트 HTML/CSS 구조 분석
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {BENCHMARK_PARTS_COMPANIES.map(comp => (
                    <div
                      key={comp.id}
                      style={{
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{comp.companyName}</span>
                          <span
                            style={{
                              fontSize: '11.5px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#F1F5F9',
                              color: '#334155'
                            }}
                          >
                            {comp.countryOrigin} · {comp.domainUrl}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#1D4ED8' }}>{comp.pricingModel}</span>
                      </div>

                      <div style={{ fontSize: '12.5px', color: '#334155', marginBottom: '10px' }}>
                        <strong>전문 영역:</strong> {comp.specialization} | <strong>주요 취급 브랜드:</strong> {comp.targetBrands.join(', ')}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.1fr 1fr',
                          gap: '12px',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#0F172A',
                          color: '#E2E8F0',
                          fontSize: '11.5px'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, color: '#38BDF8', marginBottom: '4px' }}>
                            판매사이트 DOM · CSS 셀렉터 구조 분석
                          </div>
                          <div>• 목록 컨테이너: <code>{comp.htmlCssDomArchitecture.listContainerDom}</code></div>
                          <div>• 상품 카드 DOM: <code>{comp.htmlCssDomArchitecture.itemCardDom}</code></div>
                          <div>• 상세 규격 DOM: <code>{comp.htmlCssDomArchitecture.detailSpecDom}</code></div>
                          <div>• CSS 특징: {comp.htmlCssDomArchitecture.cssLayoutCharacteristics}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#FBBF24', marginBottom: '4px' }}>
                            실제 수집된 HTML 스니펫
                          </div>
                          <pre
                            style={{
                              margin: 0,
                              padding: '6px 8px',
                              backgroundColor: '#1E293B',
                              borderRadius: '4px',
                              fontSize: '10.5px',
                              overflowX: 'auto',
                              color: '#A7F3D0'
                            }}
                          >
                            {comp.htmlCssDomArchitecture.crawledSampleHtmlSnippet}
                          </pre>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: '10px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#EFF6FF',
                          border: '1px solid #BFDBFE',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1E3A8A'
                        }}
                      >
                        당사 자체 카탈로그 겸 주문서 반영 포인트: {comp.ourConversionTakeaway}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 모달 2: 개별 호환부품 정밀 치수 도면 및 적용기종 상세 모달 */}
      {activePartDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '760px',
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ fontSize: '11.5px', color: '#93C5FD', fontWeight: 700 }}>
                  {activePartDetail.category} · {activePartDetail.sku}
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '2px 0 0 0' }}>{activePartDetail.partName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePartDetail(null)}
                style={{ background: 'transparent', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <PartTechnicalDiagramSvg type={activePartDetail.diagramType} size="lg" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                  <div>
                    <strong>자사 표준 호환품번:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1D4ED8' }}>{activePartDetail.sku}</span>
                  </div>
                  <div>
                    <strong>호환 순정품번:</strong> {activePartDetail.oemCrossRefCodes.join(' / ')}
                  </div>
                  <div>
                    <strong>제조·공급원 및 등급:</strong> {activePartDetail.manufacturer} ({activePartDetail.originCountry} · {activePartDetail.partGrade})
                  </div>
                  <div>
                    <strong>적용 지게차 모델:</strong> {activePartDetail.compatibleModels.join(', ')} ({activePartDetail.tonnageRange})
                  </div>
                  <div>
                    <strong>대리점 공급가 / 권장 소비자가:</strong>{' '}
                    <strong style={{ color: '#1D4ED8' }}>₩{activePartDetail.dealerPriceKrw.toLocaleString()}</strong> /{' '}
                    <strong>₩{activePartDetail.retailPriceKrw.toLocaleString()}</strong> (입고원가 ₩{activePartDetail.landedCostKrw.toLocaleString()})
                  </div>
                  <div>
                    <strong>창고 위치 및 발송기준:</strong> {activePartDetail.warehouseLocation} (현재고 {activePartDetail.stockQty}{activePartDetail.unitName}) · {activePartDetail.deliveryPolicy}
                  </div>
                </div>
              </div>

              {/* 실측 치수 규격 테이블 */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                  정밀 실측 규격 및 사양
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <tbody>
                    {activePartDetail.detailedSpecs.map((sp, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #E2E8F0', borderTop: i === 0 ? '1px solid #CBD5E1' : 'none' }}>
                        <th
                          style={{
                            width: '180px',
                            padding: '8px 12px',
                            backgroundColor: '#F1F5F9',
                            textAlign: 'left',
                            color: '#334155',
                            fontWeight: 700
                          }}
                        >
                          {sp.label}
                        </th>
                        <td style={{ padding: '8px 12px', color: '#0F172A', fontWeight: 600 }}>{sp.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  fontSize: '12px',
                  color: '#334155'
                }}
              >
                <div><strong>수집 및 가격 레퍼런스:</strong> {activePartDetail.referenceSource}</div>
                <div style={{ marginTop: '3px' }}><strong>장착 및 정비 기술 노트:</strong> {activePartDetail.technicalNote}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 모달 3: A4 정식 [호환부품 자체 카탈로그 겸 주문서] 인쇄 미리보기 모달 */}
      {showOrderSheetPrintModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1060px',
              maxHeight: '92dvh',
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* 모달 상단 컨트롤 바 */}
            <div
              style={{
                padding: '12px 20px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 800 }}>
                  지게차 호환부품 자체 카탈로그 겸 주문서 양식
                </span>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1E293B', padding: '3px', borderRadius: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setPrintSheetMode('FULL_CATALOG_FORM')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: printSheetMode === 'FULL_CATALOG_FORM' ? '#2563EB' : 'transparent',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    전체 카탈로그 겸 발주서 양식 ({filteredCatalog.length}종)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintSheetMode('SELECTED_ORDER_ONLY')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: printSheetMode === 'SELECTED_ORDER_ONLY' ? '#2563EB' : 'transparent',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    선택 주문품목 전용 발주서 ({orderSummary.selectedLineCount}종)
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    border: '1px solid #3B82F6',
                    backgroundColor: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Printer size={14} />
                  <span>지금 인쇄 / PDF 저장</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowOrderSheetPrintModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* A4 인쇄 본문 영역 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px', backgroundColor: '#FFFFFF', color: '#0F172A' }}>
              <div
                style={{
                  border: '2px solid #0F172A',
                  padding: '24px',
                  backgroundColor: '#FFFFFF'
                }}
              >
                {/* 문서 헤더 */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    borderBottom: '2px solid #0F172A',
                    paddingBottom: '14px',
                    marginBottom: '16px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E3A8A' }}>
                      전 브랜드 지게차 호환부품 · 어태치먼트 · 마스트 · 전장 통합 공급망
                    </div>
                    <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '4px 0', color: '#0F172A' }}>
                      지게차 호환부품 카탈로그 겸 주문서
                    </h1>
                    <div style={{ fontSize: '12px', color: '#475569' }}>
                      적용 기종 범위: {selectedModelFilter === 'ALL' ? '안후이 헬리 · 비와이디 · 항차 · 이피 · 두산 · 현대 · 클라크 · 도요타 8대 기종 통합' : selectedModelFilter}
                    </div>
                  </div>

                  {/* 수신/발신 테이블 */}
                  <table style={{ borderCollapse: 'collapse', fontSize: '11.5px', minWidth: '320px' }}>
                    <tbody>
                      <tr>
                        <th style={{ border: '1px solid #0F172A', padding: '4px 8px', backgroundColor: '#F1F5F9', textAlign: 'left' }}>
                          발주 거래처
                        </th>
                        <td style={{ border: '1px solid #0F172A', padding: '4px 8px', fontWeight: 700 }}>
                          {selectedCustomer?.name || '귀중'}
                        </td>
                        <th style={{ border: '1px solid #0F172A', padding: '4px 8px', backgroundColor: '#F1F5F9', textAlign: 'left' }}>
                          단가 구분
                        </th>
                        <td style={{ border: '1px solid #0F172A', padding: '4px 8px', fontWeight: 700, color: '#1D4ED8' }}>
                          {priceTier === 'DEALER' ? '대리점 공급가' : '권장 소비자가'}
                        </td>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid #0F172A', padding: '4px 8px', backgroundColor: '#F1F5F9', textAlign: 'left' }}>
                          발행 일자
                        </th>
                        <td style={{ border: '1px solid #0F172A', padding: '4px 8px' }}>
                          {new Date().toISOString().slice(0, 10)}
                        </td>
                        <th style={{ border: '1px solid #0F172A', padding: '4px 8px', backgroundColor: '#F1F5F9', textAlign: 'left' }}>
                          출고 기준
                        </th>
                        <td style={{ border: '1px solid #0F172A', padding: '4px 8px' }}>
                          평택 물류센터 16시 당일발송
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 카탈로그 겸 주문서 본문 테이블 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'center' }}>선택</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'center' }}>도면</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'left' }}>호환품번 / 순정품번</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'left' }}>계통 / 부품명</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'left' }}>핵심 규격 및 적용가능 모델</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'right' }}>공급단가</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'center' }}>주문수량</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'right' }}>공급가액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(printSheetMode === 'SELECTED_ORDER_ONLY'
                      ? filteredCatalog.filter(i => (orderQuantities[i.id] || 0) > 0)
                      : filteredCatalog
                    ).map(item => {
                      const qty = orderQuantities[item.id] || 0;
                      const unitPrice = priceTier === 'DEALER' ? item.dealerPriceKrw : item.retailPriceKrw;
                      return (
                        <tr key={item.id}>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px', textAlign: 'center', fontWeight: 800 }}>
                            {qty > 0 ? '☑' : '☐'}
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '4px', textAlign: 'center' }}>
                            <PartTechnicalDiagramSvg type={item.diagramType} size="sm" />
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px', fontFamily: 'monospace' }}>
                            <div style={{ fontWeight: 800, color: '#0F172A' }}>{item.sku}</div>
                            <div style={{ fontSize: '10px', color: '#475569' }}>{item.oemCrossRefCodes.slice(0, 2).join(', ')}</div>
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px' }}>
                            <div style={{ fontSize: '10px', color: '#1E3A8A', fontWeight: 700 }}>{item.category}</div>
                            <div style={{ fontWeight: 700 }}>{item.partName}</div>
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px' }}>
                            <div>{item.specSummary}</div>
                            <div style={{ fontSize: '10.5px', color: '#1D4ED8', fontWeight: 700, marginTop: '2px' }}>
                              적용기종: {item.compatibleModels.join(', ')} ({item.tonnageRange})
                            </div>
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px', textAlign: 'right', fontWeight: 700 }}>
                            ₩{unitPrice.toLocaleString()}
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px', textAlign: 'center', fontWeight: 800 }}>
                            {qty > 0 ? `${qty} ${item.unitName}` : `____ ${item.unitName}`}
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px', textAlign: 'right', fontWeight: 800 }}>
                            {qty > 0 ? `₩${(unitPrice * qty).toLocaleString()}` : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* 하단 합계 및 주문자 서명란 */}
                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '2px solid #0F172A',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#334155' }}>
                    ※ 본 양식은 호환부품 규격 카탈로그와 발주서를 겸하며, 수량 기입 후 회신 또는 시스템에서 즉시 수주 확정하실 수 있습니다.
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                    공급가액 ₩{orderSummary.supplyAmount.toLocaleString()} + 부가세 ₩{orderSummary.vatAmount.toLocaleString()} = 총 주문합계{' '}
                    <span style={{ color: '#1D4ED8', fontSize: '16px' }}>₩{orderSummary.totalOrderAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
