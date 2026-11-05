import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet,
  Search,
  Printer,
  Layers,
  CheckCircle2,
  Plus,
  Minus,
  RotateCcw,
  X,
  Database,
  Sliders,
  LayoutGrid,
  Image as ImageIcon,
  Trash2,
  Copy,
  Save,
  RefreshCw,
  Globe
} from 'lucide-react';
import {
  COMPATIBLE_PARTS_CATALOG,
  PART_CATEGORIES,
  TARGET_FORKLIFT_MODELS,
  SEED_CUSTOM_CATALOGS,
  TVH_ONLINE_BRAND_BUNDLES,
  CompatiblePartCatalogItem,
  CustomCatalogConfig,
  CustomCatalogItemOverride,
  PartCategoryType,
  PartDiagramSvgType
} from '../../data/compatiblePartsCatalogData';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { exportToExcel } from '../../services/excel';
import { db } from '../../services/db';

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

  // DB 테이블 연동 상태: fl_tvh_catalog_items & fl_custom_catalogs
  const [catalogItems, setCatalogItems] = useState<CompatiblePartCatalogItem[]>(() => {
    const stored = db.tvhCatalogItems;
    return Array.isArray(stored) && stored.length > 0 ? stored : COMPATIBLE_PARTS_CATALOG;
  });
  const [customCatalogs, setCustomCatalogs] = useState<CustomCatalogConfig[]>(() => {
    const stored = db.customCatalogs;
    return Array.isArray(stored) && stored.length > 0 ? stored : SEED_CUSTOM_CATALOGS;
  });
  const [selectedCustomCatalogId, setSelectedCustomCatalogId] = useState<string>('ALL');
  const [layoutMode, setLayoutMode] = useState<'GRID_ORDER' | 'PHOTO_BROCHURE' | 'TECH_DRAWING'>('GRID_ORDER');

  // ① 좌상단 스코프 상태
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || 'c1');
  const [priceTier, setPriceTier] = useState<'DEALER' | 'RETAIL' | 'CUSTOM'>('DEALER');
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [onlySelectedOrderItems, setOnlySelectedOrderItems] = useState<boolean>(false);

  // 품목별 주문수량 상태
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({
    'cp-01': 4,
    'cp-07': 1,
    'cp-09': 8,
    'cp-20': 2
  });

  // 모달 상태
  const [activePartDetail, setActivePartDetail] = useState<CompatiblePartCatalogItem | null>(null);
  const [showOrderSheetPrintModal, setShowOrderSheetPrintModal] = useState<boolean>(false);
  const [printSheetMode, setPrintSheetMode] = useState<'FULL_CATALOG_FORM' | 'SELECTED_ORDER_ONLY'>('FULL_CATALOG_FORM');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  // 티브이에이치 제품 수집 및 품목 DB 관리 모달 상태
  const [showTvhCollectorModal, setShowTvhCollectorModal] = useState<boolean>(false);
  const [collectorTab, setCollectorTab] = useState<'ONLINE_COLLECT' | 'ITEM_DB_FORM'>('ONLINE_COLLECT');
  const [tvhRefSearchInput, setTvhRefSearchInput] = useState<string>('');
  const [isSyncingTvhDb, setIsSyncingTvhDb] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CompatiblePartCatalogItem | null>(null);

  // 맞춤 카탈로그 빌더 모달 상태
  const [showCatalogBuilderModal, setShowCatalogBuilderModal] = useState<boolean>(false);
  const [editingCatalogDraft, setEditingCatalogDraft] = useState<CustomCatalogConfig>(() => SEED_CUSTOM_CATALOGS[0]);
  const [builderSearchKeyword, setBuilderSearchKeyword] = useState<string>('');
  const [isSavingCatalog, setIsSavingCatalog] = useState<boolean>(false);

  // 마운트 시 원격 Supabase DB에서 최신 수집 품목 및 맞춤 카탈로그 동기화
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Promise.all([
          db.pullTableFromSupabase('tvhCatalogItems'),
          db.pullTableFromSupabase('customCatalogs')
        ]);
        if (!mounted) return;
        if (Array.isArray(db.tvhCatalogItems) && db.tvhCatalogItems.length > 0) {
          const sanitized = db.tvhCatalogItems.map(it => ({
            ...it,
            partName: (it.partName || '').replace('프리미엄 ', ''),
            imageUrl: it.imageUrl?.includes('Brakes.jpg')
              ? 'https://www.tvh.com/sites/tvh/files/inline-images/Transmission%20parts.jpg'
              : it.imageUrl
          }));
          db.tvhCatalogItems = sanitized;
          setCatalogItems(sanitized);
        } else {
          db.tvhCatalogItems = [...COMPATIBLE_PARTS_CATALOG];
          db.upsertRows('tvhCatalogItems', COMPATIBLE_PARTS_CATALOG);
          await db.awaitPendingWrites();
          if (mounted) setCatalogItems([...COMPATIBLE_PARTS_CATALOG]);
        }
        if (Array.isArray(db.customCatalogs) && db.customCatalogs.length > 0) {
          setCustomCatalogs([...db.customCatalogs]);
        } else {
          db.customCatalogs = [...SEED_CUSTOM_CATALOGS];
          db.upsertRows('customCatalogs', SEED_CUSTOM_CATALOGS);
          await db.awaitPendingWrites();
          if (mounted) setCustomCatalogs([...SEED_CUSTOM_CATALOGS]);
        }
      } catch {
        // 오프라인 시 로컬 시드 유지
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const activeCustomCatalog = useMemo(
    () => customCatalogs.find(c => c.id === selectedCustomCatalogId) || null,
    [customCatalogs, selectedCustomCatalogId]
  );

  // 맞춤 카탈로그 선택 전환 핸들러
  const handleSelectCustomCatalog = (catalogId: string) => {
    setSelectedCustomCatalogId(catalogId);
    if (catalogId === 'ALL') {
      setPriceTier('DEALER');
      return;
    }
    const found = customCatalogs.find(c => c.id === catalogId);
    if (!found) return;
    setLayoutMode(found.layoutMode || 'GRID_ORDER');
    if (found.targetCustomerType === 'DEALER') setPriceTier('DEALER');
    else if (found.targetCustomerType === 'END_USER') setPriceTier('RETAIL');
    else setPriceTier('CUSTOM');

    // 기본 추천 주문수량이 지정된 경우 자동 세팅
    const nextQtyMap: Record<string, number> = {};
    Object.values(found.itemOverrides || {}).forEach(ov => {
      if (ov && ov.defaultOrderQty && ov.defaultOrderQty > 0) {
        nextQtyMap[ov.itemId] = ov.defaultOrderQty;
      }
    });
    if (Object.keys(nextQtyMap).length > 0) {
      setOrderQuantities(nextQtyMap);
    }
  };

  // 품목별 최종 적용 단가 계산 (맞춤 지정단가 / 할인·할증율 반영)
  const resolveUnitPrice = (item: CompatiblePartCatalogItem): number => {
    if (activeCustomCatalog) {
      const ov = activeCustomCatalog.itemOverrides?.[item.id];
      if (ov?.customPriceKrw && ov.customPriceKrw > 0 && priceTier === 'CUSTOM') {
        return ov.customPriceKrw;
      }
      const base =
        priceTier === 'DEALER'
          ? item.dealerPriceKrw
          : priceTier === 'RETAIL'
          ? item.retailPriceKrw
          : ov?.customPriceKrw && ov.customPriceKrw > 0
          ? ov.customPriceKrw
          : item.dealerPriceKrw;
      const rate = Number(activeCustomCatalog.priceAdjustRate || 0);
      if (rate !== 0 && priceTier !== 'CUSTOM') {
        return Math.round((base * (100 + rate)) / 1000) * 10;
      }
      return base;
    }
    return priceTier === 'RETAIL' ? item.retailPriceKrw : item.dealerPriceKrw;
  };

  const selectedCustomer = useMemo(
    () => customers.find((c: any) => c.id === selectedCustomerId) || customers[0],
    [customers, selectedCustomerId]
  );

  // 필터링된 카탈로그 리스트
  const filteredCatalog = useMemo(() => {
    return catalogItems.filter(item => {
      if (item.isActive === false) return false;
      if (activeCustomCatalog && activeCustomCatalog.selectedItemIds.length > 0) {
        if (!activeCustomCatalog.selectedItemIds.includes(item.id)) return false;
      }
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
          item.tvhRefNo || '',
          item.tvhBrand || '',
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
  }, [catalogItems, activeCustomCatalog, selectedModelFilter, selectedCategoryFilter, onlySelectedOrderItems, searchKeyword, orderQuantities]);

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

    catalogItems.forEach(item => {
      const qty = orderQuantities[item.id] || 0;
      if (qty > 0) {
        const unitPrice = resolveUnitPrice(item);
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
  }, [catalogItems, orderQuantities, priceTier, activeCustomCatalog]);

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
    catalogItems.forEach(item => {
      if (item.compatibleModels.includes(targetModel)) {
        if (item.category === '타이어·휠·캐스터') nextMap[item.id] = 2;
        else if (item.category === '마스트·롤러·체인' && item.sku.includes('BRG')) nextMap[item.id] = 4;
        else if (item.category === '유압·제동·조향' && item.sku.includes('SEALKIT')) nextMap[item.id] = 1;
        else if (item.category === '필터·시트·안전용품') nextMap[item.id] = 1;
      }
    });
    setOrderQuantities(nextMap);
    showNoticeModal(
      `[${targetModel}] 기종에 호환되는 필수 소모품 표준 발주 수량이 주문서에 자동 반영되었습니다.`
    );
  };

  // 티브이에이치 온라인 번들 수집 및 원격 DB 즉시 저장
  const handleCollectTvhBundleToDb = async (bundleKey: string) => {
    setIsSyncingTvhDb(true);
    try {
      const targetItems =
        bundleKey === 'ALL'
          ? COMPATIBLE_PARTS_CATALOG
          : COMPATIBLE_PARTS_CATALOG.filter(item => {
              const bundle = TVH_ONLINE_BRAND_BUNDLES.find(b => b.brandKey === bundleKey);
              return bundle ? bundle.itemIds.includes(item.id) : false;
            });

      const nowIso = new Date().toISOString();
      const todayStr = nowIso.slice(0, 10);
      const mergedMap = new Map<string, CompatiblePartCatalogItem>();
      catalogItems.forEach(i => mergedMap.set(i.id, i));
      targetItems.forEach(i => {
        mergedMap.set(i.id, {
          ...i,
          collectedAt: todayStr,
          updatedAt: nowIso,
          isActive: true
        });
      });

      const nextList = Array.from(mergedMap.values());
      db.tvhCatalogItems = nextList;
      db.upsertRows(
        'tvhCatalogItems',
        targetItems.map(i => ({
          ...i,
          collectedAt: todayStr,
          updatedAt: nowIso,
          isActive: true
        }))
      );
      await db.awaitPendingWrites();
      setCatalogItems(nextList);
      showNoticeModal(
        `티브이에이치 글로벌 사이트로부터 ${targetItems.length}종의 호환모델·실측스펙·단가·실물사진 정보를 수집하여 전용 테이블에 저장 완료했습니다.`
      );
    } catch (err: any) {
      showErrorModal(`티브이에이치 제품 수집 저장 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsSyncingTvhDb(false);
    }
  };

  // 티브이에이치 개별 품목 신규 등록 / 수정 저장
  const handleSaveCatalogItemToDb = async () => {
    if (!editingItem) return;
    if (!editingItem.sku.trim() || !editingItem.partName.trim()) {
      showErrorModal('자사 호환품번과 부품명을 반드시 입력해 주십시오.');
      return;
    }
    setIsSyncingTvhDb(true);
    try {
      const nowIso = new Date().toISOString();
      const normalizedItem: CompatiblePartCatalogItem = {
        ...editingItem,
        id: editingItem.id || `cp-${Date.now()}`,
        tvhRefNo: editingItem.tvhRefNo || editingItem.sku,
        tvhBrand: editingItem.tvhBrand || 'TotalSource',
        collectedAt: editingItem.collectedAt || nowIso.slice(0, 10),
        isActive: true,
        updatedAt: nowIso,
        createdAt: editingItem.createdAt || nowIso
      };

      const exists = catalogItems.some(i => i.id === normalizedItem.id);
      const nextList = exists
        ? catalogItems.map(i => (i.id === normalizedItem.id ? normalizedItem : i))
        : [normalizedItem, ...catalogItems];

      db.tvhCatalogItems = nextList;
      if (exists) {
        db.updateRow('tvhCatalogItems', normalizedItem.id, normalizedItem);
      } else {
        db.insertRow('tvhCatalogItems', normalizedItem);
      }
      await db.awaitPendingWrites();
      setCatalogItems(nextList);
      setEditingItem(null);
      showNoticeModal(
        `[${normalizedItem.sku}] ${normalizedItem.partName} 품목 정보가 티브이에이치 수집 카탈로그 테이블에 저장되었습니다.`
      );
    } catch (err: any) {
      showErrorModal(`품목 DB 저장 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsSyncingTvhDb(false);
    }
  };

  // 티브이에이치 수집 품목 삭제
  const handleDeleteCatalogItemFromDb = async (itemId: string) => {
    setIsSyncingTvhDb(true);
    try {
      const nextList = catalogItems.filter(i => i.id !== itemId);
      db.tvhCatalogItems = nextList;
      db.deleteRow('tvhCatalogItems', itemId);
      await db.awaitPendingWrites();
      setCatalogItems(nextList);
      if (editingItem?.id === itemId) setEditingItem(null);
      showNoticeModal('선택한 품목이 수집 카탈로그 테이블에서 삭제되었습니다.');
    } catch (err: any) {
      showErrorModal(`품목 삭제 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsSyncingTvhDb(false);
    }
  };

  // 맞춤 카탈로그 빌더 오픈
  const handleOpenCatalogBuilder = (mode: 'CREATE' | 'EDIT_CURRENT') => {
    if (mode === 'EDIT_CURRENT' && activeCustomCatalog) {
      setEditingCatalogDraft({
        ...activeCustomCatalog,
        selectedItemIds: [...activeCustomCatalog.selectedItemIds],
        itemOverrides: { ...(activeCustomCatalog.itemOverrides || {}) }
      });
    } else {
      const nextNum = customCatalogs.length + 1;
      setEditingCatalogDraft({
        id: `CAT-CFG-${String(nextNum).padStart(3, '0')}-${Date.now().toString().slice(-3)}`,
        catalogCode: `CAT-CUSTOM-2026-${nextNum}`,
        title: '신규 맞춤형 지게차 호환부품 카탈로그',
        subtitle: '적용 기종 및 거래처 맞춤형 단가·품목 구성 카탈로그',
        description: '티브이에이치 수집 품목 DB에서 원하는 부품만 선별하여 구성한 맞춤형 카탈로그입니다.',
        targetCustomerType: priceTier === 'RETAIL' ? 'END_USER' : priceTier === 'CUSTOM' ? 'CUSTOM' : 'DEALER',
        priceAdjustRate: 0,
        layoutMode: layoutMode,
        targetForkliftBrands: ['안후이 헬리', '비와이디', '항차그룹', '두산밥캣', '현대사이트솔루션', '클라크', '도요타'],
        targetModels: selectedModelFilter === 'ALL' ? TARGET_FORKLIFT_MODELS.map(m => m.modelName) : [selectedModelFilter],
        targetCategories: [...PART_CATEGORIES],
        selectedItemIds: filteredCatalog.map(i => i.id),
        itemOverrides: {},
        showRealPhoto: true,
        showTechDiagram: true,
        showOemCrossRef: true,
        showDetailedSpecs: true,
        showStockAndLeadTime: true,
        showUnitPrice: true,
        headerNotice: '본 카탈로그는 귀사 보유 지게차 기종에 맞추어 선별된 호환부품 전용 발주서입니다.',
        footerContact: '부품 발주 및 기술 문의: 평택 부품물류센터 031-681-8899',
        isDefault: false,
        createdBy: '관리자',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    setShowCatalogBuilderModal(true);
  };

  // 맞춤 카탈로그 DB 저장
  const handleSaveCustomCatalogToDb = async () => {
    if (!editingCatalogDraft.title.trim()) {
      showErrorModal('카탈로그 제목을 입력해 주십시오.');
      return;
    }
    if (editingCatalogDraft.selectedItemIds.length === 0) {
      showErrorModal('카탈로그에 수록할 제품을 최소 1개 이상 선택해 주십시오.');
      return;
    }
    setIsSavingCatalog(true);
    try {
      const nowIso = new Date().toISOString();
      const savedConfig: CustomCatalogConfig = {
        ...editingCatalogDraft,
        updatedAt: nowIso
      };
      const exists = customCatalogs.some(c => c.id === savedConfig.id);
      const nextCatalogs = exists
        ? customCatalogs.map(c => (c.id === savedConfig.id ? savedConfig : c))
        : [...customCatalogs, savedConfig];

      db.customCatalogs = nextCatalogs;
      if (exists) {
        db.updateRow('customCatalogs', savedConfig.id, savedConfig);
      } else {
        db.insertRow('customCatalogs', savedConfig);
      }
      await db.awaitPendingWrites();

      setCustomCatalogs(nextCatalogs);
      setSelectedCustomCatalogId(savedConfig.id);
      setLayoutMode(savedConfig.layoutMode);
      if (savedConfig.targetCustomerType === 'DEALER') setPriceTier('DEALER');
      else if (savedConfig.targetCustomerType === 'END_USER') setPriceTier('RETAIL');
      else setPriceTier('CUSTOM');
      setShowCatalogBuilderModal(false);
      showNoticeModal(
        `맞춤 카탈로그 [${savedConfig.title}] 구성(수록 품목 ${savedConfig.selectedItemIds.length}종)이 전용 테이블에 저장되어 즉시 적용되었습니다.`
      );
    } catch (err: any) {
      showErrorModal(`맞춤 카탈로그 저장 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsSavingCatalog(false);
    }
  };

  // 맞춤 카탈로그 삭제
  const handleDeleteCustomCatalogFromDb = async (catalogId: string) => {
    setIsSavingCatalog(true);
    try {
      const nextCatalogs = customCatalogs.filter(c => c.id !== catalogId);
      db.customCatalogs = nextCatalogs;
      db.deleteRow('customCatalogs', catalogId);
      await db.awaitPendingWrites();
      setCustomCatalogs(nextCatalogs);
      if (selectedCustomCatalogId === catalogId) {
        setSelectedCustomCatalogId('ALL');
      }
      setShowCatalogBuilderModal(false);
      showNoticeModal('선택한 맞춤 카탈로그가 삭제되었습니다.');
    } catch (err: any) {
      showErrorModal(`맞춤 카탈로그 삭제 중 오류가 발생했습니다: ${err?.message || err}`);
    } finally {
      setIsSavingCatalog(false);
    }
  };

  // 엑셀 카탈로그 겸 주문서 다운로드
  const handleExportCatalogOrderExcel = () => {
    const rows = filteredCatalog.map((item, idx) => {
      const qty = orderQuantities[item.id] || 0;
      const unitPrice = resolveUnitPrice(item);
      return {
        순번: idx + 1,
        티브이에이치참조번호: item.tvhRefNo || '-',
        티브이에이치브랜드: item.tvhBrand || '-',
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
        제품이미지경로: item.imageUrl || '-',
        발송기준: item.deliveryPolicy
      };
    });

    exportToExcel(
      rows,
      `지게차_호환부품_맞춤카탈로그_겸_주문서_${selectedModelFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
      showErrorModal('주문할 거래처를 선택해 주십시오.');
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
            memo: `티브이에이치 호환부품 카탈로그 자동연동 · ${line.item.tonnageRange}`
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
        specialTerms: `호환부품 카탈로그 주문 · ${activeCustomCatalog ? activeCustomCatalog.title : selectedModelFilter === 'ALL' ? '전 기종 통합' : selectedModelFilter}`,
        status: 'CONFIRMED',
        deliveryMethod: 'COURIER',
        memo: `호환부품 카탈로그 주문 확정 · ${orderSummary.selectedLineCount}종 / 총 ${orderSummary.totalUnitQty}점`
      });

      showNoticeModal(
        `수주번호 [${createdOrder.id}]로 호환부품 ${orderSummary.selectedLineCount}종 · 총 주문액 ₩${orderSummary.totalOrderAmount.toLocaleString()} 수주 및 출고 요청이 확정되었습니다.`
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
        height: 'calc(100dvh - 52px)',
        backgroundColor: 'var(--bg-app, #F4F0EA)',
        overflow: 'hidden'
      }}
    >
      {/* 상단 타이틀 & 파이프라인 액션 바 */}
      <div
        style={{
          padding: '6px 14px',
          backgroundColor: 'var(--bg-card, #FDFBF7)',
          borderBottom: '1px solid var(--border-color, #DDD6C8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexShrink: 0,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
          <h1 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary, #1C1917)', margin: 0, whiteSpace: 'nowrap' }}>
            호환부품 카탈로그 · 주문서
          </h1>
          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary, #57534E)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            전체 {catalogItems.length}종 · 표시 {filteredCatalog.length}종
          </span>
        </div>

        {/* ② 우상단 파이프라인 액션 버튼군 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              setCollectorTab('ONLINE_COLLECT');
              setShowTvhCollectorModal(true);
            }}
            style={{
              height: '28px',
              padding: '0 10px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-app, #F4F0EA)',
              color: 'var(--text-primary, #1C1917)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Database size={13} />
            <span>품목 수집·등록</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCatalogBuilder(activeCustomCatalog ? 'EDIT_CURRENT' : 'CREATE')}
            style={{
              height: '28px',
              padding: '0 10px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-app, #F4F0EA)',
              color: 'var(--text-primary, #1C1917)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Sliders size={13} />
            <span>카탈로그 구성</span>
          </button>

          <button
            type="button"
            onClick={handleApplyModelMaintenancePreset}
            style={{
              height: '28px',
              padding: '0 10px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-app, #F4F0EA)',
              color: 'var(--text-primary, #1C1917)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <span>기종별 소모품 담기</span>
          </button>

          <button
            type="button"
            onClick={handleExportCatalogOrderExcel}
            style={{
              height: '28px',
              padding: '0 10px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-app, #F4F0EA)',
              color: 'var(--text-primary, #1C1917)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <FileSpreadsheet size={13} />
            <span>엑셀 내보내기</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPrintSheetMode('FULL_CATALOG_FORM');
              setShowOrderSheetPrintModal(true);
            }}
            style={{
              height: '28px',
              padding: '0 11px',
              borderRadius: '4px',
              border: '1px solid #0F172A',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Printer size={13} />
            <span>카탈로그·주문서 인쇄</span>
          </button>
        </div>
      </div>

      {/* ① 좌상단 스코프 및 맞춤 카탈로그 선택 바 (상하 스택 레이블 표준 준수 - 헌장 3.4) */}
      <div
        style={{
          padding: '6px 14px',
          backgroundColor: 'var(--bg-app, #F4F0EA)',
          borderBottom: '1px solid var(--border-color, #DDD6C8)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          flexShrink: 0,
          overflowX: 'auto'
        }}
      >
        {/* 카탈로그 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            카탈로그 선택
          </label>
          <select
            value={selectedCustomCatalogId}
            onChange={e => handleSelectCustomCatalog(e.target.value)}
            style={{
              height: '28px',
              padding: '0 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-card, #FDFBF7)',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-primary, #1C1917)',
              minWidth: '210px'
            }}
          >
            <option value="ALL">전체 호환부품 마스터 · {catalogItems.length}종</option>
            {customCatalogs.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.title} · {cat.selectedItemIds.length}종
              </option>
            ))}
          </select>
        </div>

        {/* 보기 양식 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            보기 양식
          </label>
          <div
            style={{
              display: 'flex',
              height: '28px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-card, #FDFBF7)',
              padding: '2px',
              gap: '2px'
            }}
          >
            <button
              type="button"
              onClick={() => setLayoutMode('GRID_ORDER')}
              style={{
                padding: '0 8px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: layoutMode === 'GRID_ORDER' ? '#0F172A' : 'transparent',
                color: layoutMode === 'GRID_ORDER' ? '#FFFFFF' : 'var(--text-secondary, #57534E)',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              주문서 목록
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('PHOTO_BROCHURE')}
              style={{
                padding: '0 8px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: layoutMode === 'PHOTO_BROCHURE' ? '#0F172A' : 'transparent',
                color: layoutMode === 'PHOTO_BROCHURE' ? '#FFFFFF' : 'var(--text-secondary, #57534E)',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              사진 카드
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('TECH_DRAWING')}
              style={{
                padding: '0 8px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: layoutMode === 'TECH_DRAWING' ? '#0F172A' : 'transparent',
                color: layoutMode === 'TECH_DRAWING' ? '#FFFFFF' : 'var(--text-secondary, #57534E)',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              치수 도면
            </button>
          </div>
        </div>

        {/* 주문 거래처 선택 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            주문 거래처
          </label>
          <select
            value={selectedCustomerId}
            onChange={e => setSelectedCustomerId(e.target.value)}
            style={{
              height: '28px',
              padding: '0 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-card, #FDFBF7)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary, #1C1917)',
              minWidth: '155px'
            }}
          >
            {customers.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.customerType === 'DEALER' || c.name.includes('대리점') ? '대리점' : '최종고객'}
              </option>
            ))}
          </select>
        </div>

        {/* 단가 기준 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            단가 기준
          </label>
          <div
            style={{
              display: 'flex',
              height: '28px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-card, #FDFBF7)',
              padding: '2px',
              gap: '2px'
            }}
          >
            <button
              type="button"
              onClick={() => setPriceTier('DEALER')}
              style={{
                padding: '0 8px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: priceTier === 'DEALER' ? '#0F172A' : 'transparent',
                color: priceTier === 'DEALER' ? '#FFFFFF' : 'var(--text-secondary, #57534E)',
                fontSize: '11.5px',
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
                padding: '0 8px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: priceTier === 'RETAIL' ? '#0F172A' : 'transparent',
                color: priceTier === 'RETAIL' ? '#FFFFFF' : 'var(--text-secondary, #57534E)',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              권장 소비자가
            </button>
            <button
              type="button"
              onClick={() => setPriceTier('CUSTOM')}
              style={{
                padding: '0 8px',
                borderRadius: '3px',
                border: 'none',
                backgroundColor: priceTier === 'CUSTOM' ? '#0F172A' : 'transparent',
                color: priceTier === 'CUSTOM' ? '#FFFFFF' : 'var(--text-secondary, #57534E)',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              지정단가
            </button>
          </div>
        </div>

        {/* 적용 지게차 모델 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            적용 지게차 모델
          </label>
          <select
            value={selectedModelFilter}
            onChange={e => setSelectedModelFilter(e.target.value)}
            style={{
              height: '28px',
              padding: '0 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-card, #FDFBF7)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary, #1C1917)',
              minWidth: '185px'
            }}
          >
            <option value="ALL">전체 지게차 모델 · {catalogItems.length}종</option>
            {TARGET_FORKLIFT_MODELS.map(m => (
              <option key={m.modelName} value={m.modelName}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* 계통 분류 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            계통 분류
          </label>
          <select
            value={selectedCategoryFilter}
            onChange={e => setSelectedCategoryFilter(e.target.value)}
            style={{
              height: '28px',
              padding: '0 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: 'var(--bg-card, #FDFBF7)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary, #1C1917)',
              minWidth: '135px'
            }}
          >
            <option value="ALL">전체 계통</option>
            {PART_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* 품번 · 규격 통합 검색 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '165px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            품번 · 참조번호 · 규격 검색
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} color="#64748B" style={{ position: 'absolute', left: '8px' }} />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="품번, 참조번호, 브랜드, 규격..."
              style={{
                width: '100%',
                height: '28px',
                padding: '0 8px 0 26px',
                borderRadius: '4px',
                border: '1px solid var(--border-color, #DDD6C8)',
                backgroundColor: 'var(--bg-card, #FDFBF7)',
                fontSize: '12px',
                color: 'var(--text-primary, #1C1917)'
              }}
            />
          </div>
        </div>

        {/* 주문담긴 품목만 보기 토글 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)', whiteSpace: 'nowrap' }}>
            주문 필터
          </label>
          <button
            type="button"
            onClick={() => setOnlySelectedOrderItems(prev => !prev)}
            style={{
              height: '28px',
              padding: '0 10px',
              borderRadius: '4px',
              border: onlySelectedOrderItems ? '1px solid #0F172A' : '1px solid var(--border-color, #DDD6C8)',
              backgroundColor: onlySelectedOrderItems ? '#0F172A' : 'var(--bg-card, #FDFBF7)',
              color: onlySelectedOrderItems ? '#FFFFFF' : 'var(--text-primary, #1C1917)',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            선택품목만 · {orderSummary.selectedLineCount}종
          </button>
        </div>
      </div>

      {/* ③ 중앙 본문: 3대 레이아웃 모드 전환 (GRID_ORDER / PHOTO_BROCHURE / TECH_DRAWING) */}
      <div style={{ flex: 1, overflow: 'auto', padding: layoutMode === 'GRID_ORDER' ? '0' : '12px 14px' }}>
        {layoutMode === 'GRID_ORDER' && (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
              backgroundColor: 'var(--bg-card, #FDFBF7)'
            }}
          >
            <thead
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: '#1E293B',
                color: '#F8FAFC'
              }}
            >
              <tr>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  상세 · 선택
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  사진
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  호환품번 / 참조번호
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  계통분류
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  부품명 / 브랜드
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  핵심 실측 규격
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  적용 지게차 모델
                </th>
                {(!activeCustomCatalog || activeCustomCatalog.showStockAndLeadTime) && (
                  <th style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                    현재고 · 위치
                  </th>
                )}
                {(!activeCustomCatalog || activeCustomCatalog.showUnitPrice) && (
                  <th style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                    {priceTier === 'DEALER' ? '대리점 공급단가' : priceTier === 'RETAIL' ? '권장 소비자단가' : '지정단가'}
                  </th>
                )}
                <th style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap', borderRight: '1px solid #334155' }}>
                  주문수량
                </th>
                <th style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  주문 공급가액
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalog.map((item, idx) => {
                const qty = orderQuantities[item.id] || 0;
                const isSelected = qty > 0;
                const unitPrice = resolveUnitPrice(item);
                const lineAmount = unitPrice * qty;
                const showPhoto = !activeCustomCatalog || activeCustomCatalog.showRealPhoto;

                return (
                  <tr
                    key={item.id}
                    style={{
                      height: '40px',
                      borderBottom: '1px solid var(--border-color, #DDD6C8)',
                      backgroundColor: isSelected ? '#EFF6FF' : idx % 2 === 0 ? 'var(--bg-card, #FDFBF7)' : 'var(--bg-app, #F4F0EA)'
                    }}
                  >
                    {/* 1. 상세 액션 + 체크박스 */}
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => handleQtyChange(item.id, e.target.checked ? Math.max(item.moq, 1) : 0)}
                          style={{ width: '14px', height: '14px', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <button
                          type="button"
                          onClick={() => setActivePartDetail(item)}
                          style={{
                            padding: '2px 7px',
                            borderRadius: '3px',
                            border: '1px solid var(--border-color, #DDD6C8)',
                            backgroundColor: 'var(--bg-card, #FDFBF7)',
                            color: 'var(--text-primary, #1C1917)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}
                        >
                          상세
                        </button>
                      </div>
                    </td>

                    {/* 2. 사진 */}
                    <td style={{ padding: '3px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)' }}>
                      <div
                        onClick={() => setActivePartDetail(item)}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {showPhoto && item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.partName}
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                            }}
                            style={{
                              width: '38px',
                              height: '30px',
                              objectFit: 'cover',
                              borderRadius: '3px',
                              border: '1px solid var(--border-color, #DDD6C8)',
                              backgroundColor: '#FFFFFF',
                              flexShrink: 0
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>-</span>
                        )}
                      </div>
                    </td>

                    {/* 3. 호환품번 / 참조번호 */}
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)' }}>
                      <span style={{ fontWeight: 800, color: 'var(--text-primary, #1C1917)', fontSize: '12px', fontFamily: 'monospace' }}>
                        {item.sku}
                      </span>
                      {item.tvhRefNo && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-secondary, #57534E)', fontFamily: 'monospace' }}>
                          ({item.tvhRefNo})
                        </span>
                      )}
                    </td>

                    {/* 4. 계통분류 */}
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary, #57534E)' }}>
                      {item.category}
                    </td>

                    {/* 5. 부품명 / 브랜드 */}
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary, #1C1917)', fontSize: '12.5px' }}>
                        {item.partName}
                      </span>
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--text-secondary, #57534E)', fontWeight: 600 }}>
                        · {item.tvhBrand || item.manufacturer}
                      </span>
                    </td>

                    {/* 6. 핵심 실측 규격 */}
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)', fontSize: '11.5px', color: 'var(--text-primary, #1C1917)', fontWeight: 600 }}>
                      {item.specSummary}
                    </td>

                    {/* 7. 적용 지게차 모델 */}
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)', fontSize: '11.5px', color: 'var(--text-secondary, #57534E)', fontWeight: 600 }}>
                      {item.compatibleModels.slice(0, 3).join(', ')}
                      {item.compatibleModels.length > 3 ? ` 외 ${item.compatibleModels.length - 3}종` : ''}
                    </td>

                    {/* 8. 현재고 · 위치 */}
                    {(!activeCustomCatalog || activeCustomCatalog.showStockAndLeadTime) && (
                      <td style={{ padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)' }}>
                        <span style={{ fontWeight: 800, color: item.stockQty <= 5 ? '#B91C1C' : 'var(--text-primary, #1C1917)', fontSize: '12px' }}>
                          {item.stockQty.toLocaleString()}{item.unitName}
                        </span>
                        <span style={{ marginLeft: '5px', fontSize: '11px', color: 'var(--text-secondary, #57534E)' }}>
                          · {item.warehouseLocation}
                        </span>
                      </td>
                    )}

                    {/* 9. 공급단가 */}
                    {(!activeCustomCatalog || activeCustomCatalog.showUnitPrice) && (
                      <td style={{ padding: '4px 8px', textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)', fontWeight: 800, color: 'var(--text-primary, #1C1917)', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>
                        ₩{unitPrice.toLocaleString()}
                      </td>
                    )}

                    {/* 10. 인라인 주문수량 스테퍼 */}
                    <td style={{ padding: '4px 8px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #DDD6C8)' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.id, qty - 1)}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '3px',
                            border: '1px solid var(--border-color, #DDD6C8)',
                            backgroundColor: 'var(--bg-card, #FDFBF7)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={e => handleQtyChange(item.id, Number(e.target.value))}
                          style={{
                            width: '44px',
                            height: '22px',
                            textAlign: 'center',
                            borderRadius: '3px',
                            border: isSelected ? '1px solid #1D4ED8' : '1px solid var(--border-color, #DDD6C8)',
                            fontWeight: 800,
                            fontSize: '12px',
                            color: isSelected ? '#1D4ED8' : 'var(--text-primary, #1C1917)'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleQtyChange(item.id, qty + 1)}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '3px',
                            border: '1px solid var(--border-color, #DDD6C8)',
                            backgroundColor: 'var(--bg-card, #FDFBF7)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </td>

                    {/* 11. 주문 공급가액 */}
                    <td
                      style={{
                        padding: '4px 10px',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                        fontWeight: 800,
                        fontSize: '12.5px',
                        fontVariantNumeric: 'tabular-nums',
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
        )}

        {/* 레이아웃 2: 실물 사진 브로셔 카드 뷰 (PHOTO_BROCHURE) */}
        {layoutMode === 'PHOTO_BROCHURE' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '12px'
            }}
          >
            {filteredCatalog.map(item => {
              const qty = orderQuantities[item.id] || 0;
              const isSelected = qty > 0;
              const unitPrice = resolveUnitPrice(item);

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: 'var(--bg-card, #FDFBF7)',
                    border: isSelected ? '1.5px solid #1D4ED8' : '1px solid var(--border-color, #DDD6C8)',
                    borderRadius: '6px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-primary, #1C1917)', fontFamily: 'monospace' }}>
                        {item.tvhBrand || 'TVH'} · {item.tvhRefNo || item.sku}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary, #57534E)' }}>{item.category}</span>
                    </div>

                    <div
                      onClick={() => setActivePartDetail(item)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '6px',
                        backgroundColor: 'var(--bg-app, #F4F0EA)',
                        border: '1px solid var(--border-color, #DDD6C8)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginBottom: '8px'
                      }}
                    >
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.partName}
                          onError={e => {
                            e.currentTarget.style.display = 'none';
                          }}
                          style={{
                            width: '108px',
                            height: '78px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color, #DDD6C8)',
                            backgroundColor: '#FFFFFF',
                            flexShrink: 0
                          }}
                        />
                      )}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <PartTechnicalDiagramSvg type={item.diagramType} size="sm" />
                        <span style={{ fontSize: '10.5px', color: 'var(--text-secondary, #57534E)', fontWeight: 700 }}>상세 도면 · 스펙</span>
                      </div>
                    </div>

                    <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text-primary, #1C1917)', marginBottom: '3px' }}>
                      {item.partName}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary, #57534E)', fontWeight: 600, marginBottom: '4px' }}>
                      {item.specSummary}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary, #57534E)', fontWeight: 600 }}>
                      적용모델: {item.compatibleModels.join(', ')}
                    </div>
                  </div>

                  <div
                    style={{
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border-color, #DDD6C8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary, #57534E)', fontWeight: 600 }}>
                        단가 · 재고 {item.stockQty}{item.unitName}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text-primary, #1C1917)' }}>
                        ₩{unitPrice.toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(item.id, qty - 1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color, #DDD6C8)',
                          backgroundColor: 'var(--bg-card, #FDFBF7)',
                          cursor: 'pointer'
                        }}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={qty}
                        onChange={e => handleQtyChange(item.id, Number(e.target.value))}
                        style={{
                          width: '50px',
                          height: '26px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: isSelected ? '1.5px solid #1D4ED8' : '1px solid var(--border-color, #DDD6C8)',
                          fontWeight: 800,
                          fontSize: '12.5px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleQtyChange(item.id, qty + 1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color, #DDD6C8)',
                          backgroundColor: 'var(--bg-card, #FDFBF7)',
                          cursor: 'pointer'
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 레이아웃 3: 기술 치수 도면 대장 뷰 (TECH_DRAWING) */}
        {layoutMode === 'TECH_DRAWING' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))', gap: '12px' }}>
            {filteredCatalog.map(item => {
              const qty = orderQuantities[item.id] || 0;
              const isSelected = qty > 0;
              const unitPrice = resolveUnitPrice(item);

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: 'var(--bg-card, #FDFBF7)',
                    border: isSelected ? '1.5px solid #1D4ED8' : '1px solid var(--border-color, #DDD6C8)',
                    borderRadius: '6px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary, #57534E)', fontFamily: 'monospace' }}>
                        {item.sku} · {item.tvhRefNo || '-'} · {item.tvhBrand || item.manufacturer}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary, #1C1917)', marginTop: '2px' }}>
                        {item.partName}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text-primary, #1C1917)' }}>
                        ₩{unitPrice.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary, #57534E)' }}>
                        재고 {item.stockQty}{item.unitName} · {item.warehouseLocation}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <PartTechnicalDiagramSvg type={item.diagramType} size="lg" />
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.partName}
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                        }}
                        style={{
                          width: '120px',
                          height: '130px',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color, #DDD6C8)',
                          flexShrink: 0
                        }}
                      />
                    )}
                    <table style={{ flex: 1, borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <tbody>
                        {item.detailedSpecs.map((sp, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-color, #DDD6C8)', borderTop: i === 0 ? '1px solid var(--border-color, #DDD6C8)' : 'none' }}>
                            <th
                              style={{
                                padding: '4px 8px',
                                backgroundColor: 'var(--bg-app, #F4F0EA)',
                                textAlign: 'left',
                                color: 'var(--text-secondary, #57534E)',
                                fontWeight: 700,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {sp.label}
                            </th>
                            <td style={{ padding: '4px 8px', color: 'var(--text-primary, #1C1917)', fontWeight: 600 }}>{sp.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--border-color, #DDD6C8)',
                      fontSize: '11.5px'
                    }}
                  >
                    <div style={{ color: 'var(--text-secondary, #57534E)', fontWeight: 600 }}>
                      호환 모델: <strong style={{ color: 'var(--text-primary, #1C1917)' }}>{item.compatibleModels.join(', ')}</strong> · 순정교차: {item.oemCrossRefCodes.join(', ')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary, #1C1917)' }}>주문수량:</span>
                      <input
                        type="number"
                        min={0}
                        value={qty}
                        onChange={e => handleQtyChange(item.id, Number(e.target.value))}
                        style={{
                          width: '56px',
                          height: '26px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: isSelected ? '1.5px solid #1D4ED8' : '1px solid var(--border-color, #DDD6C8)',
                          fontWeight: 800
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ④ 우하단 대차대조 합계 검증 및 최종 수주 확정 바 (Gutenberg Z-Pattern Terminal Action) */}
      <div
        style={{
          padding: '8px 14px',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          borderTop: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexShrink: 0,
          flexWrap: 'wrap'
        }}
      >
        {/* 대차대조 검증식 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', whiteSpace: 'nowrap', fontSize: '12px' }}>
          <span style={{ fontWeight: 700, color: '#CBD5E1' }}>
            선택 품목: <strong style={{ color: '#FFFFFF' }}>{orderSummary.selectedLineCount}종 ({orderSummary.totalUnitQty}점)</strong>
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ fontWeight: 700, color: '#E2E8F0' }}>
            총 주문합계 <strong style={{ color: '#38BDF8', fontSize: '13.5px' }}>₩{orderSummary.totalOrderAmount.toLocaleString()}</strong>
            {' = '}
            공급가액 <strong>₩{orderSummary.supplyAmount.toLocaleString()}</strong>
            {' + '}
            부가세 <strong>₩{orderSummary.vatAmount.toLocaleString()}</strong>
          </span>
          <span style={{ color: '#475569' }}>|</span>
          <span style={{ fontWeight: 700, color: '#CBD5E1' }}>
            예상 매출이익 <strong style={{ color: '#34D399' }}>₩{orderSummary.expectedGrossProfit.toLocaleString()}</strong> · 이익률 {orderSummary.marginRate.toFixed(1)}% · 원가차액 ₩0
          </span>
        </div>

        {/* 우하단 최종 완결 버튼군 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setOrderQuantities({})}
            style={{
              height: '28px',
              padding: '0 10px',
              borderRadius: '4px',
              border: '1px solid #475569',
              backgroundColor: '#1E293B',
              color: '#CBD5E1',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap'
            }}
          >
            <RotateCcw size={13} />
            <span>수량 초기화</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPrintSheetMode('SELECTED_ORDER_ONLY');
              setShowOrderSheetPrintModal(true);
            }}
            style={{
              height: '28px',
              padding: '0 12px',
              borderRadius: '4px',
              border: '1px solid #475569',
              backgroundColor: '#1E293B',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap'
            }}
          >
            <Printer size={13} />
            <span>주문서 발행</span>
          </button>

          <button
            type="button"
            disabled={isSubmittingOrder}
            onClick={handleConfirmErpSalesOrder}
            style={{
              height: '28px',
              padding: '0 14px',
              borderRadius: '4px',
              border: '1px solid #2563EB',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap'
            }}
          >
            <CheckCircle2 size={14} />
            <span>{isSubmittingOrder ? '수주 생성 중...' : '수주 확정'}</span>
          </button>
        </div>
      </div>

      {/* 모달 2: 개별 호환부품 실물사진 · 정밀 치수 도면 및 적용기종 상세 모달 */}
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
              maxWidth: '860px',
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
                  {activePartDetail.category} · {activePartDetail.sku} · {activePartDetail.tvhRefNo || '-'}
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '2px 0 0 0' }}>{activePartDetail.partName}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem({ ...activePartDetail });
                    setCollectorTab('ITEM_DB_FORM');
                    setActivePartDetail(null);
                    setShowTvhCollectorModal(true);
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    border: '1px solid #60A5FA',
                    backgroundColor: '#1E3A8A',
                    color: '#FFFFFF',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  품목 DB 수정
                </button>
                <button
                  type="button"
                  onClick={() => setActivePartDetail(null)}
                  style={{ background: 'transparent', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                {activePartDetail.imageUrl && (
                  <img
                    src={activePartDetail.imageUrl}
                    alt={activePartDetail.partName}
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                    }}
                    style={{
                      width: '180px',
                      height: '140px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#F8FAFC',
                      flexShrink: 0
                    }}
                  />
                )}
                <PartTechnicalDiagramSvg type={activePartDetail.diagramType} size="lg" />
                <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12.5px' }}>
                  <div>
                    <strong>티브이에이치 참조번호 / 브랜드:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#B91C1C' }}>
                      {activePartDetail.tvhRefNo || activePartDetail.sku} · {activePartDetail.tvhBrand || activePartDetail.manufacturer}
                    </span>
                  </div>
                  <div>
                    <strong>자사 표준 호환품번:</strong>{' '}
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1D4ED8' }}>{activePartDetail.sku}</span>
                  </div>
                  <div>
                    <strong>호환 순정품번:</strong> {activePartDetail.oemCrossRefCodes.join(' / ')}
                  </div>
                  <div>
                    <strong>제조·공급원 및 등급:</strong> {activePartDetail.manufacturer} · {activePartDetail.originCountry} · {activePartDetail.partGrade}
                  </div>
                  <div>
                    <strong>적용 지게차 모델:</strong> {activePartDetail.compatibleModels.join(', ')} · {activePartDetail.tonnageRange}
                  </div>
                  <div>
                    <strong>대리점 공급가 / 권장 소비자가:</strong>{' '}
                    <strong style={{ color: '#1D4ED8' }}>₩{activePartDetail.dealerPriceKrw.toLocaleString()}</strong> /{' '}
                    <strong>₩{activePartDetail.retailPriceKrw.toLocaleString()}</strong> · 입고원가 ₩{activePartDetail.landedCostKrw.toLocaleString()}
                  </div>
                  <div>
                    <strong>창고 위치 및 발송기준:</strong> {activePartDetail.warehouseLocation} · 현재고 {activePartDetail.stockQty}{activePartDetail.unitName} · {activePartDetail.deliveryPolicy}
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
                <div><strong>수집 출처 및 레퍼런스:</strong> {activePartDetail.referenceSource} {activePartDetail.sourceUrl ? `· ${activePartDetail.sourceUrl}` : ''}</div>
                <div style={{ marginTop: '3px' }}><strong>장착 및 정비 기술 노트:</strong> {activePartDetail.technicalNote}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 모달 3: 티브이에이치 제품 수집 · 전용 테이블 등록/관리 모달 */}
      {showTvhCollectorModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.68)',
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
              maxWidth: '1120px',
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
                padding: '14px 20px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800 }}>
                  티브이에이치 글로벌 제품 정보 수집 · 전용 테이블 관리
                </span>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1E293B', padding: '3px', borderRadius: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setCollectorTab('ONLINE_COLLECT')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: collectorTab === 'ONLINE_COLLECT' ? '#DC2626' : 'transparent',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    티브이에이치 브랜드별 온라인 수집
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingItem) {
                        setEditingItem({
                          id: `cp-${catalogItems.length + 1}`,
                          tvhRefNo: `TVH-${Math.floor(10000000 + Math.random() * 89999999)}`,
                          tvhBrand: 'TotalSource',
                          imageUrl: 'https://www.tvh.com/sites/tvh/files/inline-images/Tyres%20%282%29.jpg',
                          sourceUrl: 'https://www.tvh.com',
                          collectedAt: new Date().toISOString().slice(0, 10),
                          isActive: true,
                          sku: `TVH-NEW-${String(catalogItems.length + 1).padStart(3, '0')}`,
                          oemCrossRefCodes: ['TVH-OEM-001'],
                          partName: '',
                          category: '전장·컨트롤러·센서',
                          manufacturer: '티브이에이치 토탈소스',
                          originCountry: '글로벌 OEM',
                          partGrade: '순정 OEM',
                          specSummary: '',
                          detailedSpecs: [
                            { label: '티브이에이치 참조번호', value: '' },
                            { label: '핵심 치수 및 사양', value: '' }
                          ],
                          compatibleModels: ['CPD25-GB2Li', 'CPD25-XEY2-SI', 'D30S-7'],
                          compatibleBrands: ['안후이 헬리', '항차그룹', '두산밥캣'],
                          tonnageRange: '2.0톤 ~ 3.5톤 공용',
                          foreignCurrency: 'EUR',
                          foreignUnitCost: 50,
                          landedCostKrw: 78000,
                          dealerPriceKrw: 110000,
                          retailPriceKrw: 145000,
                          unitName: '개',
                          moq: 1,
                          stockQty: 10,
                          warehouseLocation: '평택 2창고 E-01',
                          deliveryPolicy: '16시 이전 당일택배 발송',
                          diagramType: 'CONTACTOR_RELAY',
                          referenceSource: '티브이에이치 포털 직접 수집 등록',
                          technicalNote: ''
                        });
                      }
                      setCollectorTab('ITEM_DB_FORM');
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: collectorTab === 'ITEM_DB_FORM' ? '#DC2626' : 'transparent',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    수집 품목 신규 등록 · 수정
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTvhCollectorModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {collectorTab === 'ONLINE_COLLECT' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #CBD5E1',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '280px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                        티브이에이치 참조번호 또는 제품 페이지 주소로 즉시 수집
                      </label>
                      <input
                        type="text"
                        value={tvhRefSearchInput}
                        onChange={e => setTvhRefSearchInput(e.target.value)}
                        placeholder="예: https://www.tvh.com/brands/cobo-parts 또는 TVH-3321603, TVH-45568791"
                        style={{
                          height: '34px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          fontSize: '12.5px'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        disabled={isSyncingTvhDb}
                        onClick={() => handleCollectTvhBundleToDb('ALL')}
                        style={{
                          height: '34px',
                          padding: '0 14px',
                          borderRadius: '6px',
                          border: '1px solid #DC2626',
                          backgroundColor: '#DC2626',
                          color: '#FFFFFF',
                          fontSize: '12.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {isSyncingTvhDb ? '수집 동기화 중...' : `전체 34종 일괄 수집 · DB 동기화`}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                    {TVH_ONLINE_BRAND_BUNDLES.map(bundle => (
                      <div
                        key={bundle.brandKey}
                        style={{
                          border: '1px solid #CBD5E1',
                          borderRadius: '8px',
                          padding: '14px',
                          backgroundColor: '#FFFFFF',
                          display: 'flex',
                          gap: '14px',
                          alignItems: 'center'
                        }}
                      >
                        <img
                          src={bundle.bannerImageUrl}
                          alt={bundle.brandNameKo}
                          style={{
                            width: '120px',
                            height: '92px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            flexShrink: 0
                          }}
                        />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#B91C1C', fontFamily: 'monospace' }}>
                            {bundle.tvhBrandLabel} · {bundle.sourceUrl}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                            {bundle.brandNameKo} · {bundle.itemIds.length}종
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569' }}>{bundle.categorySummary}</div>
                          <div style={{ marginTop: '4px' }}>
                            <button
                              type="button"
                              disabled={isSyncingTvhDb}
                              onClick={() => handleCollectTvhBundleToDb(bundle.brandKey)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '4px',
                                border: '1px solid #0F172A',
                                backgroundColor: '#0F172A',
                                color: '#FFFFFF',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              이 브랜드 제품군 수집 · DB 저장
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {collectorTab === 'ITEM_DB_FORM' && editingItem && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>티브이에이치 참조번호</label>
                      <input
                        type="text"
                        value={editingItem.tvhRefNo || ''}
                        onChange={e => setEditingItem({ ...editingItem, tvhRefNo: e.target.value })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>티브이에이치 브랜드</label>
                      <input
                        type="text"
                        value={editingItem.tvhBrand || ''}
                        onChange={e => setEditingItem({ ...editingItem, tvhBrand: e.target.value })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>자사 호환품번</label>
                      <input
                        type="text"
                        value={editingItem.sku}
                        onChange={e => setEditingItem({ ...editingItem, sku: e.target.value })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>계통 분류</label>
                      <select
                        value={editingItem.category}
                        onChange={e => setEditingItem({ ...editingItem, category: e.target.value as PartCategoryType })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      >
                        {PART_CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>부품명</label>
                      <input
                        type="text"
                        value={editingItem.partName}
                        onChange={e => setEditingItem({ ...editingItem, partName: e.target.value })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>대리점 공급단가 · 원</label>
                      <input
                        type="number"
                        value={editingItem.dealerPriceKrw}
                        onChange={e => setEditingItem({ ...editingItem, dealerPriceKrw: Number(e.target.value) })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>권장 소비자단가 · 원</label>
                      <input
                        type="number"
                        value={editingItem.retailPriceKrw}
                        onChange={e => setEditingItem({ ...editingItem, retailPriceKrw: Number(e.target.value) })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>핵심 실측 규격 요약</label>
                      <input
                        type="text"
                        value={editingItem.specSummary}
                        onChange={e => setEditingItem({ ...editingItem, specSummary: e.target.value })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>티브이에이치 제품 실물 이미지 주소</label>
                      <input
                        type="text"
                        value={editingItem.imageUrl || ''}
                        onChange={e => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                        style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>적용가능 지게차 모델 선택</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {TARGET_FORKLIFT_MODELS.map(m => {
                        const checked = editingItem.compatibleModels.includes(m.modelName);
                        return (
                          <label
                            key={m.modelName}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              border: checked ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                              backgroundColor: checked ? '#EFF6FF' : '#FFFFFF',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const nextModels = e.target.checked
                                  ? [...editingItem.compatibleModels, m.modelName]
                                  : editingItem.compatibleModels.filter(x => x !== m.modelName);
                                setEditingItem({ ...editingItem, compatibleModels: nextModels });
                              }}
                            />
                            <span>{m.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
                    {catalogItems.some(i => i.id === editingItem.id) ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteCatalogItemFromDb(editingItem.id)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '6px',
                          border: '1px solid #DC2626',
                          backgroundColor: '#FEF2F2',
                          color: '#DC2626',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        이 품목 DB 삭제
                      </button>
                    ) : (
                      <div />
                    )}
                    <button
                      type="button"
                      disabled={isSyncingTvhDb}
                      onClick={handleSaveCatalogItemToDb}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '6px',
                        border: '1px solid #2563EB',
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {isSyncingTvhDb ? '저장 중...' : '전용 테이블에 품목 저장'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 모달 4: 맞춤 카탈로그 빌더 모달 (fl_custom_catalogs 테이블 연동) */}
      {showCatalogBuilderModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.68)',
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
              maxWidth: '1180px',
              maxHeight: '92dvh',
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
                padding: '14px 20px',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>
                  맞춤형 호환부품 카탈로그 빌더 · 전용 테이블 저장
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleOpenCatalogBuilder('CREATE')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    border: '1px solid #93C5FD',
                    backgroundColor: '#1E3A8A',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  신규 카탈로그 양식 초기화
                </button>
                <button
                  type="button"
                  onClick={() => setShowCatalogBuilderModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#CBD5E1', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 상단 메타 설정 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>카탈로그 코드</label>
                  <input
                    type="text"
                    value={editingCatalogDraft.catalogCode}
                    onChange={e => setEditingCatalogDraft({ ...editingCatalogDraft, catalogCode: e.target.value })}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>카탈로그 제목</label>
                  <input
                    type="text"
                    value={editingCatalogDraft.title}
                    onChange={e => setEditingCatalogDraft({ ...editingCatalogDraft, title: e.target.value })}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px', fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>부제목</label>
                  <input
                    type="text"
                    value={editingCatalogDraft.subtitle}
                    onChange={e => setEditingCatalogDraft({ ...editingCatalogDraft, subtitle: e.target.value })}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>기본 단가 기준</label>
                  <select
                    value={editingCatalogDraft.targetCustomerType}
                    onChange={e =>
                      setEditingCatalogDraft({
                        ...editingCatalogDraft,
                        targetCustomerType: e.target.value as 'DEALER' | 'END_USER' | 'CUSTOM'
                      })
                    }
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  >
                    <option value="DEALER">대리점 공급가</option>
                    <option value="END_USER">권장 소비자가</option>
                    <option value="CUSTOM">맞춤 지정단가</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>단가 일괄 할인·할증율 %</label>
                  <input
                    type="number"
                    value={editingCatalogDraft.priceAdjustRate}
                    onChange={e => setEditingCatalogDraft({ ...editingCatalogDraft, priceAdjustRate: Number(e.target.value) })}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>기본 레이아웃 양식</label>
                  <select
                    value={editingCatalogDraft.layoutMode}
                    onChange={e =>
                      setEditingCatalogDraft({
                        ...editingCatalogDraft,
                        layoutMode: e.target.value as 'GRID_ORDER' | 'PHOTO_BROCHURE' | 'TECH_DRAWING'
                      })
                    }
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  >
                    <option value="GRID_ORDER">표준 주문서 그리드</option>
                    <option value="PHOTO_BROCHURE">실물 사진 브로셔 카드</option>
                    <option value="TECH_DRAWING">기술 치수 도면 대장</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>카탈로그 상단 안내문</label>
                  <input
                    type="text"
                    value={editingCatalogDraft.headerNotice}
                    onChange={e => setEditingCatalogDraft({ ...editingCatalogDraft, headerNotice: e.target.value })}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>하단 발주처 연락처 문구</label>
                  <input
                    type="text"
                    value={editingCatalogDraft.footerContact}
                    onChange={e => setEditingCatalogDraft({ ...editingCatalogDraft, footerContact: e.target.value })}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              {/* 노출 컬럼 체크박스 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 12px', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 700 }}>
                <span style={{ color: '#0F172A' }}>카탈로그 표시 항목:</span>
                {[
                  { key: 'showRealPhoto', label: '티브이에이치 실물 사진' },
                  { key: 'showTechDiagram', label: '기술 치수 도면' },
                  { key: 'showOemCrossRef', label: '순정 교차품번' },
                  { key: 'showDetailedSpecs', label: '상세 실측 스펙' },
                  { key: 'showStockAndLeadTime', label: '현재고 및 창고위치' },
                  { key: 'showUnitPrice', label: '공급 단가 표시' }
                ].map(col => (
                  <label key={col.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={(editingCatalogDraft as any)[col.key]}
                      onChange={e => setEditingCatalogDraft({ ...editingCatalogDraft, [col.key]: e.target.checked })}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>

              {/* 수록 품목 선택 및 맞춤 단가·배지 지정 테이블 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
                    수록 제품 선택 및 품목별 맞춤 단가·강조 배지 설정 · 선택됨 {editingCatalogDraft.selectedItemIds.length}종 / 전체 {catalogItems.length}종
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={builderSearchKeyword}
                      onChange={e => setBuilderSearchKeyword(e.target.value)}
                      placeholder="품목명, 브랜드, 모델 검색..."
                      style={{ height: '28px', padding: '0 10px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px', width: '210px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setEditingCatalogDraft({ ...editingCatalogDraft, selectedItemIds: catalogItems.map(i => i.id) })}
                      style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCatalogDraft({ ...editingCatalogDraft, selectedItemIds: [] })}
                      style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      전체 해제
                    </button>
                  </div>
                </div>

                <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #CBD5E1', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                      <tr>
                        <th style={{ padding: '7px 10px', textAlign: 'center' }}>수록</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>참조번호 / 품번</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>계통 / 부품명</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left' }}>호환 기종</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right' }}>대리점가 / 소비자가</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center' }}>맞춤 지정단가 · 원</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center' }}>기본 주문수량</th>
                        <th style={{ padding: '7px 10px', textAlign: 'center' }}>강조 배지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalogItems
                        .filter(item => {
                          if (!builderSearchKeyword.trim()) return true;
                          const kw = builderSearchKeyword.trim().toLowerCase();
                          return [item.sku, item.tvhRefNo || '', item.partName, item.category, ...item.compatibleModels]
                            .join(' ')
                            .toLowerCase()
                            .includes(kw);
                        })
                        .map(item => {
                          const included = editingCatalogDraft.selectedItemIds.includes(item.id);
                          const ov: CustomCatalogItemOverride = editingCatalogDraft.itemOverrides?.[item.id] || { itemId: item.id };
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: included ? '#F5F3FF' : '#FFFFFF' }}>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={included}
                                  onChange={e => {
                                    const nextIds = e.target.checked
                                      ? [...editingCatalogDraft.selectedItemIds, item.id]
                                      : editingCatalogDraft.selectedItemIds.filter(id => id !== item.id);
                                    setEditingCatalogDraft({ ...editingCatalogDraft, selectedItemIds: nextIds });
                                  }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700 }}>
                                {item.tvhRefNo || item.sku}
                              </td>
                              <td style={{ padding: '6px 10px', fontWeight: 700 }}>
                                <span style={{ color: '#4338CA', marginRight: '6px' }}>[{item.category}]</span>
                                {item.partName}
                              </td>
                              <td style={{ padding: '6px 10px', color: '#475569' }}>{item.compatibleModels.join(', ')}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
                                ₩{item.dealerPriceKrw.toLocaleString()} / ₩{item.retailPriceKrw.toLocaleString()}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  placeholder="기본단가 사용"
                                  value={ov.customPriceKrw || ''}
                                  onChange={e => {
                                    const val = Number(e.target.value);
                                    setEditingCatalogDraft({
                                      ...editingCatalogDraft,
                                      itemOverrides: {
                                        ...editingCatalogDraft.itemOverrides,
                                        [item.id]: { ...ov, itemId: item.id, customPriceKrw: val > 0 ? val : undefined }
                                      }
                                    });
                                  }}
                                  style={{ width: '96px', height: '26px', padding: '0 6px', borderRadius: '4px', border: '1px solid #CBD5E1', textAlign: 'right', fontSize: '12px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  min={0}
                                  value={ov.defaultOrderQty || 0}
                                  onChange={e => {
                                    const val = Number(e.target.value);
                                    setEditingCatalogDraft({
                                      ...editingCatalogDraft,
                                      itemOverrides: {
                                        ...editingCatalogDraft.itemOverrides,
                                        [item.id]: { ...ov, itemId: item.id, defaultOrderQty: val > 0 ? val : undefined }
                                      }
                                    });
                                  }}
                                  style={{ width: '56px', height: '26px', textAlign: 'center', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                <select
                                  value={ov.badgeText || ''}
                                  onChange={e => {
                                    setEditingCatalogDraft({
                                      ...editingCatalogDraft,
                                      itemOverrides: {
                                        ...editingCatalogDraft.itemOverrides,
                                        [item.id]: { ...ov, itemId: item.id, badgeText: e.target.value || undefined }
                                      }
                                    });
                                  }}
                                  style={{ height: '26px', borderRadius: '4px', border: '1px solid #CBD5E1', fontSize: '11.5px' }}
                                >
                                  <option value="">배지 없음</option>
                                  <option value="주력">주력</option>
                                  <option value="특가">특가</option>
                                  <option value="필수소모품">필수소모품</option>
                                  <option value="신규수집">신규수집</option>
                                  <option value="순정호환">순정호환</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                {customCatalogs.some(c => c.id === editingCatalogDraft.id) ? (
                  <button
                    type="button"
                    disabled={isSavingCatalog}
                    onClick={() => handleDeleteCustomCatalogFromDb(editingCatalogDraft.id)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #DC2626',
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    이 맞춤 카탈로그 삭제
                  </button>
                ) : (
                  <div />
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowCatalogBuilderModal(false)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#334155',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    disabled={isSavingCatalog}
                    onClick={handleSaveCustomCatalogToDb}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '6px',
                      border: '1px solid #7C3AED',
                      backgroundColor: '#7C3AED',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {isSavingCatalog ? '저장 중...' : '맞춤 카탈로그 저장 및 즉시 적용'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 모달 5: A4 정식 [호환부품 자체 카탈로그 겸 주문서] 인쇄 미리보기 모달 */}
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
                    전체 카탈로그 겸 발주서 양식 · {filteredCatalog.length}종
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
                    선택 주문품목 전용 발주서 · {orderSummary.selectedLineCount}종
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
                      {activeCustomCatalog ? activeCustomCatalog.subtitle : '전 브랜드 지게차 호환부품 · 어태치먼트 · 마스트 · 전장 통합 공급망'}
                    </div>
                    <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '4px 0', color: '#0F172A' }}>
                      {activeCustomCatalog ? activeCustomCatalog.title : '지게차 호환부품 카탈로그 겸 주문서'}
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
                          {priceTier === 'DEALER' ? '대리점 공급가' : priceTier === 'RETAIL' ? '권장 소비자가' : '맞춤 지정단가'}
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
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'center' }}>사진 · 도면</th>
                      <th style={{ border: '1px solid #0F172A', padding: '6px', textAlign: 'left' }}>참조번호 / 호환품번</th>
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
                      const unitPrice = resolveUnitPrice(item);
                      return (
                        <tr key={item.id}>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px', textAlign: 'center', fontWeight: 800 }}>
                            {qty > 0 ? '[선택]' : '[ ]'}
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '4px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {item.imageUrl && (
                                <img
                                  src={item.imageUrl}
                                  alt={item.partName}
                                  style={{ width: '44px', height: '38px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #CBD5E1' }}
                                />
                              )}
                              <PartTechnicalDiagramSvg type={item.diagramType} size="sm" />
                            </div>
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px', fontFamily: 'monospace' }}>
                            <div style={{ fontWeight: 800, color: '#0F172A' }}>{item.sku}</div>
                            <div style={{ fontSize: '10px', color: '#B91C1C', fontWeight: 700 }}>{item.tvhRefNo || ''}</div>
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px' }}>
                            <div style={{ fontSize: '10px', color: '#1E3A8A', fontWeight: 700 }}>{item.category}</div>
                            <div style={{ fontWeight: 700 }}>{item.partName}</div>
                          </td>
                          <td style={{ border: '1px solid #CBD5E1', padding: '5px' }}>
                            <div>{item.specSummary}</div>
                            <div style={{ fontSize: '10.5px', color: '#1D4ED8', fontWeight: 700, marginTop: '2px' }}>
                              적용기종: {item.compatibleModels.join(', ')} · {item.tonnageRange}
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
                    {activeCustomCatalog ? activeCustomCatalog.footerContact : '※ 본 양식은 호환부품 규격 카탈로그와 발주서를 겸하며, 수량 기입 후 회신 또는 시스템에서 즉시 수주 확정하실 수 있습니다.'}
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
